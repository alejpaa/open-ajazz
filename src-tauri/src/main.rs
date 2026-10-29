#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod protocol;

use protocol::{AjazzMouseDevice, BatteryInfo, DpiStageConfig, ScreenHardwareInfo};
use hidapi::HidApi;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::{mpsc, OnceLock};
use tauri::Emitter;

type HidJob = Box<dyn FnOnce(&mut Option<HidApi>) + Send>;

/// Todo el acceso HID ocurre en un único hilo permanente con una sola instancia de `HidApi`.
/// En macOS la enumeración se engancha al run loop del hilo que la invoca: hacerlo desde
/// hilos efímeros (como los de `spawn_blocking`) provoca cierres nativos (EXC_BREAKPOINT).
/// Además, esto serializa las operaciones, que hidapi no admite en paralelo.
fn hid_worker() -> &'static mpsc::Sender<HidJob> {
    static WORKER: OnceLock<mpsc::Sender<HidJob>> = OnceLock::new();
    WORKER.get_or_init(|| {
        let (tx, rx) = mpsc::channel::<HidJob>();
        std::thread::Builder::new()
            .name("hid-worker".into())
            .spawn(move || {
                let mut api: Option<HidApi> = None;
                for job in rx {
                    job(&mut api);
                }
            })
            .expect("no se pudo crear el hilo HID");
        tx
    })
}

async fn run_hid<T, F>(job: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(&mut HidApi) -> Result<T, String> + Send + 'static,
{
    let (reply_tx, reply_rx) = tokio::sync::oneshot::channel();
    let task: HidJob = Box::new(move |slot| {
        if slot.is_none() {
            match HidApi::new() {
                Ok(api) => *slot = Some(api),
                Err(e) => {
                    let _ = reply_tx.send(Err(format!("Error inicializando HID API: {}", e)));
                    return;
                }
            }
        }
        let api = slot.as_mut().expect("HidApi inicializada");
        let result = catch_unwind(AssertUnwindSafe(|| job(api)));
        let result = result.unwrap_or_else(|_| {
            *slot = None;
            Err("Fallo interno del controlador HID.".to_string())
        });
        let _ = reply_tx.send(result);
    });
    hid_worker()
        .send(task)
        .map_err(|_| "El hilo HID no está disponible.".to_string())?;
    reply_rx
        .await
        .map_err(|_| "El hilo HID terminó inesperadamente.".to_string())?
}

#[tauri::command]
async fn sync_clock() -> Result<String, String> {
    run_hid(|api| {
        let dev = AjazzMouseDevice::open_dock(api)?;
        AjazzMouseDevice::sync_clock(&dev)?;
        Ok("Reloj sincronizado correctamente en la base TFT".into())
    })
    .await
}

#[tauri::command]
async fn verify_screen_hardware() -> Result<ScreenHardwareInfo, String> {
    run_hid(|api| {
        let dev = AjazzMouseDevice::open_dock(api)?;
        AjazzMouseDevice::verify_screen(&dev)
    })
    .await
}

#[tauri::command]
async fn erase_flash_memory() -> Result<bool, String> {
    run_hid(|api| {
        let dev = AjazzMouseDevice::open_dock(api)?;
        AjazzMouseDevice::erase_flash(&dev)
    })
    .await
}

#[tauri::command]
async fn upload_image_to_screen(
    app: tauri::AppHandle,
    image_base64: String,
    frame_delay: Option<u32>,
) -> Result<String, String> {
    run_hid(move |api| {
        let dev = AjazzMouseDevice::open_dock(api)?;
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
}

/// Batería de un mouse conectado por Bluetooth, tal como la reporta macOS.
async fn bluetooth_battery() -> Option<BatteryInfo> {
    if !cfg!(target_os = "macos") {
        return None;
    }
    let output = tokio::process::Command::new("pmset")
        .args(["-g", "accps"])
        .output()
        .await
        .ok()?;
    protocol::parse_pmset_battery(&String::from_utf8_lossy(&output.stdout))
}

#[tauri::command]
async fn get_battery_status() -> Result<BatteryInfo, String> {
    if let Some(battery) = bluetooth_battery().await {
        return Ok(battery);
    }
    run_hid(|api| {
        let dev = AjazzMouseDevice::open_mouse(api).or_else(|_| AjazzMouseDevice::open_dock(api))?;
        AjazzMouseDevice::get_battery(&dev)
    })
    .await
}

#[tauri::command]
async fn save_dpi_settings(
    active_stage: u8,
    polling_rate: u16,
    debounce_time: u8,
    stages: Vec<DpiStageConfig>,
) -> Result<String, String> {
    run_hid(move |api| {
        let dev = AjazzMouseDevice::open_mouse(api)?;
        AjazzMouseDevice::set_dpi(&dev, active_stage, &stages)?;
        AjazzMouseDevice::set_sensor_params(&dev, polling_rate, debounce_time)?;
        Ok("Configuración de DPI y sensor guardada en el mouse".into())
    })
    .await
}

#[tauri::command]
async fn set_lighting_settings(
    effect: String,
    color: String,
    brightness: u8,
    speed: u8,
) -> Result<String, String> {
    run_hid(move |api| {
        let dev = AjazzMouseDevice::open_mouse(api)?;
        AjazzMouseDevice::set_lighting(&dev, &effect, &color, brightness, speed)?;
        Ok("Iluminación aplicada con éxito".into())
    })
    .await
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
