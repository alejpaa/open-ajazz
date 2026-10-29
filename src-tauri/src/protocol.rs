use base64::prelude::*;
use chrono::{Datelike, Local, Timelike};
use hidapi::{HidApi, HidDevice};
use image::codecs::gif::GifDecoder;
use image::{AnimationDecoder, GenericImageView};
use serde::{Deserialize, Serialize};
use std::io::Cursor;

pub const VID_AJAZZ: u16 = 0x3151; // 12625
pub const PID_AJAZZ_APEX: u16 = 0x5007; // 20487

#[allow(dead_code)]
pub const CMD_SET_REPORT: u8 = 0x01;
#[allow(dead_code)]
pub const CMD_SET_PROFILE: u8 = 0x02;
pub const CMD_SET_LEDPARAM: u8 = 0x04;
#[allow(dead_code)]
pub const CMD_SET_OLEDGIFDATA: u8 = 0x24; // 36
pub const CMD_SETTFTLCDDATA: u8 = 0x25;   // 37
pub const CMD_SET_OLEDCLOCK: u8 = 0x28;   // 40
pub const CMD_MOUSE_SET_OPTIONPARAM0: u8 = 0x53; // 83
pub const CMD_MOUSE_SET_OPTIONPARAM1: u8 = 0x54; // 84
#[allow(dead_code)]
pub const CMD_GET_BATTERY: u8 = 0x83;    // 131 (sin respuesta en el receptor 2.4G 8K)
pub const CMD_GET_STATUS: u8 = 0xF7;     // 247 - estado del mouse: batería en el byte 2
pub const CMD_GETTFTLCDDATA: u8 = 0xA5;   // 165
#[allow(dead_code)]
pub const CMD_SET_FLASHCHIPERASE: u8 = 0xAC; // 172 - borra la memoria de la pantalla: no exponer
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
    /// `None` cuando la fuente no informa el estado de carga.
    pub is_charging: Option<bool>,
    pub is_connected: bool,
    /// Origen de la lectura: "hid" (comando 0xF7) o "bluetooth" (reportada por macOS).
    pub source: String,
}

