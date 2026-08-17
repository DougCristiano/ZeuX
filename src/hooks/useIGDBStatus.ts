import { useEffect, useState } from "react";
import { api } from "../api";

/**
 * Estado de conexão com o IGDB (G1), compartilhado por AllGamesScreen e
 * GameDetailScreen para não duplicar o fetch-on-mount nas duas telas — as
 * duas só precisam saber "a busca de capa está disponível sim/não" para
 * decidir se mostram o botão de buscar capa.
 *
 * `configured` é praticamente sempre `true` desde 2026-08-17: sem conta
 * pessoal conectada, o ZeuX cai numa credencial de teste embutida (ver
 * SettingsScreen e internal/igdb/credentials.go) — só fica `false` quando a
 * própria consulta a GET /igdb/credentials falha (ver `.catch` abaixo).
 *
 * `null` enquanto carrega: as telas escondem o botão nesse meio-tempo em vez
 * de mostrar e esconder de novo (evita o "pisca" de aparecer e sumir).
 */
export function useIGDBStatus() {
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getIGDBCredentials()
      .then((status) => {
        if (!cancelled) setConfigured(status.configured);
      })
      // Falha ao consultar o status também esconde o botão — mesma regra de
      // "sem credencial, G1 nem tenta" (docs/roadmap.md): não vale a pena
      // diferenciar "não configurado" de "não deu pra saber" para o usuário
      // aqui, os dois casos terminam sem o botão de buscar capa.
      .catch(() => {
        if (!cancelled) setConfigured(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return configured;
}
