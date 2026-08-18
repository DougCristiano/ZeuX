import { useEffect, useState } from "react";
import { api, ApiError } from "../api";
import type { Renderer } from "../api/types";
import { Button, Callout, ConfirmModal, InlineError, inputClass, Toast, ZSelect } from "./ui";
import { SelectItem } from "./ui/select";
import { useToast } from "../hooks/useToast";

const RENDERER_LABEL: Record<Renderer, string> = {
  "": "Padrão do emulador",
  vulkan: "Vulkan",
  opengl: "OpenGL",
  d3d12: "Direct3D 12",
  software: "Software",
};

// Mesmo motivo do sentinela em EmulatorsScreen.tsx (J3, docs/roadmap.md): o
// `Select` do shadcn/Radix recusa `value=""` num `SelectItem`, e "" aqui é
// "Padrão do emulador" (renderer não escolhido).
const DEFAULT_RENDERER = "__default__";

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
  // N9 (docs/roadmap.md, Sprint N): antes, salvar só fazia o botão voltar ao
  // normal — nada dizia que funcionou.
  const { toastMessage, showToast } = useToast();

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
      showToast("Configuração salva.");
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
      {toastMessage && <Toast message={toastMessage} />}
      {error && <InlineError>{error}</InlineError>}

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
        <ZSelect
          ariaLabel="Backend gráfico"
          value={renderer || DEFAULT_RENDERER}
          onValueChange={(v) => setRenderer((v === DEFAULT_RENDERER ? "" : v) as Renderer)}
        >
          {(Object.keys(RENDERER_LABEL) as Renderer[]).map((r) => (
            <SelectItem key={r || DEFAULT_RENDERER} value={r || DEFAULT_RENDERER}>
              {RENDERER_LABEL[r]}
            </SelectItem>
          ))}
        </ZSelect>
      </label>

      {/* N16 (docs/roadmap.md, Sprint N): era uma `<ul>` montada à mão com
          borda/fundo âmbar copiados — `Callout` (tone="amber") já é
          exatamente esse componente, reaproveitado em vez de duplicado. */}
      {unapplied.length > 0 && (
        <Callout label="Não aplicado" tone="amber">
          <ul className="list-disc pl-4">
            {unapplied.map((msg, i) => (
              <li key={i}>{msg}</li>
            ))}
          </ul>
        </Callout>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={saving} onClick={save}>
          {saving ? "Salvando…" : "Salvar"}
        </Button>
        {confirmingRestore ? (
          // N13 (docs/roadmap.md, Sprint N): irreversível (descarta a
          // configuração personalizada salva) — era painel inline, virou modal.
          <ConfirmModal
            title="Restaurar configuração padrão?"
            message={`As opções personalizadas de ${adapterName} salvas aqui serão descartadas.`}
            onClose={() => setConfirmingRestore(false)}
            actions={
              <>
                <Button variant="secondary" onClick={() => setConfirmingRestore(false)}>
                  Cancelar
                </Button>
                <Button variant="danger" autoFocus disabled={restoring} onClick={restore}>
                  Restaurar mesmo assim
                </Button>
              </>
            }
          />
        ) : (
          <Button variant="secondary" onClick={() => setConfirmingRestore(true)}>
            Restaurar padrão
          </Button>
        )}
      </div>
    </div>
  );
}
