import { useEffect, useState } from "react";
import { api, ApiError } from "../api";
import type { SaveData, SaveDataFile } from "../api/types";
import { formatBytes, formatFileDate } from "../lib/format";
import { Button, Callout, Card, InlineError, InlineWarning, Toast, inputClass } from "./ui";
import { useToast } from "../hooks/useToast";
import { useT } from "../i18n/i18n";
import { dict } from "./SaveDataPanel.i18n";

// Escrita de local de save (POST /emulators/{id}/save-data) só existe de
// verdade para o RetroArch hoje — ver docs/api.md, "SaveDataConfigurableAdapter".
// Não há campo em EmulatorEntry que anuncie isso de antemão (diferente de
// `configurable`/`bindable`), e tentar o POST só pra descobrir a resposta
// obrigaria a lidar com um efeito colateral (mudar o local de save de
// verdade) escondido dentro de uma checagem de capacidade. Mais simples e
// mais honesto: gatear a UI de edição pelo adapter_id conhecido, do mesmo
// jeito que a tabela de docs/pendencias.md já descreve o suporte hoje. Se
// outro adapter ganhar a capacidade, este `if` cresce junto.
const SAVE_DATA_WRITABLE_ADAPTERS = new Set(["retroarch"]);

function FileList({ files, emptyLabel }: { files: SaveDataFile[]; emptyLabel: string }) {
  if (files.length === 0) {
    return <p className="text-sm text-muted">{emptyLabel}</p>;
  }
  return (
    <ul className="flex flex-col divide-y divide-line">
      {files.map((file) => (
        <li key={file.name} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 py-1.5 text-sm">
          {/* Nome cru do arquivo — nenhuma tentativa de casar com um jogo da
              biblioteca (não temos esse dado, ver docs/pendencias.md). */}
          <span className="min-w-0 flex-1 truncate text-ink" title={file.name}>
            {file.name}
          </span>
          <span className="shrink-0 whitespace-nowrap font-mono text-xs text-muted">
            {formatBytes(file.size_bytes)} · {formatFileDate(file.modified_at)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * MVP de inspeção de saves (docs/pendencias.md, "Ver saves dentro do ZeuX")
 * — mostra onde este adapter guarda memory card e save state nesta máquina
 * e o que já existe lá. Nunca apaga, exporta, nem tenta casar um arquivo com
 * um jogo específico: é a lista crua que `GET .../save-data` devolve.
 *
 * `known:false` não é erro — é o estado normal para todo adapter cujo local
 * de save ainda não foi verificado ao vivo (princípio 4 do CLAUDE.md:
 * declarar desconhecido em vez de fingir certeza).
 */
export function SaveDataPanel({ adapterId }: { adapterId: string }) {
  const t = useT(dict);
  const [data, setData] = useState<SaveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [memoryCardsDir, setMemoryCardsDir] = useState("");
  const [saveStatesDir, setSaveStatesDir] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const { toastMessage, showToast } = useToast();

  function load() {
    setLoading(true);
    setError(null);
    api
      .getSaveData(adapterId)
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : t("readError")))
      .finally(() => setLoading(false));
  }

  useEffect(load, [adapterId]);

  function startEditing() {
    setMemoryCardsDir(data?.memory_cards_dir ?? "");
    setSaveStatesDir(data?.save_states_dir ?? "");
    setSaveError(null);
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    setSaveError(null);
    try {
      await api.setSaveData(adapterId, { memory_cards_dir: memoryCardsDir, save_states_dir: saveStatesDir });
      setEditing(false);
      load();
      showToast(t("savedToast"));
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : t("saveError"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-sm text-muted">{t("loading")}</p>;
  if (error) return <InlineError>{error}</InlineError>;
  if (!data) return null;

  const writable = SAVE_DATA_WRITABLE_ADAPTERS.has(adapterId);

  // known:false é estado normal (nenhum adapter novo foi verificado ao vivo
  // ainda) — mostrado como texto neutro, sem tom de erro (Callout, não
  // InlineError/InlineWarning).
  if (!data.known) {
    return <Callout label="Saves">{data.message}</Callout>;
  }

  return (
    <div className="flex flex-col gap-3">
      {toastMessage && <Toast message={toastMessage} />}

      {editing ? (
        <Card filled className="flex flex-col gap-3">
          {!writable && <InlineWarning>{t("notConfigurable")}</InlineWarning>}
          <label className="flex flex-col gap-1 text-sm text-ink">
            {t("memoryCardsDirLabel")}
            <input
              type="text"
              value={memoryCardsDir}
              placeholder={t("dirPlaceholder")}
              disabled={!writable}
              onChange={(e) => setMemoryCardsDir(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-ink">
            {t("saveStatesDirLabel")}
            <input
              type="text"
              value={saveStatesDir}
              placeholder={t("dirPlaceholder")}
              disabled={!writable}
              onChange={(e) => setSaveStatesDir(e.target.value)}
              className={inputClass}
            />
          </label>
          {saveError && <InlineError>{saveError}</InlineError>}
          <div className="flex flex-wrap gap-2">
            {writable && (
              <Button variant="primary" disabled={saving} onClick={save}>
                {saving ? t("saving") : t("save")}
              </Button>
            )}
            <Button variant="secondary" onClick={() => setEditing(false)}>
              {t("cancel")}
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <p className="font-mono text-xs tracking-wide text-muted uppercase">{t("memoryCardsLabel")}</p>
            <p className="truncate text-sm text-muted" title={data.memory_cards_dir}>
              {data.memory_cards_dir}
            </p>
            <FileList files={data.memory_cards ?? []} emptyLabel={t("emptyFolder")} />
          </div>

          <div className="flex flex-col gap-1">
            <p className="font-mono text-xs tracking-wide text-muted uppercase">{t("saveStatesLabel")}</p>
            <p className="truncate text-sm text-muted" title={data.save_states_dir}>
              {data.save_states_dir}
            </p>
            <FileList files={data.save_states ?? []} emptyLabel={t("emptyFolder")} />
          </div>

          <div>
            <Button variant="secondary" onClick={startEditing}>
              {t("changeLocation")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
