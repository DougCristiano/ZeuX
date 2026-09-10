import { useT } from "../i18n/i18n";
import { Button, Card, AmbientGlow, ZeuXMark } from "../components/ui";
import { dict } from "./ConsentScreen.i18n";

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
 *
 * Redesenho arcade/CRT estendido a esta tela (2026-09-09, ver docs/decisoes.md):
 * é a primeira impressão do app e destoava das telas já migradas — ainda em
 * `secondary` para "Agora não" e sem nenhum traço da identidade CRT. Ganha o
 * kicker monoespaçado em ciano (a paleta reserva `--accent-secondary` para
 * "aqui o sistema informa" — e um pedido de consentimento é exatamente o
 * sistema declarando o que precisa), as linhas de CRT decorativas que a
 * abertura e o herói da biblioteca já usam, e "Agora não" desce para `chrome`
 * (é navegação/decisão sobre o app, não ação sobre conteúdo — só "Autorizar
 * leitura" fica em `primary`). O `policy_text` continua vindo do servidor e
 * sendo exibido literalmente (princípio 1): nada aqui reescreve o texto legal.
 */
export function ConsentScreen({ policyText, policyVersion, onAccept, onDecline, busy = false }: ConsentScreenProps) {
  const t = useT(dict);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-paper px-6 py-12">
      <AmbientGlow />
      {/* Linhas de CRT de tela inteira, bem apagadas: o texto de consentimento
          nunca fica sobre elas com contraste comprometido (opacidade ~8%,
          `--ink` a 12.6:1 sobre `--paper` sobra de folga), mas a janela inteira
          ganha o clima — mesmo material (`.zeux-scanlines`, index.css) que o
          `SplashScreen` e o `GameHero` usam, para o onboarding e o app falarem
          a mesma língua. */}
      <div aria-hidden="true" className="zeux-scanlines pointer-events-none absolute inset-0 opacity-[0.08]" />
      {/* N3 (docs/roadmap.md, Sprint N): max-w-3xl é o mesmo teto de leitura
          que `ScreenContainer` usa no resto do app (era `max-w-xl`, isolado)
          — o `ScreenContainer` em si não serve aqui: seu `pt-16 pb-10` é
          desenhado para o shell rolável com sidebar, não para uma tela
          centralizada na viewport inteira, sem sidebar. */}
      <div className="relative z-10 flex w-full max-w-3xl flex-col gap-4">
        <ZeuXMark size={48} />
        {/* Kicker-etiqueta em monoespaçada, mesmo vocabulário de "rótulo de
            chassi" dos chips e do `SectionHeading` — ciano porque é o sistema
            informando o que precisa antes de o usuário decidir. */}
        <p className="font-mono text-xs tracking-wider text-accent-secondary uppercase">{t("kicker")}</p>
        <h1 className="text-2xl font-semibold text-ink">{t("heading")}</h1>

        {/* Filete esquerdo ciano: marca o cartão como "o que o sistema
            registra" (mesma regra da paleta), sem tirar espaço de conteúdo. O
            texto continua sendo o `policy_text` literal do servidor. */}
        <Card filled className="border-l-[3px] border-l-accent-secondary">
          <p className="text-base text-ink">{policyText}</p>
          <p className="mt-2 text-sm text-muted">{t("revokeNote")}</p>
        </Card>

        <div className="flex flex-wrap gap-2">
          <Button variant="primary" autoFocus disabled={busy} onClick={onAccept}>
            {t("acceptButton")}
          </Button>
          <Button variant="chrome" disabled={busy} onClick={onDecline}>
            {t("declineButton")}
          </Button>
        </div>

        {/* N7 (docs/roadmap.md, Sprint N): o badge "texto vem de GET /consent"
            saiu — era rastro de desenvolvimento na tela mais importante do
            app, legalmente falando (é onde o consentimento é dado). O de
            versão da política fica: é informação real de versionamento, não
            debug — em monoespaçada, sem moldura de badge, para ler como
            metadado de terminal sem competir com o texto legal acima. */}
        <p className="font-mono text-xs text-muted">{t("policyLabel")} {policyVersion}</p>
      </div>
    </main>
  );
}
