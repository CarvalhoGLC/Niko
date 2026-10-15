use std::collections::HashMap;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
#[cfg(windows)]
use std::sync::atomic::AtomicIsize;
use std::sync::Mutex;
use std::time::Duration;

use serde::Deserialize;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, RunEvent, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_global_shortcut::ShortcutState;
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandChild; 

mod atalhos;
#[cfg(windows)]
mod barra_windows;
#[cfg(not(windows))]
#[path = "barra_linux.rs"]
mod barra_windows;
mod docks;
#[cfg(windows)]
mod janela_frente;
#[cfg(not(windows))]
#[path = "janela_frente_linux.rs"]
mod janela_frente;
#[cfg(windows)]
mod miniaturas;
#[cfg(not(windows))]
#[path = "miniaturas_linux.rs"]
mod miniaturas;
mod salvamento;

const PORTA: u16 = 47831;
const ALTURA_ILHA: f64 = 720.0;
const ALTURA_DOCK: f64 = 400.0;

#[derive(Deserialize, Clone, Copy)]
struct Retangulo {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

struct Estado {
    areas: Mutex<HashMap<String, Vec<Retangulo>>>,
    token: String,
    ponte: Mutex<Option<CommandChild>>,
}

fn gerar_token() -> String {
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes).expect("falha ao gerar o token da ponte");
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

#[tauri::command]
fn area_interativa(janela: String, retangulos: Vec<Retangulo>, estado: tauri::State<Estado>) {
    if let Ok(mut areas) = estado.areas.lock() {
        areas.insert(janela, retangulos);
    }
}

#[tauri::command]
fn token_ponte(estado: tauri::State<Estado>) -> String {
    estado.token.clone()
}

#[tauri::command]
fn porta_ponte() -> u16 {
    PORTA
}

#[tauri::command]
fn mostrar_sistema(app: AppHandle) {
    mostrar(&app);
}

#[cfg(windows)]
static ULTIMA_FRENTE: AtomicIsize = AtomicIsize::new(0);
static ABERTURA_PENDENTE: AtomicBool = AtomicBool::new(false);
const LIMITE_DA_ABERTURA: Duration = Duration::from_secs(9);

fn liberar_abertura(app: &AppHandle) {
    if ABERTURA_PENDENTE.swap(false, Ordering::Relaxed) {
        mostrar_inicial(app);
    }
}

#[cfg(target_os = "macos")]
fn mostrar_inicial(app: &AppHandle) {
    if let Some(janela) = app.get_webview_window("sistema") {
        let _ = janela.unminimize();
        // No macOS, centralizar/maximizar durante a criação não é confiável
        // enquanto a janela ainda está oculta. Aplique ao revelá-la.
        let _ = janela.center();
        let _ = janela.show();
        let _ = janela.maximize();
        let _ = janela.set_focus();
    }
}

#[cfg(not(target_os = "macos"))]
fn mostrar_inicial(app: &AppHandle) {
    mostrar(app);
}

#[tauri::command]
fn liberar_sistema_inicial(app: AppHandle) {
    liberar_abertura(&app);
}

#[cfg(not(windows))]
#[tauri::command]
fn tempo_ocioso_ms() -> u64 {
    // GNOME: o monitor de inatividade do Mutter responde em milissegundos, por exemplo "(uint64 4231,)".
    let saida = Command::new("gdbus")
        .args(["call", "--session", "--dest", "org.gnome.Mutter.IdleMonitor", "--object-path", "/org/gnome/Mutter/IdleMonitor/Core", "--method", "org.gnome.Mutter.IdleMonitor.GetIdletime"])
        .output();
    let Ok(saida) = saida else { return 0 };
    let texto = String::from_utf8_lossy(&saida.stdout).to_string();
    let digitos: String = texto.split_whitespace().nth(1).unwrap_or("").chars().take_while(|c| c.is_ascii_digit()).collect();
    digitos.parse::<u64>().unwrap_or(0)
}

#[cfg(windows)]
#[tauri::command]
fn tempo_ocioso_ms() -> u64 {
    use windows::Win32::System::SystemInformation::GetTickCount;
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
    let mut info = LASTINPUTINFO { cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32, dwTime: 0 };
    if !unsafe { GetLastInputInfo(&mut info) }.as_bool() {
        return 0;
    }
    u64::from(unsafe { GetTickCount() }.wrapping_sub(info.dwTime))
}

#[cfg(not(windows))]
fn registrar_frente(_app: &AppHandle) {}

#[cfg(windows)]
fn registrar_frente(app: &AppHandle) {
    let frente = unsafe { windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow() }.0 as isize;
    if frente == 0 {
        return;
    }
    let sobreposta = app.webview_windows().iter().any(|(r, j)| (r == "ilha" || r == "assistive" || docks::eh_dock(r)) && j.hwnd().map(|h| h.0 as isize == frente).unwrap_or(false));
    if !sobreposta {
        ULTIMA_FRENTE.store(frente, Ordering::Relaxed);
    }
}

#[cfg(not(windows))]
#[tauri::command]
fn devolver_foco() {}

#[cfg(windows)]
#[tauri::command]
fn devolver_foco() {
    let anterior = ULTIMA_FRENTE.load(Ordering::Relaxed);
    if anterior != 0 {
        let janela = windows::Win32::Foundation::HWND(anterior as *mut core::ffi::c_void);
        unsafe {
            let _ = windows::Win32::UI::WindowsAndMessaging::SetForegroundWindow(janela);
        }
    }
}

#[tauri::command]
fn alternar_sistema(app: AppHandle) {
    if let Some(janela) = app.get_webview_window("sistema") {
        let visivel = janela.is_visible().unwrap_or(false) && !janela.is_minimized().unwrap_or(false);
        #[cfg(windows)]
        let focada = janela.hwnd().map(|h| h.0 as isize == ULTIMA_FRENTE.load(Ordering::Relaxed)).unwrap_or(false);
        #[cfg(not(windows))]
        let focada = janela.is_focused().unwrap_or(false);
        if visivel && focada {
            let _ = janela.minimize();
        } else {
            mostrar(&app);
        }
    }
}

#[cfg(windows)]
fn abrir_no_sistema(endereco: &str) -> Result<(), String> {
    let largo: Vec<u16> = endereco.encode_utf16().chain(std::iter::once(0)).collect();
    let resultado = unsafe {
        windows::Win32::UI::Shell::ShellExecuteW(
            None,
            windows::core::w!("open"),
            windows::core::PCWSTR(largo.as_ptr()),
            None,
            None,
            windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL,
        )
    };
    if resultado.0 as isize > 32 {
        Ok(())
    } else {
        Err("falha_ao_abrir".into())
    }
}

#[cfg(not(windows))]
fn abrir_no_sistema(endereco: &str) -> Result<(), String> {
    let mut filho = Command::new("xdg-open")
        .arg(endereco)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|_| "falha_ao_abrir".to_string())?;
    std::thread::spawn(move || {
        let _ = filho.wait();
    });
    Ok(())
}

