import { useT } from "../i18n/i18n";
import { Button, AmbientGlow } from "../components/ui";
import { dict } from "./DeclinedScreen.i18n";

/**
 * Tela mostrada depois de "Agora não" na tela 01. Regra de produto (item B8):
 * recusar não pode ser beco sem saída — o app continua utilizável, e a
 * recusa pode ser revista a qualquer momento.
 *
 * Achado real, 2026-09-08 (relato do Douglas: "quem não dá consentimento
 * não consegue acessar a biblioteca — tem que poder fazer tudo que uma
 * pessoa que deu consentimento pode fazer"): antes desta correção, esta
 * tela só oferecia "Autorizar agora" ou "Ver emuladores" — sem caminho
 * nenhum para Biblioteca/Consoles/Configurações, e as telas de biblioteca
 * exigiam `report` não-nulo por dentro. Agora "Continuar sem autorizar"
 * leva ao app inteiro (mesma sidebar, mesmas telas) sem nenhum parecer de
 * hardware calculado — jogos abrem sem preset autoconfigurado (ver
 * `internal/api/server.go`, `toInput`), e a tela de Especificações mostra
 * por que não há parecer, com um atalho de volta para autorizar.
 *
 * Redesenho arcade/CRT estendido a esta tela (2026-09-09, ver docs/decisoes.md):
 * kicker monoespaçado em ciano (o sistema informando o estado — sem leitura de
 * hardware), linhas de CRT decorativas, e só "Autorizar agora" fica em
 * `primary`. "Continuar sem autorizar" e "Ver emuladores" são navegação e
 * descem para `chrome` — nada de `secondary` solto.
 */
export function DeclinedScreen({
  onReconsider,
  onViewEmulators,
  onContinueWithoutConsent,
}: {
  onReconsider: () => void;
  onViewEmulators: () => void;
  onContinueWithoutConsent: () => void;
}) {
  const t = useT(dict);

  return (
    // N3/N8 (docs/roadmap.md, Sprint N): max-w-3xl é o mesmo teto de leitura
    // do resto do app (era max-w-md); glow de identidade (N8) — mesmo motivo
    // do comentário em AmbientGlow (src/components/ui.tsx).
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-paper px-6">
      <AmbientGlow />
      {/* Linhas de CRT bem apagadas (~8%) — mesmo material do `SplashScreen`/
          `GameHero`; o texto por cima é `--ink`/`--muted` sobre `--paper`, com
          folga de contraste de sobra. */}
      <div aria-hidden="true" className="zeux-scanlines pointer-events-none absolute inset-0 opacity-[0.08]" />
      <div className="relative z-10 flex w-full max-w-3xl flex-col gap-4">
        <p className="font-mono text-xs tracking-wider text-accent-secondary uppercase">{t("kicker")}</p>
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
          <Button variant="chrome" onClick={onContinueWithoutConsent}>
            {t("continueWithoutConsent")}
          </Button>
          <Button variant="chrome" onClick={onViewEmulators}>
            {t("viewEmulators")}
          </Button>
        </div>
      </div>
    </main>
  );
}
