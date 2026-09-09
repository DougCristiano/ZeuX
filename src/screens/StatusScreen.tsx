import logoZeux from "../assets/logo-zeux.png";
import { useT } from "../i18n/i18n";
import { Button, AmbientGlow, InlineError } from "../components/ui";
import { dict } from "./StatusScreen.i18n";

/**
 * Estado de carregamento — nunca fica girando para sempre (ver ErrorScreen).
 *
 * N6 (docs/roadmap.md, Sprint N): antes era só o `<p>` de texto, sem marca
 * nem indicador de atividade — a primeira coisa que qualquer usuário vê (até
 * ~20s na primeira abertura, enquanto o sidecar sobe) era uma linha cinza
 * sobre preto, sem nenhum sinal de que o app estava vivo. O logo dá
 * identidade; o spinner (`motion-reduce:animate-none` — ADR 0009 exige
 * respeitar a preferência do SO) dá o sinal de atividade que faltava.
 *
 * Redesenho arcade/CRT estendido a esta tela (2026-09-09, ver docs/decisoes.md):
 * as linhas de CRT sobre o logo — mesmo tratamento que o `SplashScreen` já dá
 * à marca — fazem a tela de conexão e a abertura falarem a mesma língua. O
 * spinner já usa o ciano de "sistema informando" desde o N6.
 */
export function LoadingScreen({ message }: { message: string }) {
  return (
    <main
      className="relative flex min-h-screen flex-col items-center justify-center gap-4 overflow-hidden bg-paper"
      role="status"
    >
      <AmbientGlow />
      <div className="relative z-10">
        <img src={logoZeux} alt="" aria-hidden="true" className="h-12 w-12" />
        {/* Linhas de CRT recortadas na área do logo, mesma opacidade que o
            `SplashScreen` usa sobre a marca (60%). Decorativas, `aria-hidden`. */}
        <div aria-hidden="true" className="zeux-scanlines pointer-events-none absolute inset-0 opacity-60" />
      </div>
      {/* A11y 1.3.1: heading da tela — visualmente a mensagem já basta, então
          fica `sr-only`; sem ele, quem navega por headings não acha esta tela. */}
      <h1 className="sr-only">Carregando</h1>
      <p className="relative z-10 font-mono text-sm text-muted">{message}</p>
      <div
        aria-hidden="true"
        className="relative z-10 h-5 w-5 animate-spin rounded-full border-2 border-line-strong border-t-accent-secondary motion-reduce:animate-none"
      />
    </main>
  );
}

/**
 * Erro com caminho de volta — sempre com um botão "tentar de novo", nunca só
 * uma mensagem morta. Item B8 (docs/sprint-b-plano.md): "se o daemon não
 * responder, a tela mostra a falha em português e um botão de tentar de
 * novo — nunca fica girando indefinidamente".
 *
 * Redesenho arcade/CRT (2026-09-09): kicker monoespaçado em vermelho (o degrau
 * que diz "isto é uma falha" antes da mensagem) e a mensagem dentro do
 * `InlineError` do app — a mesma moldura de erro que o resto da interface usa,
 * em vez de um `<p>` vermelho solto. A mensagem em si continua vindo de fora,
 * sem reescrita.
 */
export function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  const t = useT(dict);

  return (
    // N3/N8 (docs/roadmap.md, Sprint N): max-w-3xl é o teto de leitura do
    // resto do app (era max-w-sm, isolado); glow de identidade (N8).
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-paper px-6">
      <AmbientGlow />
      <div aria-hidden="true" className="zeux-scanlines pointer-events-none absolute inset-0 opacity-[0.08]" />
      <div className="relative z-10 flex w-full max-w-3xl flex-col items-start gap-4">
        {/* A11y 1.3.1: uma tela de erro sem heading é difícil de localizar por
            leitor de tela. `sr-only` — o kicker + o `InlineError` abaixo são o
            rótulo visual. */}
        <h1 className="sr-only">Erro ao conectar</h1>
        <p className="font-mono text-xs tracking-wider text-danger uppercase">{t("errorKicker")}</p>
        <InlineError>{message}</InlineError>
        <Button variant="primary" autoFocus onClick={onRetry}>
          {t("retry")}
        </Button>
      </div>
    </main>
  );
}