#[tauri::command]
fn abrir_link(url: String) -> Result<(), String> {
    let endereco = url.trim();
    if !(endereco.starts_with("https://") || endereco.starts_with("http://")) || endereco.chars().any(|c| c.is_whitespace() || c.is_control()) {
        return Err("link_invalido".into());
    }
    abrir_no_sistema(endereco)
}

#[tauri::command]
fn sair(app: AppHandle) {
    sair_salvando(&app);
}

fn sair_salvando(app: &AppHandle) {
    if ENCERRAMENTO_PEDIDO.swap(true, Ordering::Relaxed) {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if salvamento::salvar(&app).await.is_ok() {
            ENCERRANDO.store(true, Ordering::Relaxed);
            app.exit(0);
        } else {
            ENCERRAMENTO_PEDIDO.store(false, Ordering::Relaxed);
            mostrar(&app);
        }
    });
}

fn mostrar(app: &AppHandle) {
    ABERTURA_PENDENTE.store(false, Ordering::Relaxed);
    if let Some(janela) = app.get_webview_window("sistema") {
        let _ = janela.unminimize();
        let _ = janela.show();
        let _ = janela.set_focus();
    }
}

fn dock_sob_o_cursor(app: &AppHandle) -> Option<WebviewWindow> {
    let docks: Vec<(String, WebviewWindow)> = app.webview_windows().into_iter().filter(|(r, j)| docks::eh_dock(r) && j.is_visible().unwrap_or(false)).collect();
    let cursor = app.cursor_position().ok();
    let sob_o_cursor = cursor.and_then(|c| {
        docks.iter().find(|(_, j)| {
            let Ok(Some(m)) = j.current_monitor() else { return false };
            let (p, t) = (m.position(), m.size());
            c.x >= p.x as f64 && c.x < p.x as f64 + t.width as f64 && c.y >= p.y as f64 && c.y < p.y as f64 + t.height as f64
        })
    });
    sob_o_cursor.or_else(|| docks.iter().find(|(r, _)| r == "dock")).or(docks.first()).map(|(_, j)| j.clone())
}

