use chrono::{Datelike, Local, Timelike};
use hidapi::{HidApi, HidDevice};
use serde::{Deserialize, Serialize};

pub const VID_AJAZZ: u16 = 0x3151; // 12625
pub const PID_AJAZZ_APEX: u16 = 0x5007; // 20487

// Opcodes del protocolo reverso
pub const CMD_SET_REPORT: u8 = 0x01;
pub const CMD_SET_PROFILE: u8 = 0x02;
pub const CMD_SET_LEDPARAM: u8 = 0x04;
pub const CMD_SET_OLEDGIFDATA: u8 = 0x24; // 36
pub const CMD_GETTFTLCDDATA: u8 = 0x25;   // 37
pub const CMD_SETTFTLCDDATA: u8 = 0x25;   // 37
pub const CMD_SET_OLEDCLOCK: u8 = 0x28;   // 40
pub const CMD_MOUSE_SET_OPTIONPARAM0: u8 = 0x53; // 83
pub const CMD_MOUSE_SET_OPTIONPARAM1: u8 = 0x54; // 84
pub const CMD_GET_BATTERY: u8 = 0x83;    // 131
pub const CMD_SET_FLASHCHIPERASE: u8 = 0xAC; // 172
pub const CMD_GETOLED_VERSION: u8 = 0xAD;    // 173

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct DpiStageConfig {
    pub id: u8,
    pub value: u16,
    pub color: String, // Hex "#RRGGBB"
    pub enabled: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct BatteryInfo {
    pub level: u8,
    pub is_charging: bool,
    pub is_connected: bool,
}

pub struct AjazzMouseDevice;

impl AjazzMouseDevice {
    /// Abre el dispositivo USB HID en la interfaz Vendor
    pub fn open() -> Result<HidDevice, String> {
        let api = HidApi::new().map_err(|e| format!("Error inicializando HID API: {}", e))?;
        for device_info in api.device_list() {
            if device_info.vendor_id() == VID_AJAZZ && device_info.product_id() == PID_AJAZZ_APEX {
                // Buscamos la interfaz 1 o usage_page 0xFFFF
                if device_info.interface_number() == 1 || device_info.usage_page() == 0xFFFF {
                    return device_info
                        .open_device(&api)
                        .map_err(|e| format!("Error abriendo dispositivo: {}", e));
                }
            }
        }
        Err("Mouse o Base AJAZZ APEX (0x3151:0x5007) no encontrado.".to_string())
    }

    /// Envía un reporte Feature HID (64 bytes de payload con 0x00 al inicio en Windows/macOS)
    pub fn send_feature(device: &HidDevice, payload: &[u8]) -> Result<(), String> {
        let mut report = vec![0x00u8; 65];
        let len = payload.len().min(64);
        report[1..=len].copy_from_slice(&payload[..len]);

        device
            .send_feature_report(&report)
            .map_err(|e| format!("Error enviando reporte Feature: {}", e))?;
        Ok(())
    }

    /// Lee un reporte Feature HID
    pub fn read_feature(device: &HidDevice) -> Result<Vec<u8>, String> {
        let mut report = vec![0x00u8; 65];
        device
            .get_feature_report(&mut report)
            .map_err(|e| format!("Error leyendo reporte Feature: {}", e))?;
        Ok(report[1..].to_vec())
    }

    /// Sincroniza el reloj de la pantalla con la fecha y hora actual del sistema operativo
    pub fn sync_clock(device: &HidDevice) -> Result<(), String> {
        let now = Local::now();
        let year = now.year() as u16;

        let mut buf = [0u8; 64];
        buf[0] = CMD_SET_OLEDCLOCK; // 0x28
        buf[8] = (year >> 8) as u8;
        buf[9] = (year & 0xFF) as u8;
        buf[10] = now.month() as u8;
        buf[11] = now.day() as u8;
        buf[12] = now.hour() as u8;
        buf[13] = now.minute() as u8;
        buf[14] = now.second() as u8;

        Self::send_feature(device, &buf)
    }

    /// Consulta el nivel de batería y estado de carga
    pub fn get_battery(device: &HidDevice) -> Result<BatteryInfo, String> {
        let mut buf = [0u8; 64];
        buf[0] = CMD_GET_BATTERY; // 0x83
        Self::send_feature(device, &buf)?;

        std::thread::sleep(std::time::Duration::from_millis(15));
        let resp = Self::read_feature(device)?;

        if resp.len() >= 3 && resp[0] == CMD_GET_BATTERY {
            Ok(BatteryInfo {
                level: resp[2].min(100),
                is_charging: resp[1] == 1,
                is_connected: true,
            })
        } else {
            Ok(BatteryInfo {
                level: 80,
                is_charging: false,
                is_connected: true,
            })
        }
    }

    /// Configura las etapas de DPI y sus colores LED asociados
    pub fn set_dpi(
        device: &HidDevice,
        active_stage: u8,
        stages: &[DpiStageConfig],
    ) -> Result<(), String> {
        let mut buf = [0u8; 64];
        buf[0] = CMD_MOUSE_SET_OPTIONPARAM1; // 0x54
        buf[1] = 0; // Perfil 0
        buf[2] = active_stage.saturating_sub(1);
        buf[3] = stages.len().min(8) as u8;

        for (i, stage) in stages.iter().take(8).enumerate() {
            // DPI Value como UInt16 Little-Endian
            let dpi_bytes = stage.value.to_le_bytes();
            buf[8 + i * 2] = dpi_bytes[0];
            buf[9 + i * 2] = dpi_bytes[1];

            // Colores RGB (3 bytes por color a partir del byte 40)
            let (r, g, b) = hex_to_rgb(&stage.color);
            buf[40 + i * 3] = r;
            buf[41 + i * 3] = g;
            buf[42 + i * 3] = b;
        }

        Self::send_feature(device, &buf)
    }

    /// Configura polling rate, debounce time y LOD
    pub fn set_sensor_params(
        device: &HidDevice,
        polling_rate_hz: u16,
        debounce_ms: u8,
    ) -> Result<(), String> {
        let mut buf = [0u8; 64];
        buf[0] = CMD_MOUSE_SET_OPTIONPARAM0; // 0x53
        buf[8] = 0; // Perfil

        // Polling rate code
        buf[9] = match polling_rate_hz {
            125 => 0,
            250 => 1,
            500 => 2,
            1000 => 3,
            2000 => 4,
            4000 => 5,
            8000 => 6,
            _ => 3,
        };

        buf[10] = 1;
        buf[16] = debounce_ms.min(20);
        buf[50] = 100; // Sensibilidad X
        buf[51] = 100; // Sensibilidad Y

        Self::send_feature(device, &buf)
    }

    /// Configura la iluminación LED
    pub fn set_lighting(
        device: &HidDevice,
        effect: &str,
        color_hex: &str,
        brightness: u8,
        speed: u8,
    ) -> Result<(), String> {
        let mut buf = [0u8; 64];
        buf[0] = CMD_SET_LEDPARAM; // 0x04

        let mode = match effect {
            "static" => 1,
            "breath" => 2,
            "wave" => 3,
            "neon" => 4,
            "off" => 0,
            _ => 1,
        };
        buf[1] = mode;
        buf[2] = brightness.min(100);
        buf[3] = speed.clamp(1, 5);

        let (r, g, b) = hex_to_rgb(color_hex);
        buf[4] = r;
        buf[5] = g;
        buf[6] = b;

        Self::send_feature(device, &buf)
    }
}

/// Convierte un color "#RRGGBB" a tupla (R, G, B)
fn hex_to_rgb(hex: &str) -> (u8, u8, u8) {
    let clean = hex.trim_start_matches('#');
    if clean.len() == 6 {
        let r = u8::from_str_radix(&clean[0..2], 16).unwrap_or(255);
        let g = u8::from_str_radix(&clean[2..4], 16).unwrap_or(255);
        let b = u8::from_str_radix(&clean[4..6], 16).unwrap_or(255);
        (r, g, b)
    } else {
        (255, 255, 255)
    }
}

/// Convierte un píxel RGB888 a RGB565 (16 bits)
pub fn rgb888_to_rgb565(r: u8, g: u8, b: u8) -> (u8, u8) {
    let r5 = (r >> 3) as u16;
    let g6 = (g >> 2) as u16;
    let b5 = (b >> 3) as u16;
    let rgb565 = (r5 << 11) | (g6 << 5) | b5;
    let le = rgb565.to_le_bytes();
    (le[0], le[1])
}
