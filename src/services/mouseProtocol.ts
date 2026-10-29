import { logger } from './logger';

export const VID_AJAZZ = 0x3151; // 12625
export const PID_AJAZZ_APEX = 0x5007; // 20487

// Opcodes del protocolo USB inverso (extraídos directamente del driver oficial AJAZZ)
export const CMD_SET_REPORT = 0x01;
export const CMD_SET_LEDPARAM = 0x04;
export const CMD_SET_OLEDGIFDATA = 0x24; // 36 - Bloques de animación GIF
export const CMD_SETTFTLCDDATA = 0x25;   // 37 - Bloques de imagen RGB565
export const CMD_SET_OLEDCLOCK = 0x28;   // 40 - Reloj y fecha
export const CMD_MOUSE_SET_OPTIONPARAM0 = 0x53; // 83 - Sensor, debounce, LOD, polling
export const CMD_MOUSE_SET_OPTIONPARAM1 = 0x54; // 84 - Etapas DPI y colores
export const CMD_GET_BATTERY = 0x83;    // 131 - Sin respuesta en el receptor 2.4G 8K (la batería usa 0xF7)
export const CMD_GETTFTLCDDATA = 0xA5;   // 165 - Handshake obligatorio para imagen TFT
export const CMD_SET_FLASHCHIPERASE = 0xAC; // 172 - Borrado de memoria Flash
export const CMD_GETOLED_VERSION = 0xAD; // 173 - Lectura y verificación de versión TFT/OLED

export interface DpiStageConfig {
  id: number;
  value: number;
  color: string;
  enabled: boolean;
}

export interface BatteryInfo {
  level: number;
  is_charging: boolean | null;
  is_connected: boolean;
  source: 'hid' | 'bluetooth';
}

export interface DeviceStatus {
  battery: BatteryInfo | null;
  /** El receptor 2.4G está enchufado (aunque el mouse no responda). */
  receiver_connected: boolean;
  error: string | null;
}

export interface ScreenHardwareInfo {
  verified: boolean;
  oledVersion?: string;
  flashVersion?: string;
  details?: string;
}

class MouseProtocolService {
  private hidDevice: any = null; // Dispositivo activo por defecto
  private screenDevice: any = null; // Interfaz específica de la pantalla (Usage 2 / base magnética)
  private mouseDevice: any = null; // Interfaz específica del sensor/DPI del mouse (Usage 1)
  private screenReportId: number = 0;
  private mouseReportId: number = 0;
  private isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
  private screenInfo: ScreenHardwareInfo = { verified: false };
  private tauriConnected = false;

