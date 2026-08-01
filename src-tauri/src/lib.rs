// O ADR 0001 (docs/decisoes/0001-ipc-http-local.md) decidiu que o front fala
// com o núcleo do ZeuX via HTTP no zeuxd, não por comandos Tauri/Rust — por
// isso não há nenhum #[tauri::command] aqui. O lado Rust só hospeda a janela.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