fn abrir_lupa(app: &AppHandle) {
    let Some(dock) = dock_sob_o_cursor(app) else { return };
    let _ = dock.set_focus();
    let _ = dock.emit_to(dock.label(), "niko://lupa", ());
}

fn criar_sobreposta(app: &AppHandle, rotulo: &str, y: f64, x: f64, largura: f64, altura: f64) -> tauri::Result<WebviewWindow> {
    WebviewWindowBuilder::new(app, rotulo, WebviewUrl::App("index.html".into()))
        .title("Niko")
        .transparent(true)
        .decorations(false)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .focused(false)
        .visible(false)
        .position(x, y)
        .inner_size(largura, altura)
        .build()
}

// No Linux, uma janela escondida ainda não existe de verdade e o tao falha ao pedir click-through nela.
fn ignorar_cursor(janela: &WebviewWindow, ignorar: bool) -> bool {
    #[cfg(target_os = "linux")]
    {
        if !janela.is_visible().unwrap_or(false) {
            return false;
        }
    }
    janela.set_ignore_cursor_events(ignorar).is_ok()
}

fn vigiar_cursor(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let mut fora: HashMap<String, bool> = HashMap::new();
        loop {
            tokio::time::sleep(Duration::from_millis(45)).await;
            if ENCERRANDO.load(Ordering::Relaxed) { return; }
            let alvo = app.clone();
            match tauri::async_runtime::spawn_blocking(move || atualizar_cursor(&alvo, fora)).await {
                Ok(atual) => fora = atual,
                Err(_) => return,
            }
        }
    });
}

fn atualizar_cursor(app: &AppHandle, mut fora: HashMap<String, bool>) -> HashMap<String, bool> {
    if ENCERRANDO.load(Ordering::Relaxed) { return fora; }
    registrar_frente(app);
    let areas = match app.state::<Estado>().areas.lock() {
        Ok(a) => a.clone(),
        Err(_) => return fora,
    };
    let Ok(cursor) = app.cursor_position() else { return fora };
    let sobrepostas: Vec<(String, WebviewWindow)> = app.webview_windows().into_iter().filter(|(r, _)| r == "ilha" || r == "assistive" || docks::eh_dock(r)).collect();
    fora.retain(|r, _| sobrepostas.iter().any(|(s, _)| s == r));
    for (rotulo, janela) in &sobrepostas {
        if ENCERRANDO.load(Ordering::Relaxed) { break; }
        let rotulo = rotulo.as_str();
        if !janela.is_visible().unwrap_or(false) { continue; }
        let dentro = if let Some(lista) = areas.get(rotulo).filter(|a| !a.is_empty()) {
            let (Ok(origem), Ok(escala)) = (janela.outer_position(), janela.scale_factor()) else { continue };
            let x = (cursor.x - origem.x as f64) / escala;
            let y = (cursor.y - origem.y as f64) / escala;
            lista.iter().any(|r| x >= r.x - 4.0 && x <= r.x + r.w + 4.0 && y >= r.y - 4.0 && y <= r.y + r.h + 4.0)
        } else { false };
        let agora_fora = !dentro;
        if fora.get(rotulo) != Some(&agora_fora) {
            if !ignorar_cursor(janela, agora_fora) { continue; }
            if agora_fora {
                let _ = janela.emit_to(rotulo, "niko://cursor-fora", ());
            }
            fora.insert(rotulo.to_string(), agora_fora);
        }
    }
    fora
}

