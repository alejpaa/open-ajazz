/**
 * OpenAJAZZ - Servicio de Comunicación USB HID
 * 
 * Soporta de manera híbrida:
 * 1. WebHID API (para ejecución instantánea en navegadores como Chrome, Edge, Brave, Opera, etc.)
 * 2. Tauri IPC (para la aplicación de escritorio compilada con Rust en macOS, Linux y Windows)
 */

export const VID_AJAZZ = 0x3151; // 12625
export const PID_AJAZZ_APEX = 0x5007; // 20487

// Opcodes del protocolo USB
export const CMD_SET_REPORT = 0x01;
export const CMD_SET_LEDPARAM = 0x04;
export const CMD_SET_OLEDGIFDATA = 0x24; // 36
export const CMD_GETTFTLCDDATA = 0x25;   // 37
export const CMD_SETTFTLCDDATA = 0x25;   // 37
export const CMD_SET_OLEDCLOCK = 0x28;   // 40
export const CMD_MOUSE_SET_OPTIONPARAM0 = 0x53; // 83
export const CMD_MOUSE_SET_OPTIONPARAM1 = 0x54; // 84
export const CMD_GET_BATTERY = 0x83;    // 131
export const CMD_SET_FLASHCHIPERASE = 0xAC; // 172

export interface DpiStageConfig {
  id: number;
  value: number;
  color: string;
  enabled: boolean;
}

export interface BatteryInfo {
  level: number;
  is_charging: boolean;
  is_connected: boolean;
}

class MouseProtocolService {
  private hidDevice: any = null;
  private isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;

  /**
   * Conecta con el dispositivo USB HID
   */
  async connect(): Promise<boolean> {
    if (this.isTauri) {
      return true;
    }

    if (typeof navigator !== 'undefined' && 'hid' in navigator) {
      try {
        const devices = await (navigator as any).hid.requestDevice({
          filters: [{ vendorId: VID_AJAZZ, productId: PID_AJAZZ_APEX }]
        });

        if (devices && devices.length > 0) {
          // Buscamos la interfaz 1 o la que permita feature reports
          for (const d of devices) {
            if (!d.opened) {
              await d.open();
            }
            this.hidDevice = d;
            console.log('Conectado a dispositivo WebHID:', d.productName, d);
            return true;
          }
        }
      } catch (err) {
        console.error('Error al solicitar dispositivo WebHID:', err);
        throw err;
      }
    } else {
      throw new Error('Tu navegador no soporta WebHID. Utiliza Chrome, Edge, Brave o la app de escritorio compilada.');
    }

    return false;
  }

  isConnected(): boolean {
    if (this.isTauri) return true;
    return !!(this.hidDevice && this.hidDevice.opened);
  }

  getDeviceName(): string {
    if (this.hidDevice) return this.hidDevice.productName || 'AJAZZ AJ159/AJ179 APEX';
    return 'AJAZZ AJ159/AJ179 APEX';
  }

  /**
   * Envía un reporte Feature HID (64 bytes)
   */
  private async sendFeatureReport(payload: Uint8Array): Promise<void> {
    if (this.isTauri) {
      // Invocación a Tauri
      return;
    }

    if (!this.hidDevice || !this.hidDevice.opened) {
      const ok = await this.connect();
      if (!ok || !this.hidDevice) throw new Error('Dispositivo no conectado. Haz clic en "Conectar Mouse USB".');
    }

    try {
      // WebHID: sendFeatureReport(reportId, data)
      // Si el primer byte es 0x00 se usa como reportId, si no reportId=0 y data=payload
      const reportId = 0;
      await this.hidDevice.sendFeatureReport(reportId, payload);
    } catch (e) {
      console.error('Error enviando Feature Report por WebHID:', e);
      throw e;
    }
  }

  /**
   * Sincroniza la hora y fecha del sistema en la pantalla TFT
   */
  async syncClock(): Promise<void> {
    if (this.isTauri) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('sync_clock');
      return;
    }

    const now = new Date();
    const year = now.getFullYear();
    const buf = new Uint8Array(64);
    buf[0] = CMD_SET_OLEDCLOCK; // 0x28
    buf[8] = (year >> 8) & 0xff;
    buf[9] = year & 0xff;
    buf[10] = now.getMonth() + 1;
    buf[11] = now.getDate();
    buf[12] = now.getHours();
    buf[13] = now.getMinutes();
    buf[14] = now.getSeconds();

