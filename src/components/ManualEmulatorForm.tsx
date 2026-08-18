import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { api, ApiError } from "../api";
import type { CustomDefinition } from "../api/types";
import { Button, InlineError, inputClass } from "./ui";

// slugify vira o nome digitado num id estável (mesmo alfabeto de
// console_id/adapter_id do catálogo: minúsculo, hífen). Só usado para uma
// definição NOVA — editar mantém o id original, porque trocar o id de uma
// definição existente seria criar uma segunda entrada, não renomear.
function slugify(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "emulador"
  );
}

/**
 * Formulário de "Adicionar/editar emulador manualmente" (I1,
 * docs/roadmap.md) — o backend inteiro já existia
 * (`internal/emulator/custom.go`, rotas `GET/POST/DELETE
 * /custom-emulators`), só faltava esta tela. `existing` presente edita (id
 * fixo); ausente cadastra um novo (id gerado por slug do nome, com
 * desambiguação contra `existingIds`).
 *
 * Args é uma lista de tokens de linha de comando (`CustomDefinition.args`,
 * cada elemento um argv separado) — pedir isso como textarea, um token por
 * linha, evita a ambiguidade de dividir uma string por espaço (um caminho
 * com espaço quebraria).
 */
export function ManualEmulatorForm({
  existing,
  existingIds,
  placeholders,
  onSaved,
  onCancel,
}: {
  existing?: CustomDefinition;
  existingIds: string[];
  placeholders: Record<string, string>;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [consoles, setConsoles] = useState((existing?.consoles ?? []).join(", "));
  const [binaryPath, setBinaryPath] = useState(existing?.binary_path ?? "");
  const [args, setArgs] = useState((existing?.args ?? ["{rom}"]).join("\n"));
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pickBinary() {
    const picked = await open({ multiple: false, directory: false });
    if (typeof picked === "string") setBinaryPath(picked);
  }

  function resolveID(): string {
    if (existing) return existing.id;
    const base = slugify(name);
    if (!existingIds.includes(base)) return base;
    let n = 2;
    while (existingIds.includes(`${base}-${n}`)) n++;
    return `${base}-${n}`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const def: CustomDefinition = {
        id: resolveID(),
        name: name.trim(),
        consoles: consoles
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean),
        binary_path: binaryPath.trim(),
        args: args
          .split("\n")
          .map((a) => a.trim())
          .filter(Boolean),
        notes: notes.trim() || undefined,
      };
      await api.upsertCustomEmulator(def);
      onSaved();
    } catch (err) {
      // Mensagem literal do servidor — nunca reescrita (regra do projeto),
      // é o que nomeia exatamente o que falhou (ex.: "os argumentos
      // precisam conter {rom}", "o caminho X não existe ou não é um
      // executável").
      setError(err instanceof ApiError ? err.message : "Não foi possível salvar este emulador.");
    } finally {
      setSaving(false);
    }
  }

  return (
    // B6 (achado do critico-design, 2026-08-18): `border-line-strong` era
    // divergente do token que `Card` usa (`border-line`) — `<form>` não pode
    // virar `<Card>` de verdade (precisa da semântica nativa de submit),
    // então alinhado à mão aos mesmos tokens que o componente usa.
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded border border-line bg-fill p-4">
      <label className="flex flex-col gap-1 text-sm text-ink">
        Nome
        <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
      </label>

      <label className="flex flex-col gap-1 text-sm text-ink">
        Consoles atendidos (ids separados por vírgula, ex.: ps1, ps2)
        <input
          type="text"
          required
          value={consoles}
          onChange={(e) => setConsoles(e.target.value)}
          className={inputClass}
        />
      </label>

      <label className="flex flex-col gap-1 text-sm text-ink">
        Caminho do executável
        <div className="flex gap-2">
          <input
            type="text"
            required
            value={binaryPath}
            onChange={(e) => setBinaryPath(e.target.value)}
            className={inputClass}
          />
          <Button type="button" variant="secondary" onClick={pickBinary} className="shrink-0">
            Escolher arquivo
          </Button>
        </div>
      </label>

      <label className="flex flex-col gap-1 text-sm text-ink">
        Argumentos (um por linha — precisa incluir {"{rom}"} em algum deles)
        <textarea
          required
          rows={4}
          value={args}
          onChange={(e) => setArgs(e.target.value)}
          className={inputClass + " font-mono"}
        />
        <span className="text-xs text-muted">
          {Object.entries(placeholders)
            .map(([token, desc]) => `${token} — ${desc}`)
            .join(" · ")}
        </span>
      </label>

      <label className="flex flex-col gap-1 text-sm text-ink">
        Notas (opcional)
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
      </label>

      {error && <InlineError>{error}</InlineError>}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? "Salvando…" : "Salvar"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
