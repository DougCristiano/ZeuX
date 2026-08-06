package igdb

import (
	"os"
	"path/filepath"
	"testing"
)

// newTestCredentialsStore cria um CredentialsStore apontando para um arquivo
// temporário, sem tocar no diretório de configuração real da máquina que
// roda o teste — mesmo padrão de internal/consent.newTestStore.
func newTestCredentialsStore(t *testing.T) *CredentialsStore {
	t.Helper()
	return &CredentialsStore{path: filepath.Join(t.TempDir(), "igdb_credentials.json")}
}

// Trava a regra central: sem arquivo em disco, a credencial é tratada como
// "usuário ainda não conectou a conta", nunca como erro.
func TestLoadWithoutFileReturnsUnconfigured(t *testing.T) {
	store := newTestCredentialsStore(t)

	creds, configured, err := store.Load()
	if err != nil {
		t.Fatalf("Load: erro inesperado: %v", err)
	}
	if configured {
		t.Fatal("Load: credencial ausente não pode aparecer como configurada")
	}
	if creds != (Credentials{}) {
		t.Fatalf("Load: esperado Credentials zerado, veio %+v", creds)
	}
}

// Trava que Save persiste uma credencial que volta idêntica por Load.
func TestSavePersistsAndReloads(t *testing.T) {
	store := newTestCredentialsStore(t)
	want := Credentials{ClientID: "abc123", ClientSecret: "segredo"}

	if err := store.Save(want); err != nil {
		t.Fatalf("Save: %v", err)
	}

	got, configured, err := store.Load()
	if err != nil {
		t.Fatalf("Load após Save: %v", err)
	}
	if !configured {
		t.Fatal("Load após Save: deveria estar configurado")
	}
	if got != want {
		t.Fatalf("Load após Save: %+v, esperado %+v", got, want)
	}
}

// Trava que uma credencial parcial (só um dos dois campos) conta como "não
// configurado" — nem client_id nem client_secret sozinhos autenticam nada.
func TestPartialCredentialsAreNotConfigured(t *testing.T) {
	store := newTestCredentialsStore(t)

	if err := store.Save(Credentials{ClientID: "abc123"}); err != nil {
		t.Fatalf("Save: %v", err)
	}

	_, configured, err := store.Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if configured {
		t.Fatal("Load: client_secret ausente não pode contar como configurado")
	}
}

// Trava que um arquivo corrompido é tratado como ausência de credencial,
// nunca como erro — mesmo raciocínio de consent.Store.Load: errar para o
// lado de "não configurado" é mais seguro que travar o app numa leitura
// ruim.
func TestLoadWithCorruptedFileReturnsUnconfigured(t *testing.T) {
	store := newTestCredentialsStore(t)

	if err := os.WriteFile(store.path, []byte("{ isso não é json"), 0o600); err != nil {
		t.Fatalf("escrevendo arquivo corrompido: %v", err)
	}

	_, configured, err := store.Load()
	if err != nil {
		t.Fatalf("Load: JSON corrompido não deveria virar erro: %v", err)
	}
	if configured {
		t.Fatal("Load: JSON corrompido não pode ser interpretado como credencial configurada")
	}
}

// Trava que Clear desconecta a conta, e que chamar Clear sem nada conectado
// é um no-op válido (não um erro).
func TestClearRemovesCredentials(t *testing.T) {
	store := newTestCredentialsStore(t)

	if err := store.Save(Credentials{ClientID: "abc123", ClientSecret: "segredo"}); err != nil {
		t.Fatalf("Save: %v", err)
	}

	if err := store.Clear(); err != nil {
		t.Fatalf("Clear: %v", err)
	}

	_, configured, err := store.Load()
	if err != nil {
		t.Fatalf("Load após Clear: %v", err)
	}
	if configured {
		t.Fatal("Load após Clear: não deveria haver credencial configurada")
	}

	// Clear de novo, já sem nada — não pode virar erro.
	if err := store.Clear(); err != nil {
		t.Fatalf("Clear sem credencial: não deveria ser erro: %v", err)
	}
}

// Trava que a gravação é atômica: não deve sobrar um arquivo .tmp depois de
// um Save bem-sucedido.
func TestSaveDoesNotLeaveTemporaryFile(t *testing.T) {
	store := newTestCredentialsStore(t)

	if err := store.Save(Credentials{ClientID: "abc123", ClientSecret: "segredo"}); err != nil {
		t.Fatalf("Save: %v", err)
	}

	if _, err := os.Stat(store.path + ".tmp"); !os.IsNotExist(err) {
		t.Fatalf("Save: arquivo temporário deveria ter sido renomeado, stat = %v", err)
	}
}
