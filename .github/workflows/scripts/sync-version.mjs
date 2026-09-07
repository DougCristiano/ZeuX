// Grava em package.json e src-tauri/tauri.conf.json o número de versão
// extraído da tag do release (ex.: "v0.1.12" -> "0.1.12").
//
// Achado real (2026-09-07, relato do Douglas): o auto-updater nunca via
// atualização disponível. Causa: o campo "version" dos dois arquivos ficava
// travado em "0.1.0" desde sempre — só a tag do git avançava (v0.1.9,
// v0.1.10...). O latest.json que o plugin de updater consulta é gerado a
// partir desse "version" do build, não da tag; com os dois lados (app
// instalado e manifesto) sempre dizendo "0.1.0", o updater comparava versão
// igual a versão igual e concluía "nada novo" — mesmo com releases mais
// novas publicadas. Corrigido escrevendo a versão real da tag antes do
// build, nos 3 jobs (Windows/Linux/macOS), que buildam cada um por conta
// própria a partir do checkout da tag.
//
// script em Node (não bash/pwsh) de propósito: os 3 runners (windows-latest,
// ubuntu-latest, macos-latest) já têm Node instalado neste ponto do
// workflow, e um único script evita manter a mesma lógica de parsing em
// dois shells diferentes (bash no Linux/macOS, pwsh no Windows).
import { readFileSync, writeFileSync } from "node:fs";

const tag = process.env.RELEASE_TAG;
if (!tag) {
  console.error("RELEASE_TAG não definido.");
  process.exit(1);
}

const version = tag.replace(/^v/, "");
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`Tag "${tag}" não vira uma versão semver válida ("${version}").`);
  process.exit(1);
}

for (const path of ["package.json", "src-tauri/tauri.conf.json"]) {
  const json = JSON.parse(readFileSync(path, "utf8"));
  json.version = version;
  writeFileSync(path, JSON.stringify(json, null, 2) + "\n");
  console.log(`${path}: version -> ${version}`);
}
