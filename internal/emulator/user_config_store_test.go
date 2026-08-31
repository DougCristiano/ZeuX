package emulator

import (
	"context"
	"testing"

	"github.com/doufl/zeux/internal/store"
)

func novoUserConfigStore(t *testing.T) *UserConfigStore {
	t.Helper()
	db, err := store.OpenAt(t.TempDir() + "/zeux.db")
	if err != nil {
		t.Fatalf("store.OpenAt: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return NewUserConfigStore(db)
}

// O ciclo que o Q2 depende: emulador sem registro aceita o preset do catálogo;
// depois que o usuário salva configuração pelo painel, deixa de aceitar; e se
// ele restaurar a configuração original, volta a aceitar.
func TestUserConfigStoreCicloCompleto(t *testing.T) {
	s := novoUserConfigStore(t)
	ctx := context.Background()

	configurado, err := s.IsUserConfigured(ctx, "pcsx2")
	if err != nil {
		t.Fatalf("IsUserConfigured: %v", err)
	}
	if configurado {
		t.Fatal("um emulador nunca configurado não deveria constar como configurado")
	}

	if err := s.MarkUserConfigured(ctx, "pcsx2"); err != nil {
		t.Fatalf("MarkUserConfigured: %v", err)
	}
	if configurado, err = s.IsUserConfigured(ctx, "pcsx2"); err != nil || !configurado {
		t.Fatalf("depois de marcar: configurado=%v, err=%v", configurado, err)
	}

	if err := s.ClearUserConfigured(ctx, "pcsx2"); err != nil {
		t.Fatalf("ClearUserConfigured: %v", err)
	}
	if configurado, err = s.IsUserConfigured(ctx, "pcsx2"); err != nil || configurado {
		t.Fatalf("depois de restaurar: configurado=%v, err=%v", configurado, err)
	}
}

// Marcar duas vezes não pode explodir na chave primária — o usuário salva
// configuração quantas vezes quiser pelo painel.
func TestUserConfigStoreMarcarDuasVezesEIdempotente(t *testing.T) {
	s := novoUserConfigStore(t)
	ctx := context.Background()

	if err := s.MarkUserConfigured(ctx, "retroarch"); err != nil {
		t.Fatalf("primeira marcação: %v", err)
	}
	if err := s.MarkUserConfigured(ctx, "retroarch"); err != nil {
		t.Fatalf("segunda marcação: %v", err)
	}
}

// O registro é por emulador: configurar o PCSX2 não pode fazer o RetroArch
// parar de receber o preset do catálogo.
func TestUserConfigStoreNaoVazaEntreEmuladores(t *testing.T) {
	s := novoUserConfigStore(t)
	ctx := context.Background()

	if err := s.MarkUserConfigured(ctx, "pcsx2"); err != nil {
		t.Fatalf("MarkUserConfigured: %v", err)
	}

	configurado, err := s.IsUserConfigured(ctx, "retroarch")
	if err != nil {
		t.Fatalf("IsUserConfigured: %v", err)
	}
	if configurado {
		t.Error("configurar o PCSX2 marcou o RetroArch junto")
	}
}
