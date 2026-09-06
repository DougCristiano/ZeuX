package verdict

import (
	"fmt"
	"sort"

	"github.com/doufl/zeux/internal/emulator"
	"github.com/doufl/zeux/internal/hardware"
)

// Precision indica o quanto o parecer pode ser levado a sério. Quando a GPU não
// foi identificada, ou reportou VRAM desconhecida, o parecer sai como parcial —
// e a interface deve dizer isso ao usuário em vez de fingir certeza.
type Precision string

const (
	PrecisionCompleta Precision = "completa"
	PrecisionParcial  Precision = "parcial"
)

// ConsoleVerdict é o parecer para um console específico.
type ConsoleVerdict struct {
	ConsoleID string `json:"console_id"`
	Name      string `json:"name"`
	ShortName string `json:"short_name"`
	Year      int    `json:"year"`

	Level    Level  `json:"level"`
	Headline string `json:"headline"`

	// RequiresExternalFile vem direto do catálogo (Console.RequiresExternalFile)
	// — nunca varia por patamar, então fica fora do bloco condicional abaixo.
	// L9 (docs/roadmap.md) usa isto para mostrar o aviso genérico na biblioteca.
	RequiresExternalFile bool `json:"requires_external_file,omitempty"`

	// Emulator e Preset ficam vazios quando o nível é "improvavel": não faz
	// sentido sugerir configuração para algo que não deve rodar.
	Emulator  string `json:"emulator,omitempty"`
	AdapterID string `json:"adapter_id,omitempty"`
	Core      string `json:"core,omitempty"`
	Preset    string `json:"preset,omitempty"`

	// Options é o preset em forma aplicável, pronto para ser enviado ao
	// lançamento sem que a interface precise reinterpretar o texto.
	Options *emulator.Options `json:"options,omitempty"`

	// NextLevel e Bottlenecks respondem "o que falta para melhorar?". É o ponto
	// que evita o parecer virar uma nota opaca: em vez de dizer que a máquina é
	// mediana, dizemos exatamente qual componente barra o próximo patamar.
	NextLevel   Level    `json:"next_level,omitempty"`
	Bottlenecks []string `json:"bottlenecks,omitempty"`

	// DisplayNote explica, quando a resolução interna do preset foi ajustada
	// à tela do usuário (Q3), o que mudou e por quê. Ausente quando nada foi
	// ajustado — não há nota a dar sobre o caso normal.
	DisplayNote string `json:"display_note,omitempty"`

	Precision Precision `json:"precision"`
}

// Report reúne o parecer de todos os consoles junto do resumo do hardware.
type Report struct {
	Summary   HardwareSummary  `json:"summary"`
	Verdicts  []ConsoleVerdict `json:"verdicts"`
	Precision Precision        `json:"precision"`
	Notes     []string         `json:"notes"`
}

// Evaluate produz o parecer completo para o hardware detectado.
func Evaluate(catalog *Catalog, info hardware.HardwareInfo) Report {
	precision := PrecisionCompleta
	if len(info.GPUs) == 0 {
		precision = PrecisionParcial
	}

	report := Report{
		Summary:   Summarize(info),
		Precision: precision,
		Notes:     append([]string{}, info.Warnings...),
		Verdicts:  make([]ConsoleVerdict, 0, len(catalog.Consoles)),
	}

	for _, console := range catalog.Consoles {
		report.Verdicts = append(report.Verdicts, evaluateConsole(console, info))
	}

	// Consoles mais promissores primeiro: é o que o usuário quer ver logo ao
	// abrir o app. Empates caem para o mais recente, que costuma ser o mais
	// interessante entre dois consoles igualmente viáveis.
	sort.SliceStable(report.Verdicts, func(i, j int) bool {
		a, b := report.Verdicts[i], report.Verdicts[j]
		if a.Level != b.Level {
			return levelRank(a.Level) < levelRank(b.Level)
		}
		return a.Year > b.Year
	})

	return report
}

