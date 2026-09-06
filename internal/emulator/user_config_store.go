package emulator

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

// UserConfigStore lembra para quais emuladores o usuário salvou configuração
// à mão, pelo painel "Configurações" (H1/H2).
//
// Guarda só o fato, nunca os valores: os valores já vivem no arquivo de
// configuração do próprio emulador, e uma segunda cópia deles aqui seria uma
// fonte de verdade capaz de discordar da primeira.
//
// Existe por causa do Q2 (docs/roadmap.md, Sprint Q): o lançamento passou a
// aplicar o preset do catálogo antes de abrir o jogo, e sem este registro ele
// sobrescreveria em silêncio a escolha explícita de quem já tinha configurado
// o emulador. É a mesma precedência que o Registry já documenta para emulador
// personalizado — o que o usuário definiu à mão vence o que vem de fábrica.
//
// Mora em internal/emulator, junto do domínio que ela descreve, no mesmo
// espírito de SQLiteSessions (session_store.go) e CustomStore (custom.go).
type UserConfigStore struct {
	db *sql.DB
}

// NewUserConfigStore cria o repositório sobre um banco já aberto e migrado
// (internal/store.Open ou OpenAt).
func NewUserConfigStore(db *sql.DB) *UserConfigStore {
	return &UserConfigStore{db: db}
}

// MarkUserConfigured registra que o usuário salvou configuração para este
// adapter. Idempotente: salvar de novo só atualiza o instante.
func (s *UserConfigStore) MarkUserConfigured(ctx context.Context, adapterID string) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO emulator_user_config (adapter_id, set_at) VALUES (?, ?)
		ON CONFLICT(adapter_id) DO UPDATE SET set_at = excluded.set_at
	`, adapterID, time.Now().UTC().Format(time.RFC3339Nano))
	if err != nil {
		return fmt.Errorf("registrando a configuração manual de %s: %w", adapterID, err)
	}
	return nil
}

// ClearUserConfigured esquece o registro — chamado quando o usuário restaura a
// configuração original do emulador (DELETE /emulators/{id}/config). Quem
// desfez a própria configuração volta a aceitar o preset do catálogo.
func (s *UserConfigStore) ClearUserConfigured(ctx context.Context, adapterID string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM emulator_user_config WHERE adapter_id = ?`, adapterID)
	if err != nil {
		return fmt.Errorf("esquecendo a configuração manual de %s: %w", adapterID, err)
	}
	return nil
}

// IsUserConfigured diz se o usuário já salvou configuração para este adapter.
//
// Erro de banco devolve **true** de propósito, junto do erro: na dúvida, não
// mexer no arquivo do usuário. O pior caso de um falso positivo é o preset não
// ser aplicado numa vez (o jogo abre assim mesmo, com a configuração que já
// estava lá); o de um falso negativo é sobrescrever calado a escolha da
// pessoa, que é irreversível do ponto de vista dela.
func (s *UserConfigStore) IsUserConfigured(ctx context.Context, adapterID string) (bool, error) {
	var count int
	err := s.db.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM emulator_user_config WHERE adapter_id = ?`, adapterID).Scan(&count)
	if err != nil {
		return true, fmt.Errorf("lendo a configuração manual de %s: %w", adapterID, err)
	}
	return count > 0, nil
}