fn sem_prefixo(caminho: std::path::PathBuf) -> std::path::PathBuf {
    let texto = caminho.to_string_lossy().to_string();
    match texto.strip_prefix(r"\\?\UNC\") {
        Some(resto) => std::path::PathBuf::from(format!(r"\\{}", resto)),
        None => match texto.strip_prefix(r"\\?\") {
            Some(resto) => std::path::PathBuf::from(resto),
            None => caminho,
        },
    }
}

fn iniciar_ponte(app: &AppHandle, token: &str, reinicio: bool) {
    if cfg!(debug_assertions) {
        return;
    }
    let dados = app.path().app_data_dir().ok();
    let registrar = |texto: String| {
        if let Some(pasta) = &dados {
            let _ = std::fs::create_dir_all(pasta);
            let _ = std::fs::write(pasta.join("niko.log"), texto);
        }
    };
    let Ok(pasta) = app.path().resource_dir() else {
        registrar("sem pasta de recursos".into());
        return;
    };
    let recursos = sem_prefixo(pasta.join("recursos"));
    let script = recursos.join("ponte.mjs");
    if !script.exists() {
        registrar(format!("Script da ponte não encontrado: {}", script.display()));
        return;
    }
    let mut sidecar_comando = match app.shell().sidecar("node"){
        Ok(cmd) => cmd,
        Err(erro) => {
            registrar(format!("Falha ao carregar o Sidecar do Node: {}", erro));
            return;
        }
    };
    sidecar_comando = sidecar_comando
    .current_dir(recursos)
    .arg("ponte.mjs")
    .env("NIKO_PORTA", PORTA.to_string())
    .env("NIKO_TOKEN", token)
    .env("NIKO_PAI", std::process::id().to_string());

    let estado = app.state::<Estado>();
    let Ok(mut ponte) = estado.ponte.lock() else { return };
    if ENCERRANDO.load(Ordering::Relaxed) { return; }
    if ponte.is_some() { return; }

    match sidecar_comando.spawn() {
        Ok((_rx, filho)) => {
            registrar(format!("ponte sidecar iniciada com sucesso (pid {})", filho.pid()));
            *ponte = Some(filho);
        }
        Err(erro) => registrar(format!("falha ao dar spawn no Sidecar do Node: {}", erro)),
    }
}

fn parar_ponte(app: &AppHandle) {
    ENCERRANDO.store(true, Ordering::Relaxed);
    let filho = app.state::<Estado>().ponte.lock().ok().and_then(|mut ponte| ponte.take());
    if let Some(mut filho) = filho {
        let _ = filho.kill();
    }
}

#[tauri::command]
async fn preparar_atualizacao(app: AppHandle) -> Result<(), String> {
    if ENCERRAMENTO_PEDIDO.swap(true, Ordering::Relaxed) { return Err("encerramento_em_andamento".into()); }
    if let Err(erro) = salvamento::salvar(&app).await {
        ENCERRAMENTO_PEDIDO.store(false, Ordering::Relaxed);
        return Err(erro);
    }
    ENCERRANDO.store(true, Ordering::Relaxed);
    for (rotulo, janela) in app.webview_windows() {
        if docks::eh_dock(&rotulo) {
            barra_windows::reservar_espaco_do_dock(&janela, false);
        }
    }
    let _ = tauri::async_runtime::spawn_blocking(move || {
        barra_windows::restaurar(&app);
        parar_ponte(&app);
    }).await;
    Ok(())
}

