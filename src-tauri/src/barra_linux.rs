use tauri::{AppHandle, WebviewWindow};

pub fn barra_oculta() -> bool { false }
pub fn restaurar(_app: &AppHandle) {}
pub fn reservar_espaco_do_dock(_dock: &WebviewWindow, _reservar: bool) {}

#[tauri::command]
pub fn reservar_dock(window: WebviewWindow, reservar: bool) {
    reservar_espaco_do_dock(&window, reservar);
}

#[tauri::command]
pub fn barra_windows(_app: AppHandle, _ocultar_barra: bool) {}