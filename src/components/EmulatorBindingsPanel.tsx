import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "../api";
import controllerPhoto from "../assets/controller-reference.png";
import type { InputBinding } from "../api/types";
import type { ControllerAssignment, ControllerProfile } from "../api/types";
import { CONTROLLER_SPOTS, regionForAction, type ControllerRegion } from "../lib/controllerRegions";
import { translateKeyForAdapter } from "../lib/keyMapping";
import { Button, Callout, InlineError, Toast, ZSelect } from "./ui";
import { SelectItem } from "./ui/select";
import { useToast } from "../hooks/useToast";
import { useGamepad } from "../hooks/useGamepad";
import { useT } from "../i18n/i18n";
import { dict } from "./EmulatorBindingsPanel.i18n";

/**
 * As duas colunas que ladeiam a foto, de cima para baixo na ordem em que a
 * região aparece no controle de verdade. É isto que torna o layout espacial:
 * o card de "L2" fica acima do card de "L1", que fica acima do analógico
 * esquerdo, do mesmo jeito que as peças se empilham na foto. Referência que o
 * Douglas trouxe: o painel de configuração de controle do PCSX2 — foto no
 * centro, grupos ao redor, sem seta ligando um ao outro.
 */
const LEFT_COLUMN: ControllerRegion[] = ["triggerLeft", "shoulderLeft", "leftStick", "dpad"];
const RIGHT_COLUMN: ControllerRegion[] = ["triggerRight", "shoulderRight", "face", "rightStick"];

/**
 * Tela de mapeamento de teclado/controle (H3/H4, docs/roadmap.md) — só
 * aparece para adapters com `bindable: true` (PCSX2/RetroArch nesta v1.0).
 *
 * **Detecção de controle via Gamepad API do navegador, não uma rota do
 * ZeuX.** O roadmap cogitava `GET /api/v1/controllers`, mas isso exigiria
 * uma lib de gamepad em Go — o H3 já registra que isso arrisca quebrar o
 * build sem CGO que o ADR 0011 preserva de propósito, e sugere a
 * alternativa adotada aqui: a própria WebView já expõe
 * `navigator.getGamepads()`/`gamepadconnected`, sem custar dependência
 * nenhuma. Decisão tomada nesta sessão, registrada no roadmap.
 *
 * **O que esta tela NÃO pôde verificar nesta sessão: nenhum controle físico
 * estava conectado.** A escrita do vínculo de botão (`_btn`/formato de
 * botão do PCSX2) funciona e está testada com valores sintéticos, mas o
 * significado real de cada índice de botão — "o índice 0 é o botão Cross
 * de verdade?" — só pode ser confirmado com hardware conectado. Mesma
 * classe de achado que D11/B11 já registram: fica para o Douglas fechar.
 */
