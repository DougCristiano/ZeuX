import { open } from "@tauri-apps/plugin-dialog";
import { api } from "../api";
import type { Screenshot } from "../api/types";

/** Extensões que a galeria aceita — as mesmas de `imageExts` no zeuxd. */
const SCREENSHOT_EXTENSIONS = ["png", "jpg", "jpeg", "bmp", "webp"];

/**
 * Abre o diálogo nativo e envia as imagens escolhidas à galeria do jogo.
 * `null` = a pessoa cancelou. O front nunca lê os bytes: passa o caminho e
 * o zeuxd copia e valida (mesma fronteira da troca de capa).
 */
export async function pickAndAddScreenshots(
  gameId: number,
  filterName: string,
  multiple: boolean,
): Promise<{ added: Screenshot[]; errors: { path: string; message: string }[] } | null> {
  const picked = await open({
    multiple,
    directory: false,
    filters: [{ name: filterName, extensions: SCREENSHOT_EXTENSIONS }],
  });
  const paths = Array.isArray(picked) ? picked : typeof picked === "string" ? [picked] : [];
  if (paths.length === 0) return null;
  return api.addGameScreenshots(gameId, paths);
}