  /**
   * Conecta con el mouse y la base de carga.
   * Prioriza encontrar la base con pantalla TFT (UsagePage 0xFFFF / Usage 2)
   * y el controlador del mouse (UsagePage 0xFFFF / Usage 1).
   */
  async connect(forcePrompt: boolean = false): Promise<boolean> {
    if (this.isTauri) {
      const info = await this.verifyHardwareConnection();
      if (!this.tauriConnected) {
        throw new Error(info.details || 'No se encontró el dispositivo AJAZZ APEX.');
      }
      return true;
    }

    if (typeof navigator !== 'undefined' && 'hid' in navigator) {
      try {
        logger.info(`Escaneando dispositivos AJAZZ APEX (${VID_AJAZZ.toString(16)}:${PID_AJAZZ_APEX.toString(16)})...`);

        let allDevices: any[] = await (navigator as any).hid.getDevices();
        allDevices = allDevices.filter(
          (d) => d.vendorId === VID_AJAZZ && d.productId === PID_AJAZZ_APEX
        );

        // Buscar el dispositivo de pantalla (Usage 2 / 0xFFFF)
        this.screenDevice = allDevices.find((d) =>
          d.collections?.some((c: any) => (c.usagePage === 65535 || c.usagePage === 0xFFFF) && c.usage === 2)
        );

        // Buscar el dispositivo de mouse (Usage 1 / 0xFFFF)
        this.mouseDevice = allDevices.find((d) =>
          d.collections?.some((c: any) => (c.usagePage === 65535 || c.usagePage === 0xFFFF) && c.usage === 1)
        ) || allDevices.find((d) => d !== this.screenDevice) || allDevices[0];

        // Si falta la pantalla o se fuerza el selector, abrir la ventana del navegador
        if (!this.screenDevice || forcePrompt) {
          logger.info('Solicitando selección de la Base de Carga con Pantalla TFT (Usage: 2)...');
          try {
            const requested = await (navigator as any).hid.requestDevice({
              filters: [
                { vendorId: VID_AJAZZ, productId: PID_AJAZZ_APEX, usagePage: 0xFFFF, usage: 2 },
                { vendorId: VID_AJAZZ, productId: PID_AJAZZ_APEX, usagePage: 0xFFFF },
                { vendorId: VID_AJAZZ, productId: PID_AJAZZ_APEX },
              ],
            });

            if (requested && requested.length > 0) {
              const selected = requested[0];
              const isScreen = selected.collections?.some((c: any) => c.usage === 2);
              if (isScreen) {
                this.screenDevice = selected;
                logger.info('✓ Base con pantalla TFT seleccionada explícitamente.');
              } else {
                this.mouseDevice = selected;
              }
            }
          } catch (e: any) {
            if (!this.screenDevice && !this.mouseDevice) throw e;
          }

          const foundScreen = allDevices.find((d) =>
            d.collections?.some((c: any) => (c.usagePage === 65535 || c.usagePage === 0xFFFF) && c.usage === 2)
          );
          if (foundScreen) {
            this.screenDevice = foundScreen;
          } else if (!this.screenDevice && allDevices.length > 0) {
            this.screenDevice = allDevices[0];
            logger.warn('Advertencia: No se encontró la interfaz Usage: 2 (Base TFT). Si la pantalla no responde, pulsa "Cambiar / Re-vincular USB" y selecciona la otra interfaz.');
          }

          const foundMouse = allDevices.find((d) =>
            d.collections?.some((c: any) => (c.usagePage === 65535 || c.usagePage === 0xFFFF) && c.usage === 1)
          );
          if (foundMouse) {
            this.mouseDevice = foundMouse;
          } else if (!this.mouseDevice && allDevices.length > 0) {
            this.mouseDevice = allDevices.find((d) => d !== this.screenDevice) || allDevices[0];
          }
        }

        // Abrir interfaces
        if (this.screenDevice && !this.screenDevice.opened) {
          await this.screenDevice.open();
          logger.info(`Base con pantalla abierta: ${this.screenDevice.productName}`);
        }
        if (this.mouseDevice && this.mouseDevice !== this.screenDevice && !this.mouseDevice.opened) {
          await this.mouseDevice.open();
          logger.info(`Controlador de mouse abierto: ${this.mouseDevice.productName}`);
        }

        this.hidDevice = this.screenDevice || this.mouseDevice;
        this.detectReportIds();

        // Diagnóstico en consola y logs
        if (this.screenDevice) {
          const cols = this.screenDevice.collections
            ?.map((c: any) => `UsagePage=${c.usagePage}, Usage=${c.usage}`)
            .join(' | ');
          logger.info(`Canal de Pantalla TFT asignado a: ${cols} (ReportID: ${this.screenReportId})`);
        }

        // Verificación de hardware de pantalla
        await this.verifyHardwareConnection();

        return true;
      } catch (err: any) {
        logger.error(`Error al conectar con WebHID: ${err?.message || err}`);
        throw err;
      }
    } else {
      logger.error('Navegador incompatible: navigator.hid no existe.');
      throw new Error('Tu navegador no soporta WebHID. Utiliza Chrome, Edge, Brave o la app de escritorio compilada.');
    }
  }

