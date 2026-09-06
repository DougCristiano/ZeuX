import { useT } from "../i18n/i18n";
import { Button, OnboardingGlow } from "../components/ui";
import { dict } from "./DeclinedScreen.i18n";

/**
 * Tela mostrada depois de "Agora não" na tela 01. Regra de produto (item B8):
 * recusar não pode ser beco sem saída — o app continua utilizável, e a
 * recusa pode ser revista a qualquer momento.
 *
 * Honestidade de escopo: a biblioteca (wireframe 04-05) ainda não existe
 * nesta versão (Sprint D). Emuladores (B10) já existe e não depende de
 * consentimento — instalar um emulador não lê hardware nenhum — por isso
 * "Ver emuladores" aparece aqui de verdade, não como promessa vazia.
 */
export function DeclinedScreen({
  onReconsider,
  onViewEmulators,
}: {
  onReconsider: () => void;
  onViewEmulators: () => void;
}) {
  const t = useT(dict);

  return (
    // N3/N8 (docs/roadmap.md, Sprint N): max-w-3xl é o mesmo teto de leitura
    // do resto do app (era max-w-md); glow de identidade (N8) — mesmo motivo
    // do comentário em OnboardingGlow (src/components/ui.tsx).
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-paper px-6">
      <OnboardingGlow />
      <div className="relative z-10 flex w-full max-w-3xl flex-col gap-4">
        <h1 className="text-2xl font-semibold text-ink">{t("heading")}</h1>
        <p className="text-base text-ink">
          {t("description")}
        </p>
        <p className="text-sm text-muted">
          {t("note")}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" autoFocus onClick={onReconsider}>
            {t("reconsider")}
          </Button>
          <Button variant="secondary" onClick={onViewEmulators}>
            {t("viewEmulators")}
          </Button>
        </div>
      </div>
    </main>
  );
}
