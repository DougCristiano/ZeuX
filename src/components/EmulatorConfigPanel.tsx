import { useEffect, useState } from "react";
import { api, ApiError } from "../api";
import type { Renderer } from "../api/types";
import { Button, Select } from "./ui";

const inputClass =
  "w-full rounded border border-line bg-fill px-3 py-2 text-sm text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

const RENDERER_LABEL: Record<Renderer, string> = {
  "": "Padrão do emulador",
  vulkan: "Vulkan",
  opengl: "OpenGL",
  d3d12: "Direct3D 12",
  software: "Software",
};

/**
 * Painel de configuração persistida (H2, docs/roadmap.md) — consome
 * GET/POST/DELETE /emulators/{id}/config, que só existe de verdade para
 * adapters com `configurable: true` (PCSX2 e RetroArch nesta v1.0, ver
 * EmulatorEntry). Cada campo mostra o valor efetivo lido do arquivo real —
 * "desconhecido" quando o ZeuX não conseguiu ler, nunca um chute.
 *
 * Uma opção não suportada pelo emulador não trava a tela: ao salvar, o
 * servidor devolve `unapplied` nomeando o que não pôde ser aplicado (mesma
 * disciplina de `Command.Unapplied`), exibido como aviso — mais simples que
 * esconder campo por campo de antemão, e sem prometer certeza que a API
 * ainda não expõe por opção.
 */
export function EmulatorConfigPanel({ adapterId, adapterName }: { adapterId: string; adapterName: string }) {
  const [fullscreen, setFullscreen] = useState<boolean | null>(null);
  const [internalScale, setInternalScale] = useState<number | null>(null);
  const [renderer, setRenderer] = useState<Renderer>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [unapplied, setUnapplied] = useState<string[]>([]);
  const [confirmingRestore, setConfirmingRestore] = useState(false);
  const [restoring, setRestoring] = useState(false);

  function load() {
    setLoading(true);
    setError(null);
    api
      .getEmulatorConfig(adapterId)
      .then((cfg) => {
        setFullscreen(cfg.fullscreen ?? null);
        setInternalScale(cfg.internal_scale ?? null);
        setRenderer(cfg.renderer ?? "");
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Não foi possível ler a configuração."))
      .finally(() => setLoading(false));
  }

  useEffect(load, [adapterId]);

  async function save() {
    setSaving(true);
    setError(null);
    setUnapplied([]);
    try {
      const result = await api.setEmulatorConfig(adapterId, {
        fullscreen: fullscreen ?? false,
        internal_scale: internalScale ?? 0,
        renderer,
      });
      setUnapplied(result.unapplied ?? []);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível salvar a configuração.");
    } finally {
      setSaving(false);
    }
  }

  async function restore() {
    setRestoring(true);
    setError(null);
    try {
      await api.restoreEmulatorConfig(adapterId);
      setConfirmingRestore(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível restaurar a configuração original.");
    } finally {
      setRestoring(false);
    }
  }

  if (loading) return <p className="text-sm text-muted">Lendo a configuração do {adapterName}…</p>;

  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-danger">{error}</p>}

      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={fullscreen ?? false}
          onChange={(e) => setFullscreen(e.target.checked)}
          className="h-4 w-4"
        />
        Tela cheia
        {fullscreen === null && <span className="text-xs text-muted">(desconhecido — nunca lido do arquivo)</span>}
      </label>

      <label className="flex flex-col gap-1 text-sm text-ink">
        Resolução interna (multiplicador)
        <input
          type="number"
          min={0}
          value={internalScale ?? ""}
          placeholder={internalScale === null ? "desconhecido" : undefined}
          onChange={(e) => setInternalScale(e.target.value ? Number(e.target.value) : null)}
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-ink">
        Backend gráfico
        <Select value={renderer} onChange={(e) => setRenderer(e.target.value as Renderer)}>
          {(Object.keys(RENDERER_LABEL) as Renderer[]).map((r) => (
            <option key={r} value={r}>
              {RENDERER_LABEL[r]}
            </option>
          ))}
        </Select>
      </label>

      {unapplied.length > 0 && (
        <ul className="list-disc rounded border border-dashed border-amber-line bg-amber-bg pl-6 py-2 pr-2 text-sm text-ink">
          {unapplied.map((msg, i) => (
            <li key={i}>{msg}</li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={saving} onClick={save}>
          {saving ? "Salvando…" : "Salvar"}
        </Button>
        {confirmingRestore ? (
          <>
            <Button variant="primary" autoFocus disabled={restoring} onClick={restore}>
              Restaurar mesmo assim
            </Button>
            <Button variant="secondary" onClick={() => setConfirmingRestore(false)}>
              Cancelar
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={() => setConfirmingRestore(true)}>
            Restaurar padrão
          </Button>
        )}
      </div>
    </div>
  );
}
