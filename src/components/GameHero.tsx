import { Play } from "lucide-react";
import { coverImageURL } from "../api";
import type { LibraryGame } from "../api/types";
import { useT } from "../i18n/i18n";
import { consoleAccentColor } from "../lib/consoleColor";
import { formatLastPlayedShort, formatPlaytime } from "../lib/format";
import type { GameLaunchability } from "../lib/gameLaunchability";
import { dict } from "./GameHero.i18n";
import { Badge, Button, FavoriteToggle } from "./ui";

/**
 * Faixa de retomada da biblioteca (2026-09-07, redesenho da tela inicial a
 * pedido do Douglas: "a tela mais impactante do app").
 *
 * O problema que ela resolve: a tela de entrada abria com trinta capas do
 * mesmo tamanho e nenhum ponto de partida — a coisa que o usuário quase
 * sempre quer (voltar ao jogo de ontem) tinha exatamente o mesmo peso visual
 * do jogo que ele nunca abriu. A faixa "Continue jogando" já existia e já
 * ordenava por último jogado; o que faltava era **um** item promovido a
 * tamanho de destaque, com a ação principal escrita por extenso em vez de
 * escondida atrás do hover de uma capa. É a mesma jogada que Steam/Epic/GOG
 * fazem no topo da biblioteca, e não inventa dado nenhum: tudo aqui já vinha
 * de `GET /library/games`.
 *
 * A arte do próprio jogo é o fundo (desfocada e escurecida), com a cor de
 * identidade do console tingindo a borda e o glow — o mesmo vocabulário que
 * `GameCover` usa no hover, em escala maior. As linhas de CRT
 * (`.zeux-scanlines`, index.css) são o material que a abertura do app também
 * usa: a marca aparece duas vezes na mesma língua, não em duas.
 *
 * Contraste: o texto nunca fica sobre a arte crua. O fundo leva
 * `brightness-[0.55] saturate-[1.8]` mais um tingimento na cor do console e um
 * gradiente de `--paper` por cima — o brilho/saturação subiram em duas
 * rodadas (2026-09-07: primeiro "quero que ela tenha um pouco mais de cor",
 * depois "a imagem da capa está estranha ainda" — o blur fraco original
 * lavava a cor de menos e ainda deixava a mancha turva reconhecível como capa
 * malfeita) em relação à primeira versão (`brightness-[0.25]`, sem
 * saturação), que ficava perto de tons de cinza debaixo do gradiente. O piso
 * do gradiente continua 80% de `--paper` **em toda a extensão da coluna de
 * texto** — uma revisão anterior pegou a primeira versão descendo a 25% na
 * borda direita, onde um título longo em janela larga (`ScreenContainer`
 * chega a 2000px) podia alcançar. Com 80% de `--paper` sobre arte a 55% de
 * brilho, o pior fundo possível continua escuro o bastante para `--ink`
 * (12.6:1 sobre `--paper` puro) e `--muted` (7.62:1) passarem com folga — o
 * piso de opacidade é o que garante contraste, não o brilho da arte por
 * baixo dele, por isso subir brilho/saturação da arte não reabre o risco que
 * a revisão anterior fechou. O trecho à direita do texto (`max-w-2xl` na
 * coluna) é onde a cor nova aparece de verdade: a arte chega bem mais viva
 * ali, e nada é lido por cima dela.
 *
 * `onPlay` ausente = o jogo não pode abrir agora (emulador faltando, arquivo
 * sumido, lançamento em andamento). Nesse caso a faixa **continua na tela**,
 * com o motivo escrito e o caminho de resolver ao lado — informar, não
 * bloquear (CLAUDE.md, princípio 5). Nunca sumir com o destaque: some o
 * destaque, some a explicação junto.
 */
