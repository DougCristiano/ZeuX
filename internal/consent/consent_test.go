package consent

import (
	"os"
	"path/filepath"
	"testing"
)

// newTestStore cria um Store apontando para um arquivo temporário, sem tocar
// no diretório de configuração real da máquina que roda o teste.
func newTestStore(t *testing.T) *Store {
	t.Helper()
	return &Store{path: filepath.Join(t.TempDir(), "consent.json")}
}

// Trava a regra central do pacote: sem arquivo em disco, o consentimento é
// tratado como "usuário ainda não respondeu", nunca como erro.
func TestLoadWithoutFileReturnsEmptyRecord(t *testing.T) {
	store := newTestStore(t)

	record, err := store.Load()
	if err != nil {
		t.Fatalf("Load: erro inesperado: %v", err)
	}
	if record.Granted {
		t.Fatal("Load: registro ausente não pode aparecer como concedido")
	}
	if record.IsValid() {
		t.Fatal("Load: registro ausente não pode ser válido")
	}
}

// Trava que Grant persiste um registro que volta idêntico (na parte que
// importa) por Load, e que a versão da política gravada é sempre a atual.
func TestGrantPersistsAndReloads(t *testing.T) {
	store := newTestStore(t)

	granted, err := store.Grant()
	if err != nil {
		t.Fatalf("Grant: %v", err)
	}
	if !granted.IsValid() {
		t.Fatal("Grant: registro devolvido deveria ser válido")
	}
	if granted.PolicyVersion != PolicyVersion {
		t.Fatalf("Grant: policy_version = %q, esperado %q", granted.PolicyVersion, PolicyVersion)
	}

	reloaded, err := store.Load()
	if err != nil {
		t.Fatalf("Load após Grant: %v", err)
	}
	if !reloaded.IsValid() {
		t.Fatal("Load após Grant: deveria devolver um registro válido")
	}
	if !reloaded.GrantedAt.Equal(granted.GrantedAt) {
		t.Fatalf("Load após Grant: granted_at = %v, esperado %v", reloaded.GrantedAt, granted.GrantedAt)
	}
}

// Trava que Revoke apaga a autorização mesmo depois de um Grant anterior —
// o usuário precisa poder voltar atrás com a mesma facilidade com que
// autorizou.
func TestRevokeInvalidatesPreviousGrant(t *testing.T) {
	store := newTestStore(t)

	if _, err := store.Grant(); err != nil {
		t.Fatalf("Grant: %v", err)
	}

	revoked, err := store.Revoke()
	if err != nil {
		t.Fatalf("Revoke: %v", err)
	}
	if revoked.IsValid() {
		t.Fatal("Revoke: registro devolvido não pode ser válido")
	}

	reloaded, err := store.Load()
	if err != nil {
		t.Fatalf("Load após Revoke: %v", err)
	}
	if reloaded.IsValid() {
		t.Fatal("Load após Revoke: registro persistido não pode ser válido")
	}
}

// Trava a regra de versionamento: um registro gravado sob uma política antiga
// não autoriza o scan sob a política atual, mesmo com granted=true.
func TestRecordFromOlderPolicyVersionIsInvalid(t *testing.T) {
	record := Record{Granted: true, PolicyVersion: "0"}

	if record.IsValid() {
		t.Fatal("IsValid: um consentimento de versão de política antiga não pode valer para a atual")
	}
}

// Trava que um consent.json corrompido é tratado como ausência de
// consentimento, nunca como erro — errar para o lado de perguntar de novo é
// mais seguro que presumir uma autorização que pode nunca ter existido.
func TestLoadWithCorruptedFileReturnsEmptyRecord(t *testing.T) {
	store := newTestStore(t)

	if err := os.WriteFile(store.path, []byte("{ isso não é json"), 0o644); err != nil {
		t.Fatalf("escrevendo arquivo corrompido: %v", err)
	}

	record, err := store.Load()
	if err != nil {
		t.Fatalf("Load: JSON corrompido não deveria virar erro, e sim registro vazio: %v", err)
	}
	if record.IsValid() {
		t.Fatal("Load: JSON corrompido não pode ser interpretado como consentimento válido")
	}
}

// Trava que a gravação é atômica: não deve sobrar um arquivo .tmp depois de
// um Grant bem-sucedido.
func TestSaveDoesNotLeaveTemporaryFile(t *testing.T) {
	store := newTestStore(t)

	if _, err := store.Grant(); err != nil {
		t.Fatalf("Grant: %v", err)
	}

	if _, err := os.Stat(store.path + ".tmp"); !os.IsNotExist(err) {
		t.Fatalf("Grant: arquivo temporário deveria ter sido renomeado, stat = %v", err)
	}
}
