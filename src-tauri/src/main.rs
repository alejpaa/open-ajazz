#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod protocol;

use protocol::{AjazzMouseDevice, BatteryInfo, DpiStageConfig, ScreenHardwareInfo};
use tauri::Emitter;

#[tauri::command]
fn sync_clock() -> Result<String, String> {
    let dev = AjazzMouseDevice::open_dock()?;
    AjazzMouseDevice::sync_clock(&dev)?;
    Ok("Reloj sincronizado correctamente en la base TFT".into())
}

#[tauri::command]
fn verify_screen_hardware() -> Result<ScreenHardwareInfo, String> {
    let dev = AjazzMouseDevice::open_dock()?;
    AjazzMouseDevice::verify_screen(&dev)
}

#[tauri::command]
fn erase_flash_memory() -> Result<bool, String> {
    let dev = AjazzMouseDevice::open_dock()?;
    AjazzMouseDevice::erase_flash(&dev)
}

#[tauri::command]
async fn upload_image_to_screen(
    app: tauri::AppHandle,
    image_base64: String,
    frame_delay: Option<u32>,
) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        let dev = AjazzMouseDevice::open_dock()?;
        AjazzMouseDevice::upload_base64_image(&dev, &image_base64, frame_delay, |pct, status| {
            let _ = app.emit(
                "screen-upload-progress",
                serde_json::json!({
                    "progress": pct,
                    "status": status
                }),
            );
        })?;
        Ok("¡Transferencia a pantalla TFT completada con éxito!".into())
    })
    .await
    .map_err(|e| format!("Error de ejecución: {}", e))?
}

#[tauri::command]
fn get_battery_status() -> Result<BatteryInfo, String> {
    let dev = AjazzMouseDevice::open_mouse().or_else(|_| AjazzMouseDevice::open_dock())?;
    AjazzMouseDevice::get_battery(&dev)
}

#[tauri::command]
fn save_dpi_settings(
    active_stage: u8,
    polling_rate: u16,
    debounce_time: u8,
    stages: Vec<DpiStageConfig>,
) -> Result<String, String> {
    let dev = AjazzMouseDevice::open_mouse()?;
    AjazzMouseDevice::set_dpi(&dev, active_stage, &stages)?;
    AjazzMouseDevice::set_sensor_params(&dev, polling_rate, debounce_time)?;
    Ok("Configuración de DPI y sensor guardada en el mouse".into())
}

#[tauri::command]
fn set_lighting_settings(
    effect: String,
    color: String,
    brightness: u8,
    speed: u8,
) -> Result<String, String> {
    let dev = AjazzMouseDevice::open_mouse()?;
    AjazzMouseDevice::set_lighting(&dev, &effect, &color, brightness, speed)?;
    Ok("Iluminación aplicada con éxito".into())
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            sync_clock,
            verify_screen_hardware,
            erase_flash_memory,
            upload_image_to_screen,
            get_battery_status,
            save_dpi_settings,
            set_lighting_settings
        ])
        .run(tauri::generate_context!())
        .expect("Error al iniciar aplicación OpenAJAZZ");
}