// evaluateConsole encontra o melhor patamar que a máquina atende e explica o
// que impede o patamar imediatamente acima.
func evaluateConsole(console Console, info hardware.HardwareInfo) ConsoleVerdict {
	result := ConsoleVerdict{
		ConsoleID:            console.ID,
		Name:                 console.Name,
		ShortName:            console.ShortName,
		Year:                 console.Year,
		Level:                LevelImprovavel,
		Precision:            PrecisionCompleta,
		RequiresExternalFile: console.RequiresExternalFile,
	}

	for index, tier := range console.Tiers {
		unmet, uncertain := checkRequirements(tier.Requires, info)
		if uncertain {
			result.Precision = PrecisionParcial
		}

		if len(unmet) > 0 {
			continue
		}

		result.Level = tier.Level
		result.Emulator = tier.Emulator
		result.AdapterID = tier.AdapterID
		result.Core = tier.Core
		result.Preset = tier.Preset

		options := tier.Options
		// Q3 (docs/roadmap.md, Sprint Q): a resolução interna do catálogo é
		// calibrada para 1080p — os próprios presets dizem isso no texto
		// ("Resolução interna 3x (1080p)"). Numa tela menor, renderizar nessa
		// escala gasta GPU sem nada aparecer.
		if scale, note, adjusted := scaleForDisplay(tier.Options.InternalScale, info); adjusted {
			options.InternalScale = scale
			result.DisplayNote = note
		}
		result.Options = &options

		// Atendeu um patamar que não é o melhor: explicamos o que falta acima.
		if index > 0 {
			better := console.Tiers[index-1]
			blockers, _ := checkRequirements(better.Requires, info)
			result.NextLevel = better.Level
			result.Bottlenecks = blockers
		}

		result.Headline = result.Level.Headline()
		return result
	}

	// Nenhum patamar atendido: o gargalo é o do patamar menos exigente.
	if len(console.Tiers) > 0 {
		lowest := console.Tiers[len(console.Tiers)-1]
		blockers, _ := checkRequirements(lowest.Requires, info)
		result.NextLevel = lowest.Level
		result.Bottlenecks = blockers
	}

	result.Headline = result.Level.Headline()
	return result
}

// EvaluateConsole retorna o parecer para um único console, sem recalcular os demais.
// É mais eficiente que Evaluate() quando só um console interessa.
func EvaluateConsole(catalog *Catalog, info hardware.HardwareInfo, consoleID string) (ConsoleVerdict, error) {
	console, ok := catalog.ConsoleByID(consoleID)
	if !ok {
		return ConsoleVerdict{}, fmt.Errorf("console %q desconhecido", consoleID)
	}
	return evaluateConsole(console, info), nil
}

// checkRequirements devolve a lista de exigências não atendidas, em linguagem
// de usuário, e sinaliza se alguma verificação teve de ser pulada por falta de
// dado confiável.
//
// A distinção importa: uma exigência pulada não é uma exigência atendida. Se a
// VRAM da placa não foi reportada, não afirmamos que ela é suficiente nem que é
// insuficiente — apenas marcamos o parecer como parcial.
func checkRequirements(req Requirements, info hardware.HardwareInfo) (unmet []string, uncertain bool) {
	if req.LogicalCores > 0 && info.CPU.LogicalCore < req.LogicalCores {
		unmet = append(unmet, fmt.Sprintf(
			"Este patamar pede %d threads de processador; esta CPU oferece %d.",
			req.LogicalCores, info.CPU.LogicalCore))
	}

	if req.ClockMHz > 0 {
		if info.CPU.BaseClockMHz <= 0 {
			uncertain = true
		} else if info.CPU.BaseClockMHz < req.ClockMHz {
			unmet = append(unmet, fmt.Sprintf(
				"Este patamar pede %.1f GHz de clock; esta CPU opera a %.1f GHz.",
				req.ClockMHz/1000, info.CPU.BaseClockMHz/1000))
		}
	}

	if req.RAMGiB > 0 {
		if total := info.TotalRAMGiB(); total < req.RAMGiB {
			unmet = append(unmet, fmt.Sprintf(
				"Este patamar pede %.0f GB de memória RAM; esta máquina tem %.1f GB.",
				req.RAMGiB, total))
		}
	}

	gpu, hasGPU := info.PrimaryGPU()

	if req.DedicatedGPU {
		switch {
		case !hasGPU:
			uncertain = true
		case !info.HasDedicatedGPU():
			unmet = append(unmet, fmt.Sprintf(
				"Este patamar pede uma placa de vídeo dedicada; esta máquina usa gráficos integrados (%s).",
				gpu.Model))
		}
	}

	if req.VRAMGiB > 0 {
		switch {
		case !hasGPU, gpu.VRAMBytes == 0:
			uncertain = true
		case gpu.VRAMGiB() < req.VRAMGiB:
			unmet = append(unmet, fmt.Sprintf(
				"Este patamar pede %.0f GB de memória de vídeo; a placa %s tem %.1f GB.",
				req.VRAMGiB, gpu.Model, gpu.VRAMGiB()))
		}
	}

	return unmet, uncertain
}

