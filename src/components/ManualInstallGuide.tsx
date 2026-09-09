import { useState } from "react";
import { openPath, openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import { api, ApiError } from "../api";
import { Button, InlineError } from "./ui";
import { useT } from "../i18n/i18n";
import { dict } from "./ManualInstallGuide.i18n";

/**
 * Trilho guiado de instalação manual (2026-09-09). Para emuladores de fonte
 * "manual" (RetroArch, Dolphin), o ZeuX não resolve o download por API — o
 * usuário baixa, extrai e coloca no lugar. Antes, as telas de Consoles e
 * Emuladores davam só um parágrafo solto + o caminho da pasta; este
 * componente transforma isso em passos numerados com as três ações:
 *
 *  1. abrir o site OFICIAL do projeto (link do catálogo, `source.homepage` —
 *     é o binário do emulador, não ROM/BIOS, então é permitido);
 *  2. abrir a pasta de destino no explorador (POST /emulators/{id}/managed-dir
 *     cria a pasta se ela ainda não existe — sem isso, "abrir a pasta"
 *     falha justamente para quem nunca instalou o emulador);
 *  3. "Verificar de novo" — refaz o Survey (GET /emulators roda a descoberta
 *     a cada chamada) e confirma pelo `installed` real do adapter.
 *
 * As duas telas compartilham este componente para o trilho não divergir no
 * primeiro ajuste — mesma razão de `controllerRegions.ts` ser um módulo só.
 */
export function ManualInstallGuide({
  emulatorId,
  emulatorName,
  homepage,
  reason,
  onVerified,
}: {
  emulatorId: string;
  emulatorName: string;
  /** `source.homepage` do catálogo — a página oficial de download do projeto. */
  homepage: string;
  /** `source.reason` do catálogo: por que este emulador é instalação manual. */
  reason?: string;
  /** Chamado quando "Verificar de novo" encontra o emulador instalado. */
  onVerified: () => void;
}) {
  const t = useT(dict);
  const [check, setCheck] = useState<
    { kind: "idle" } | { kind: "checking" } | { kind: "found" } | { kind: "not-found" }
  >({ kind: "idle" });
  const [folderError, setFolderError] = useState<string | null>(null);

  async function openDestination() {
    setFolderError(null);
    try {
      // Cria a pasta (se preciso) e devolve o caminho absoluto — só então
      // dá para revelá-la no explorador.
      const { path } = await api.ensureManagedDir(emulatorId);
      try {
        await revealItemInDir(path);
      } catch {
        // `revealItemInDir` quer um item existente; uma pasta recém-criada e
        // vazia às vezes não conta. Cair para abrir a pasta em si resolve.
        await openPath(path);
      }
    } catch (err) {
      setFolderError(
        t("errorOpeningFolder", { error: err instanceof ApiError || err instanceof Error ? err.message : String(err) }),
      );
    }
  }

  async function recheck() {
    setCheck({ kind: "checking" });
    try {
      const res = await api.getEmulators();
      const found = res.emulators.find((e) => e.adapter_id === emulatorId)?.installed ?? false;
      if (found) {
        setCheck({ kind: "found" });
        onVerified();
      } else {
        setCheck({ kind: "not-found" });
      }
    } catch {
      // Falhar em verificar não merece erro na cara — o botão continua ali.
      setCheck({ kind: "not-found" });
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-fill p-3">
      <p className="text-sm font-semibold text-ink">{t("heading")}</p>
      <p className="text-sm text-muted">{t("intro", { name: emulatorName })}</p>
      {reason && <p className="text-xs text-muted">{reason}</p>}

      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-ink">{t("step1Title", { name: emulatorName })}</p>
        <p className="text-sm text-muted">{t("step1Body")}</p>
        <Button variant="chrome" className="mt-1 w-fit" onClick={() => void openUrl(homepage)}>
          {t("openSite")}
        </Button>
        <p className="mt-0.5 font-mono text-xs break-all text-muted select-all">{homepage}</p>
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-ink">{t("step2Title")}</p>
        <p className="text-sm text-muted">{t("step2Body", { name: emulatorName })}</p>
        <Button variant="chrome" className="mt-1 w-fit" onClick={() => void openDestination()}>
          {t("openFolder")}
        </Button>
        {folderError && <InlineError>{folderError}</InlineError>}
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-ink">{t("step3Title")}</p>
        <p className="text-sm text-muted">{t("step3Body", { name: emulatorName })}</p>
        <Button
          variant="chrome"
          className="mt-1 w-fit"
          disabled={check.kind === "checking"}
          onClick={() => void recheck()}
        >
          {check.kind === "checking" ? t("rechecking") : t("recheck")}
        </Button>
        {check.kind === "found" && <p className="text-xs text-ink">{t("found", { name: emulatorName })}</p>}
        {check.kind === "not-found" && (
          <p className="text-xs text-muted">{t("notFound", { name: emulatorName })}</p>
        )}
      </div>
    </div>
  );
}