export function EmulatorBindingsPanel({ adapterId, adapterName }: { adapterId: string; adapterName: string }) {
  const t = useT(dict);
  const [actions, setActions] = useState<string[]>([]);
  const [bindings, setBindings] = useState<InputBinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<ControllerProfile[]>([]);
  const [assignment, setAssignment] = useState<ControllerAssignment | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [listeningKeyFor, setListeningKeyFor] = useState<string | null>(null);
  const [listeningButtonFor, setListeningButtonFor] = useState<string | null>(null);
  // `key` ou `button`, nunca os dois: o conflito é sempre sobre um vínculo
  // específico, e saber qual deles decide o texto e o que gravar ao confirmar.
  const [conflict, setConflict] = useState<
    { action: string; withAction: string; key?: string; button?: string } | null
  >(null);
  // Q4 (docs/roadmap.md, Sprint Q): a detecção saiu daqui para `useGamepad`,
  // que também devolve o NOME do controle — antes a tela só sabia dizer
  // "conectado sim/não", e quem tem dois controles não tinha como confirmar
  // qual deles está sendo lido.
  const gamepad = useGamepad();
  const gamepadConnected = gamepad.connected;
  // Mapeamento em sequência (Q4): percorre todas as ações de uma vez, uma
  // por aperto de botão, em vez de exigir um clique em "Mapear controle"
  // antes de cada uma. Com 14+ ações, o caminho de um clique por ação era o
  // que fazia ninguém terminar de mapear.
  const [sequence, setSequence] = useState<{ actions: string[]; index: number } | null>(null);
  // B2 (achado do critico-design, 2026-08-18): `unapplied` (ADR 0006) estava
  // sendo jogado dentro de `error` — o mesmo `InlineError` vermelho que
  // erro de verdade usa, transformando uma ressalva ("essa opção não coube")
  // em "algo quebrou". Separado do `error`, com sua própria caixa âmbar
  // (mesmo tratamento que `EmulatorConfigPanel` já usa via `Callout`).
  const [unapplied, setUnapplied] = useState<string[]>([]);
  // N9 (docs/roadmap.md, Sprint N): antes, gravar um mapeamento não dizia
  // nada — só o painel recarregava em silêncio.
  const { toastMessage, showToast } = useToast();

  // `unapplied` NÃO é limpo aqui: `saveBinding` chama `load()` logo depois
  // de gravar o próprio `unapplied` — como as duas chamadas acontecem no
  // mesmo tick síncrono, um `setUnapplied([])` aqui dentro apagaria o aviso
  // antes de qualquer render mostrar ele (achado do critico-design,
  // 2026-08-18, ao separar `unapplied` de `error`). Quem precisa zerar
  // `unapplied` de verdade é a troca de `adapterId` — coberto pelo
  // `useEffect` mais abaixo, que já recria o componente do zero.
  function load() {
    setLoading(true);
    setError(null);
    Promise.all([api.getEmulatorBindings(adapterId), api.getControllerProfiles(), api.getControllerAssignment(adapterId)])
      .then(([bindingsRes, profilesRes, assignmentRes]) => {
        setActions(bindingsRes.actions ?? []);
        setBindings(bindingsRes.bindings ?? []);
        setProfiles(profilesRes.profiles ?? []);
        setAssignment(assignmentRes);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : t("errorLoadingBindings")))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    setUnapplied([]);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adapterId, t]);

  // Devolve se gravou. A sequência (Q4) depende disso: avançar depois de uma
  // falha faria a fila correr inteira gravando nada — foi o que aconteceu ao
  // testar com um RetroArch cuja pasta de configuração não existia
  // (2026-08-28), 16 ações consumidas e nenhum vínculo salvo.
  async function saveBinding(
    action: string,
    patch: Partial<Pick<InputBinding, "key" | "button">>,
  ): Promise<boolean> {
    setError(null);
    setUnapplied([]);
    try {
      const result = await api.setEmulatorBindings(adapterId, [{ action, ...patch }]);
      if ((result.unapplied ?? []).length > 0) {
        setUnapplied(result.unapplied);
      } else if (!sequenceRef.current) {
        // Durante a sequência o toast por ação seria um piscar constante — o
        // progresso já aparece no cabeçalho, e o "Controle mapeado." do fim
        // fecha a conversa.
        showToast(t("bindingSaved"));
      }
      load();
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("errorSavingBindings"));
      return false;
    }
  }

  async function saveControllerProfile(profileId: string | null) {
    setProfileSaving(true);
    setError(null);
    try {
      await api.setControllerAssignment(adapterId, profileId);
      await Promise.all([
        api.getControllerProfiles(),
        api.getControllerAssignment(adapterId),
      ]).then(([profilesRes, assignmentRes]) => {
        setProfiles(profilesRes.profiles ?? []);
        setAssignment(assignmentRes);
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("errorSavingBindings"));
    } finally {
      setProfileSaving(false);
    }
  }

  function currentKeyOwner(key: string, exceptAction: string): string | null {
    const owner = bindings.find((b) => b.key === key && b.action !== exceptAction);
    return owner ? owner.action : null;
  }

  // Q4: o mesmo aviso que a tecla já tinha, agora para botão. Sem isto, dois
  // botões iguais em ações diferentes passavam batido — e no controle o
  // sintoma é pior que no teclado: a pessoa aperta um botão no jogo e duas
  // coisas acontecem.
  function currentButtonOwner(button: string, exceptAction: string): string | null {
    const owner = bindings.find((b) => b.button === button && b.action !== exceptAction);
    return owner ? owner.action : null;
  }

  // Captura de tecla: um listener global de keydown enquanto
  // listeningKeyFor não é null — mesma técnica de qualquer tela de
  // "pressione uma tecla" (ex.: rebind de atalho).
  useEffect(() => {
    if (!listeningKeyFor) return;
    const action = listeningKeyFor;

    function onKeyDown(e: KeyboardEvent) {
      e.preventDefault();
      // A11y 2.1.2 (auditoria de acessibilidade, 2026-09-06): enquanto a
      // captura está ativa este listener `preventDefault()`-a toda tecla —
      // sem tratar `Escape` primeiro, apertar Esc para desistir gravaria
      // "Escape" como o novo vínculo (ou um erro). Esc aqui = cancelar a
      // captura sem gravar nada. O botão "Cancelar" no JSX faz o mesmo para
      // quem usa mouse.
      if (e.key === "Escape") {
        setListeningKeyFor(null);
        return;
      }
      const translated = translateKeyForAdapter(adapterId, e);
      setListeningKeyFor(null);
      if (!translated) {
        setError(t("keyNotMappable", { key: e.key, adapter: adapterName }));
        return;
      }
      const owner = currentKeyOwner(translated, action);
      if (owner) {
        setConflict({ action, key: translated, withAction: owner });
        return;
      }
      saveBinding(action, { key: translated });
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listeningKeyFor, t, adapterId, adapterName]);

  // Ref espelhando `sequence`: o laço de captura (requestAnimationFrame,
  // abaixo) tem `listeningButtonFor` nas dependências e leria um `sequence`
  // congelado no fechamento.
  const sequenceRef = useRef<{ actions: string[]; index: number } | null>(null);
  sequenceRef.current = sequence;

  // Quem liga a escuta do próximo botão é este efeito, e não `avancarSequencia`
  // direto. **Achado dirigindo a tela com um controle simulado (Playwright,
  // 2026-08-28):** a primeira versão chamava `setListeningButtonFor` de dentro
  // do updater de `setSequence`. Updater de estado precisa ser função pura — o
  // React pode invocá-lo duas vezes (é o que o modo estrito faz em
  // desenvolvimento), e o efeito colateral lá dentro se perdia: a sequência
  // travava na primeira ação, gravando o vínculo e nunca andando.
  useEffect(() => {
    if (!sequence) return;
    setListeningButtonFor(sequence.actions[sequence.index]);
  }, [sequence]);

  // Avança para a próxima ação, ou encerra quando acabam. Só mexe em estado
  // com valores já calculados aqui fora.
  function avancarSequencia(action: string) {
    const atual = sequenceRef.current;
    if (!atual || atual.actions[atual.index] !== action) return;

    const proximo = atual.index + 1;
    if (proximo >= atual.actions.length) {
      setSequence(null);
      showToast(t("gamepadMapped"));
      return;
    }
    setSequence({ ...atual, index: proximo });
  }

  function iniciarSequencia() {
    if (actions.length === 0) return;
    // `listeningButtonFor` fica para o efeito acima — definir aqui também
    // faria a escuta ligar duas vezes para a mesma ação.
    setSequence({ actions, index: 0 });
  }

  function pararSequencia() {
    setSequence(null);
    setListeningButtonFor(null);
  }

  // Captura de botão: poll via requestAnimationFrame comparando o estado
  // anterior de cada botão do primeiro controle conectado, para achar uma
  // transição solto→pressionado (não o estado já pressionado ao entrar no
  // modo de captura).
  const prevButtonsRef = useRef<boolean[]>([]);
  useEffect(() => {
    if (!listeningButtonFor) return;
    const action = listeningButtonFor;
    let frame: number;
    let cancelled = false;

    // **Semeado com o estado ATUAL do controle, não vazio.** Achado dirigindo
    // a tela com um controle simulado (2026-08-28): zerar aqui fazia um botão
    // ainda segurado contar como transição solto→pressionado no primeiro
    // quadro da próxima ação — um único aperto consumia a sequência inteira,
    // gravando o mesmo botão em todas as ações. Semeando com o que está
    // pressionado agora, a captura só reage a um aperto NOVO.
    prevButtonsRef.current = Array.from(navigator.getGamepads?.() ?? [])
      .find((pad) => pad !== null)
      ?.buttons.map((b) => b.pressed) ?? [];

    function poll() {
      const pads = navigator.getGamepads?.() ?? [];
      const pad = Array.from(pads).find((p) => p !== null);
      if (pad) {
        pad.buttons.forEach((b, i) => {
          const wasPressed = prevButtonsRef.current[i] ?? false;
          if (b.pressed && !wasPressed && !cancelled) {
            cancelled = true;
            setListeningButtonFor(null);

            const button = String(i);
            const owner = currentButtonOwner(button, action);
            if (owner) {
              // Durante a sequência, um conflito PARA a fila: continuar
              // gravaria as ações seguintes por cima enquanto o usuário ainda
              // decide o que fazer com esta.
              setSequence(null);
              setConflict({ action, button, withAction: owner });
              return;
            }

            void saveBinding(action, { button }).then((salvou) => {
              if (salvou) {
                avancarSequencia(action);
                return;
              }
              // Falhou: a fila para aqui, com o erro na tela. Continuar
              // pediria os 15 botões seguintes para gravar nada.
              setSequence(null);
            });
            return;
          }
          prevButtonsRef.current[i] = b.pressed;
        });
      }
      if (!cancelled) frame = requestAnimationFrame(poll);
    }
    frame = requestAnimationFrame(poll);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listeningButtonFor]);

  if (loading) return <p className="text-sm text-muted">{t("loadingBindings", { adapterName })}</p>;

  // Palpite por nome, uma vez por render. `regionForAction` devolve null para
  // o que não reconhece, e o null é levado a sério: vira "Outras ações", nunca
  // desaparece.
  const porRegiao = new Map<ControllerRegion, string[]>();
  const residuais: string[] = [];
  for (const action of actions) {
    const region = regionForAction(action);
    if (!region) {
      residuais.push(action);
      continue;
    }
    const lista = porRegiao.get(region);
    if (lista) lista.push(action);
    else porRegiao.set(region, [action]);
  }

  // A ação em foco é a que está esperando um aperto — durante a sequência é a
  // da vez. É ela que acende a região correspondente na foto.
  const acaoEmFoco = listeningButtonFor ?? listeningKeyFor;
  const regiaoEmFoco = acaoEmFoco ? regionForAction(acaoEmFoco) : null;

  const rotuloDaRegiao: Record<ControllerRegion, string> = {
    triggerLeft: t("groupTriggerLeft"),
    triggerRight: t("groupTriggerRight"),
    shoulderLeft: t("groupShoulderLeft"),
    shoulderRight: t("groupShoulderRight"),
    leftStick: t("groupLeftStick"),
    rightStick: t("groupRightStick"),
    dpad: t("groupDpad"),
    face: t("groupFace"),
    center: t("groupCenter"),
  };

  // Funções que devolvem JSX, não componentes: declarar um componente aqui
  // dentro faria o React remontar cada card a cada render, e o `autoFocus`/foco
  // de teclado dentro do card se perderia no meio da captura.
  function renderAction(action: string) {
    const binding = bindings.find((b) => b.action === action);
    const naVez = sequence?.actions[sequence.index] === action;
    const emCaptura = listeningKeyFor === action || listeningButtonFor === action;
    return (
      <div
        key={action}
        // A ação da vez precisa se destacar sem mover nada: durante a
        // sequência o usuário está olhando o controle, não a tela, e volta o
        // olho para conferir onde parou. A borda existe sempre (na cor da
        // linha) justamente para o realce não mudar a altura do card.
        className={`rounded-lg border bg-fill px-2.5 py-2 ${
          naVez || emCaptura ? "border-accent" : "border-line"
        }`}
      >
        <p className="text-sm break-words text-ink">{action}</p>
        <p className="text-xs break-words text-muted">
          {binding?.key ?? t("noKeyMapped")}
          {binding?.button ? ` · ${t("buttonDisplay", { button: binding.button })}` : ""}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button
            variant="secondary"
            className="px-2 py-1 text-xs"
            disabled={listeningKeyFor !== null && listeningKeyFor !== action}
            onClick={() => setListeningKeyFor(action)}
          >
            {listeningKeyFor === action ? t("listeningForKey") : t("mapKeyButton")}
          </Button>
          {/* A11y 2.1.2: saída visível da captura sem efeito colateral —
              Esc também cancela (ver o listener acima), este botão é o
              caminho para mouse/toque. */}
          {listeningKeyFor === action && (
            <Button variant="secondary" className="px-2 py-1 text-xs" onClick={() => setListeningKeyFor(null)}>
              {t("cancelButton")}
            </Button>
          )}
          {gamepadConnected && (
            <Button
              variant="secondary"
              className="px-2 py-1 text-xs"
              disabled={listeningButtonFor !== null}
              onClick={() => setListeningButtonFor(action)}
            >
              {listeningButtonFor === action ? t("listeningForButton") : t("mapGamepadButton")}
            </Button>
          )}
        </div>
      </div>
    );
  }

  function renderGroup(region: ControllerRegion) {
    const doGrupo = porRegiao.get(region);
    if (!doGrupo || doGrupo.length === 0) return null;
    return (
      <div key={region} className="flex flex-col gap-1.5">
        <p className="font-mono text-[11px] tracking-wider text-muted uppercase">{rotuloDaRegiao[region]}</p>
        {doGrupo.map((action) => renderAction(action))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {toastMessage && <Toast message={toastMessage} />}
      {error && <InlineError>{error}</InlineError>}
      {unapplied.length > 0 && (
        <Callout label={t("unappliedLabel")} tone="amber">
          <ul className="list-disc pl-4">
            {unapplied.map((msg, i) => (
              <li key={i}>{msg}</li>
            ))}
          </ul>
        </Callout>
      )}

      <div className="rounded-lg border border-line bg-fill p-3">
        <div className="flex flex-col gap-2">
          <div>
            <p className="text-sm text-ink">Perfil de controle do Zeux</p>
            <p className="text-xs text-muted">
              Escolha a família que este emulador vai usar como referência. Isso ainda não altera o arquivo do emulador; guarda a preferência no Zeux para a próxima etapa.
            </p>
          </div>
          <ZSelect
            ariaLabel="Perfil de controle"
            value={assignment?.profile_id ?? "__none__"}
            onValueChange={(value) => void saveControllerProfile(value === "__none__" ? null : value)}
            disabled={profileSaving || profiles.length === 0}
          >
            <SelectItem value="__none__">Nenhum perfil</SelectItem>
            {profiles.map((profile) => (
              <SelectItem key={profile.id} value={profile.id}>
                {profile.name} · {profile.vendor}
              </SelectItem>
            ))}
          </ZSelect>
        </div>
      </div>

      {/* Q4 (docs/roadmap.md, Sprint Q): o cabeçalho do controle. Antes, esta
          área só existia no estado negativo ("nenhum controle detectado") — com
          um controle plugado, a tela não confirmava nada, e quem tem dois não
          tinha como saber qual está sendo lido. */}
      {gamepadConnected ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-fill px-3 py-2">
          <p className="text-sm text-ink">
            {t("gamepadDetected")}
            {gamepad.name && <span className="text-muted"> · {gamepad.name}</span>}
          </p>
          {sequence ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted tabular-nums">
                {t("sequenceProgress", { index: sequence.index + 1, total: sequence.actions.length, action: sequence.actions[sequence.index] })}
              </span>
              <Button variant="quiet" className="px-2 py-1 text-xs" onClick={pararSequencia}>
                {t("stopButton")}
              </Button>
            </div>
          ) : (
            /* Mapear tudo de uma vez: com 14+ ações, exigir um clique em
               "Mapear controle" antes de cada aperto é o que fazia ninguém
               terminar. A ação por ação continua disponível abaixo, para
               corrigir um vínculo só sem refazer o resto. */
            <Button
              variant="secondary"
              className="px-2 py-1 text-xs"
              disabled={listeningButtonFor !== null || actions.length === 0}
              onClick={iniciarSequencia}
            >
              {t("mapEntireGamepad")}
            </Button>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted">
          {t("noGamepadDetected")}
        </p>
      )}

      {conflict && (
        <div className="rounded-lg border border-dashed border-line-strong p-3">
          <p className="text-sm text-ink">
            {conflict.key
              ? t("keyConflictMessage", { action: conflict.withAction })
              : t("buttonConflictMessage", { button: conflict.button ?? "", action: conflict.withAction })}{" "}
            {t("switchConfirmationSuffix", { action: conflict.action })}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              variant="primary"
              autoFocus
              onClick={() => {
                const { action, key, button } = conflict;
                setConflict(null);
                saveBinding(action, key ? { key } : { button });
              }}
            >
              {t("switchButton")}
            </Button>
            <Button variant="secondary" onClick={() => setConflict(null)}>
              {t("cancelButton")}
            </Button>
          </div>
        </div>
      )}

      {/* Layout espacial (2026-09-08): a foto do controle no centro e os cards
          de mapeamento agrupados por região ao redor dela, em vez da lista
          vertical única de antes. Com 16 ações, a lista não dizia NADA sobre
          qual peça do controle cada nome ("L3", "Cross", "l2") é — a foto diz.

          **Container query (`@container`/`@4xl:`), não breakpoint de janela.**
          O CLAUDE.md avisa que `lg:`/`xl:` medem a janela inteira; aqui isso
          seria pior que impreciso, seria errado: este painel é montado tanto
          em largura quase cheia (ConsoleDetailScreen, SettingsScreen) quanto
          dentro de um card de grade de ~300px (EmulatorsScreen). Com
          breakpoint de janela, maximizar a janela ativaria as três colunas
          dentro do card estreito e os cards se espremeriam um no outro — que
          é exatamente o defeito que esta rodada precisava não repetir. A
          consulta é sobre a largura DO PAINEL: abaixo de 56rem ele volta para
          uma coluna só, com a foto por cima da lista.

          56rem (`@4xl`) e não 48rem: com 48rem cada coluna lateral fica com
          ~190px, e "Direcional digital para cima" + dois botões não cabem sem
          o card virar uma torre de quebras de linha. */}
      <div className="@container">
        <div className="grid grid-cols-1 gap-x-5 gap-y-5 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)_minmax(0,1fr)] @4xl:items-start">
          {/* A foto vem primeiro no DOM para que, na coluna única, ela apareça
              acima dos grupos; `order` só reposiciona ela para o meio quando
              as três colunas existem. */}
          <div className="order-1 flex flex-col gap-4 @4xl:order-2">
            {/* Escondida em painel estreito (`@md`): a mesma foto que ajuda em
                24rem vira uma miniatura ilegível dentro de um card de grade. */}
            <div className="relative mx-auto hidden w-full max-w-sm @md:block">
              <img src={controllerPhoto} alt="" aria-hidden="true" className="block w-full select-none" draggable={false} />
              {/* Realce da região da ação em foco — é o que liga o card à peça
                  física sem precisar desenhar uma seta. Durante a sequência,
                  aponta para onde apertar em seguida. */}
              {regiaoEmFoco &&
                Object.entries(CONTROLLER_SPOTS)
                  .filter(([, spot]) => spot.region === regiaoEmFoco)
                  .map(([id, spot]) => (
                    <div
                      key={id}
                      aria-hidden="true"
                      className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
                      style={{
                        left: `${spot.x}%`,
                        top: `${spot.y}%`,
                        width: `${spot.w}%`,
                        height: `${spot.h}%`,
                        background: "var(--accent)",
                        opacity: 0.55,
                        boxShadow: "0 0 14px 4px var(--accent)",
                      }}
                    />
                  ))}
            </div>
            {renderGroup("center")}
          </div>

          <div className="order-2 flex flex-col gap-4 @4xl:order-1">
            {LEFT_COLUMN.map((region) => renderGroup(region))}
          </div>

          <div className="order-3 flex flex-col gap-4">
            {RIGHT_COLUMN.map((region) => renderGroup(region))}
          </div>
        </div>

        {/* Ação que nenhuma palavra-chave reconheceu (hotkey de emulador, ação
            sem botão físico correspondente) **continua visível aqui**. O
            palpite de região é best-effort por nome — some ação da tela seria
            some a única forma de mapear ela. */}
        {residuais.length > 0 && (
          <div className="mt-5 flex flex-col gap-1.5 border-t border-line pt-4">
            <p className="font-mono text-[11px] tracking-wider text-muted uppercase">{t("groupOther")}</p>
            <p className="mb-1 text-xs text-muted">{t("groupOtherHint")}</p>
            <div className="grid grid-cols-1 gap-1.5 @2xl:grid-cols-2 @5xl:grid-cols-3">
              {residuais.map((action) => renderAction(action))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
