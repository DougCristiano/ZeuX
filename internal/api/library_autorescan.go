package api

import (
	"context"
	"net/http"
	"time"
)

// rescanAllFolders revarre todas as pastas apontadas e devolve quantas foram
// varridas e quantos jogos foram vistos no total. Uma pasta que falhar (HD
// externo desconectado, permissão) não interrompe as outras: o jogo dela fica
// marcado como ausente por SyncFolder, nunca apagado.
func (s *Server) rescanAllFolders(ctx context.Context) (folders, games int, err error) {
	list, err := s.library.ListFolders(ctx)
	if err != nil {
		return 0, 0, err
	}
	for _, folder := range list {
		extensions, _, ok := s.resolveConsoleExtensions(ctx, folder.ConsoleID)
		if !ok {
			continue
		}
		found, err := s.syncLibraryFolder(ctx, folder, extensions)
		if err != nil {
			s.logger.Warn("não foi possível revarrer a pasta", "pasta", folder.Path, "erro", err)
			continue
		}
		folders++
		games += found
	}
	if games > 0 {
		go s.autoScrapeCovers()
	}
	return folders, games, nil
}

// StartLibraryAutoRescan revarre a biblioteca ao subir o daemon e depois a
// cada interval, até ctx acabar. Existe porque a revarredura só no front
// (src/lib/autoRescan.ts) acontece ao abrir uma tela: quem deixava o ZeuX
// aberto e apagava um jogo da pasta continuava vendo o jogo na biblioteca
// (relato do Douglas, 2026-10-05). Sem watcher de sistema de arquivos — a
// varredura periódica custa uma caminhada por pasta, sem dependência nova.
func (s *Server) StartLibraryAutoRescan(ctx context.Context, interval time.Duration) {
	go func() {
		// Pequena espera: o daemon acabou de subir e a primeira tela do app
		// já dispara a sua própria revarredura; esta é a rede de segurança.
		timer := time.NewTimer(10 * time.Second)
		defer timer.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-timer.C:
				if _, _, err := s.rescanAllFolders(ctx); err != nil {
					s.logger.Warn("revarredura periódica da biblioteca falhou", "erro", err)
				}
				timer.Reset(interval)
			}
		}
	}()
}

// handleRescanLibrary é o botão "Revarrer tudo": a mesma varredura periódica,
// sob demanda, para quem não quer esperar a próxima rodada.
func (s *Server) handleRescanLibrary(w http.ResponseWriter, r *http.Request) {
	folders, games, err := s.rescanAllFolders(r.Context())
	if err != nil {
		s.writeError(w, http.StatusInternalServerError, "library_scan_failed", err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"folders_scanned": folders, "games_found": games})
}
