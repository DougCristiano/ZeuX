import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { EyeOff, FolderOpen, Info, Play, Star, StarOff, Undo2 } from "lucide-react";
import { ContextMenu } from "radix-ui";
import { useState, type ReactNode } from "react";
import { api, ApiError } from "../api";
import type { LibraryGame } from "../api/types";
import { useT } from "../i18n/i18n";
import { dict } from "./GameContextMenu.i18n";
import { Button, ConfirmModal } from "./ui";

/**
 * Menu de botão direito de um jogo (2026-09-28, pedido do Douglas: "clicar com
 * botão direito em um jogo ausente que eu quero deletar e ver detalhes, entre
 * outros"). Antes, essas ações só existiam dentro da tela de detalhe — e o
 * botão direito não fazia nada.
 *
 * **"Remover da biblioteca" esconde, não apaga o arquivo** (é o
 * `POST /library/games/{id}/exclude`, o mesmo da tela de detalhe): o jogo some
 * da lista e volta pelo filtro "Ocultos". Por isso o menu chama de "remover",
 * a confirmação diz que o arquivo não é apagado, e o ZeuX continua sem nenhuma
 * ação que mexa em ROM no disco (princípio 6 do `CLAUDE.md`).
 *
 * Quem usa passa o que só a tela sabe (`onPlay` passa pela checagem de
 * emulador instalado, `onToggleFavorite` é otimista); o que o menu resolve
 * sozinho — remover, trazer de volta, mostrar na pasta — ele mesmo chama, e
 * avisa a tela por `onChanged` para recarregar a lista.
 *
 * O contêiner é `display: contents`, então não vira caixa nenhuma na grade nem
 * na lista: só recebe o `contextmenu` que borbulha do tile de dentro. Teclado:
 * a tecla Menu / Shift+F10 dispara o mesmo evento no elemento focado.
 */
export function GameContextMenu({
  game,
  onOpenDetail,
  onPlay,
  onToggleFavorite,
  onChanged,
  onNotify,
  children,
}: {
  game: LibraryGame;
  onOpenDetail: () => void;
  /** Ausente quando a tela ainda não sabe se o jogo abre — o item fica desabilitado. */
  onPlay?: () => void;
  onToggleFavorite: () => void;
  /** Chamado depois de remover ou trazer de volta, para a tela recarregar a lista. */
  onChanged: () => void;
  /** Mensagem curta (toast) — sucesso e falha das ações resolvidas aqui dentro. */
  onNotify: (message: string) => void;
  children: ReactNode;
}) {
  const t = useT(dict);
  const [confirmingRemove, setConfirmingRemove] = useState(false);

  async function reveal() {
    try {
      await revealItemInDir(game.path);
    } catch (err) {
      onNotify(t("errorReveal", { error: err instanceof Error ? err.message : String(err) }));
    }
  }

  async function setExcluded(excluded: boolean) {
    try {
      if (excluded) await api.excludeGame(game.id);
      else await api.unexcludeGame(game.id);
      onNotify(t(excluded ? "removed" : "restored", { title: game.title }));
      onChanged();
    } catch (err) {
      onNotify(err instanceof ApiError ? err.message : t(excluded ? "errorRemove" : "errorRestore"));
    }
  }

  return (
    <>
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          <div className="contents">{children}</div>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          {/* Mesmo vocabulário do menu de filtros (LibraryToolbar) e do
              `Select`: borda + fundo sólido, rótulo mono em caixa alta. */}
          <ContextMenu.Content className="z-50 min-w-52 rounded-sm border-[1.5px] border-control-border bg-fill p-1">
            <Item icon={<Info size={12} />} onSelect={onOpenDetail}>
              {t("details")}
            </Item>
            <Item icon={<Play size={12} />} disabled={game.missing || !onPlay} onSelect={() => onPlay?.()}>
              {t("play")}
            </Item>
            <Item
              icon={game.favorite ? <StarOff size={12} /> : <Star size={12} />}
              onSelect={onToggleFavorite}
            >
              {game.favorite ? t("unfavorite") : t("favorite")}
            </Item>
            <Item icon={<FolderOpen size={12} />} disabled={game.missing} onSelect={() => void reveal()}>
              {t("reveal")}
            </Item>
            <ContextMenu.Separator className="my-1 h-px bg-line" />
            {game.excluded ? (
              <Item icon={<Undo2 size={12} />} onSelect={() => void setExcluded(false)}>
                {t("restore")}
              </Item>
            ) : (
              <Item icon={<EyeOff size={12} />} danger onSelect={() => setConfirmingRemove(true)}>
                {t("remove")}
              </Item>
            )}
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>

      {confirmingRemove && (
        <ConfirmModal
          title={t("removeTitle")}
          message={t("removeConfirm", { title: game.title })}
          onClose={() => setConfirmingRemove(false)}
          actions={
            <>
              <Button variant="chrome" onClick={() => setConfirmingRemove(false)}>
                {t("cancel")}
              </Button>
              <Button
                variant="danger"
                autoFocus
                onClick={() => {
                  setConfirmingRemove(false);
                  void setExcluded(true);
                }}
              >
                {t("remove")}
              </Button>
            </>
          }
        />
      )}
    </>
  );
}

function Item({
  icon,
  danger = false,
  disabled = false,
  onSelect,
  children,
}: {
  icon: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <ContextMenu.Item
      disabled={disabled}
      onSelect={onSelect}
      className={`flex items-center gap-2 rounded-sm px-2 py-1.5 font-mono text-xs tracking-wider uppercase outline-none select-none data-disabled:opacity-40 data-highlighted:bg-accent/15 ${
        danger ? "text-danger" : "text-ink"
      }`}
    >
      <span aria-hidden="true" className="shrink-0">
        {icon}
      </span>
      <span className="flex-1">{children}</span>
    </ContextMenu.Item>
  );
}
