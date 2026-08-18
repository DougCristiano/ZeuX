import logoZeux from "../assets/logo-zeux.png";
import { Button, Card, OnboardingGlow } from "../components/ui";

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
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-paper px-6 py-12">
      <OnboardingGlow />
      {/* N3 (docs/roadmap.md, Sprint N): max-w-3xl é o mesmo teto de leitura
          que `ScreenContainer` usa no resto do app (era `max-w-xl`, isolado)
          — o `ScreenContainer` em si não serve aqui: seu `pt-16 pb-10` é
          desenhado para o shell rolável com sidebar, não para uma tela
          centralizada na viewport inteira, sem sidebar. */}
      <div className="relative z-10 flex w-full max-w-3xl flex-col gap-4">
        <img src={logoZeux} alt="" aria-hidden="true" className="h-12 w-12" />
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

        {/* N7 (docs/roadmap.md, Sprint N): o badge "texto vem de GET /consent"
            saiu — era rastro de desenvolvimento na tela mais importante do
            app, legalmente falando (é onde o consentimento é dado). O de
            versão da política fica: é informação real de versionamento, não
            debug — só o rótulo virou texto corrido, sem moldura de badge, pra
            não competir visualmente com o texto legal acima. */}
        <p className="text-xs text-muted">Política de dados · versão {policyVersion}</p>
      </div>
    </main>
  );
}
