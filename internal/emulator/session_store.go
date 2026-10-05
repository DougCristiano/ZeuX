package emulator

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// SQLiteSessions implementa SessionRepository sobre o banco local (ver
// internal/store, que abre e migra o arquivo). Fica em internal/emulator, ao
// lado do tipo Session que ela persiste, no mesmo espírito de CustomStore em
// custom.go — a persistência mora junto do domínio, não num pacote genérico.
type SQLiteSessions struct {
	db *sql.DB
}

// NewSQLiteSessions cria o repositório sobre um banco já aberto e migrado
// (internal/store.Open ou internal/store.OpenAt).
func NewSQLiteSessions(db *sql.DB) *SQLiteSessions {
	return &SQLiteSessions{db: db}
}

// Insert grava a sessão e devolve o ID definitivo, derivado do rowid
// autoincrement do SQLite — sobrevive a um reinício do daemon sem colidir
// com sessões gravadas antes dele, o que um contador em memória não garantia.
func (s *SQLiteSessions) Insert(ctx context.Context, session Session) (string, error) {
	unapplied, err := json.Marshal(session.Unapplied)
	if err != nil {
		return "", fmt.Errorf("serializando unapplied da sessão: %w", err)
	}

	result, err := s.db.ExecContext(ctx, `
		INSERT INTO sessions (console_id, adapter_id, emulator, rom_path, started_at, unapplied)
		VALUES (?, ?, ?, ?, ?, ?)
	`, session.ConsoleID, session.AdapterID, session.Emulator, session.ROMPath,
		session.StartedAt.Format(time.RFC3339Nano), string(unapplied))
	if err != nil {
		return "", fmt.Errorf("gravando sessão: %w", err)
	}

	seq, err := result.LastInsertId()
	if err != nil {
		return "", fmt.Errorf("lendo o id da sessão gravada: %w", err)
	}

	return formatSessionID(seq), nil
}

// Close marca a sessão como encerrada.
func (s *SQLiteSessions) Close(ctx context.Context, id string, endedAt time.Time, exitError string) error {
	seq, err := parseSessionID(id)
	if err != nil {
		return err
	}

	if _, err := s.db.ExecContext(ctx, `
		UPDATE sessions SET ended_at = ?, exit_error = ? WHERE seq = ?
	`, endedAt.Format(time.RFC3339Nano), exitError, seq); err != nil {
		return fmt.Errorf("fechando a sessão %s: %w", id, err)
	}

	return nil
}

// OrphanedSessionMessage vai em exit_error das sessões encerradas por
// CloseOrphaned, para o histórico dizer por que aquela sessão não tem
// duração em vez de mostrar um zero sem explicação.
const OrphanedSessionMessage = "O ZeuX foi fechado com o jogo aberto, então a duração desta sessão não pôde ser medida."

// CloseOrphaned encerra as sessões que ficaram abertas de uma execução
// anterior do daemon e devolve quantas eram.
//
// Quem fecha uma sessão é a goroutine `supervise`, esperando o processo do
// emulador — e ela morre junto com o daemon. Se o ZeuX é fechado (ou
// reiniciado por uma atualização) com o jogo aberto, a linha fica com
// ended_at nulo para sempre: a interface mostrava o jogo "em andamento" dias
// depois, e o Playtime somava time.Since(started_at), fazendo o tempo jogado
// crescer sozinho. Relatado pelo Douglas em 2026-09-28 depois de atualizar
// para a v0.1.30.
//
// Nenhum processo novo do daemon consegue acompanhar o emulador antigo (o pid
// não é gravado, e mesmo que fosse, não daria para esperar um processo que
// não é filho deste), então a única resposta honesta é encerrar a sessão.
// ended_at = started_at, e não "agora": o fim real é desconhecido, e somar
// zero ao tempo jogado deixa de contar um tempo que não foi medido, em vez de
// inventar um (princípio 4 do CLAUDE.md).
//
// Precisa rodar ao subir o daemon, antes de qualquer Launch — depois disso,
// uma sessão aberta é uma sessão viva deste processo.
func (s *SQLiteSessions) CloseOrphaned(ctx context.Context) (int64, error) {
	result, err := s.db.ExecContext(ctx, `
		UPDATE sessions SET ended_at = started_at, exit_error = ? WHERE ended_at IS NULL
	`, OrphanedSessionMessage)
	if err != nil {
		return 0, fmt.Errorf("encerrando sessões que ficaram abertas: %w", err)
	}

	closed, err := result.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("contando sessões encerradas: %w", err)
	}
	return closed, nil
}