  /**
   * Envía el opcode 0xAD para consultar la versión de firmware del microcontrolador de la pantalla TFT
   * y validar que el canal de comunicación HID bidireccional responde adecuadamente.
   */
  async verifyHardwareConnection(): Promise<ScreenHardwareInfo> {
    logger.tx('Verificando hardware de pantalla TFT (Opcode 0xAD - FEA_CMD_GETOLED_VERSION)...');
    if (this.isTauri) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const info: any = await invoke('verify_screen_hardware');
        this.tauriConnected = true;
        this.screenInfo = {
          verified: info.verified,
          oledVersion: info.oled_version || undefined,
          flashVersion: info.flash_version || undefined,
          details: info.details,
        };
        if (info.verified) {
          logger.rx(`Chip TFT verificado. OLED: ${this.screenInfo.oledVersion}, Flash: ${this.screenInfo.flashVersion}`);
        } else {
          logger.warn(info.details);
        }
        return this.screenInfo;
      } catch (e: any) {
        this.tauriConnected = false;
        const details = typeof e === 'string' ? e : e?.message || String(e);
        logger.warn(`No se pudo abrir el dispositivo: ${details}`);
        this.screenInfo = { verified: false, details };
        return this.screenInfo;
      }
    }

    try {
      const probeBuf = new Uint8Array(64);
      probeBuf[0] = CMD_GETOLED_VERSION; // 0xAD (173)

      await this.sendFeatureReport(probeBuf, 'screen');
      await new Promise((r) => setTimeout(r, 40));

      const resp = await this.readFeatureReport(CMD_GETOLED_VERSION, 'screen');
      if (resp && resp.length >= 5) {
        // En algunos drivers el reporte recibido comienza directamente con el opcode 0xAD
        let offset = 0;
        if (resp[0] !== CMD_GETOLED_VERSION && resp[1] === CMD_GETOLED_VERSION) {
          offset = 1;
        }

        if (resp[offset] === CMD_GETOLED_VERSION) {
          const oledVer = (resp[offset + 2] << 8) | resp[offset + 1];
          const flashVer = (resp[offset + 4] << 8) | resp[offset + 3];
          this.screenInfo = {
            verified: true,
            oledVersion: `${(oledVer >> 8) & 0xff}.${oledVer & 0xff} (0x${oledVer.toString(16)})`,
            flashVersion: `${(flashVer >> 8) & 0xff}.${flashVer & 0xff} (0x${flashVer.toString(16)})`,
            details: `OLED: ${oledVer}, Flash: ${flashVer}`,
          };
          logger.rx(`✓ Microcontrolador TFT verificado! OLED: ${this.screenInfo.oledVersion}, Flash: ${this.screenInfo.flashVersion}`);
          return this.screenInfo;
        }
      }

      // Si no devolvió 0xAD explícito pero el envío no falló
      this.screenInfo = {
        verified: true,
        oledVersion: 'Detectado',
        flashVersion: 'Detectado',
        details: 'Enlace USB HID activo sin reporte de versión explícito.',
      };
      logger.rx('✓ Enlace USB HID activo con la base del mouse.');
      return this.screenInfo;
    } catch (e: any) {
      logger.warn(`Advertencia al consultar versión OLED: ${e?.message || e}`);
      this.screenInfo = { verified: false, details: e?.message || String(e) };
      return this.screenInfo;
    }
  }

  private detectReportIds() {
    this.screenReportId = this.findVendorReportId(this.screenDevice);
    this.mouseReportId = this.findVendorReportId(this.mouseDevice);
    logger.info(`ReportIDs detectados -> Pantalla: ${this.screenReportId}, Mouse: ${this.mouseReportId}`);
  }

  private findVendorReportId(dev: any): number {
    if (!dev?.collections) return 0;
    for (const col of dev.collections) {
      if (col.usagePage === 65535 || col.usagePage >= 0xff00) {
        if (col.featureReports && col.featureReports.length > 0) {
          const rep = col.featureReports[0];
          if (typeof rep.reportId === 'number') {
            return rep.reportId;
          }
        }
      }
    }
    for (const col of dev.collections) {
      if (col.featureReports && col.featureReports.length > 0) {
        const rep = col.featureReports[0];
        if (typeof rep.reportId === 'number') {
          return rep.reportId;
        }
      }
    }
    return 0;
  }

  /**
   * Lee un reporte Feature HID desde el dispositivo correspondiente (pantalla o mouse)
   */
  async readFeatureReport(expectedReportId?: number, target: 'screen' | 'mouse' = 'screen'): Promise<Uint8Array | null> {
    if (this.isTauri) {
      return null;
    }

    const dev = target === 'screen' ? (this.screenDevice || this.hidDevice) : (this.mouseDevice || this.hidDevice);
    if (!dev || !dev.opened) {
      return null;
    }

    const repId =
      expectedReportId !== undefined
        ? expectedReportId
        : target === 'screen'
        ? this.screenReportId
        : this.mouseReportId;

    try {
      const dataView: DataView = await dev.receiveFeatureReport(repId);
      const bytes = new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength);
      logger.rx(
        `Feature Report recibido [${target}] (ID=${repId}, ${bytes.byteLength} bytes): [${Array.from(
          bytes.subarray(0, Math.min(10, bytes.byteLength))
        )
          .map((b) => '0x' + b.toString(16).padStart(2, '0'))
          .join(', ')}...]`
      );
      return bytes;
    } catch (err: any) {
      if (repId !== 0) {
        try {
          const dataView: DataView = await dev.receiveFeatureReport(0);
          return new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength);
        } catch {
          // continuar
        }
      }
      logger.warn(`No se pudo leer Feature Report [${target}] (ID=${repId}): ${err?.message || err}`);
      return null;
    }
  }

  /** Fuerza una lectura inmediata; el backend además la publica en el evento `device-status`. */
  async getDeviceStatus(): Promise<DeviceStatus> {
    if (!this.isTauri) {
      throw new Error('La lectura de batería requiere la app de escritorio.');
    }
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<DeviceStatus>('get_device_status');
  }

  /** Suscribe a las lecturas periódicas que hace el backend (cada 30 s). */
  async onDeviceStatus(handler: (status: DeviceStatus) => void): Promise<() => void> {
    if (!this.isTauri) return () => {};
    const { listen } = await import('@tauri-apps/api/event');
    return listen<DeviceStatus>('device-status', (event) => handler(event.payload));
  }

  getScreenInfo(): ScreenHardwareInfo {
    return this.screenInfo;
  }

  isConnected(): boolean {
    if (this.isTauri) return this.tauriConnected;
    return !!(this.screenDevice?.opened || this.mouseDevice?.opened || this.hidDevice?.opened);
  }

  getDeviceName(): string {
    if (this.screenDevice) return `${this.screenDevice.productName || 'AJAZZ APEX'} (Base)`;
    if (this.mouseDevice) return `${this.mouseDevice.productName || 'AJAZZ APEX'} (Mouse)`;
    return 'AJAZZ AJ159/AJ179 APEX';
  }

  /**
   * Envía un reporte Feature HID asegurando el tamaño exacto al dispositivo adecuado
   */
  private async sendFeatureReport(payload: Uint8Array, target: 'screen' | 'mouse' = 'screen'): Promise<void> {
    if (this.isTauri) {
      return;
    }

    let dev = target === 'screen' ? (this.screenDevice || this.hidDevice) : (this.mouseDevice || this.hidDevice);
    let targetRepId = target === 'screen' ? this.screenReportId : this.mouseReportId;

    if (!dev || !dev.opened) {
      await this.connect();
      dev = target === 'screen' ? (this.screenDevice || this.hidDevice) : (this.mouseDevice || this.hidDevice);
      if (!dev) throw new Error('Dispositivo no conectado. Haz clic en "Conectar Mouse USB".');
    }

    let buf64: Uint8Array;
    if (payload.byteLength === 64) {
      buf64 = payload;
    } else {
      buf64 = new Uint8Array(64);
      buf64.set(payload.subarray(0, Math.min(64, payload.byteLength)));
    }

    try {
      await dev.sendFeatureReport(targetRepId, buf64);
      return;
    } catch (err1: any) {
      logger.warn(`ReportID ${targetRepId} en [${target}] falló: ${err1?.message || err1}. Probando IDs alternativos...`);

      const altIds = [0, buf64[0], 7, 1].filter((id) => id !== targetRepId);
      for (const altId of altIds) {
        try {
          await dev.sendFeatureReport(altId, buf64);
          if (target === 'screen') this.screenReportId = altId;
          else this.mouseReportId = altId;
          logger.info(`Éxito enviando con Report ID alternativo ${altId}!`);
          return;
        } catch {
          // continuar
        }
      }

      logger.error(`El microcontrolador rechazó el Feature Report en [${target}].`);
      throw new Error(
        `Error USB HID: El microcontrolador rechazó el Feature Report en ${target}. Asegúrate de que la base magnética esté conectada directamente por cable USB.`
      );
    }
  }

  /**
   * Sincroniza la hora y fecha del sistema en la pantalla TFT
   */
  async syncClock(): Promise<void> {
    logger.tx('Iniciando sincronización de reloj (Opcode 0x28)...');
    if (this.isTauri) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('sync_clock');
      logger.rx('Reloj sincronizado vía Tauri IPC.');
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

    await this.sendFeatureReport(buf, 'screen');
    logger.rx(`Reloj sincronizado: ${now.toLocaleTimeString()}`);
  }

  /**
   * Configura las etapas de DPI y sus colores LED asociados
   */
  async setDpi(activeStageId: number, allStages: DpiStageConfig[], pollingRate: number, debounceTime: number): Promise<void> {
    const stages = allStages.filter((s) => s.enabled);
    const activeIndex = stages.findIndex((s) => s.id === activeStageId);
    if (stages.length === 0 || activeIndex < 0) {
      throw new Error('Activa al menos una etapa y selecciona una etapa activa habilitada.');
    }
    const activeStage = activeIndex + 1;
    logger.tx(`Configurando DPI: etapa activa=${activeStage}, polling=${pollingRate}Hz, debounce=${debounceTime}ms`);
    if (this.isTauri) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('save_dpi_settings', {
        activeStage,
        pollingRate,
        debounceTime,
        stages
      });
      return;
    }

    const buf0 = new Uint8Array(64);
    buf0[0] = CMD_MOUSE_SET_OPTIONPARAM0; // 0x53
    buf0[8] = 0;
    buf0[9] = pollingRate === 8000 ? 6 : pollingRate === 4000 ? 5 : pollingRate === 2000 ? 4 : pollingRate === 1000 ? 3 : pollingRate === 500 ? 2 : 1;
    buf0[10] = 1;
    buf0[16] = Math.min(20, debounceTime);
    buf0[50] = 100;
    buf0[51] = 100;
    await this.sendFeatureReport(buf0, 'mouse');

    await new Promise(r => setTimeout(r, 20));

    const buf1 = new Uint8Array(64);
    buf1[0] = CMD_MOUSE_SET_OPTIONPARAM1; // 0x54
    buf1[1] = 0;
    buf1[2] = Math.max(0, activeStage - 1);
    buf1[3] = Math.min(8, stages.length);

    stages.slice(0, 8).forEach((stage, i) => {
      buf1[8 + i * 2] = stage.value & 0xff;
      buf1[9 + i * 2] = (stage.value >> 8) & 0xff;

      const rgb = this.hexToRgb(stage.color);
      buf1[40 + i * 3] = rgb.r;
      buf1[41 + i * 3] = rgb.g;
      buf1[42 + i * 3] = rgb.b;
    });

    await this.sendFeatureReport(buf1, 'mouse');
    logger.rx('Parámetros de DPI y sensor guardados en el dispositivo.');
  }

  /**
   * Configura los efectos de iluminación RGB
   */
  async setLighting(effect: string, color: string, brightness: number, speed: number): Promise<void> {
    logger.tx(`Configurando iluminación: efecto=${effect}, color=${color}, brillo=${brightness}%`);
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

    await this.sendFeatureReport(buf, 'mouse');
    logger.rx('Efecto de iluminación aplicado.');
  }

  /**
   * Procesa y transfiere una imagen a la pantalla TFT de 128x128 píxeles
   * Implementa el handshake 0xA5 (FEA_CMD_GETTFTLCDDATA) con lectura de ACK
   * y la fragmentación en paquetes 0x25 (FEA_CMD_SETTFTLCDDATA) con cabecera estricta.
   */
  async uploadImageToScreen(
    asset: File | HTMLImageElement,
    frameDelay: number = 60,
    onProgress: (percent: number, statusText?: string) => void
  ): Promise<void> {
    if (this.isTauri) {
      logger.tx('Iniciando carga de imagen/GIF mediante el controlador nativo Rust...');
      onProgress(3, 'Leyendo archivo binario original...');

      let base64 = '';
      if (asset instanceof File) {
        base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('Error leyendo archivo seleccionado'));
          reader.readAsDataURL(asset);
        });
      } else {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('No se pudo inicializar canvas 2D');
        if (!asset.complete) {
          await asset.decode().catch(() => {});
        }
        ctx.drawImage(asset, 0, 0, 128, 128);
        base64 = canvas.toDataURL('image/png');
      }

      const { invoke } = await import('@tauri-apps/api/core');
      let unlisten = () => {};
      try {
        const { listen } = await import('@tauri-apps/api/event');
        unlisten = await listen('screen-upload-progress', (event: any) => {
          if (event.payload) {
            onProgress(event.payload.progress, event.payload.status);
          }
        });
      } catch (e) {
        logger.warn(`Suscripción a progreso omitida: ${e}`);
      }

      try {
        await invoke('upload_image_to_screen', {
          imageBase64: base64,
          frameDelay: Math.round(frameDelay),
        });
        onProgress(100, '¡Transferencia completada con éxito!');
        logger.rx('✓ Transferencia exitosa vía driver nativo Rust.');
      } finally {
        unlisten();
      }
      return;
    }

    // --- Modo WebHID (Navegador) ---
    logger.tx('Procesando fotogramas para pantalla TFT...');
    onProgress(5, 'Analizando formato de imagen...');

    const convertToRgb565 = (imgData: Uint8ClampedArray): Uint8Array => {
      const totalBytes = 128 * 128 * 2;
      const rawBytes = new Uint8Array(totalBytes);
      let byteIdx = 0;
      for (let x = 0; x < 128; x++) {
        for (let y = 0; y < 128; y++) {
          const offset = (y * 128 + x) * 4;
          const r = imgData[offset];
          const g = imgData[offset + 1];
          const b = imgData[offset + 2];
          const r5 = (r >> 3) & 0x1f;
          const g6 = (g >> 2) & 0x3f;
          const b5 = (b >> 3) & 0x1f;
          const rgb565 = (r5 << 11) | (g6 << 5) | b5;
          rawBytes[byteIdx++] = (rgb565 >> 8) & 0xff;
          rawBytes[byteIdx++] = rgb565 & 0xff;
        }
      }
      return rawBytes;
    };

    const isGif =
      asset instanceof File &&
      (asset.type === 'image/gif' || asset.name.toLowerCase().endsWith('.gif'));

    const framesData: Uint8Array[] = [];

    if (isGif && typeof (window as any).ImageDecoder !== 'undefined') {
      try {
        const decoder = new (window as any).ImageDecoder({
          data: (asset as File).stream(),
          type: 'image/gif',
        });
        await decoder.tracks.ready;
        const total = Math.min(60, decoder.tracks.selectedTrack.frameCount);
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        for (let i = 0; i < total; i++) {
          const frame = await decoder.decode({ frameIndex: i });
          if (ctx) {
            ctx.clearRect(0, 0, 128, 128);
            ctx.drawImage(frame.image, 0, 0, 128, 128);
            const imgData = ctx.getImageData(0, 0, 128, 128).data;
            framesData.push(convertToRgb565(imgData));
          }
          frame.image.close();
        }
      } catch (e) {
        logger.warn(`Fallo al decodificar GIF con ImageDecoder: ${e}`);
      }
    }

    // Si no se extrajeron fotogramas múltiples (imagen estática o fallback)
    if (framesData.length === 0) {
      const canvas = document.createElement('canvas');
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('No se pudo inicializar canvas 2D');

      if (asset instanceof File) {
        const img = new Image();
        const url = URL.createObjectURL(asset);
        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = url;
        });
        ctx.drawImage(img, 0, 0, 128, 128);
        URL.revokeObjectURL(url);
      } else {
        if (!asset.complete) await asset.decode().catch(() => {});
        ctx.drawImage(asset, 0, 0, 128, 128);
      }
      framesData.push(convertToRgb565(ctx.getImageData(0, 0, 128, 128).data));
    }

    const totalFrames = framesData.length;
    const totalBytesPerFrame = 128 * 128 * 2; // 32768

    onProgress(10, `Iniciando handshake TFT (${totalFrames} fotogramas)...`);

    const applyBit7Checksum = (buf: Uint8Array) => {
      let sum = 0;
      for (let i = 0; i < 7; i++) {
        sum += buf[i];
      }
      buf[7] = 255 - (sum & 255);
    };

    // Handshake obligatorio (0xA5)
    logger.tx(`Enviando handshake TFT (Opcode 0xA5, ${totalFrames} fotogramas)...`);
    const handshake = new Uint8Array(64);
    handshake[0] = CMD_GETTFTLCDDATA; // 0xA5 (165)
    handshake[1] = 0; // currentFrame
    handshake[2] = totalFrames;
    handshake[3] = totalFrames > 1 ? Math.round(frameDelay) : 0;
    handshake[4] = totalBytesPerFrame & 0xff;        // 0x00
    handshake[5] = (totalBytesPerFrame >> 8) & 0xff; // 0x80
    handshake[6] = 0;
    applyBit7Checksum(handshake);
    handshake[8] = 0;   // left
    handshake[9] = 0;   // top
    handshake[10] = 128;// right (128)
    handshake[11] = 128;// bottom (128)
    handshake[16] = (totalBytesPerFrame >> 16) & 0xff;
    handshake[17] = (totalBytesPerFrame >> 24) & 0xff;

    let ackOk = false;
    for (let attempt = 0; attempt < 10; attempt++) {
      await this.sendFeatureReport(handshake, 'screen');
      await new Promise((r) => setTimeout(r, 100));
      const ackResp = await this.readFeatureReport(CMD_GETTFTLCDDATA, 'screen');
      if (ackResp) {
        if (ackResp[1] === 1 || ackResp[0] === 1 || (ackResp[0] === CMD_GETTFTLCDDATA && ackResp[1] === 1)) {
          ackOk = true;
          logger.rx(`✓ ACK recibido del controlador TFT (intento ${attempt + 1}). Listo para transferir.`);
          break;
        }
      }
    }

    if (!ackOk) {
      logger.warn('El microcontrolador no devolvió ACK 1 explícito tras el handshake; procediendo con la transmisión...');
    }

    await new Promise((r) => setTimeout(r, 100));

    // Transmitir cada fotograma
    const chunkSize = 56;
    const totalChunks = Math.ceil(totalBytesPerFrame / chunkSize);
    const overallChunks = totalFrames * totalChunks;

    for (let f = 0; f < totalFrames; f++) {
      const rawBytes = framesData[f];
      for (let y = 0; y < totalChunks; y++) {
        const packet = new Uint8Array(64);
        packet[0] = CMD_SETTFTLCDDATA; // 0x25 (37)
        packet[1] = f;                 // currentFrame
        packet[2] = totalFrames;       // frameNum
        packet[3] = totalFrames > 1 ? Math.round(frameDelay) : 0;
        packet[4] = y & 0xff;
        packet[5] = (y >> 8) & 0xff;

        const chunk = rawBytes.subarray(y * chunkSize, (y + 1) * chunkSize);
        packet[6] = chunk.length;
        applyBit7Checksum(packet);
        packet.set(chunk, 8);

        await this.sendFeatureReport(packet, 'screen');

        const currentOverall = f * totalChunks + y;
        if (currentOverall % 25 === 0 || currentOverall === overallChunks - 1) {
          const pct = Math.min(99, Math.round((currentOverall / overallChunks) * 88) + 11);
          if (totalFrames > 1) {
            onProgress(pct, `Fotograma ${f + 1}/${totalFrames} (paquete ${y + 1}/${totalChunks})...`);
          } else {
            onProgress(pct, `Enviando paquete ${y + 1} de ${totalChunks}...`);
          }
        }

        await new Promise((r) => setTimeout(r, 2));
      }
      await new Promise((r) => setTimeout(r, 20));
    }

    onProgress(100, '¡Transferencia a pantalla TFT finalizada con éxito!');
    logger.rx(`✓ Transferencia exitosa: ${totalFrames} fotogramas desplegados en la pantalla TFT.`);
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
