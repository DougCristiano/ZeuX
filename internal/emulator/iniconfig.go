package emulator

import (
	"bytes"
	"fmt"
	"strings"
)

// iniFile é uma representação editável de um arquivo .ini clássico (seções
// [Nome] + Chave = Valor), usada por ConfigurableAdapter (H1,
// docs/roadmap.md) para editar a config de um emulador sem destruir o que o
// usuário já ajustou.
//
// A unidade de trabalho é a linha, não um mapa chave→valor: cada linha que
// este editor não toca sai byte a byte igual ao que entrou, comentário e
// espaçamento inclusive — só chaves explicitamente lidas por `set` mudam.
// Um `map[string]string` perderia ordem, comentários e chaves desconhecidas
// na hora de serializar de volta; a regra "config de emulador é do usuário,
// o ZeuX é visita" (H1) exige o formato linha a linha.
type iniFile struct {
	lines []iniLine
}

type iniLine struct {
	raw     string // conteúdo original da linha (sem o \n), usado quando não é uma chave alterada por set()
	section string // seção vigente nesta linha ("" antes da primeira [Seção])
	key     string // chave desta linha, se ela for "Chave = Valor"; "" caso contrário (comentário, [Seção], linha em branco)
}

// parseINI interpreta o conteúdo bruto de um arquivo .ini. Nunca falha —
// uma linha que não bate com nenhum formato reconhecido (comentário,
// [Seção], Chave = Valor) é preservada como está, sem interpretar.
func parseINI(data []byte) *iniFile {
	f := &iniFile{}
	section := ""

	text := strings.ReplaceAll(string(data), "\r\n", "\n")
	// TrimSuffix evita uma linha vazia fantasma no fim quando o arquivo já
	// termina com \n — bytes() reintroduz o \n final separadamente.
	text = strings.TrimSuffix(text, "\n")
	if text == "" {
		return f
	}

	for _, raw := range strings.Split(text, "\n") {
		trimmed := strings.TrimSpace(raw)

		if strings.HasPrefix(trimmed, "[") && strings.HasSuffix(trimmed, "]") {
			section = strings.TrimSpace(trimmed[1 : len(trimmed)-1])
			f.lines = append(f.lines, iniLine{raw: raw, section: section})
			continue
		}

		if trimmed == "" || strings.HasPrefix(trimmed, ";") || strings.HasPrefix(trimmed, "#") {
			f.lines = append(f.lines, iniLine{raw: raw, section: section})
			continue
		}

		if idx := strings.Index(raw, "="); idx >= 0 {
			key := strings.TrimSpace(raw[:idx])
			if key != "" {
				f.lines = append(f.lines, iniLine{raw: raw, section: section, key: key})
				continue
			}
		}

		// Linha que não reconhecemos (ex.: "= valor sem chave") — preservada
		// como está, nunca descartada.
		f.lines = append(f.lines, iniLine{raw: raw, section: section})
	}

	return f
}

// get devolve o valor bruto (texto entre o "=" e o fim da linha, com espaço
// nas pontas removido) de section/key, e se a chave foi achada.
func (f *iniFile) get(section, key string) (string, bool) {
	for _, line := range f.lines {
		if line.section == section && line.key == key {
			idx := strings.Index(line.raw, "=")
			return strings.TrimSpace(line.raw[idx+1:]), true
		}
	}
	return "", false
}

// set sobrescreve o valor de section/key se a chave já existir (preservando
// tudo mais nessa linha — nome exato da chave, espaçamento em volta do "=");
// senão insere "Chave = Valor" ao final da seção, criando a seção ao final
// do arquivo se ela ainda não existir.
func (f *iniFile) set(section, key, value string) {
	for i, line := range f.lines {
		if line.section == section && line.key == key {
			idx := strings.Index(line.raw, "=")
			f.lines[i].raw = line.raw[:idx+1] + " " + value
			return
		}
	}

	// Insere logo após a última CHAVE da seção (ou, se a seção ainda não
	// tem nenhuma, logo após o cabeçalho "[Seção]") — nunca depois da
	// última linha "de qualquer tipo" com essa seção, que poderia ser uma
	// linha em branco separando da próxima seção. Inserir ali empurraria a
	// chave nova para depois do separador, dentro visualmente da seção
	// seguinte.
	headerAt := -1
	lastKeyAt := -1
	for i, line := range f.lines {
		if strings.TrimSpace(line.raw) == "["+section+"]" {
			headerAt = i
		}
		if line.section == section && line.key != "" {
			lastKeyAt = i
		}
	}

	insertAt := lastKeyAt
	if insertAt == -1 {
		insertAt = headerAt
	}

	newLine := iniLine{raw: fmt.Sprintf("%s = %s", key, value), section: section, key: key}

	if insertAt == -1 {
		// Seção ainda não existe — cria ao final do arquivo. Uma linha em
		// branco antes separa da última seção existente, se houver alguma.
		if len(f.lines) > 0 {
			f.lines = append(f.lines, iniLine{raw: ""})
		}
		f.lines = append(f.lines, iniLine{raw: "[" + section + "]", section: section})
		f.lines = append(f.lines, newLine)
		return
	}

	insertAt++
	f.lines = append(f.lines[:insertAt], append([]iniLine{newLine}, f.lines[insertAt:]...)...)
}

// bytes serializa o arquivo de volta, uma linha por linha, terminando com
// \n (convenção já usada pelo resto do repositório — ver firstrun.go).
func (f *iniFile) bytes() []byte {
	var buf bytes.Buffer
	for _, line := range f.lines {
		buf.WriteString(line.raw)
		buf.WriteByte('\n')
	}
	return buf.Bytes()
}
