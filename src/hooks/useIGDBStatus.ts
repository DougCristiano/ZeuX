import { useEffect, useState } from "react";
import { api } from "../api";

/**
 * Estado de conexão com o IGDB (G1), compartilhado por AllGamesScreen e
 * GameDetailScreen para não duplicar o fetch-on-mount nas duas telas — as
 * duas só precisam saber "a busca de capa está disponível sim/não" para
 * decidir se mostram o botão de buscar capa.
 *
 * `configured` cai numa credencial de teste embutida (ver SettingsScreen e
 * internal/igdb/credentials.go) quando ninguém conecta conta pessoal — mas
 * essa credencial só existe de verdade num build oficial (release.yml
 * injeta via ldflags; correção de 2026-09-08, antes ficava escrita no
 * código-fonte). Um build local sem ela, e sem conta pessoal conectada,
 * reporta `configured: false` de verdade agora — junto com a consulta em
 * si falhando (ver `.catch` abaixo), são os dois jeitos do botão de buscar
 * capa ficar escondido.
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
