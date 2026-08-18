import { Button, OnboardingGlow } from "../components/ui";

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
  return (
    // N3/N8 (docs/roadmap.md, Sprint N): max-w-3xl é o mesmo teto de leitura
    // do resto do app (era max-w-md); glow de identidade (N8) — mesmo motivo
    // do comentário em OnboardingGlow (src/components/ui.tsx).
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-paper px-6">
      <OnboardingGlow />
      <div className="relative z-10 flex w-full max-w-3xl flex-col gap-4">
        <h1 className="text-2xl font-semibold text-ink">Sem leitura de hardware</h1>
        <p className="text-base text-ink">
          Você optou por não autorizar a leitura deste computador. Sem essa leitura, o ZeuX não tem como
          sugerir quais consoles esta máquina roda.
        </p>
        <p className="text-sm text-muted">
          Você pode autorizar a qualquer momento — nada foi lido, e nada muda até você decidir.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" autoFocus onClick={onReconsider}>
            Autorizar agora
          </Button>
          <Button variant="secondary" onClick={onViewEmulators}>
            Ver emuladores
          </Button>
        </div>
      </div>
    </main>
  );
}
