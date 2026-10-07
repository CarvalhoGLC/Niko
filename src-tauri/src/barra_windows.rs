use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Manager, WebviewWindow};
use windows::core::w;
use windows::Win32::Foundation::{HWND, LPARAM, RECT};
use windows::Win32::UI::Shell::{SHAppBarMessage, ABE_BOTTOM, ABM_GETSTATE, ABM_NEW, ABM_QUERYPOS, ABM_REMOVE, ABM_SETPOS, ABM_SETSTATE, ABS_AUTOHIDE, APPBARDATA};
use windows::Win32::UI::WindowsAndMessaging::{FindWindowExW, FindWindowW, IsWindowVisible, ShowWindow, SW_HIDE, SW_SHOWNA, WM_APP};

static OCULTA: AtomicBool = AtomicBool::new(false);

pub fn barra_oculta() -> bool {
    OCULTA.load(Ordering::SeqCst)
}

fn arquivo_recuperacao(app: &AppHandle) -> Option<PathBuf> {
    let pasta = app.path().app_data_dir().ok()?;
    let _ = std::fs::create_dir_all(&pasta);
    Some(pasta.join("barra-windows.flag"))
}

fn barras_do_windows() -> Vec<HWND> {
    let mut lista = Vec::new();
    if let Ok(principal) = unsafe { FindWindowW(w!("Shell_TrayWnd"), None) } {
        lista.push(principal);
    }
    let mut anterior: Option<HWND> = None;
    while let Ok(secundaria) = unsafe { FindWindowExW(None, anterior, w!("Shell_SecondaryTrayWnd"), None) } {
        if secundaria.is_invalid() {
            break;
        }
        lista.push(secundaria);
        anterior = Some(secundaria);
    }
    lista
}

fn dados_appbar(estado: u32) -> APPBARDATA {
    APPBARDATA { cbSize: std::mem::size_of::<APPBARDATA>() as u32, lParam: LPARAM(estado as isize), ..Default::default() }
}

fn estado_da_barra() -> u32 {
    let mut dados = dados_appbar(0);
    unsafe { SHAppBarMessage(ABM_GETSTATE, &mut dados) as u32 }
}

fn definir_estado_da_barra(estado: u32) {
    let mut dados = dados_appbar(estado);
    unsafe {
        SHAppBarMessage(ABM_SETSTATE, &mut dados);
    }
}

fn esconder_barras() {
    for barra in barras_do_windows() {
        if unsafe { IsWindowVisible(barra) }.as_bool() {
            let _ = unsafe { ShowWindow(barra, SW_HIDE) };
        }
    }
}

fn reposicionar_dock(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(400));
        crate::docks::reposicionar_todos(&app);
    });
}

fn vigiar_barra() {
    std::thread::spawn(|| {
        while OCULTA.load(Ordering::SeqCst) {
            esconder_barras();
            std::thread::sleep(Duration::from_millis(1000));
        }
    });
}

pub fn ocultar(app: &AppHandle) {
    if OCULTA.swap(true, Ordering::SeqCst) {
        return;
    }
    let original = estado_da_barra();
    if let Some(arquivo) = arquivo_recuperacao(app) {
        if !arquivo.exists() {
            let _ = std::fs::write(&arquivo, original.to_string());
        }
    }
    definir_estado_da_barra(original | ABS_AUTOHIDE);
    esconder_barras();
    vigiar_barra();
    reposicionar_dock(app);
}

pub fn restaurar(app: &AppHandle) {
    let arquivo = arquivo_recuperacao(app);
    let guardado = arquivo.as_ref().and_then(|a| std::fs::read_to_string(a).ok()).and_then(|t| t.trim().parse::<u32>().ok());
    let estava_oculta = OCULTA.swap(false, Ordering::SeqCst);
    if guardado.is_none() && !estava_oculta {
        return;
    }
    if let Some(original) = guardado {
        definir_estado_da_barra(original & !ABS_AUTOHIDE);
    }
    for barra in barras_do_windows() {
        let _ = unsafe { ShowWindow(barra, SW_SHOWNA) };
    }
    if let Some(arquivo) = arquivo {
        let _ = std::fs::remove_file(arquivo);
    }
    reposicionar_dock(app);
}

static RESERVADOS: Mutex<Option<HashSet<isize>>> = Mutex::new(None);
const ALTURA_RESERVADA_DOCK: f64 = 62.0;

fn dados_do_dock(dock: &WebviewWindow) -> Option<(APPBARDATA, tauri::Monitor)> {
    let janela = dock.hwnd().ok()?;
    let monitor = dock.current_monitor().ok()??;
    let dados = APPBARDATA {
        cbSize: std::mem::size_of::<APPBARDATA>() as u32,
        hWnd: HWND(janela.0),
        uCallbackMessage: WM_APP + 0x4e,
        uEdge: ABE_BOTTOM,
        ..Default::default()
    };
    Some((dados, monitor))
}

pub fn reservar_espaco_do_dock(dock: &WebviewWindow, reservar: bool) {
    let Some((mut dados, monitor)) = dados_do_dock(dock) else { return };
    let Ok(mut guarda) = RESERVADOS.lock() else { return };
    let reservados = guarda.get_or_insert_with(HashSet::new);
    let chave = dados.hWnd.0 as isize;
    if !reservar {
        if reservados.remove(&chave) {
            unsafe {
                SHAppBarMessage(ABM_REMOVE, &mut dados);
            }
        }
        return;
    }
    if reservados.insert(chave) {
        unsafe {
            SHAppBarMessage(ABM_NEW, &mut dados);
        }
    }
    let altura = (ALTURA_RESERVADA_DOCK * monitor.scale_factor()).round() as i32;
    let posicao = monitor.position();
    let tamanho = monitor.size();
    let base = posicao.y + tamanho.height as i32;
    dados.rc = RECT { left: posicao.x, top: base - altura, right: posicao.x + tamanho.width as i32, bottom: base };
    unsafe {
        SHAppBarMessage(ABM_QUERYPOS, &mut dados);
        dados.rc.top = dados.rc.bottom - altura;
        SHAppBarMessage(ABM_SETPOS, &mut dados);
    }
}
#[tauri::command]
pub fn reservar_dock(window: WebviewWindow, reservar: bool) {
    reservar_espaco_do_dock(&window, reservar);
}

#[tauri::command]
pub fn barra_windows(app: AppHandle, ocultar_barra: bool) {
    if ocultar_barra {
        ocultar(&app);
    } else {
        restaurar(&app);
    }
}
