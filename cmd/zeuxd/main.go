// Command zeuxd é o daemon local do ZeuX: lê o hardware da máquina e serve as
// sugestões de console para a interface.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/doufl/zeux/internal/api"
	"github.com/doufl/zeux/internal/consent"
	"github.com/doufl/zeux/internal/emulator"
	"github.com/doufl/zeux/internal/hardware"
	"github.com/doufl/zeux/internal/igdb"
	"github.com/doufl/zeux/internal/install"
	"github.com/doufl/zeux/internal/library"
	"github.com/doufl/zeux/internal/store"
	"github.com/doufl/zeux/internal/verdict"
)

func main() {
	// O bind fica travado em 127.0.0.1 por padrão: este daemon serve a interface
	// que roda na mesma máquina e não tem motivo para aceitar conexões externas.
	addr := flag.String("addr", "127.0.0.1:7777", "endereço de escuta do daemon")
	debug := flag.Bool("debug", false, "ativa log detalhado de requisições")
	flag.Parse()

	level := slog.LevelInfo
	if *debug {
		level = slog.LevelDebug
	}
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: level}))

	if err := run(*addr, logger); err != nil {
		logger.Error("daemon encerrado com erro", "erro", err)
		os.Exit(1)
	}
}

func run(addr string, logger *slog.Logger) error {
	catalog, err := verdict.LoadCatalog()
	if err != nil {
		return err
	}

	consentStore, err := consent.NewStore()
	if err != nil {
		return err
	}

	registry := emulator.NewRegistry()

	customStore, err := emulator.NewCustomStore()
	if err != nil {
		return err
	}

	// Definições inválidas não impedem o app de subir: o usuário pode ter
	// editado o JSON à mão e errado numa entrada, e o resto precisa continuar
	// funcionando enquanto ele corrige.
	if definitions, err := customStore.Load(); err != nil {
		logger.Warn("não foi possível ler os emuladores personalizados", "erro", err)
	} else {
		adapters, problems := emulator.BuildAdapters(definitions)
		registry.SetCustom(adapters)

		for _, problem := range problems {
			logger.Warn("emulador personalizado inválido", "detalhe", problem)
		}
	}

	db, err := store.Open()
	if err != nil {
		return fmt.Errorf("abrindo o banco local: %w", err)
	}
	defer db.Close()

	// Q2 (docs/roadmap.md, Sprint Q): o lançamento aplica o preset do catálogo
	// no arquivo do emulador, mas nunca por cima de configuração que o usuário
	// salvou à mão — quem responde "ele configurou?" é este store.
	userConfig := emulator.NewUserConfigStore(db)

	launcher := emulator.NewLauncher(registry, emulator.NewSQLiteSessions(db), userConfig, logger)

	sources, err := install.LoadCatalog()
	if err != nil {
		return err
	}
	installer := install.NewManager(sources, logger)

	libraryStore := library.NewStore(db)

	igdbCreds, err := igdb.NewCredentialsStore()
	if err != nil {
		return err
	}
	igdbJobs := igdb.NewScrapeManager(libraryStore, igdbCreds, logger)

	server := api.NewServer(
		hardware.NewProbe(), catalog, consentStore,
		registry, customStore, launcher, installer, libraryStore,
		igdbCreds, igdbJobs, userConfig, logger)

	// Só quem está rodando o front em modo desenvolvimento (`npm run tauri
	// dev`) define esta variável — o instalador nunca a define, então o
	// binário que o usuário recebe só aceita as origens de produção do Tauri.
	if devOrigin := os.Getenv("ZEUX_DEV_ORIGIN"); devOrigin != "" {
		server.SetDevOrigin(devOrigin)
		logger.Warn("CORS liberado para origem de desenvolvimento", "origin", devOrigin)
	}

	httpServer := &http.Server{
		Addr:              addr,
		Handler:           server.Routes(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	// Encerramento limpo no Ctrl+C: importante porque a interface Tauri vai
	// gerenciar este processo como filho e precisa que ele morra sem deixar a
	// porta presa.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	errCh := make(chan error, 1)
	go func() {
		logger.Info("daemon no ar", "endereco", "http://"+addr, "consoles", len(catalog.Consoles))
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
		logger.Info("encerrando daemon")
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	return httpServer.Shutdown(shutdownCtx)
}
