package emulator

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

// "Salvar estado ao fechar o jogo" (decisão do Douglas, 2026-10-09): em todo
// emulador que oferece a opção, o ZeuX a liga por padrão, porque é ela que
// grava o estado que o "Continuar" retoma. A pessoa pode desligá-la na tela
// de configurações do emulador.
//
// Onde o valor mora depende do emulador, e a regra é não criar um segundo
// lugar quando o emulador já tem um:
//   - DuckStation e PCSX2: a própria chave do arquivo de configuração deles
//     (settings.ini [Main] SaveStateOnExit; PCSX2.ini [EmuCore]
//     SaveStateOnShutdown). O ZeuX já escreve esses arquivos.
//   - RetroArch e Flycast: não há arquivo do emulador que o ZeuX possa usar
//     como fonte de verdade (o RetroArch recebe um arquivo de override; o
//     Flycast recebe -config transitório). O valor fica na tabela
//     emulator_launch_prefs.
//
// Em todos, a opção aparece com o mesmo ID (AutoSaveStateID), para que a tela
// tenha um único controle por emulador.

// AutoSaveStateID é o ID da opção "Salvar estado ao fechar o jogo" no catálogo
// de cada emulador. Igual em todos, para a interface ter um só texto e um só
// controle.
const AutoSaveStateID = "auto_save_state"

// StoresSettingsInZeuX diz se as opções do emulador ficam na tabela do ZeuX
// (e não no arquivo do emulador). Só RetroArch e Flycast: ver o comentário
// do arquivo.
func StoresSettingsInZeuX(adapterID string) bool {
	return adapterID == "retroarch" || adapterID == "flycast"
}

// fileAutoSaveSetting é a opção de auto-save para os emuladores que a guardam
// no próprio arquivo: a chave e o padrão ligado do ZeuX.
func fileAutoSaveSetting(section, key string) EmulatorSetting {
	return EmulatorSetting{ID: AutoSaveStateID, Section: section, Key: key, Kind: SettingBool, Default: "true"}
}

// storedAutoSaveSetting é a mesma opção, para os emuladores que a guardam no
// ZeuX: sem seção nem chave de arquivo.
func storedAutoSaveSetting() EmulatorSetting {
	return EmulatorSetting{ID: AutoSaveStateID, Kind: SettingBool, Default: "true"}
}

// LaunchPrefsRepository guarda as preferências de lançamento do ZeuX. Interface
// para que os testes do lançamento não precisem de banco; sem ela, vale o padrão.
type LaunchPrefsRepository interface {
	// AutoSaveState devolve o valor guardado e se há um valor guardado. Sem
	// linha, o padrão do ZeuX (ligado) vale.
	AutoSaveState(ctx context.Context, adapterID string) (on bool, stored bool, err error)
	SetAutoSaveState(ctx context.Context, adapterID string, on bool) error
}

// AutoSaveState implementa LaunchPrefsRepository.
func (s *SQLiteSessions) AutoSaveState(ctx context.Context, adapterID string) (bool, bool, error) {
	var v int
	err := s.db.QueryRowContext(ctx,
		`SELECT auto_save_state FROM emulator_launch_prefs WHERE adapter_id = ?`, adapterID).Scan(&v)
	if errors.Is(err, sql.ErrNoRows) {
		return true, false, nil
	}
	if err != nil {
		return true, false, fmt.Errorf("lendo a opção de salvar estado de %s: %w", adapterID, err)
	}
	return v != 0, true, nil
}

// SetAutoSaveState implementa LaunchPrefsRepository.
func (s *SQLiteSessions) SetAutoSaveState(ctx context.Context, adapterID string, on bool) error {
	v := 0
	if on {
		v = 1
	}
	if _, err := s.db.ExecContext(ctx, `
		INSERT INTO emulator_launch_prefs (adapter_id, auto_save_state) VALUES (?, ?)
		ON CONFLICT (adapter_id) DO UPDATE SET auto_save_state = excluded.auto_save_state
	`, adapterID, v); err != nil {
		return fmt.Errorf("gravando a opção de salvar estado de %s: %w", adapterID, err)
	}
	return nil
}

// AutoSaveStateFor diz se o lançamento deve pedir o salvamento ao fechar.
// Para emuladores cuja opção fica no arquivo do próprio emulador, a resposta é
// sempre "ligado": quem decide ali é o arquivo, e o lançamento só garante o
// padrão (EnsureDuckStationDefaults, EnsurePCSX2Defaults). Erro de banco vale
// como ligado — é o padrão do produto, e o aviso vai para o log.
func (l *Launcher) AutoSaveStateFor(ctx context.Context, adapterID string) bool {
	if !StoresSettingsInZeuX(adapterID) {
		return true
	}
	repo, ok := l.sessions.(LaunchPrefsRepository)
	if !ok {
		return true
	}
	on, _, err := repo.AutoSaveState(ctx, adapterID)
	if err != nil {
		l.logger.Warn("não foi possível ler a opção de salvar estado; usando o padrão (ligado)",
			"emulador", adapterID, "erro", err)
		return true
	}
	return on
}

// StoredEmulatorSettings devolve o catálogo de um emulador cujas opções ficam
// no ZeuX, com o valor atual. Para os outros, quem chama usa
// ReadEmulatorSettings.
func (l *Launcher) StoredEmulatorSettings(ctx context.Context, adapterID string) ([]EmulatorSetting, error) {
	if !StoresSettingsInZeuX(adapterID) {
		return nil, ErrSettingsUnsupported
	}
	s := storedAutoSaveSetting()
	s.Value = "true"
	if repo, ok := l.sessions.(LaunchPrefsRepository); ok {
		on, _, err := repo.AutoSaveState(ctx, adapterID)
		if err != nil {
			return nil, err
		}
		s.Value = fmt.Sprint(on)
	}
	return []EmulatorSetting{s}, nil
}

// SetStoredEmulatorSettings valida e grava as opções de um emulador cujas
// opções ficam no ZeuX. Recusa tudo se algum ID for desconhecido ou algum valor
// for inválido, como WriteEmulatorSettings faz com o arquivo.
func (l *Launcher) SetStoredEmulatorSettings(ctx context.Context, adapterID string, values map[string]string) error {
	if !StoresSettingsInZeuX(adapterID) {
		return ErrSettingsUnsupported
	}
	repo, ok := l.sessions.(LaunchPrefsRepository)
	if !ok {
		return errors.New("o ZeuX não tem onde guardar a configuração deste emulador")
	}
	catalog := storedAutoSaveSetting()
	for id, v := range values {
		if id != catalog.ID {
			return fmt.Errorf("a opção %q não existe nas opções deste emulador", id)
		}
		if err := validateSettingValue(catalog, v); err != nil {
			return err
		}
	}
	if v, ok := values[AutoSaveStateID]; ok {
		return repo.SetAutoSaveState(ctx, adapterID, v == "true")
	}
	return nil
}
