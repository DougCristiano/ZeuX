import { Button } from "../components/ui";

/**
 * Tela mostrada depois de "Agora não" na tela 01. Regra de produto (item B8):
 * recusar não pode ser beco sem saída — o app continua utilizável, e a
 * recusa pode ser revista a qualquer momento.
 *
 * Honestidade de escopo: as telas de biblioteca e emuladores (wireframe 04-07)
 * ainda não existem nesta versão (Sprint C/D) — então "utilizável" hoje
 * significa "não é um beco sem saída", não "app completo sem hardware". O
 * texto diz isso, em vez de fingir uma funcionalidade que não está aqui.
 */
export function DeclinedScreen({ onReconsider }: { onReconsider: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-6">
      <div className="flex max-w-md flex-col gap-4">
        <h1 className="text-2xl font-semibold text-ink">Sem leitura de hardware</h1>
        <p className="text-base text-ink">
          Você optou por não autorizar a leitura deste computador. Sem essa leitura, o ZeuX não tem como
          sugerir quais consoles esta máquina roda.
        </p>
        <p className="text-sm text-muted">
          Você pode autorizar a qualquer momento — nada foi lido, e nada muda até você decidir.
        </p>
        <div>
          <Button variant="primary" autoFocus onClick={onReconsider}>
            Autorizar agora
          </Button>
        </div>
      </div>
    </main>
  );
}
