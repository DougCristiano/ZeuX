// Caminho de instalação (`Installation.binary_path`) vem do SO que rodou o
// ZeuX — separador `\` no Windows, `/` no Linux/macOS. `parentDir` aceita os
// dois para poder derivar "a pasta onde o binário está" no lado do
// front-end, sem depender de o backend expor um campo por finalidade.
export function parentDir(path: string): string {
  const trimmed = path.replace(/[/\\]+$/, "");
  const cut = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  return cut === -1 ? trimmed : trimmed.slice(0, cut);
}
