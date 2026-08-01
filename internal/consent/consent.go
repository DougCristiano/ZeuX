// Package consent guarda o consentimento do usuário para a leitura de hardware.
//
// O scan só pode acontecer depois de um "sim" explícito, e essa checagem vive no
// servidor — não na interface. Se um dia outro cliente falar com esta API, ou se
// alguém chamar a rota direto pelo terminal, a exigência continua valendo. Uma
// permissão que só a tela protege não é uma permissão.
package consent

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// PolicyVersion identifica o texto de consentimento que o usuário aceitou. Se o
// escopo do uso dos dados mudar, esta versão sobe e o consentimento anterior
// deixa de valer — o usuário precisa aceitar o novo texto.
const PolicyVersion = "1"

// PolicyText é o que a interface deve exibir ao pedir o consentimento. Fica aqui,
// junto da versão, para que texto e versão nunca saiam de sincronia.
const PolicyText = "O ZeuX vai ler as características do seu computador (modelo do processador, " +
	"núcleos, clock, placa de vídeo e memória) para sugerir quais consoles ele consegue rodar. " +
	"Esses dados são usados apenas para gerar essas sugestões e como base de comparação " +
	"entre jogadores. Nada além disso é coletado, e nenhum arquivo pessoal é acessado."

// Record é o registro persistido do consentimento.
type Record struct {
	Granted       bool      `json:"granted"`
	GrantedAt     time.Time `json:"granted_at,omitempty"`
	PolicyVersion string    `json:"policy_version"`
}

// IsValid informa se o registro autoriza um scan agora. Consentimento dado para
// uma versão antiga da política não vale para a atual.
func (r Record) IsValid() bool {
	return r.Granted && r.PolicyVersion == PolicyVersion
}

// Store persiste o consentimento em disco.
type Store struct {
	path string
	mu   sync.RWMutex
}

// NewStore cria o repositório de consentimento no diretório de configuração do
// usuário (AppData no Windows, ~/.config no Linux, Application Support no macOS).
func NewStore() (*Store, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return nil, fmt.Errorf("localizando diretório de configuração: %w", err)
	}

	appDir := filepath.Join(dir, "ZeuX")
	if err := os.MkdirAll(appDir, 0o755); err != nil {
		return nil, fmt.Errorf("criando diretório de configuração: %w", err)
	}

	return &Store{path: filepath.Join(appDir, "consent.json")}, nil
}

// Load devolve o consentimento registrado. A ausência do arquivo não é erro:
// significa apenas que o usuário ainda não respondeu, que é o estado esperado no
// primeiro uso.
func (s *Store) Load() (Record, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	data, err := os.ReadFile(s.path)
	if os.IsNotExist(err) {
		return Record{}, nil
	}
	if err != nil {
		return Record{}, fmt.Errorf("lendo consentimento: %w", err)
	}

	var record Record
	if err := json.Unmarshal(data, &record); err != nil {
		// Arquivo corrompido é tratado como ausência de consentimento. Errar para
		// o lado de perguntar de novo é melhor que assumir uma autorização que
		// talvez nunca tenha sido dada.
		return Record{}, nil
	}

	return record, nil
}

// Grant registra o consentimento do usuário para a política atual.
func (s *Store) Grant() (Record, error) {
	record := Record{
		Granted:       true,
		GrantedAt:     time.Now().UTC(),
		PolicyVersion: PolicyVersion,
	}
	return record, s.save(record)
}

// Revoke apaga o consentimento. O usuário precisa poder voltar atrás com a mesma
// facilidade com que autorizou.
func (s *Store) Revoke() (Record, error) {
	record := Record{Granted: false, PolicyVersion: PolicyVersion}
	return record, s.save(record)
}

// save grava o registro de forma atômica, escrevendo num arquivo temporário e
// renomeando por cima. Evita deixar um consent.json truncado caso o processo
// morra no meio da escrita.
func (s *Store) save(record Record) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := json.MarshalIndent(record, "", "  ")
	if err != nil {
		return fmt.Errorf("serializando consentimento: %w", err)
	}

	temp := s.path + ".tmp"
	if err := os.WriteFile(temp, data, 0o644); err != nil {
		return fmt.Errorf("gravando consentimento: %w", err)
	}

	if err := os.Rename(temp, s.path); err != nil {
		os.Remove(temp)
		return fmt.Errorf("finalizando gravação do consentimento: %w", err)
	}

	return nil
}