static ENCERRANDO: AtomicBool = AtomicBool::new(false);
static ENCERRAMENTO_PEDIDO: AtomicBool = AtomicBool::new(false);
const MAXIMO_REINICIOS_DA_PONTE: u32 = 5;

fn vigiar_ponte(app: AppHandle, token: String) {
    if cfg!(debug_assertions) {
        return;
    }
    tauri::async_runtime::spawn(async move {
        let mut reinicios = 0u32;
        let mut estavel_desde = std::time::Instant::now();
        loop {
            tokio::time::sleep(Duration::from_secs(3)).await;
            if ENCERRANDO.load(Ordering::Relaxed) {
                return;
            }
            let caiu = match app.state::<Estado>().ponte.lock() {
                Ok(mut ponte) => {
                    if let Some(ref mut filho) = *ponte {
                        filho.pid() == 0
                    } else {
                        true
                    }
                }
                Err(_) => false,
            };
            if !caiu {
                if estavel_desde.elapsed() > Duration::from_secs(120) {
                    reinicios = 0;
                }
                continue;
            }
            if reinicios >= MAXIMO_REINICIOS_DA_PONTE {
                return;
            }
            if let Ok(mut ponte) = app.state::<Estado>().ponte.lock() {
                *ponte = None;
            }

            reinicios += 1;
            tokio::time::sleep(Duration::from_secs(u64::from(reinicios) * 2)).await;
            if ENCERRANDO.load(Ordering::Relaxed) {
                return;
            }
            let alvo = app.clone();
            let chave = token.clone();
            if tauri::async_runtime::spawn_blocking(move || iniciar_ponte(&alvo, &chave, true)).await.is_err() { return; }
            estavel_desde = std::time::Instant::now();
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // O Niko posiciona janelas por coordenada e lê o cursor global: isso só funciona sob X11/XWayland.
    #[cfg(target_os = "linux")]
    {
        if std::env::var_os("GDK_BACKEND").is_none() {
            std::env::set_var("GDK_BACKEND", "x11");
        }
    }
    let token = gerar_token();
    let escondido = std::env::args().any(|a| a == "--escondido");

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| mostrar(app)))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, Some(vec!["--escondido"])))
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, atalho, evento| {
                    if evento.state() != ShortcutState::Pressed {
                        return;
                    }
                    let Some(acao) = atalhos::acao_de(app, atalho) else { return };
                    match acao.as_str() {
                        "lupa" => abrir_lupa(app),
                        "sistema" => alternar_sistema(app.clone()),
                        "captura" => {
                            mostrar(app);
                            let _ = app.emit_to("sistema", "niko://captura", ());
                        }
                        "pedido" | "proximaAba" | "terminal" => atalhos::avisar_janela(app, "ilha", &acao),
                        _ => atalhos::avisar_janela(app, "sistema", &acao),
                    }
                })
                .build(),
        )
        .manage(Estado { areas: Mutex::new(HashMap::new()), token: token.clone(), ponte: Mutex::new(None) })
        .manage(miniaturas::Miniaturas::default())
        .manage(salvamento::ControleSalvamento::default())
        .manage(atalhos::Atalhos::default())
        .invoke_handler(tauri::generate_handler![
            area_interativa,
            token_ponte,
            porta_ponte,
            mostrar_sistema,
            alternar_sistema,
            docks::monitores,
            docks::definir_docks,
            docks::definir_monitor_da_ilha,
            liberar_sistema_inicial,
            preparar_atualizacao,
            salvamento::registrar_armazenamento,
            salvamento::confirmar_salvamento,
            tempo_ocioso_ms,
            abrir_link,
            sair,
            barra_windows::barra_windows,
            barra_windows::reservar_dock,
            janela_frente::frente_cobre_tela,
            miniaturas::miniaturas_janelas,
            atalhos::definir_atalhos,
            devolver_foco
        ])
        .setup(move |app| {
            let handle = app.handle().clone();
            barra_windows::restaurar(&handle);
            let alvo_da_ponte = handle.clone();
            let chave_da_ponte = token.clone();
            tauri::async_runtime::spawn_blocking(move || iniciar_ponte(&alvo_da_ponte, &chave_da_ponte, false));
            vigiar_ponte(handle.clone(), token.clone());

            let monitor = app.primary_monitor()?.or(app.available_monitors()?.into_iter().next());
            let (mx, my, mw, mh) = match &monitor {
                Some(m) => {
                    let escala = m.scale_factor();
                    let area = m.work_area();
                    (area.position.x as f64 / escala, area.position.y as f64 / escala, area.size.width as f64 / escala, area.size.height as f64 / escala)
                }
                None => (0.0, 0.0, 1920.0, 1040.0),
            };
            let (tela_x, tela_y, tela_largura) = match &monitor {
                Some(m) => {
                    let escala = m.scale_factor();
                    (m.position().x as f64 / escala, m.position().y as f64 / escala, m.size().width as f64 / escala)
                }
                None => (mx, my, mw),
            };

            let sistema = WebviewWindowBuilder::new(app, "sistema", WebviewUrl::App("index.html".into()))
                .title("Niko")
                .decorations(false)
                .inner_size(1320.0_f64.min(mw - 40.0), 860.0_f64.min(mh - 40.0))
                .min_inner_size(960.0, 600.0)
                .background_color(tauri::window::Color(14, 14, 16, 255))
                .disable_drag_drop_handler()
                .center()
                .visible(false)
                .build()?;
            if !escondido {
                ABERTURA_PENDENTE.store(true, Ordering::Relaxed);
                let reserva = handle.clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(LIMITE_DA_ABERTURA).await;
                    liberar_abertura(&reserva);
                });
            }
            let sistema_ref = sistema.clone();
            sistema.on_window_event(move |evento| {
                if let WindowEvent::CloseRequested { api, .. } = evento {
                    api.prevent_close();
                    let _ = sistema_ref.hide();
                }
            });

            criar_sobreposta(&handle, "ilha", tela_y, tela_x, tela_largura, ALTURA_ILHA)?;
            criar_sobreposta(&handle, "dock", my + mh - ALTURA_DOCK, mx, mw, ALTURA_DOCK)?;
            criar_sobreposta(&handle, "assistive", my, mx, mw, mh)?;
            for rotulo in ["ilha", "dock", "assistive"] {
                if let Some(j) = handle.get_webview_window(rotulo) {
                    ignorar_cursor(&j, true);
                }
            }
            docks::sincronizar(&handle);
            docks::vigiar_monitores(handle.clone());
            vigiar_cursor(handle.clone());

            let abrir = MenuItem::with_id(app, "abrir", "Abrir o Niko", true, None::<&str>)?;
            let sair_item = MenuItem::with_id(app, "sair", "Sair", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&abrir, &sair_item])?;
            let mut bandeja = TrayIconBuilder::with_id("niko").menu(&menu).show_menu_on_left_click(false).tooltip("Niko");
            if let Some(icone) = app.default_window_icon() {
                bandeja = bandeja.icon(icone.clone());
            }
            bandeja
                .on_menu_event(|app, evento| match evento.id.as_ref() {
                    "abrir" => mostrar(app),
                    "sair" => sair_salvando(app),
                    _ => {}
                })
                .on_tray_icon_event(|bandeja, evento| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = evento {
                        mostrar(bandeja.app_handle());
                    }
                })
                .build(app)?;

            atalhos::registrar_padrao(&handle);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("falha ao iniciar o Niko");

    app.run(|handle, evento| {
        if let RunEvent::Exit = evento {
            ENCERRANDO.store(true, Ordering::Relaxed);
            for (rotulo, janela) in handle.webview_windows() {
                if docks::eh_dock(&rotulo) {
                    barra_windows::reservar_espaco_do_dock(&janela, false);
                }
            }
            barra_windows::restaurar(handle);
            parar_ponte(handle);
        }
    });
}
