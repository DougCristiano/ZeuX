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

// Trava a regra central de LoadPersonal: sem arquivo em disco, a credencial
// PESSOAL é tratada como "usuário ainda não conectou a conta", nunca como
// erro.
func TestLoadPersonalWithoutFileReturnsUnconfigured(t *testing.T) {
	store := newTestCredentialsStore(t)

	creds, configured, err := store.LoadPersonal()
	if err != nil {
		t.Fatalf("LoadPersonal: erro inesperado: %v", err)
	}
	if configured {
		t.Fatal("LoadPersonal: credencial ausente não pode aparecer como configurada")
	}
	if creds != (Credentials{}) {
		t.Fatalf("LoadPersonal: esperado Credentials zerado, veio %+v", creds)
	}
}

// Trava a mudança de 2026-08-17: sem credencial pessoal, Load (a efetiva,
// usada de verdade para autenticar) cai na credencial de teste embutida —
// nunca "não configurado" — para que poucos testadores não precisem
// conectar conta nenhuma.
func TestLoadWithoutPersonalFileFallsBackToDefault(t *testing.T) {
	store := newTestCredentialsStore(t)

	creds, configured, err := store.Load()
	if err != nil {
		t.Fatalf("Load: erro inesperado: %v", err)
	}
	if !configured {
		t.Fatal("Load: sem credencial pessoal deveria mesmo assim cair no padrão embutido")
	}
	if creds != defaultCredentials {
		t.Fatalf("Load: esperava a credencial padrão embutida, veio %+v", creds)
	}
}

// Trava que Save persiste uma credencial que volta idêntica por Load — e que
// a pessoal tem prioridade sobre o padrão embutido.
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
		t.Fatalf("Load após Save: %+v, esperado %+v (credencial pessoal deveria vencer o padrão)", got, want)
	}
}

// Trava que uma credencial parcial (só um dos dois campos) conta como "sem
// credencial pessoal" em LoadPersonal — nem client_id nem client_secret
// sozinhos autenticam nada — e que Load ainda assim cai no padrão embutido
// em vez de tentar autenticar com a credencial pessoal incompleta.
func TestPartialCredentialsAreNotConfigured(t *testing.T) {
	store := newTestCredentialsStore(t)

	if err := store.Save(Credentials{ClientID: "abc123"}); err != nil {
		t.Fatalf("Save: %v", err)
	}

	_, personal, err := store.LoadPersonal()
	if err != nil {
		t.Fatalf("LoadPersonal: %v", err)
	}
	if personal {
		t.Fatal("LoadPersonal: client_secret ausente não pode contar como configurado")
	}

	creds, configured, err := store.Load()
	if err != nil {
		t.Fatalf("Load: %v", err)
	}
	if !configured || creds != defaultCredentials {
		t.Fatalf("Load: esperava cair no padrão embutido com credencial pessoal incompleta, veio %+v/%v", creds, configured)
	}
}

// Trava que um arquivo corrompido é tratado como ausência de credencial
// pessoal, nunca como erro — mesmo raciocínio de consent.Store.Load: errar
// para o lado de "sem credencial pessoal" é mais seguro que travar o app
// numa leitura ruim.
func TestLoadWithCorruptedFileReturnsUnconfigured(t *testing.T) {
	store := newTestCredentialsStore(t)

	if err := os.WriteFile(store.path, []byte("{ isso não é json"), 0o600); err != nil {
		t.Fatalf("escrevendo arquivo corrompido: %v", err)
	}

	_, personal, err := store.LoadPersonal()
	if err != nil {
		t.Fatalf("LoadPersonal: JSON corrompido não deveria virar erro: %v", err)
	}
	if personal {
		t.Fatal("LoadPersonal: JSON corrompido não pode ser interpretado como credencial configurada")
	}
}

// Trava que Clear desconecta a conta pessoal (Load volta a cair no padrão
// embutido, não em "sem credencial"), e que chamar Clear sem nada conectado
// é um no-op válido (não um erro).
func TestClearRemovesCredentials(t *testing.T) {
	store := newTestCredentialsStore(t)

	if err := store.Save(Credentials{ClientID: "abc123", ClientSecret: "segredo"}); err != nil {
		t.Fatalf("Save: %v", err)
	}

	if err := store.Clear(); err != nil {
		t.Fatalf("Clear: %v", err)
	}

	_, personal, err := store.LoadPersonal()
	if err != nil {
		t.Fatalf("LoadPersonal após Clear: %v", err)
	}
	if personal {
		t.Fatal("LoadPersonal após Clear: não deveria haver credencial pessoal")
	}

	if creds, configured, err := store.Load(); err != nil || !configured || creds != defaultCredentials {
		t.Fatalf("Load após Clear: esperava cair no padrão embutido, veio %+v/%v/%v", creds, configured, err)
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