    await this.sendFeatureReport(buf);
  }

  /**
   * Configura las etapas de DPI y sus colores LED asociados
   */
  async setDpi(activeStage: number, stages: DpiStageConfig[], pollingRate: number, debounceTime: number): Promise<void> {
    if (this.isTauri) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('save_dpi_settings', {
        activeStage,
        pollingRate,
        debounceTime,
        stages: stages.filter(s => s.enabled)
      });
      return;
    }

    // 1. Enviar parámetros de sensor (0x53)
    const buf0 = new Uint8Array(64);
    buf0[0] = CMD_MOUSE_SET_OPTIONPARAM0; // 0x53
    buf0[8] = 0; // Perfil 0
    buf0[9] = pollingRate === 8000 ? 6 : pollingRate === 4000 ? 5 : pollingRate === 2000 ? 4 : pollingRate === 1000 ? 3 : pollingRate === 500 ? 2 : 1;
    buf0[10] = 1;
    buf0[16] = Math.min(20, debounceTime);
    buf0[50] = 100;
    buf0[51] = 100;
    await this.sendFeatureReport(buf0);

    await new Promise(r => setTimeout(r, 20));

    // 2. Enviar valores de DPI y colores (0x54)
    const buf1 = new Uint8Array(64);
    buf1[0] = CMD_MOUSE_SET_OPTIONPARAM1; // 0x54
    buf1[1] = 0;
    buf1[2] = Math.max(0, activeStage - 1);
    const enabledStages = stages.filter(s => s.enabled);
    buf1[3] = Math.min(8, enabledStages.length);

    enabledStages.slice(0, 8).forEach((stage, i) => {
      // DPI como UInt16 Little Endian
      buf1[8 + i * 2] = stage.value & 0xff;
      buf1[9 + i * 2] = (stage.value >> 8) & 0xff;

      // Colores RGB
      const rgb = this.hexToRgb(stage.color);
      buf1[40 + i * 3] = rgb.r;
      buf1[41 + i * 3] = rgb.g;
      buf1[42 + i * 3] = rgb.b;
    });

    await this.sendFeatureReport(buf1);
  }

  /**
   * Configura los efectos de iluminación RGB
   */
  async setLighting(effect: string, color: string, brightness: number, speed: number): Promise<void> {
    if (this.isTauri) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('set_lighting_settings', { effect, color, brightness, speed });
      return;
    }

    const buf = new Uint8Array(64);
    buf[0] = CMD_SET_LEDPARAM; // 0x04
    buf[1] = effect === 'static' ? 1 : effect === 'breath' ? 2 : effect === 'wave' ? 3 : effect === 'neon' ? 4 : 0;
    buf[2] = Math.min(100, brightness);
    buf[3] = Math.min(5, Math.max(1, speed));

    const rgb = this.hexToRgb(color);
    buf[4] = rgb.r;
    buf[5] = rgb.g;
    buf[6] = rgb.b;

    await this.sendFeatureReport(buf);
  }

  /**
   * Procesa y transfiere una imagen a la pantalla TFT de 128x128 píxeles
   */
  async uploadImageToScreen(
    imgElement: HTMLImageElement,
    onProgress: (percent: number) => void
  ): Promise<void> {
    // 1. Redimensionar en un Canvas a 128x128 exactos
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo inicializar canvas 2D');

    ctx.drawImage(imgElement, 0, 0, 128, 128);
    const imgData = ctx.getImageData(0, 0, 128, 128).data;

    // 2. Convertir píxeles RGBA (128*128*4) a RGB565 (128*128*2 = 32,768 bytes)
    const rawBytes = new Uint8Array(128 * 128 * 2);
    let byteIdx = 0;
    for (let i = 0; i < imgData.length; i += 4) {
      const r = imgData[i];
      const g = imgData[i + 1];
      const b = imgData[i + 2];

      const r5 = (r >> 3) & 0x1f;
      const g6 = (g >> 2) & 0x3f;
      const b5 = (b >> 3) & 0x1f;
      const rgb565 = (r5 << 11) | (g6 << 5) | b5;

      rawBytes[byteIdx++] = rgb565 & 0xff;
      rawBytes[byteIdx++] = (rgb565 >> 8) & 0xff;
    }

    onProgress(5);

    // 3. Handshake inicial (0x25 / FEA_CMD_GETTFTLCDDATA)
    const handshake = new Uint8Array(64);
    handshake[0] = CMD_GETTFTLCDDATA; // 0x25
    handshake[1] = 0; // currentFrame
    handshake[2] = 1; // totalFrames
    handshake[3] = 60; // delay
    const totalBytes = 128 * 128 * 2; // 32768
    handshake[4] = totalBytes & 0xff;
    handshake[5] = (totalBytes >> 8) & 0xff;
    handshake[6] = 0;
    handshake[7] = 0;
    handshake[8] = 0;   // left
    handshake[9] = 0;   // top
    handshake[10] = 127; // right
    handshake[11] = 127; // bottom

    await this.sendFeatureReport(handshake);
    await new Promise(r => setTimeout(r, 50));

    // 4. Fragmentación en paquetes de 56 bytes útiles (total 586 paquetes)
    const totalChunks = Math.ceil(totalBytes / 56);
    for (let y = 0; y < totalChunks; y++) {
      const packet = new Uint8Array(64);
      packet[0] = CMD_SETTFTLCDDATA; // 0x25 (o 0x24)
      packet[1] = 0; // estático
      packet[2] = y & 0xff;
      packet[3] = 0; // frame 0
      packet[4] = 60;
      packet[5] = 1; // layer 1
      packet[6] = y & 0xff;
      packet[7] = (y >> 8) & 0xff;

      const chunk = rawBytes.subarray(y * 56, (y + 1) * 56);
      packet.set(chunk, 8);

      await this.sendFeatureReport(packet);

      // Reportar progreso y pausa de 2ms para no saturar el buffer USB del microcontrolador
      if (y % 15 === 0 || y === totalChunks - 1) {
        onProgress(Math.min(99, Math.round((y / totalChunks) * 95) + 5));
        await new Promise(r => setTimeout(r, 4));
      } else {
        await new Promise(r => setTimeout(r, 2));
      }
    }

    onProgress(100);
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    const clean = hex.replace('#', '');
    if (clean.length === 6) {
      return {
        r: parseInt(clean.substring(0, 2), 16) || 255,
        g: parseInt(clean.substring(2, 4), 16) || 255,
        b: parseInt(clean.substring(4, 6), 16) || 255,
      };
    }
    return { r: 255, g: 255, b: 255 };
  }
}

export const mouseService = new MouseProtocolService();
