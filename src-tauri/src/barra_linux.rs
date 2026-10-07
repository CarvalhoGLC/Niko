use tauri::AppHandle;

pub fn restaurar(_app: &AppHandle) {}
pub fn reservar_espaco_do_dock(_app: &AppHandle, _reservar: bool) {}

#[tauri::command]
pub fn reservar_dock(app: AppHandle, reservar: bool) {
    reservar_espaco_do_dock(&app, reservar);
}

#[tauri::command]
pub fn barra_windows(_app: AppHandle, _ocultar_barra: bool) {}