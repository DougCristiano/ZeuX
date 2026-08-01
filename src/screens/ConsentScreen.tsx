import { Badge, Button, Card } from "../components/ui";

type ConsentScreenProps = {
  /** Vem de GET /consent (`policy_text`) — nunca um texto escrito no front (docs/wireframe.md, tela 01). */
  policyText: string;
  policyVersion: string;
  onAccept: () => void;
  onDecline: () => void;
  busy?: boolean;
};

/**
 * Tela 01 do wireframe (docs/wireframe.html): a primeira coisa que existe.
 * Puramente apresentacional — quem decide o que fazer com os cliques é quem
 * usa este componente (item B8: consentimento → scan → parecer).
 *
 * Ordem de foco: botão primário primeiro (autoFocus), depois "Agora não" —
 * segue a ordem de leitura, como o wireframe anota. Nenhuma ação depende de
 * hover ou clique direito (ADR 0009).
 */
export function ConsentScreen({ policyText, policyVersion, onAccept, onDecline, busy = false }: ConsentScreenProps) {
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-6 py-12">
      <h1 className="text-2xl font-semibold text-ink">Antes de começar</h1>

      <Card>
        <p className="text-base text-ink">{policyText}</p>
        <p className="mt-2 text-sm text-muted">Você pode revogar essa autorização depois, a qualquer momento.</p>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" autoFocus disabled={busy} onClick={onAccept}>
          Autorizar leitura
        </Button>
        <Button variant="secondary" disabled={busy} onClick={onDecline}>
          Agora não
        </Button>
      </div>

      <div className="flex gap-2">
        <Badge>política v{policyVersion}</Badge>
        <Badge>texto vem de GET /consent</Badge>
      </div>
    </div>
  );
}
