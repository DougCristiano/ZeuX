package emulator

import "testing"

// ResolveRetroArchCore existe para a API (R3, ADR 0015) saber qual core um
// lançamento vai usar antes de montar o comando — precisa espelhar
// resolveCoreName exatamente, ou a decisão de baixar um core divergiria da
// decisão de qual core o BuildCommand de fato resolve.
func TestResolveRetroArchCoreFallsBackToConsoleDefault(t *testing.T) {
	core, err := ResolveRetroArchCore("gb", "")
	if err != nil {
		t.Fatalf("erro inesperado: %v", err)
	}
	if core == "" {
		t.Fatal("esperava um core padrão para gb")
	}
}

func TestResolveRetroArchCoreHonorsExplicitCore(t *testing.T) {
	core, err := ResolveRetroArchCore("gb", "mesen")
	if err != nil {
		t.Fatalf("erro inesperado: %v", err)
	}
	if core != "mesen" {
		t.Errorf("core = %q, esperava %q (o explícito, não o padrão do console)", core, "mesen")
	}
}

func TestResolveRetroArchCoreRejectsUnknownExplicitCore(t *testing.T) {
	if _, err := ResolveRetroArchCore("gb", "core-que-nao-existe"); err == nil {
		t.Fatal("esperava erro para um core explícito desconhecido")
	}
}

func TestResolveRetroArchCoreRejectsConsoleWithoutDefault(t *testing.T) {
	if _, err := ResolveRetroArchCore("console-sem-core-padrao", ""); err == nil {
		t.Fatal("esperava erro para um console sem core padrão e sem core explícito")
	}
}
