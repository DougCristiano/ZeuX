import { useEffect, useState } from "react";
import { api, ApiError } from "../api";
import { useT } from "../i18n/i18n";
import { dict } from "./ManualEmulatorFormModal.i18n";
import { ManualEmulatorForm } from "./ManualEmulatorForm";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { InlineError } from "./ui";

/**
 * B2 (docs/pendencias.md): as telas de lançamento (Home/AllGames/Games/
 * GameDetail) não têm uma superfície de "formulário aberto" embutida como
 * `ConsoleDetailScreen`/`EmulatorsScreen` têm — sobrepor o `ManualEmulatorForm`
 * num modal evita duplicar essa superfície em quatro telas diferentes, e
 * reaproveita o mesmo shell (`Dialog`) que `ErrorModal` já usa: focus-trap e
 * `aria-modal` de graça, sem fechar clicando fora (mesma regra do `ErrorModal`
 * — o formulário tem estado digitado, perder isso com um clique acidental
 * fora seria pior que o erro que levou até aqui).
 *
 * Autocontido de propósito: busca `existingIds`/`placeholders` sozinho (mesma
 * chamada que `EmulatorsScreen` já fazia) em vez de pedir que cada tela
 * chamadora replique esse carregamento só para abrir este modal uma vez.
 */
export function ManualEmulatorFormModal({
  prefill,
  onClose,
  onSaved,
}: {
  prefill?: { name?: string; consoles?: string[] };
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT(dict);
  const [existingIds, setExistingIds] = useState<string[] | null>(null);
  const [placeholders, setPlaceholders] = useState<Record<string, string>>({});
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getCustomEmulators()
      .then((res) => {
        setExistingIds(res.custom_emulators.map((c) => c.id));
        setPlaceholders(res.placeholders);
      })
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : t("loadError")));
  }, [t]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="sm:max-w-lg rounded-lg border border-line bg-fill p-5 ring-0"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogTitle className="mb-2 text-lg font-semibold tracking-wide text-accent-secondary uppercase">
          {t("title")}
        </DialogTitle>
        {/* C3 (mesmo achado do ErrorModal): `DialogDescription` é o que o
            leitor de tela liga ao modal via `aria-describedby` — sem
            conteúdo visível de propósito aqui, o formulário abaixo já é a
            descrição real. */}
        <DialogDescription className="sr-only">{t("title")}</DialogDescription>

        {loadError && <InlineError>{loadError}</InlineError>}
        {!loadError && existingIds === null && <p className="text-sm text-muted">{t("loading")}</p>}
        {!loadError && existingIds !== null && (
          <ManualEmulatorForm
            prefill={prefill}
            existingIds={existingIds}
            placeholders={placeholders}
            onSaved={onSaved}
            onCancel={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
