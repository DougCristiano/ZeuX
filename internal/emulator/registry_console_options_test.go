package emulator

import "testing"

// Trava que o RetroArch continua satisfazendo CoreAdapter. A asserção é de
// compilação de propósito: se alguém renomear DefaultCore ou mudar a
// assinatura, o erro aparece aqui, nomeando a capacidade que se perdeu — e
// não lá na frente, como um `core` que simplesmente parou de vir na tela de
// consoles sem nada falhar.
var _ CoreAdapter = retroArchAdapter{}

// OptionsForConsole é uma vista de ForConsole, nunca uma segunda lista: os
// mesmos adapters, na mesma ordem. Sem isto, as duas poderiam divergir e a
// tela de consoles ofereceria um emulador que o lançamento (que passa por
// Resolve → ForConsole) não escolheria.
func TestOptionsForConsoleAcompanhaForConsole(t *testing.T) {
	r := NewRegistry()

	// Console com escolha real (DuckStation e RetroArch), que é onde a ordem
	// tem como estar errada — num console de um adapter só, qualquer ordem
	// passaria.
	adapters := r.ForConsole("ps1")
	options := r.OptionsForConsole("ps1")

	if len(options) != len(adapters) {
		t.Fatalf("ForConsole devolveu %d adapters, OptionsForConsole devolveu %d", len(adapters), len(options))
	}
	for i := range adapters {
		if options[i].AdapterID != adapters[i].ID() {
			t.Errorf("posição %d: OptionsForConsole diz %q, ForConsole diz %q",
				i, options[i].AdapterID, adapters[i].ID())
		}
		if options[i].Name != adapters[i].Name() {
			t.Errorf("adapter %q: nome %q, esperava %q", options[i].AdapterID, options[i].Name, adapters[i].Name())
		}
	}
}

// Um console que nenhum adapter atende devolve lista vazia, não nil disfarçado
// nem erro: a tela precisa poder dizer "o ZeuX ainda não sabe rodar isto".
func TestOptionsForConsoleDesconhecidoVemVazio(t *testing.T) {
	if options := NewRegistry().OptionsForConsole("console-que-nao-existe"); len(options) != 0 {
		t.Errorf("esperava lista vazia, veio %+v", options)
	}
}

// DefaultCore só responde por console que o RetroArch de fato atende — o
// segundo retorno é o que impede um console fora da tabela virar core "".
func TestDefaultCoreSoRespondePorConsoleAtendido(t *testing.T) {
	a := retroArchAdapter{}

	core, ok := a.DefaultCore("gb")
	if !ok || core != "gambatte" {
		t.Errorf("DefaultCore(\"gb\") = (%q, %v), esperava (\"gambatte\", true)", core, ok)
	}

	// O PS2 está no catálogo, mas o RetroArch não o atende (só o PCSX2).
	if core, ok := a.DefaultCore("ps2"); ok {
		t.Errorf("DefaultCore(\"ps2\") = (%q, true), esperava false — o RetroArch não atende PS2", core)
	}
}
