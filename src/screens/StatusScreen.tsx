import { Button } from "../components/ui";

/** Estado de carregamento — nunca fica girando para sempre (ver ErrorScreen). */
export function LoadingScreen({ message }: { message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper" role="status">
      <p className="font-mono text-sm text-muted">{message}</p>
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
    <main className="flex min-h-screen items-center justify-center bg-paper px-6">
      <div className="flex max-w-sm flex-col items-start gap-4">
        <p className="text-base text-danger">{message}</p>
        <Button variant="primary" autoFocus onClick={onRetry}>
          Tentar de novo
        </Button>
      </div>
    </main>
  );
}
