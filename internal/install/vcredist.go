package install

import (
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"

	"github.com/doufl/zeux/internal/emulator"
)

// vcRedistHost é o domínio para onde "https://aka.ms/vs/17/release/vc_redist.x64.exe"
// redireciona — o link oficial e estável que a própria Microsoft documenta em
// learn.microsoft.com/cpp/windows/latest-supported-vc-redist. allowedHosts
// (download.go) precisa dos dois: o encurtador e o destino do redirecionamento,
// porque CheckRedirect valida cada salto.
const vcRedistShortURL = "https://aka.ms/vs/17/release/vc_redist.x64.exe"

// InstallVCRedist baixa o instalador oficial do Visual C++ Redistributable
// (x64) da Microsoft e o executa.
//
// É a ação por trás do botão que o ErrorModal de lançamento oferece quando
// uma sessão termina com o código 0xC0000135 — DuckStation e PCSX2 importam
// VCRUNTIME140.dll/VCRUNTIME140_1.dll/MSVCP140.dll e recusam abrir sem esse
// runtime instalado (describeExitCode, internal/emulator/session.go; achado
// ao vivo registrado em docs/decisoes.md, "PS1 e PS2 não abriam: faltava o
// runtime do Visual C++", 2026-09-11).
//
// O instalador roda com a interface dele visível, sem "/quiet" nem
// "/norestart": é o próprio instalador da Microsoft que pede elevação (UAC),
// mostra EULA e progresso — o ZeuX evita que o usuário precise achar o link
// sozinho, mas não decide por ele nem finge que a instalação foi silenciosa.
// Por isso o processo não é aguardado (Start, não Run): a janela pode ficar
// aberta bem além da duração desta chamada, e prendê-la ao contexto da
// requisição HTTP a mataria assim que a resposta voltasse — mesma regra de
// context.Background() documentada em session.go.
//
// Só roda em Windows, único sistema em que esse runtime existe; em qualquer
// outro devolve erro sem tocar em nada.
//
// ATENÇÃO — nunca verificado contra o instalador real: esta função foi
// escrita numa sessão de IA rodando em ambiente Linux remoto, sem acesso a
// uma máquina Windows para testar o download e a execução de ponta a ponta.
// A URL é a mesma que a documentação oficial da Microsoft publica e o padrão
// de download reaproveita o mesmo `download()` já testado contra GitHub e
// buildbot.libretro.com, mas o comportamento do instalador em si (elevação,
// código de saída, o que acontece se já estiver instalado) não foi
// observado ao vivo. Ver docs/decisoes.md antes de confiar nisto sem
// verificação — mesma ressalva que o projeto já registra para as flags dos
// adapters.
func InstallVCRedist(ctx context.Context) error {
	if runtime.GOOS != "windows" {
		return fmt.Errorf("o runtime do Visual C++ é específico do Windows; este sistema é %s", runtime.GOOS)
	}

	root, err := emulator.ManagedRoot()
	if err != nil {
		return fmt.Errorf("localizando a pasta gerenciada do ZeuX: %w", err)
	}

	stagingDir := filepath.Join(root, "_vcredist")
	if err := os.MkdirAll(stagingDir, 0o755); err != nil {
		return fmt.Errorf("criando %s: %w", stagingDir, err)
	}

	destPath := filepath.Join(stagingDir, "vc_redist.x64.exe")
	if _, err := download(ctx, vcRedistShortURL, destPath, 0, nil); err != nil {
		return fmt.Errorf("baixando o Visual C++ Redistributable: %w", err)
	}

	// context.Background(), de propósito: o instalador precisa sobreviver ao
	// fim desta requisição HTTP (ver doc comment da função).
	cmd := exec.CommandContext(context.Background(), destPath)
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("iniciando o instalador: %w", err)
	}

	// Não aguardamos cmd.Wait(): o instalador é interativo (EULA, UAC,
	// barra de progresso) e pode ficar aberto por minutos. Devolvemos assim
	// que o processo nasceu, como handleOpenEmulator já faz para o
	// lançamento de um emulador standalone.
	go func() {
		_ = cmd.Wait()
	}()

	return nil
}
