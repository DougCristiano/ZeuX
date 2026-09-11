import { useT } from "../i18n/i18n";
import { dict } from "./PracaPanel.i18n";

/**
 * "A Praça" — a coluna de comunidade da Home (2026-09-11, padrão do mockup H).
 *
 * **Não existe backend nenhum para isto**: nenhuma rota de API, nenhuma
 * tabela, nenhuma linha de código de compartilhamento de save/texture pack/
 * perfil de controle/netplay (conferido no `internal/` inteiro nesta sessão,
 * não presumido — CLAUDE.md, "não presuma que uma funcionalidade do PRD
 * existe"). O mockup enchia esta coluna de atividade com nomes de usuário
 * inventados; copiar isso para a tela que roda de verdade seria fingir dado,
 * exatamente o que o princípio 4 proíbe.
 *
 * O que se faz em vez disso: a coluna diz que a camada social ainda não está
 * no ar e mostra o **formato** do que vai aparecer, rotulado como prévia e
 * sem nenhum nome, avatar ou contador. As barras cinzas no lugar do texto são
 * de propósito — quem olha entende que ali vai entrar conteúdo de gente, e
 * ninguém consegue ler como se já houvesse gente.
 *
 * Quando o backend existir, o desenho de cada linha (etiqueta de tipo + frase
 * + ação) já está aqui; o que entra é o dado, não uma tela nova.
 */
export function PracaPanel() {
  const t = useT(dict);
  const kinds = [
    { label: t("kindSave"), desc: t("kindSaveDesc"), color: "var(--amber)" },
    { label: t("kindTexture"), desc: t("kindTextureDesc"), color: "var(--accent-secondary)" },
    { label: t("kindController"), desc: t("kindControllerDesc"), color: "var(--accent)" },
    { label: t("kindNetplay"), desc: t("kindNetplayDesc"), color: "var(--amber)" },
  ];

  return (
    <aside aria-label={t("label")} className="overflow-hidden rounded-lg border border-line bg-panel">
      {/* Bloco de cor cheio no topo, como no mockup — o ciano é o token de
          "aqui o sistema informa" (regra da paleta em index.css), que é
          exatamente o papel desta coluna hoje: ela informa, não dá ação. */}
      <div className="border-b border-line bg-accent-secondary px-4 py-3 text-paper">
        <h2 className="font-pixel text-sm leading-relaxed tracking-[0.04em]">{t("title")}</h2>
        <p className="mt-1.5 font-mono text-xs font-medium tracking-wide uppercase">{t("status")}</p>
      </div>

      <div className="p-4">
        <p className="text-sm text-muted">{t("intro")}</p>

        <p className="mt-4 font-mono text-xs tracking-wide text-muted uppercase">{t("previewLabel")}</p>
        <ul className="mt-2 flex flex-col gap-2">
          {kinds.map((k) => (
            <li
              key={k.label}
              className="rounded-sm border border-dashed border-line-strong bg-fill/60 p-3"
              style={{ borderLeftColor: k.color, borderLeftWidth: 3, borderLeftStyle: "solid" }}
            >
              <span className="font-mono text-[11px] tracking-wider" style={{ color: k.color }}>
                {k.label}
              </span>
              <p className="mt-1 text-sm text-muted">{k.desc}</p>
              {/* Lugar do nome de quem compartilhou e do horário: barras, não
                  texto — o formato aparece, a pessoa inexistente não. */}
              <div aria-hidden="true" className="mt-2 flex items-center gap-2">
                <span className="h-2 w-20 rounded-sm bg-line-strong" />
                <span className="h-2 w-10 rounded-sm bg-line" />
              </div>
            </li>
          ))}
        </ul>

        {/* Princípio 6 (CLAUDE.md): a regra do que circula e do que nunca
            circula fica escrita na própria coluna, não só na documentação. */}
        <p className="mt-4 rounded-sm border border-amber-line bg-amber-bg p-3 text-xs text-muted">{t("legal")}</p>
      </div>
    </aside>
  );
}