// List devolve todas as sessões, da mais recente para a mais antiga.
func (s *SQLiteSessions) List(ctx context.Context) ([]Session, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT seq, console_id, adapter_id, emulator, rom_path, started_at, ended_at, exit_error, unapplied
		FROM sessions
		ORDER BY seq DESC
	`)
	if err != nil {
		return nil, fmt.Errorf("lendo sessões: %w", err)
	}
	defer rows.Close()

	var sessions []Session
	for rows.Next() {
		session, err := scanSession(rows)
		if err != nil {
			return nil, err
		}
		sessions = append(sessions, session)
	}

	return sessions, rows.Err()
}

// rowScanner é satisfeito tanto por *sql.Rows quanto por *sql.Row — só List
// usa isto hoje, mas evita reimplementar o scan se um Get por ID aparecer.
type rowScanner interface {
	Scan(dest ...any) error
}

func scanSession(row rowScanner) (Session, error) {
	var (
		seq          int64
		startedAtRaw string
		endedAtRaw   sql.NullString
		unappliedRaw sql.NullString
		session      Session
	)

	if err := row.Scan(&seq, &session.ConsoleID, &session.AdapterID, &session.Emulator,
		&session.ROMPath, &startedAtRaw, &endedAtRaw, &session.ExitError, &unappliedRaw); err != nil {
		return Session{}, fmt.Errorf("lendo linha de sessão: %w", err)
	}

	session.ID = formatSessionID(seq)

	startedAt, err := time.Parse(time.RFC3339Nano, startedAtRaw)
	if err != nil {
		return Session{}, fmt.Errorf("interpretando started_at da sessão %s: %w", session.ID, err)
	}
	session.StartedAt = startedAt

	if endedAtRaw.Valid {
		endedAt, err := time.Parse(time.RFC3339Nano, endedAtRaw.String)
		if err != nil {
			return Session{}, fmt.Errorf("interpretando ended_at da sessão %s: %w", session.ID, err)
		}
		session.EndedAt = &endedAt
	}

	if unappliedRaw.Valid && unappliedRaw.String != "" {
		if err := json.Unmarshal([]byte(unappliedRaw.String), &session.Unapplied); err != nil {
			return Session{}, fmt.Errorf("interpretando unapplied da sessão %s: %w", session.ID, err)
		}
	}

	return session, nil
}

func formatSessionID(seq int64) string {
	return fmt.Sprintf("s%d", seq)
}

func parseSessionID(id string) (int64, error) {
	seq, err := strconv.ParseInt(strings.TrimPrefix(id, "s"), 10, 64)
	if err != nil {
		return 0, fmt.Errorf("id de sessão inválido: %q", id)
	}
	return seq, nil
}

// RecordResumeState guarda (ou troca) o estado de retomada de um jogo — ver
// resume.go. Implementa ResumeRepository.
func (s *SQLiteSessions) RecordResumeState(ctx context.Context, state ResumeState) error {
	if _, err := s.db.ExecContext(ctx, `
		INSERT INTO resume_states (rom_path, adapter_id, state_path, saved_at)
		VALUES (?, ?, ?, ?)
		ON CONFLICT (rom_path) DO UPDATE SET
			adapter_id = excluded.adapter_id,
			state_path = excluded.state_path,
			saved_at   = excluded.saved_at
	`, state.ROMPath, state.AdapterID, state.StatePath, state.SavedAt.Format(time.RFC3339Nano)); err != nil {
		return fmt.Errorf("gravando estado de retomada: %w", err)
	}
	return nil
}

// ResumeStates devolve todos os estados de retomada gravados, por ROM.
func (s *SQLiteSessions) ResumeStates(ctx context.Context) (map[string]ResumeState, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT rom_path, adapter_id, state_path, saved_at FROM resume_states`)
	if err != nil {
		return nil, fmt.Errorf("lendo estados de retomada: %w", err)
	}
	defer rows.Close()

	states := map[string]ResumeState{}
	for rows.Next() {
		var st ResumeState
		var savedAt string
		if err := rows.Scan(&st.ROMPath, &st.AdapterID, &st.StatePath, &savedAt); err != nil {
			return nil, fmt.Errorf("lendo linha de estado de retomada: %w", err)
		}
		st.SavedAt, _ = time.Parse(time.RFC3339Nano, savedAt)
		states[st.ROMPath] = st
	}
	return states, rows.Err()
}