/// Lectura periódica del dispositivo: alimenta el tray y el estado de conexión del frontend.
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct DeviceStatus {
    pub battery: Option<BatteryInfo>,
    /// El receptor 2.4G está enchufado (aunque el mouse esté apagado o dormido).
    pub receiver_connected: bool,
    pub error: Option<String>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct ScreenHardwareInfo {
    pub verified: bool,
    pub oled_version: String,
    pub flash_version: String,
    pub details: String,
}

pub struct AjazzMouseDevice;

impl AjazzMouseDevice {
    /// Indica si el receptor/base está enchufado, sin abrir ninguna interfaz.
    pub fn is_present(api: &mut HidApi) -> Result<bool, String> {
        api.refresh_devices()
            .map_err(|e| format!("Error enumerando dispositivos HID: {}", e))?;
        Ok(api
            .device_list()
            .any(|info| info.vendor_id() == VID_AJAZZ && info.product_id() == PID_AJAZZ_APEX))
    }

    /// Interfaz propietaria del fabricante (UsagePage 0xFFFF). En macOS/Windows el
    /// `usage_page` es fiable; en backends que no lo informan (0) se usa el número de interfaz.
    fn is_vendor_interface(info: &hidapi::DeviceInfo) -> bool {
        if info.vendor_id() != VID_AJAZZ || info.product_id() != PID_AJAZZ_APEX {
            return false;
        }
        match info.usage_page() {
            0xFFFF => true,
            0 => {
                matches!(info.interface_number(), 1 | 2)
                    || info.path().to_str().map_or(false, |p| {
                        let p = p.to_lowercase();
                        p.contains("mi_01") || p.contains("mi_02")
                    })
            }
            _ => false,
        }
    }

    /// Indica si un descriptor HID declara algún reporte Feature (ítem principal 0xB1).
    fn declares_feature_report(descriptor: &[u8]) -> bool {
        let mut i = 0;
        while i < descriptor.len() {
            let prefix = descriptor[i];
            if prefix == 0xFE {
                // ítem largo: el siguiente byte es su tamaño de datos
                i += 3 + descriptor.get(i + 1).copied().unwrap_or(0) as usize;
                continue;
            }
            if prefix & 0xFC == 0xB0 {
                return true;
            }
            i += 1 + match prefix & 0x03 {
                3 => 4,
                n => n as usize,
            };
        }
        false
    }

    /// Abre la interfaz del fabricante por la que se envían los comandos (reportes Feature).
    /// Se prefiere `preferred_usage`, pero solo se acepta una interfaz que realmente
    /// declare reportes Feature: según el modelo, el canal de comandos puede ser Usage 1 o 2.
    fn open_command_channel(api: &mut HidApi, preferred_usage: u16, what: &str) -> Result<HidDevice, String> {
        api.refresh_devices()
            .map_err(|e| format!("Error enumerando dispositivos HID: {}", e))?;
        let mut candidates: Vec<&hidapi::DeviceInfo> = api
            .device_list()
            .filter(|info| Self::is_vendor_interface(info))
            .collect();
        if candidates.is_empty() {
            return Err(format!("{} AJAZZ APEX (0x3151:0x5007) no encontrado.", what));
        }
        candidates.sort_by_key(|info| info.usage() != preferred_usage);

        let mut last_error = None;
        for info in candidates {
            match info.open_device(api) {
                Ok(dev) => {
                    let mut descriptor = [0u8; 4096];
                    let has_feature = dev
                        .get_report_descriptor(&mut descriptor)
                        .map(|n| Self::declares_feature_report(&descriptor[..n]))
                        .unwrap_or(info.usage() == preferred_usage);
                    if has_feature {
                        return Ok(dev);
                    }
                }
                Err(e) => last_error = Some(e.to_string()),
            }
        }
        Err(match last_error {
            Some(e) => format!(
                "Error abriendo {}: {}. Cierra cualquier otro software que lo use.",
                what, e
            ),
            None => format!("{}: ninguna interfaz acepta comandos.", what),
        })
    }

    /// Abre la Base Magnética con Pantalla TFT
    pub fn open_dock(api: &mut HidApi) -> Result<HidDevice, String> {
        Self::open_command_channel(api, 2, "Base con pantalla TFT")
    }

    /// Abre el Mouse para configuración de DPI, luces y polling
    pub fn open_mouse(api: &mut HidApi) -> Result<HidDevice, String> {
        Self::open_command_channel(api, 1, "Mouse")
    }

    /// Calcula y aplica el checksum BIT7 oficial del firmware AJAZZ:
    /// El byte 7 almacena el complemento a uno de la suma de los primeros 7 bytes (0..6)
    #[inline]
    pub fn apply_bit7_checksum(packet: &mut [u8; 64]) {
        let sum: u32 = packet[0..7].iter().map(|&b| b as u32).sum();
        packet[7] = (255 - (sum & 255)) as u8;
    }

    /// Envía un reporte Feature HID asegurando compatibilidad multiplataforma (Windows/macOS/Linux)
    pub fn send_feature(device: &HidDevice, payload: &[u8]) -> Result<(), String> {
        let mut report = vec![0x00u8; 65];
        let len = payload.len().min(64);
        report[1..=len].copy_from_slice(&payload[..len]);
        // El firmware ignora los comandos sin checksum en el byte 7 (complemento de la suma de 0..6).
        let sum: u32 = report[1..8].iter().map(|&b| b as u32).sum();
        report[8] = (255 - (sum & 255)) as u8;

        match device.send_feature_report(&report) {
            Ok(_) => Ok(()),
            Err(e) => {
                if payload.len() == 64 {
                    device.send_feature_report(payload).map(|_| ()).map_err(|e2| {
                        format!("Fallo de envío HID (ReportID 0: {}, RAW: {})", e, e2)
                    })
                } else {
                    Err(format!("Fallo de envío HID: {}", e))
                }
            }
        }
    }

    /// Lee un reporte Feature HID. El canal de comandos usa reportes sin numerar (ID 0);
    /// `report_id` solo se prueba como alternativa para interfaces numeradas.
    pub fn read_feature(device: &HidDevice, report_id: u8) -> Result<Vec<u8>, String> {
        let mut last_error = String::new();
        for id in [0u8, report_id] {
            let mut report = vec![0x00u8; 65];
            report[0] = id;
            match device.get_feature_report(&mut report) {
                Ok(n) if n > 1 => return Ok(report[1..n].to_vec()),
                Ok(_) => return Ok(report),
                Err(e) => last_error = e.to_string(),
            }
        }
        Err(format!("Error leyendo reporte Feature HID: {}", last_error))
    }

    /// Consulta y verifica en vivo el firmware del microcontrolador TFT (Opcode 0xAD)
    pub fn verify_screen(device: &HidDevice) -> Result<ScreenHardwareInfo, String> {
        let mut probe = [0u8; 64];
        probe[0] = CMD_GETOLED_VERSION; // 0xAD (173)

        Self::send_feature(device, &probe)?;
        std::thread::sleep(std::time::Duration::from_millis(40));

        let resp = Self::read_feature(device, CMD_GETOLED_VERSION)?;
        if resp.len() >= 5 {
            let offset = if resp[0] != CMD_GETOLED_VERSION && resp[1] == CMD_GETOLED_VERSION {
                1
            } else {
                0
            };
            if resp[offset] == CMD_GETOLED_VERSION {
                let oled_ver = ((resp[offset + 2] as u16) << 8) | (resp[offset + 1] as u16);
                let flash_ver = ((resp[offset + 4] as u16) << 8) | (resp[offset + 3] as u16);
                return Ok(ScreenHardwareInfo {
                    verified: true,
                    oled_version: format!("{}.{} (0x{:04X})", (oled_ver >> 8) & 0xff, oled_ver & 0xff, oled_ver),
                    flash_version: format!("{}.{} (0x{:04X})", (flash_ver >> 8) & 0xff, flash_ver & 0xff, flash_ver),
                    details: format!("OLED: {}, Flash: {}", oled_ver, flash_ver),
                });
            }
        }

        Ok(ScreenHardwareInfo {
            verified: false,
            oled_version: String::new(),
            flash_version: String::new(),
            details: "El dispositivo se abrió pero no respondió a la consulta de versión (0xAD).".into(),
        })
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

    /// Carga una imagen o animación GIF y la transfiere fotograma por fotograma a la pantalla TFT 128x128
    pub fn upload_image_data<F>(
        device: &HidDevice,
        image_bytes: &[u8],
        custom_delay_ms: Option<u32>,
        progress_cb: F,
    ) -> Result<(), String>
    where
        F: Fn(u32, &str),
    {
        progress_cb(2, "Analizando y decodificando archivo de imagen/GIF...");

        let mut processed_frames: Vec<Vec<u8>> = Vec::new();
        let frame_delay: u8;

        // Detectar si el archivo es un GIF animado

        if image_bytes.starts_with(b"GIF87a") || image_bytes.starts_with(b"GIF89a") {
            let cursor = Cursor::new(image_bytes);
            let decoder = GifDecoder::new(cursor)
                .map_err(|e| format!("Error abriendo archivo GIF: {}", e))?;
            let raw_frames = decoder
                .into_frames()
                .collect_frames()
                .map_err(|e| format!("Error decodificando fotogramas del GIF: {}", e))?;

            if raw_frames.is_empty() {
                return Err("El archivo GIF no contiene ningún fotograma válido.".into());
            }

            // Determinar delay de reproducción en milisegundos
            if let Some(delay) = custom_delay_ms {
                frame_delay = delay.clamp(10, 255) as u8;
            } else {
                let (num, denom) = raw_frames[0].delay().numer_denom_ms();
                let detected = if denom > 0 { num / denom } else { 60 };
                frame_delay = detected.clamp(10, 255) as u8;
            }

            // Límite de seguridad: máximo 60 fotogramas para proteger la memoria Flash del dock
            let max_frames = 60;
            let orig_count = raw_frames.len();
            let frames_to_process: Vec<_> = if orig_count > max_frames {
                let step = (orig_count as f32 / max_frames as f32).ceil() as usize;
                progress_cb(
                    4,
                    &format!(
                        "Optimizando GIF de {} a {} fotogramas para memoria Flash...",
                        orig_count,
                        orig_count.div_ceil(step)
                    ),
                );
                raw_frames.into_iter().step_by(step).collect()
            } else {
                raw_frames
            };

            for (idx, frame) in frames_to_process.iter().enumerate() {
                let buffer = frame.buffer();
                let resized = image::DynamicImage::ImageRgba8(buffer.clone())
                    .resize_to_fill(128, 128, image::imageops::FilterType::Triangle)
                    .to_rgba8();

                let mut raw_bytes = Vec::with_capacity(128 * 128 * 2);
                for x in 0..128 {
                    for y in 0..128 {
                        let pixel = resized.get_pixel(x, y);
                        let alpha = pixel[3] as u32;
                        let r = ((pixel[0] as u32 * alpha) / 255) as u8;
                        let g = ((pixel[1] as u32 * alpha) / 255) as u8;
                        let b = ((pixel[2] as u32 * alpha) / 255) as u8;

                        let r5 = ((r >> 3) & 0x1f) as u16;
                        let g6 = ((g >> 2) & 0x3f) as u16;
                        let b5 = ((b >> 3) & 0x1f) as u16;
                        let rgb565 = (r5 << 11) | (g6 << 5) | b5;

                        raw_bytes.push(((rgb565 >> 8) & 0xff) as u8);
                        raw_bytes.push((rgb565 & 0xff) as u8);
                    }
                }
                processed_frames.push(raw_bytes);

                if idx % 5 == 0 || idx == frames_to_process.len() - 1 {
                    progress_cb(
                        5 + (((idx as f32) / (frames_to_process.len() as f32)) * 5.0) as u32,
                        &format!("Procesando fotograma {} de {}...", idx + 1, frames_to_process.len()),
                    );
                }
            }
        } else {
            // Imagen estática (PNG, JPG, WebP, etc.)
            let dynamic_img = image::load_from_memory(image_bytes)
                .map_err(|e| format!("Error procesando formato de imagen: {}", e))?;

            let resized = dynamic_img.resize_to_fill(128, 128, image::imageops::FilterType::Lanczos3);
            let mut raw_bytes = Vec::with_capacity(128 * 128 * 2);
            for x in 0..128 {
                for y in 0..128 {
                    let pixel = resized.get_pixel(x, y);
                    let r = pixel[0];
                    let g = pixel[1];
                    let b = pixel[2];

                    let r5 = ((r >> 3) & 0x1f) as u16;
                    let g6 = ((g >> 2) & 0x3f) as u16;
                    let b5 = ((b >> 3) & 0x1f) as u16;
                    let rgb565 = (r5 << 11) | (g6 << 5) | b5;

                    raw_bytes.push(((rgb565 >> 8) & 0xff) as u8);
                    raw_bytes.push((rgb565 & 0xff) as u8);
                }
            }
            processed_frames.push(raw_bytes);
            frame_delay = 0;
        }

        let total_frames = processed_frames.len();
        let frame_bytes_len: usize = 128 * 128 * 2; // 32768 bytes

        progress_cb(
            10,
            &format!("Iniciando enlace TFT con microcontrolador ({} fotogramas)...", total_frames),
        );

        // 1. Handshake inicial obligatorio (0xA5)
        let mut handshake = [0u8; 64];
        handshake[0] = CMD_GETTFTLCDDATA; // 0xA5 (165)
        handshake[1] = 0; // currentFrame (siempre 0 en el handshake)
        handshake[2] = total_frames as u8; // total de fotogramas
        handshake[3] = frame_delay; // delay entre fotogramas en ms
        handshake[4] = (frame_bytes_len & 0xff) as u8;        // 0x00
        handshake[5] = ((frame_bytes_len >> 8) & 0xff) as u8; // 0x80 (32768)
        handshake[6] = 0;
        Self::apply_bit7_checksum(&mut handshake);
        handshake[8] = 0;   // left
        handshake[9] = 0;   // top
        handshake[10] = 128; // right (ancho = 128)
        handshake[11] = 128; // bottom (alto = 128)
        handshake[12] = 0;
        handshake[13] = 0;
        handshake[14] = 0;
        handshake[15] = 0;
        handshake[16] = ((frame_bytes_len >> 16) & 0xff) as u8;
        handshake[17] = ((frame_bytes_len >> 24) & 0xff) as u8;

        // Algunos firmwares no devuelven ACK legible: tras 10 intentos se continúa igualmente.
        for _ in 0..10 {
            let _ = Self::send_feature(device, &handshake);
            std::thread::sleep(std::time::Duration::from_millis(100));

            if let Ok(ack_resp) = Self::read_feature(device, CMD_GETTFTLCDDATA) {
                if ack_resp.len() > 1 && (ack_resp[1] == 1 || ack_resp[0] == 1) {
                    break;
                }
            }
        }

        std::thread::sleep(std::time::Duration::from_millis(100));

        // 2. Transmisión secuencial de cada fotograma
        let chunk_size = 56;
        let chunks_per_frame = frame_bytes_len.div_ceil(chunk_size); // 586 chunks
        let total_all_chunks = total_frames * chunks_per_frame;

        for (frame_idx, frame_data) in processed_frames.iter().enumerate() {
            for c in 0..chunks_per_frame {
                let start = c * chunk_size;
                let end = (start + chunk_size).min(frame_data.len());
                let chunk = &frame_data[start..end];

                let mut packet = [0u8; 64];
                packet[0] = CMD_SETTFTLCDDATA; // 0x25 (37)
                packet[1] = frame_idx as u8;   // currentFrame (0, 1, ..., total_frames - 1)
                packet[2] = total_frames as u8;// total de fotogramas
                packet[3] = frame_delay;       // retardo entre fotogramas en ms
                packet[4] = (c & 0xff) as u8;  // chunk index LE byte bajo
                packet[5] = ((c >> 8) & 0xff) as u8; // chunk index LE byte alto
                packet[6] = chunk.len() as u8;
                Self::apply_bit7_checksum(&mut packet);
                packet[8..8 + chunk.len()].copy_from_slice(chunk);

                Self::send_feature(device, &packet)?;

                let current_chunk_idx = frame_idx * chunks_per_frame + c;
                if current_chunk_idx % 25 == 0 || current_chunk_idx == total_all_chunks - 1 {
                    let pct = 10 + (((current_chunk_idx as f32) / (total_all_chunks as f32)) * 89.0) as u32;
                    if total_frames > 1 {
                        progress_cb(
                            pct,
                            &format!(
                                "Fotograma {}/{} - Enviando paquete {}/{}...",
                                frame_idx + 1,
                                total_frames,
                                c + 1,
                                chunks_per_frame
                            ),
                        );
                    } else {
                        progress_cb(
                            pct,
                            &format!("Transmitiendo paquete {} de {}...", c + 1, chunks_per_frame),
                        );
                    }
                }

                std::thread::sleep(std::time::Duration::from_millis(2));
            }

            // Intervalo breve de 20ms entre fotogramas para estabilidad de escritura en flash
            std::thread::sleep(std::time::Duration::from_millis(20));
        }

        std::thread::sleep(std::time::Duration::from_millis(100));
        if total_frames > 1 {
            progress_cb(100, "¡Animación GIF transferida con éxito a la pantalla TFT!");
        } else {
            progress_cb(100, "¡Imagen transferida con éxito a la pantalla TFT!");
        }

        Ok(())
    }

    /// Carga una imagen o GIF codificado en Base64
    pub fn upload_base64_image<F>(
        device: &HidDevice,
        base64_str: &str,
        custom_delay_ms: Option<u32>,
        progress_cb: F,
    ) -> Result<(), String>
    where
        F: Fn(u32, &str),
    {
        let clean = if let Some(idx) = base64_str.find(',') {
            &base64_str[idx + 1..]
        } else {
            base64_str
        };

        let decoded = BASE64_STANDARD
            .decode(clean.trim())
            .map_err(|e| format!("Error decodificando imagen base64: {}", e))?;

        Self::upload_image_data(device, &decoded, custom_delay_ms, progress_cb)
    }


    /// Consulta el nivel de batería con el comando de estado 0xF7: el porcentaje llega en el
    /// byte 2 de la respuesta. El byte de carga no está descifrado, por eso no se informa.
    pub fn get_battery(device: &HidDevice) -> Result<BatteryInfo, String> {
        let mut buf = [0u8; 64];
        buf[0] = CMD_GET_STATUS;
        Self::send_feature(device, &buf)?;

        std::thread::sleep(std::time::Duration::from_millis(60));
        let resp = Self::read_feature(device, 0)?;

        match resp.get(2) {
            Some(&level) if level <= 100 && resp.iter().any(|&b| b != 0) => Ok(BatteryInfo {
                level,
                is_charging: None,
                is_connected: true,
                source: "hid".into(),
            }),
            _ => Err("El receptor no devolvió una lectura de batería válida. ¿El mouse está activo y en modo 2.4G?".into()),
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
            let dpi_bytes = stage.value.to_le_bytes();
            buf[8 + i * 2] = dpi_bytes[0];
            buf[9 + i * 2] = dpi_bytes[1];

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

/// Extrae la batería de un mouse AJAZZ de la salida de `pmset -g accps` (macOS).
/// Los periféricos Bluetooth aparecen como `-<nombre> (id=N)\t<porcentaje>%; ...`.
pub fn parse_pmset_battery(output: &str) -> Option<BatteryInfo> {
    output.lines().find_map(|line| {
        let line = line.trim().strip_prefix('-')?;
        let (name, rest) = line.split_once(" (id=")?;
        if !is_ajazz_name(name) {
            return None;
        }
        let (_, after_tab) = rest.split_once('\t')?;
        let (percent, status) = after_tab.split_once('%')?;
        let level: u8 = percent.trim().parse().ok()?;
        let status = status.to_lowercase();
        let is_charging = if status.trim_matches(|c: char| c == ';' || c.is_whitespace()).is_empty() {
            None
        } else {
            Some(
                status.contains("charging")
                    && !status.contains("discharging")
                    && !status.contains("not charging"),
            )
        };
        Some(BatteryInfo {
            level: level.min(100),
            is_charging,
            is_connected: true,
            source: "bluetooth".into(),
        })
    })
}

fn is_ajazz_name(name: &str) -> bool {
    let n = name.to_lowercase();
    n.contains("ajazz") || n.starts_with("aj1")
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = "Now drawing from 'AC Power'\n -InternalBattery-0 (id=7602275)\t80%; AC attached; not charging present: true\n -AJ159 APEX (id=25367447)\t24%; \n";

    #[test]
    fn reads_bluetooth_mouse_battery() {
        let b = parse_pmset_battery(SAMPLE).expect("debe encontrar el mouse");
        assert_eq!(b.level, 24);
        assert_eq!(b.is_charging, None);
        assert_eq!(b.source, "bluetooth");
    }

    #[test]
    fn detects_charging_state() {
        let out = " -AJ159 APEX (id=1)\t60%; charging; (no estimate)\n";
        assert_eq!(parse_pmset_battery(out).unwrap().is_charging, Some(true));
        let out = " -AJ159 APEX (id=1)\t60%; discharging; 3:00 remaining\n";
        assert_eq!(parse_pmset_battery(out).unwrap().is_charging, Some(false));
    }

    #[test]
    fn ignores_other_devices() {
        let out = " -InternalBattery-0 (id=1)\t80%; charging\n -Redmi Buds 6 (id=2)\t50%; \n";
        assert!(parse_pmset_battery(out).is_none());
    }
}
