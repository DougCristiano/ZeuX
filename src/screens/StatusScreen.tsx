import logoZeux from "../assets/logo-zeux.png";
import { Button, OnboardingGlow } from "../components/ui";

/**
 * Estado de carregamento — nunca fica girando para sempre (ver ErrorScreen).
 *
 * N6 (docs/roadmap.md, Sprint N): antes era só o `<p>` de texto, sem marca
 * nem indicador de atividade — a primeira coisa que qualquer usuário vê (até
 * ~20s na primeira abertura, enquanto o sidecar sobe) era uma linha cinza
 * sobre preto, sem nenhum sinal de que o app estava vivo. O logo dá
 * identidade; o spinner (`motion-reduce:animate-none` — ADR 0009 exige
 * respeitar a preferência do SO) dá o sinal de atividade que faltava.
 */
export function LoadingScreen({ message }: { message: string }) {
  return (
    <main
      className="relative flex min-h-screen flex-col items-center justify-center gap-4 overflow-hidden bg-paper"
      role="status"
    >
      <OnboardingGlow />
      <img src={logoZeux} alt="" aria-hidden="true" className="relative z-10 h-12 w-12" />
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
 */
export function ErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    // N3/N8 (docs/roadmap.md, Sprint N): max-w-3xl é o teto de leitura do
    // resto do app (era max-w-sm, isolado); glow de identidade (N8).
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-paper px-6">
      <OnboardingGlow />
      <div className="relative z-10 flex w-full max-w-3xl flex-col items-start gap-4">
        <p className="text-base text-danger">{message}</p>
        <Button variant="primary" autoFocus onClick={onRetry}>
          Tentar de novo
        </Button>
      </div>
    </main>
  );
}
