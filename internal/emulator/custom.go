package emulator

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
)

// Emuladores personalizados são a válvula de escape do ZeuX.
//
// A lista embutida nunca vai cobrir tudo: existem emuladores de nicho, forks,
// builds experimentais e sistemas que o catálogo não conhece. Um app que só
// roda o que os autores previram vira uma gaiola. Aqui o usuário aponta
// qualquer executável, com quaisquer argumentos, para qualquer sistema — o
// ZeuX não julga a escolha, só executa.
//
// Por isso a validação abaixo é mínima e checa apenas o que torna a definição
// impossível de executar (sem binário, sem o lugar da ROM). Nada de lista de
// emuladores permitidos, nada de exigir que o console exista no catálogo.

// Placeholders aceitos no template de argumentos.
const (
	PlaceholderROM      = "{rom}"
	PlaceholderScale    = "{scale}"
	PlaceholderRenderer = "{renderer}"
)

// CustomDefinition é um emulador cadastrado pelo usuário.
type CustomDefinition struct {
	ID         string   `json:"id"`
	Name       string   `json:"name"`
	Consoles   []string `json:"consoles"`
	BinaryPath string   `json:"binary_path"`

	// Args é o template de argumentos. Precisa conter {rom}, que é substituído
	// pelo caminho do jogo. {scale} e {renderer} são opcionais e recebem os
	// valores do preset. Qualquer outro texto é repassado literalmente.
	Args []string `json:"args"`

	// Notes é espaço livre para o usuário anotar o que quiser sobre esta
	// definição — de onde veio o build, qual bug ela contorna, o que for.
	Notes string `json:"notes,omitempty"`
}

// Validate checa apenas o que impediria a definição de funcionar.
func (d CustomDefinition) Validate() error {
	if strings.TrimSpace(d.ID) == "" {
		return fmt.Errorf("o emulador precisa de um identificador (id)")
	}
	if strings.TrimSpace(d.Name) == "" {
		return fmt.Errorf("o emulador precisa de um nome")
	}
	if strings.TrimSpace(d.BinaryPath) == "" {
		return fmt.Errorf("informe o caminho do executável do emulador")
	}
	if len(d.Consoles) == 0 {
		return fmt.Errorf("informe ao menos um console que este emulador atende")
	}

	// Sem {rom} o emulador abriria sem jogo nenhum. É a única exigência sobre o
	// conteúdo dos argumentos.
	for _, arg := range d.Args {
		if strings.Contains(arg, PlaceholderROM) {
			return nil
		}
	}

	return fmt.Errorf("os argumentos precisam conter %s, que marca onde entra o caminho do jogo", PlaceholderROM)
}

// customAdapter adapta uma definição do usuário à interface Adapter.
type customAdapter struct {
	def CustomDefinition
}

// NewCustomAdapter cria um adapter a partir de uma definição do usuário.
func NewCustomAdapter(def CustomDefinition) (Adapter, error) {
	if err := def.Validate(); err != nil {
		return nil, err
	}
	return customAdapter{def: def}, nil
}

func (a customAdapter) ID() string         { return a.def.ID }
func (a customAdapter) Name() string       { return a.def.Name }
func (a customAdapter) Consoles() []string { return a.def.Consoles }

// Locate confia no caminho que o usuário informou. Não procuramos em lugar
// nenhum nem aplicamos a heurística de bit de execução dos adapters embutidos:
// se a pessoa apontou para lá, é para lá que vamos.
func (a customAdapter) Locate(ctx context.Context) (Installation, bool) {
	info, err := os.Stat(a.def.BinaryPath)
	if err != nil || info.IsDir() {
		return Installation{}, false
	}

	return Installation{
		AdapterID:  a.def.ID,
		Name:       a.def.Name,
		BinaryPath: a.def.BinaryPath,
	}, true
}

func (a customAdapter) BuildCommand(install Installation, req Request) (Command, error) {
	if err := validateRequest(a, req); err != nil {
		return Command{}, err
	}

	binary := install.BinaryPath
	if binary == "" {
		binary = a.def.BinaryPath
	}

	scale := req.Options.InternalScale
	if scale < 1 {
		scale = 1
	}

	replacer := strings.NewReplacer(
		PlaceholderROM, req.ROMPath,
		PlaceholderScale, strconv.Itoa(scale),
		PlaceholderRenderer, string(req.Options.Renderer),
	)

	// Aqui os extras vêm antes do template, e não depois: o template do usuário
	// termina onde ele quiser — inclusive com o caminho do jogo no meio — e
	// anexar ao final poderia quebrar a ordem que ele desenhou.
	argv := []string{binary}
	argv = append(argv, req.Options.Extra...)
	for _, arg := range a.def.Args {
		argv = append(argv, replacer.Replace(arg))
	}

	// Só reportamos como não aplicado aquilo que o template realmente ignorou.
	// Quem escreveu o próprio template sabe o que colocou nele.
	var unapplied []string
	if req.Options.Fullscreen && !a.templateMentions("full", "-f") {
		unapplied = append(unapplied,
			"Este emulador é personalizado: se quiser tela cheia, inclua a opção correspondente nos argumentos.")
	}
	if req.Options.InternalScale > 1 && !a.templateHas(PlaceholderScale) {
		unapplied = append(unapplied,
			"O preset pede resolução aumentada, mas os argumentos não usam "+PlaceholderScale+".")
	}

	return Command{Argv: argv, Unapplied: unapplied}, nil
}