export function GameHero({
  game,
  shortName,
  onOpenDetail,
  onPlay,
  onToggleFavorite,
  launchability,
  onInstall,
}: {
  game: LibraryGame;
  shortName: string;
  onOpenDetail: () => void;
  onPlay?: () => void;
  onToggleFavorite: () => void;
  launchability?: GameLaunchability;
  onInstall?: () => void;
}) {
  const t = useT(dict);
  const accent = consoleAccentColor(game.console_id);
  const cover = coverImageURL(game.cover_url);
  const lastPlayed = formatLastPlayedShort(game.last_played_at);
  const blocked = launchability !== undefined && !launchability.launchable;

  return (
    <div
      className="relative overflow-hidden rounded-xl border"
      style={{
        borderColor: `color-mix(in srgb, ${accent} 45%, var(--line))`,
        boxShadow: `0 0 60px -16px color-mix(in srgb, ${accent} 85%, transparent)`,
      }}
    >
      {/* Camadas de fundo, todas decorativas: arte → tingimento de acento →
          escurecimento em gradiente → linhas de CRT. `aria-hidden` em bloco:
          nada aqui carrega informação que o texto ao lado já não diga.

          Blur subiu de `blur-[2px]` para `blur-3xl` (2026-09-07, achado do
          Douglas: "a imagem da capa está estranha ainda"). 2px de blur numa
          capa em pé (3:4) esticada numa faixa larga e baixa não lava a cor —
          só embaça o contorno, sobra uma mancha turva sem desenho nem cor
          clara (o recorte horizontal do meio de uma capa de boxart raramente
          é a área mais colorida dela). blur-3xl (64px) rende a arte como
          washout de cor puro, no espírito do fundo desfocado que
          Spotify/Apple Music usam atrás da capa tocando — não é a imagem
          nítida, é só a atmosfera dela. `scale-150` compensa: blur pesado
          revela borda/vazamento fora do frame caso o elemento não estoure a
          área visível por uma margem generosa. */}
      <div aria-hidden="true" className="absolute inset-0">
        {cover ? (
          <img
            src={cover}
            alt=""
            className="h-full w-full scale-150 object-cover blur-3xl brightness-[0.55] saturate-[1.8]"
          />
        ) : (
          <div
            className="h-full w-full"
            style={{ background: `linear-gradient(135deg, ${accent}55, transparent 65%)` }}
          />
        )}
        {/* Tingimento na cor de identidade do console, por cima da arte
            lavada — garante que a cor que aparece seja sempre a do console
            (consistente, "de propósito"), mesmo quando a paleta real da capa
            for fria/neutra no recorte que sobrou depois do blur pesado
            acima. `mix-blend-overlay`: realça o que já é claro/escuro na
            arte em vez de pintar uma camada plana por cima dela. */}
        <div
          className="absolute inset-0 mix-blend-overlay"
          style={{ background: `linear-gradient(135deg, ${accent}, transparent 70%)`, opacity: 0.55 }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to right, var(--paper) 0%, color-mix(in srgb, var(--paper) 88%, transparent) 55%, color-mix(in srgb, var(--paper) 80%, transparent) 70%, color-mix(in srgb, var(--paper) 12%, transparent) 100%)",
          }}
        />
        <div className="zeux-scanlines absolute inset-0 opacity-40" />
      </div>

      <div className="relative flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:gap-6 sm:p-6">
        {/* A capa leva ao detalhe para quem mira na arte antes de ler — mas é
            atalho de mouse, não um segundo alvo de teclado: `tabIndex={-1}` +
            `aria-hidden` porque o botão "Ver detalhes" abaixo já é o mesmo
            destino, com nome acessível de verdade (mesmo padrão do overlay ▶
            de `GameCover`). `shrink-0` + largura própria: peça de tamanho fixo
            por desenho, não área que deveria crescer com a janela (CLAUDE.md,
            exceções de layout responsivo). */}
        <button
          type="button"
          onClick={onOpenDetail}
          tabIndex={-1}
          aria-hidden="true"
          className="w-28 shrink-0 cursor-pointer overflow-hidden rounded-lg border transition-transform duration-150 hover:scale-[1.03] sm:w-36"
          style={{ borderColor: `color-mix(in srgb, ${accent} 60%, var(--line-strong))` }}
        >
          {cover ? (
            <img src={cover} alt="" className="aspect-[3/4] w-full object-cover" />
          ) : (
            <div
              className="flex aspect-[3/4] w-full items-center justify-center bg-fill"
              style={{ background: `linear-gradient(160deg, ${accent}44, var(--fill) 70%)` }}
            >
              <span className="font-pixel text-[11px] text-ink">{shortName}</span>
            </div>
          )}
        </button>

        {/* `max-w-2xl` é teto, não largura: a coluna continua encolhendo
            livre com a janela (CLAUDE.md, layout responsivo) — o teto só
            impede que o texto alcance a faixa direita do gradiente, onde a
            arte volta a aparecer e o contraste deixa de ser garantido. */}
        <div className="min-w-0 max-w-2xl flex-1">
          <h3 className="text-2xl font-semibold text-balance text-ink" title={game.title}>
            {game.title}
          </h3>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            <Badge accentColor={accent}>{shortName.toUpperCase()}</Badge>
            <span>{formatPlaytime(game.playtime_seconds)}</span>
            {lastPlayed && (
              <>
                <span aria-hidden="true">·</span>
                <span>{t("lastPlayed", { date: lastPlayed })}</span>
              </>
            )}
          </div>

          {blocked && (
            <p className="mt-3 text-sm text-amber">{launchability!.title}</p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {/* Ordem deliberada: quando falta o emulador, a ação principal é
                instalar, não "Continuar". O `▶` da grade chama a mesma cadeia
                de decisão nos dois casos (`handlePlay` ramifica por motivo),
                mas ali o rótulo é um ícone e não promete nada — aqui é uma
                palavra escrita, e "Continuar" num jogo que ainda não abre
                seria uma promessa falsa. */}
            {/* `data-gamepad-start`: onde o cursor do controle pousa ao
                entrar nesta tela (useGamepadNavigation.ts, `landingTarget`).
                Sem isto o pouso seria o primeiro focável por posição de
                tela — que aqui é chrome de navegação, não a ação que a
                pessoa veio fazer. O spread de objeto é o que permite um
                `data-*` num componente React sem alargar `ButtonProps`. */}
            {blocked &&
            onInstall &&
            (launchability!.reason === "not_installed" || launchability!.reason === "install_manual") ? (
              <Button variant="primary" onClick={onInstall} {...{ "data-gamepad-start": "" }}>
                {launchability!.badge}
              </Button>
            ) : blocked &&
              onPlay &&
              (launchability!.reason === "no_preset" || launchability!.reason === "bios_empty") ? (
              // Princípio 5: sem preset ou BIOS vazia não bloqueia — o jogo
              // abre assim mesmo (na config padrão do emulador). "Continuar"
              // aqui prometeria retomar de onde parou; "jogar assim mesmo"
              // não. O motivo do bloqueio já está escrito acima (`blocked`).
              <Button variant="primary" onClick={onPlay} className="gap-2" {...{ "data-gamepad-start": "" }}>
                <Play size={15} fill="currentColor" aria-hidden="true" />
                {t("playAnyway")}
              </Button>
            ) : (
              onPlay && (
                <Button variant="primary" onClick={onPlay} className="gap-2" {...{ "data-gamepad-start": "" }}>
                  <Play size={15} fill="currentColor" aria-hidden="true" />
                  {t("resume")}
                </Button>
              )
            )}
            <Button variant="secondary" onClick={onOpenDetail}>
              {t("seeDetails")}
            </Button>
            <FavoriteToggle favorite={game.favorite} onToggle={onToggleFavorite} />
          </div>
        </div>
      </div>
    </div>
  );
}
