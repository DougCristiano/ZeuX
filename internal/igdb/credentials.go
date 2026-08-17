// Package igdb busca metadado de jogo (título, ano, capa) na API do IGDB —
// nunca o arquivo do jogo em si. O ideal é cada usuário conectar a própria
// conta (client_id/client_secret do Twitch Developer Console), evitando
// estourar uma cota compartilhada com o uso de todo mundo que instalar o
// ZeuX (docs/roadmap.md, Sprint G, item G1). Sem conta pessoal conectada, o
// ZeuX cai numa credencial de teste embutida (defaultCredentials, em
// credentials.go) — decisão pontual de 2026-08-17, a pedido do Douglas,
// para poucos testadores não precisarem configurar nada antes de ver a
// busca de capa funcionando. Custo aceito conscientemente: essa cota é
// dividida por todo mundo que não conectar a própria conta.
package igdb

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
)

// Credentials são as chaves que autenticam contra o IGDB (o Twitch usa a
// mesma autenticação). O ideal é o usuário conectar a própria conta, obtida
// no painel de desenvolvedor do Twitch — nunca hardcoded, nunca versionado
// — e ela sempre tem prioridade sobre defaultCredentials quando presente
// (ver CredentialsStore.Load()).
type Credentials struct {
	ClientID     string `json:"client_id"`
	ClientSecret string `json:"client_secret"`
}

// defaultCredentials é uma credencial de teste do IGDB embutida a pedido do
// Douglas (2026-08-17), para pequenos grupos de testadores não precisarem
// criar/colar a própria conta antes de ver a busca de capa funcionando.
//
// Trade-off aceito conscientemente, não decisão de arquitetura (sem ADR
// formal — escopo pequeno demais para isso): esta chave fica gravada no
// binário/instalador do ZeuX e no histórico do git, então é extraível por
// qualquer pessoa com o app instalado; e é compartilhada por todo mundo que
// não conectar a própria conta, sujeita ao mesmo limite de cota da
// Twitch/IGDB para todos ao mesmo tempo. Se o público de testadores
// crescer, rotacionar esta chave no painel da Twitch e reavaliar o
// trade-off é o caminho — nunca aumentar o público sem reavaliar a cota.
var defaultCredentials = Credentials{
	ClientID:     "fr1sxo7h82iihh48lrhl1qg94bh42y",
	ClientSecret: "2tt2naofqi6fkuwlbpo145q1kwplr9",
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

// Load devolve a credencial EFETIVA a usar para autenticar contra o IGDB: a
// pessoal, se alguém conectou uma em Configurações, ou a credencial de
// teste embutida (defaultCredentials) caso contrário — por isso o segundo
// retorno nunca é `false` aqui (sempre há alguma credencial para tentar).
// Use LoadPersonal para saber se a credencial em uso é a pessoal ou a
// padrão compartilhada (é o que a tela de Configurações precisa).
func (s *CredentialsStore) Load() (Credentials, bool, error) {
	creds, ok, err := s.LoadPersonal()
	if err != nil {
		return Credentials{}, false, err
	}
	if ok {
		return creds, true, nil
	}
	return defaultCredentials, true, nil
}

// LoadPersonal devolve só a credencial que o próprio usuário conectou em
// Configurações — nunca o padrão embutido de Load(). A ausência do arquivo,
// ou um arquivo corrompido, não é erro — só significa que ninguém conectou
// conta pessoal ainda (mesmo raciocínio de consent.Store.Load: errar para o
// lado de "sem credencial pessoal" é melhor que travar o app numa leitura
// ruim).
func (s *CredentialsStore) LoadPersonal() (Credentials, bool, error) {
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
