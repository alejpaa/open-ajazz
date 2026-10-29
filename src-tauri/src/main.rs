#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod protocol;

use protocol::{AjazzMouseDevice, BatteryInfo, DeviceStatus, DpiStageConfig, ScreenHardwareInfo};
use hidapi::HidApi;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::{mpsc, OnceLock};
use std::time::Duration;
use tauri::image::Image;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, Manager, WindowEvent};

const TRAY_ID: &str = "battery";
const STATUS_POLL_INTERVAL: Duration = Duration::from_secs(30);

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

async fn read_device_status() -> DeviceStatus {
    if let Some(battery) = bluetooth_battery().await {
        return DeviceStatus {
            battery: Some(battery),
            ..Default::default()
        };
    }
    run_hid(|api| {
        if !AjazzMouseDevice::is_present(api)? {
            return Ok(DeviceStatus {
                error: Some("Receptor 2.4G no conectado.".into()),
                ..Default::default()
            });
        }
        let battery = AjazzMouseDevice::open_mouse(api)
            .or_else(|_| AjazzMouseDevice::open_dock(api))
            .and_then(|dev| AjazzMouseDevice::get_battery(&dev));
        Ok(DeviceStatus {
            receiver_connected: true,
            error: battery.as_ref().err().cloned(),
            battery: battery.ok(),
        })
    })
    .await
    .unwrap_or_else(|e| DeviceStatus {
        error: Some(e),
        ..Default::default()
    })
}

fn tray_tooltip(status: &DeviceStatus) -> String {
    match (&status.battery, status.receiver_connected) {
        (Some(b), _) if b.source == "bluetooth" => format!("AJAZZ APEX: {}% (Bluetooth)", b.level),
        (Some(b), _) => format!("AJAZZ APEX: {}% (2.4G)", b.level),
        (None, true) => "AJAZZ APEX: el mouse no responde".into(),
        (None, false) => "AJAZZ APEX: desconectado".into(),
    }
}

/// Lee el estado, lo refleja en la barra de menús y lo emite al frontend (`device-status`).
async fn publish_device_status(app: &AppHandle) -> DeviceStatus {
    let status = read_device_status().await;
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let title = status.battery.as_ref().map(|b| format!("{}%", b.level));
        let _ = tray.set_title(title.as_deref());
        let _ = tray.set_tooltip(Some(tray_tooltip(&status)));
    }
    let _ = app.emit("device-status", &status);
    status
}

#[tauri::command]
async fn get_device_status(app: AppHandle) -> DeviceStatus {
    publish_device_status(&app).await
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Abrir OpenAJAZZ", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Salir", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;
    TrayIconBuilder::with_id(TRAY_ID)
        .icon(Image::from_bytes(include_bytes!("../icons/tray-template.png"))?)
        .icon_as_template(true)
        .tooltip("AJAZZ APEX")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
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
        .setup(|app| {
            build_tray(app)?;
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                loop {
                    publish_device_status(&handle).await;
                    tokio::time::sleep(STATUS_POLL_INTERVAL).await;
                }
            });
            Ok(())
        })
        // Cerrar la ventana la oculta: la app sigue en la barra de menús hasta "Salir".
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            sync_clock,
            verify_screen_hardware,
            upload_image_to_screen,
            get_device_status,
            save_dpi_settings,
            set_lighting_settings
        ])
        .build(tauri::generate_context!())
        .expect("Error al iniciar aplicación OpenAJAZZ")
        .run(|_app, _event| {
            // En macOS, pulsar el icono del Dock con la ventana oculta la vuelve a mostrar.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { has_visible_windows: false, .. } = _event {
                show_main_window(_app);
            }
        });
}