func (a customAdapter) templateHas(placeholder string) bool {
	for _, arg := range a.def.Args {
		if strings.Contains(arg, placeholder) {
			return true
		}
	}
	return false
}

func (a customAdapter) templateMentions(needles ...string) bool {
	for _, arg := range a.def.Args {
		lower := strings.ToLower(arg)
		for _, needle := range needles {
			if strings.Contains(lower, needle) {
				return true
			}
		}
	}
	return false
}

// Definition devolve a definição original, para exibição e edição.
func (a customAdapter) Definition() CustomDefinition { return a.def }

// CustomStore persiste as definições do usuário em disco.
type CustomStore struct {
	path string
	mu   sync.RWMutex
}

// NewCustomStore cria o repositório no diretório de configuração do usuário.
func NewCustomStore() (*CustomStore, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return nil, fmt.Errorf("localizando diretório de configuração: %w", err)
	}

	appDir := filepath.Join(dir, "ZeuX")
	if err := os.MkdirAll(appDir, 0o755); err != nil {
		return nil, fmt.Errorf("criando diretório de configuração: %w", err)
	}

	return &CustomStore{path: filepath.Join(appDir, "custom_emulators.json")}, nil
}

// Path devolve o arquivo onde as definições vivem. A interface mostra isso ao
// usuário: quem prefere editar o JSON à mão deve poder encontrá-lo.
func (s *CustomStore) Path() string { return s.path }

// Load lê as definições. Arquivo ausente devolve lista vazia, não erro.
func (s *CustomStore) Load() ([]CustomDefinition, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return s.loadLocked()
}

func (s *CustomStore) loadLocked() ([]CustomDefinition, error) {
	data, err := os.ReadFile(s.path)
	if os.IsNotExist(err) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("lendo emuladores personalizados: %w", err)
	}

	var definitions []CustomDefinition
	if err := json.Unmarshal(data, &definitions); err != nil {
		// O arquivo é editável à mão, e um JSON quebrado precisa apontar o erro
		// em vez de sumir silenciosamente com as definições do usuário.
		return nil, fmt.Errorf("o arquivo %s tem JSON inválido: %w", s.path, err)
	}

	return definitions, nil
}

func (s *CustomStore) saveLocked(definitions []CustomDefinition) error {
	if definitions == nil {
		definitions = []CustomDefinition{}
	}

	data, err := json.MarshalIndent(definitions, "", "  ")
	if err != nil {
		return fmt.Errorf("serializando emuladores personalizados: %w", err)
	}

	temp := s.path + ".tmp"
	if err := os.WriteFile(temp, data, 0o644); err != nil {
		return fmt.Errorf("gravando emuladores personalizados: %w", err)
	}

	// fsync garante que o arquivo está no disco antes do rename — resiste a
	// queda de energia no meio da operação.
	file, err := os.Open(temp)
	if err != nil {
		os.Remove(temp)
		return fmt.Errorf("reabrindo para fsync: %w", err)
	}
	if err := file.Sync(); err != nil {
		file.Close()
		os.Remove(temp)
		return fmt.Errorf("sincronizando ao disco: %w", err)
	}
	file.Close()

	if err := os.Rename(temp, s.path); err != nil {
		os.Remove(temp)
		return fmt.Errorf("finalizando gravação: %w", err)
	}

	return nil
}

// Upsert adiciona ou substitui uma definição pelo ID.
//
// Load e Save tomam o lock por conta própria, então chamá-los em sequência
// deixaria uma janela entre os dois onde outra goroutine poderia gravar por
// cima — dois POSTs simultâneos podiam se perder um ao outro. Aqui o lock é
// tomado uma vez só, para o ciclo ler-modificar-gravar inteiro.
func (s *CustomStore) Upsert(def CustomDefinition) ([]CustomDefinition, error) {
	if err := def.Validate(); err != nil {
		return nil, err
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	definitions, err := s.loadLocked()
	if err != nil {
		return nil, err
	}

	replaced := false
	for i, existing := range definitions {
		if existing.ID == def.ID {
			definitions[i] = def
			replaced = true
			break
		}
	}
	if !replaced {
		definitions = append(definitions, def)
	}

	return definitions, s.saveLocked(definitions)
}

// Delete remove uma definição pelo ID. Mesmo motivo do Upsert: um lock só
// para o ciclo ler-modificar-gravar inteiro.
func (s *CustomStore) Delete(id string) ([]CustomDefinition, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	definitions, err := s.loadLocked()
	if err != nil {
		return nil, err
	}

	filtered := make([]CustomDefinition, 0, len(definitions))
	found := false
	for _, def := range definitions {
		if def.ID == id {
			found = true
			continue
		}
		filtered = append(filtered, def)
	}

	if !found {
		return nil, fmt.Errorf("nenhum emulador personalizado com o id %q", id)
	}

	return filtered, s.saveLocked(filtered)
}

// BuildAdapters converte definições em adapters, ignorando as inválidas.
//
// Uma definição quebrada não pode derrubar as outras: quem editou o JSON à mão
// e errou numa entrada continua com as demais funcionando, e recebe de volta o
// que deu errado para corrigir.
func BuildAdapters(definitions []CustomDefinition) (adapters []Adapter, problems []string) {
	for _, def := range definitions {
		adapter, err := NewCustomAdapter(def)
		if err != nil {
			problems = append(problems, fmt.Sprintf("%s: %v", def.ID, err))
			continue
		}
		adapters = append(adapters, adapter)
	}

	return adapters, problems
}