// levelRank ordena os níveis do melhor para o pior.
func levelRank(level Level) int {
	switch level {
	case LevelOtimo:
		return 0
	case LevelBom:
		return 1
	case LevelLimitado:
		return 2
	default:
		return 3
	}
}

// referenceDisplayHeight é a altura de tela para a qual os `internal_scale` do
// catálogo foram escritos. Não é uma escolha nossa: os próprios textos de
// preset dizem isso ("Resolução interna 3x (1080p)"), então é a única leitura
// coerente com o dado que já está lá.
const referenceDisplayHeight = 1080

// scaleForDisplay ajusta a resolução interna do preset à tela do usuário.
//
// **Só reduz, nunca aumenta.** Reduzir é seguro e claramente certo: renderizar
// 4x internamente para exibir num monitor de 768 linhas gasta GPU e não aparece
// em lugar nenhum. Aumentar seria outra conversa — o patamar do catálogo foi
// escolhido pelo que o *hardware* aguenta, não pelo que a tela mostra, e subir
// a escala num 4K entregaria à GPU um trabalho que o patamar não orçou. Quem
// quiser mais que isso tem o painel "Configurações" do emulador.
//
// Sem monitor detectado, devolve adjusted=false e o preset do catálogo vale
// como está: dado que não pôde ser lido não vira palpite (princípio 4).
//
// A regra em si é uma heurística, não uma medição — mesma ressalva do D2, que
// segue aberto sobre os limiares do catálogo.
func scaleForDisplay(tierScale int, info hardware.HardwareInfo) (scale int, note string, adjusted bool) {
	// Escala 0 ou 1 é "resolução nativa do console": não há o que reduzir.
	if tierScale <= 1 {
		return 0, "", false
	}

	display, ok := info.PrimaryDisplay()
	if !ok || display.Height <= 0 || display.Height >= referenceDisplayHeight {
		return 0, "", false
	}

	// Arredonda para cima: entre ficar abaixo do que a tela mostra e um pouco
	// acima, o excesso é invisível e a falta aparece como imagem mais grosseira.
	adjustedScale := (tierScale*display.Height + referenceDisplayHeight - 1) / referenceDisplayHeight
	if adjustedScale < 1 {
		adjustedScale = 1
	}
	if adjustedScale >= tierScale {
		return 0, "", false
	}

	// Descritivo, nunca julgador (princípio 2): diz os números e o que foi
	// feito, sem qualificar a tela do usuário.
	return adjustedScale, fmt.Sprintf(
		"Resolução interna ajustada de %dx para %dx: esta tela tem %d×%d, e o preset do catálogo é calibrado para %d linhas.",
		tierScale, adjustedScale, display.Width, display.Height, referenceDisplayHeight), true
}
