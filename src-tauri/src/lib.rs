// O ADR 0001 (docs/decisoes/0001-ipc-http-local.md) decidiu que o front fala
// com o núcleo do ZeuX via HTTP no zeuxd, não por comandos Tauri/Rust — por
// isso não há nenhum #[tauri::command] de negócio aqui. O que este arquivo faz
// é só o ciclo de vida do zeuxd como processo filho (item B5 do plano da
// Sprint B, docs/sprint-b-plano.md): subir junto da janela, descer junto dela,
// e não duplicar um zeuxd que já esteja no ar.
use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{Manager, WindowEvent};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

#[allow(dead_code)]
#[cfg(target_os = "windows")]
const BUNDLED_CORES_RELATIVE_PATH: &str = r"retroarch\cores";
#[allow(dead_code)]
#[cfg(not(target_os = "windows"))]
const BUNDLED_CORES_RELATIVE_PATH: &str = "retroarch/cores";

const ZEUXD_ADDR: &str = "127.0.0.1:7777";

/// Guarda o processo do zeuxd que este app subiu, para poder derrubá-lo junto
/// do app. Fica None quando reaproveitamos um zeuxd que já estava no ar — não
/// é nosso para matar.
struct DaemonState(Mutex<Option<CommandChild>>);

/// Se probe_port() achou algo na porta que não é o zeuxd. Exposto por
/// zeuxd_port_conflict() como comando, em vez de evento: um evento emitido
/// dentro de setup() pode chegar antes do front terminar de registrar o
/// listener (o app já tentou isso e a corrida se confirmou na prática — ver
/// docs/sprint-b-plano.md, item B5). Um comando consultado sob demanda não tem
/// essa corrida.
struct PortConflict(Mutex<bool>);

#[tauri::command]
fn zeuxd_port_conflict(state: tauri::State<PortConflict>) -> bool {
    *state.0.lock().unwrap()
}

enum PortState {
    Free,
    RunningZeuxd,
    OccupiedByOther,
}

/// Verifica o que já existe na porta do zeuxd antes de decidir se sobe um novo
/// processo. Sem isso, abrir o app duas vezes (ou abrir com um zeuxd de
/// desenvolvimento já rodando) subiria um segundo processo brigando pela
/// mesma porta.
fn probe_port() -> PortState {
    let addr: SocketAddr = ZEUXD_ADDR
        .parse()
        .expect("endereço do zeuxd é constante e válido");
    match TcpStream::connect_timeout(&addr, Duration::from_millis(300)) {
        Err(_) => PortState::Free,
        Ok(stream) => {
            if health_check(stream) {
                PortState::RunningZeuxd
            } else {
                PortState::OccupiedByOther
            }
        }
    }
}

