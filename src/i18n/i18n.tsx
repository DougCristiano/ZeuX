import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * i18n do ZeuX (pedido do Douglas, 2026-09-06): o público-alvo inclui gente
 * que prefere inglês, e a escolha de idioma precisa ser explícita e visível
 * (seletor), não inferida do sistema operacional — um usuário com Windows em
 * inglês mas que quer o ZeuX em português (ou o contrário) não pode ficar
 * refém da configuração do SO.
 *
 * Desenho deliberadamente sem biblioteca: o projeto não tinha nenhuma
 * dependência de i18n, e o vocabulário do produto já é pequeno o bastante
 * para um dicionário por tela/componente, colocado ao lado do arquivo que o
 * usa (ex.: `DeclinedScreen.i18n.ts` ao lado de `DeclinedScreen.tsx`) — isso
 * evita um arquivo central gigante e deixa cada dicionário revisável junto
 * do componente que ele serve.
 *
 * `pt-BR` é a língua de registro do produto (ver CLAUDE.md) — todo texto
 * novo nasce em pt-BR primeiro. `en` é tradução, mantida em paralelo.
 */
export type Locale = "pt-BR" | "en";

export const LOCALES: { id: Locale; label: string }[] = [
  { id: "pt-BR", label: "Português (Brasil)" },
  { id: "en", label: "English" },
];

const STORAGE_KEY = "zeux-locale";

function detectDefaultLocale(): Locale {
  // Sem detecção automática pelo navegador/SO de propósito: a escolha é do
  // usuário, não do ambiente (ver comentário do arquivo). Só lê o que a
  // própria pessoa já escolheu antes.
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "pt-BR" || stored === "en") return stored;
  } catch {
    // localStorage pode não estar disponível (ex.: modo privado restrito);
    // cai no padrão silenciosamente.
  }
  return "pt-BR";
}

type LanguageContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectDefaultLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Preferência não persiste nesta sessão, mas o app continua funcional.
    }
  }, []);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLocale(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLocale precisa estar dentro de <LanguageProvider>.");
  return ctx;
}

// Dicionário de uma tela/componente: chave estável em inglês (identificador,
// não texto de UI) → texto por idioma. `pt-BR` é obrigatório; `en` também —
// nenhuma chave deve faltar tradução (ver script de checagem em
// scripts/check-i18n.mjs).
export type Dict = Record<string, Record<Locale, string>>;

/**
 * `useT(dict)` devolve uma função `t(key, vars?)` que resolve para o texto no
 * idioma atual. Interpolação simples de `{{nome}}` — o bastante para o
 * vocabulário do ZeuX, sem puxar uma lib de formatação inteira.
 *
 * Se a chave não existir no dicionário, cai para `pt-BR` (nunca quebra a UI)
 * e avisa no console em dev — sinal de dicionário incompleto.
 */
export function useT<D extends Dict>(dict: D) {
  const { locale } = useLocale();
  return useCallback(
    (key: keyof D & string, vars?: Record<string, string | number>) => {
      const entry = dict[key];
      let text: string;
      if (!entry) {
        console.warn(`[i18n] chave ausente: "${key}"`);
        text = key;
      } else {
        text = entry[locale] ?? entry["pt-BR"];
        if (import.meta.env.DEV && entry[locale] === undefined) {
          console.warn(`[i18n] chave "${key}" sem tradução para "${locale}"`);
        }
      }
      if (vars) {
        for (const [k, v] of Object.entries(vars)) {
          // split/join em vez de replaceAll: o target do tsconfig é ES2020,
          // que não tem String.prototype.replaceAll (só a partir de ES2021).
          text = text.split(`{{${k}}}`).join(String(v));
        }
      }
      return text;
    },
    [dict, locale],
  );
}
