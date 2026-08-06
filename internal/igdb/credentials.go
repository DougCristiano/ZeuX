// Package igdb busca metadado de jogo (título, ano, capa) na API do IGDB —
// nunca o arquivo do jogo em si. Cada usuário conecta a própria conta
// (client_id/client_secret do Twitch Developer Console), evitando estourar
// uma cota compartilhada com o uso de todo mundo que instalar o ZeuX
// (docs/roadmap.md, Sprint G, item G1).
package igdb

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

// Credentials são as chaves que o usuário obtém no próprio painel de
// desenvolvedor do Twitch (o IGDB usa a mesma autenticação). Nunca
// hardcoded, nunca versionado — mesmo princípio de consent.Store.
type Credentials struct {
	ClientID     string `json:"client_id"`
	ClientSecret string `json:"client_secret"`
}

// configured informa se as duas chaves foram preenchidas. Uma credencial
// parcial (só client_id, por exemplo) não autentica em lugar nenhum, então
// conta como "não configurado" — mesmo tratamento de ausência total.
func (c Credentials) configured() bool {
	return c.ClientID != "" && c.ClientSecret != ""
}

// CredentialsStore persiste a credencial do IGDB em disco, no diretório de
// configuração do usuário — nunca em variável de ambiente do processo nem
// no repositório. Mesmo formato de internal/consent.Store: escrita atômica,
// arquivo corrompido tratado como ausência (nunca erro que trava o app).
type CredentialsStore struct {
	path string
	mu   sync.RWMutex
}

// NewCredentialsStore cria o repositório de credenciais do IGDB no mesmo
// diretório onde consent.Store e o banco SQLite já vivem.
func NewCredentialsStore() (*CredentialsStore, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return nil, fmt.Errorf("localizando diretório de configuração: %w", err)
	}

	appDir := filepath.Join(dir, "ZeuX")
	if err := os.MkdirAll(appDir, 0o755); err != nil {
		return nil, fmt.Errorf("criando diretório de configuração: %w", err)
	}

	return &CredentialsStore{path: filepath.Join(appDir, "igdb_credentials.json")}, nil
}

// Load devolve a credencial guardada e se ela está completa o bastante para
// autenticar. A ausência do arquivo, ou um arquivo corrompido, não é erro —
// só significa que o usuário ainda não conectou a conta (mesmo raciocínio
// de consent.Store.Load: errar para o lado de "não configurado" é melhor
// que travar o app numa leitura ruim).
func (s *CredentialsStore) Load() (Credentials, bool, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	data, err := os.ReadFile(s.path)
	if os.IsNotExist(err) {
		return Credentials{}, false, nil
	}
	if err != nil {
		return Credentials{}, false, fmt.Errorf("lendo credencial do IGDB: %w", err)
	}

	var creds Credentials
	if err := json.Unmarshal(data, &creds); err != nil {
		return Credentials{}, false, nil
	}

	return creds, creds.configured(), nil
}

// Save grava a credencial de forma atômica (arquivo temporário + rename),
// evitando deixar um JSON truncado se o processo morrer no meio da escrita.
func (s *CredentialsStore) Save(creds Credentials) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := json.MarshalIndent(creds, "", "  ")
	if err != nil {
		return fmt.Errorf("serializando credencial do IGDB: %w", err)
	}

	temp := s.path + ".tmp"
	if err := os.WriteFile(temp, data, 0o600); err != nil {
		return fmt.Errorf("gravando credencial do IGDB: %w", err)
	}

	if err := os.Rename(temp, s.path); err != nil {
		os.Remove(temp)
		return fmt.Errorf("finalizando gravação da credencial do IGDB: %w", err)
	}

	return nil
}

// Clear desconecta a conta, apagando o arquivo. Ausência do arquivo não é
// erro — desconectar quando já não há nada conectado é um no-op válido.
func (s *CredentialsStore) Clear() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := os.Remove(s.path); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("removendo credencial do IGDB: %w", err)
	}
	return nil
}