/// Faz uma requisição HTTP crua a GET /api/v1/health. Não vale trazer um
/// cliente HTTP inteiro como dependência só para esta checagem de bootstrap,
/// que roda uma vez por abertura do app.
fn health_check(mut stream: TcpStream) -> bool {
    let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));

    let request = b"GET /api/v1/health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n";
    if stream.write_all(request).is_err() {
        return false;
    }

    let mut buf = Vec::new();
    let _ = stream.read_to_end(&mut buf);
    let response = String::from_utf8_lossy(&buf);

    response.starts_with("HTTP/1.1 200") && response.contains("\"status\":\"ok\"")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(DaemonState(Mutex::new(None)))
        .manage(PortConflict(Mutex::new(false)))
        .invoke_handler(tauri::generate_handler![zeuxd_port_conflict])
        .setup(|app| {
            match probe_port() {
                PortState::RunningZeuxd => {
                    // Já tem um zeuxd de verdade respondendo — provavelmente o
                    // desenvolvedor rodando `go run ./cmd/zeuxd` à parte, ou
                    // uma segunda janela do app. Reaproveita, não sobe outro.
                }
                PortState::OccupiedByOther => {
                    // A porta está ocupada, mas por algo que não responde como
                    // o zeuxd responderia. Subir um segundo processo erraria a
                    // porta; seguir em frente sem avisar deixaria o usuário
                    // olhando pra uma tela que nunca carrega. O front consulta
                    // zeuxd_port_conflict() ao montar e decide o que mostrar.
                    *app.state::<PortConflict>().0.lock().unwrap() = true;
                }
                PortState::Free => {
                    // Calcular caminho de cores bundled para o daemon (ADR 0012).
                    // Se não existir, daemon silenciosamente ignora (cores podem vir
                    // do Online Updater do RetroArch).
                    //
                    // O prefixo "resources/" é necessário: resource_dir() devolve a
                    // raiz de instalação do app (ex.: /usr/lib/zeux no .deb), e
                    // "resources": ["resources/"] em tauri.conf.json preserva esse
                    // nome de pasta no destino — os arquivos ficam em
                    // <resource_dir>/resources/retroarch/..., não
                    // <resource_dir>/retroarch/... Bug real, presente desde a
                    // implementação original do ADR 0012: sem o prefixo, a env var
                    // sempre apontava para um caminho inexistente, e
                    // ensureBundledCoresAvailable() falhava silenciosamente (só
                    // logava, nunca travava o daemon) — nunca foi percebido porque
                    // só roda de verdade na hora de lançar um jogo (D11, ainda
                    // pendente). Achado e corrigido em 2026-08-04 verificando a env
                    // var de um processo real (/proc/<pid>/environ) contra o
                    // caminho real dos arquivos instalados.
                    //
                    // Só passa a env var se o diretório existir de verdade —
                    // apontar para um caminho fantasma fazia o daemon logar
                    // aviso em toda abertura de `tauri dev` sem resources/.
                    let bundled_cores_dir = app.path().resource_dir().ok().and_then(|p| {
                        let dir = p.join("resources/retroarch/cores");
                        dir.is_dir()
                            .then(|| dir.to_str().map(String::from))
                            .flatten()
                    });

                    // Idem para o app do RetroArch em si (extensão do ADR 0012 —
                    // o ADR original só cobria os cores; o executável ficou de
                    // fora até 2026-08-04, quando a tela de emuladores mostrou
                    // "não instalado" mesmo com os cores presentes). Ausente em
                    // macOS por enquanto (cmd/download-retroarch-app ainda não
                    // sabe empacotar o .dmg do RetroArch para lá).
                    let bundled_retroarch_dir = app.path().resource_dir().ok().and_then(|p| {
                        let dir = p.join("resources/retroarch/bin");
                        dir.is_dir()
                            .then(|| dir.to_str().map(String::from))
                            .flatten()
                    });

                    let mut sidecar = app
                        .shell()
                        .sidecar("zeuxd")
                        .expect("binário zeuxd não foi encontrado no pacote — rode `npm run build:daemon` antes de `tauri dev`/`tauri build`");

                    // Passar ZEUX_BUNDLED_CORES_DIR se cores empacotados existem
                    if let Some(cores_dir) = bundled_cores_dir {
                        sidecar = sidecar.env("ZEUX_BUNDLED_CORES_DIR", cores_dir);
                    }
                    if let Some(retroarch_dir) = bundled_retroarch_dir {
                        sidecar = sidecar.env("ZEUX_BUNDLED_RETROARCH_DIR", retroarch_dir);
                    }

                    // Em `tauri dev` o WebView vem de http://localhost:1420
                    // (devUrl). Sem ZEUX_DEV_ORIGIN o CORS recusa o fetch e a
                    // UI fica em "lendo o consentimento…" até esgotar retries
                    // (issue #6). cfg!(dev) só é true no sidecar de
                    // desenvolvimento — o instalador nunca leva essa env.
                    #[cfg(dev)]
                    {
                        sidecar = sidecar.env("ZEUX_DEV_ORIGIN", "http://localhost:1420");
                    }

                    let (mut events, child) = sidecar
                        .args(["--addr", ZEUXD_ADDR])
                        .spawn()
                        .expect("falha ao iniciar o processo do zeuxd");

                    app.state::<DaemonState>().0.lock().unwrap().replace(child);

                    // Repassa a saída do zeuxd para o log do Tauri — útil em
                    // desenvolvimento, e não custa nada em produção.
                    tauri::async_runtime::spawn(async move {
                        while let Some(event) = events.recv().await {
                            if let CommandEvent::Stderr(line) = event {
                                eprint!("[zeuxd] {}", String::from_utf8_lossy(&line));
                            }
                        }
                    });
                }
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            // Fechar a janela não pode deixar o zeuxd órfão segurando a porta
            // — é exatamente o que o ADR 0001 e o cmd/zeuxd/main.go (shutdown
            // limpo em SIGTERM) previram para quando o Tauri assumisse o
            // ciclo de vida do daemon.
            if let WindowEvent::CloseRequested { .. } = event {
                if let Some(child) = window
                    .app_handle()
                    .state::<DaemonState>()
                    .0
                    .lock()
                    .unwrap()
                    .take()
                {
                    let _ = child.kill();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
