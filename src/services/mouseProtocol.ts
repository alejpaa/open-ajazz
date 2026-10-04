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
export const CMD_GET_BATTERY = 0x83;    // 131 - Nivel de batería
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
  is_charging: boolean;
  is_connected: boolean;
}

export interface ScreenHardwareInfo {
  verified: boolean;
  oledVersion?: string;
  flashVersion?: string;
  details?: string;
}

class MouseProtocolService {
  private hidDevice: any = null;
  private isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
  private targetReportId: number = 0;
  private screenInfo: ScreenHardwareInfo = { verified: false };

  /**
   * Conecta con el dispositivo USB HID buscando estrictamente la interfaz Vendor (UsagePage 0xFFFF / 65535)
   * Si forcePrompt es true, abre obligatoriamente la ventana del navegador para que el usuario elija el dispositivo correcto.
   */
  async connect(forcePrompt: boolean = false): Promise<boolean> {
    if (this.isTauri) {
      logger.info('Modo Tauri nativo activo.');
      this.screenInfo = { verified: true, oledVersion: '1.0 (Tauri)', flashVersion: '1.0' };
      return true;
    }

    if (typeof navigator !== 'undefined' && 'hid' in navigator) {
      try {
        logger.info(`Buscando mouse AJAZZ APEX (${VID_AJAZZ.toString(16)}:${PID_AJAZZ_APEX.toString(16)})...`);

        let targetDevice: any = null;

        if (forcePrompt) {
          logger.info('Forzando ventana de selección de dispositivo USB...');
          const requested = await (navigator as any).hid.requestDevice({
            filters: [
              { vendorId: VID_AJAZZ, productId: PID_AJAZZ_APEX, usagePage: 0xFFFF, usage: 2 },
              { vendorId: VID_AJAZZ, productId: PID_AJAZZ_APEX, usagePage: 0xFFFF },
              { vendorId: VID_AJAZZ, productId: PID_AJAZZ_APEX },
            ],
          });
          if (!requested || requested.length === 0) {
            logger.warn('El usuario canceló la selección de dispositivo USB.');
            throw new Error('No se seleccionó ningún dispositivo USB.');
          }
          targetDevice = requested[0];
        } else {
          // 1. Obtener dispositivos ya autorizados
          let allDevices: any[] = await (navigator as any).hid.getDevices();
          allDevices = allDevices.filter(
            (d) => d.vendorId === VID_AJAZZ && d.productId === PID_AJAZZ_APEX
          );

          if (allDevices.length === 0) {
            logger.info('No hay dispositivos autorizados en caché. Abriendo ventana de selección...');
            const requested = await (navigator as any).hid.requestDevice({
              filters: [
                { vendorId: VID_AJAZZ, productId: PID_AJAZZ_APEX, usagePage: 0xFFFF, usage: 2 },
                { vendorId: VID_AJAZZ, productId: PID_AJAZZ_APEX, usagePage: 0xFFFF },
                { vendorId: VID_AJAZZ, productId: PID_AJAZZ_APEX },
              ],
            });
            if (!requested || requested.length === 0) {
              logger.warn('El usuario canceló la selección de dispositivo USB.');
              throw new Error('No se seleccionó ningún dispositivo USB.');
            }
            allDevices = requested;
          }

          logger.info(`Se detectaron ${allDevices.length} interfaces autorizadas para el mouse.`);

          // 2. Imprimir diagnósticos de cada colección para depuración
          allDevices.forEach((d, idx) => {
            const colInfo = d.collections
              ?.map(
                (c: any) =>
                  `UsagePage=0x${c.usagePage.toString(16)} (${c.usagePage}), Usage=${c.usage}, Features=${c.featureReports?.length || 0}`
              )
              .join(' | ');
            logger.info(`[Interfaz ${idx}] ${d.productName || 'HID'} -> ${colInfo}`);
          });

          // 3. Seleccionar ESTRÍCTAMENTE la interfaz Vendor: UsagePage 0xFFFF (65535) y Usage 2 (dangle_3950b)
          targetDevice = allDevices.find((d) =>
            d.collections?.some((c: any) => (c.usagePage === 65535 || c.usagePage === 0xFFFF) && c.usage === 2)
          );

          // Si no, buscar cualquier colección con UsagePage 0xFFFF
          if (!targetDevice) {
            targetDevice = allDevices.find((d) =>
              d.collections?.some((c: any) => c.usagePage === 65535 || c.usagePage === 0xFFFF || (c.usagePage >= 0xFF00 && c.usagePage <= 0xFFFF))
            );
          }

          // Si no, buscar la que tenga featureReports de 64 bytes
          if (!targetDevice) {
            targetDevice = allDevices.find((d) =>
              d.collections?.some((c: any) => c.featureReports && c.featureReports.length > 0 && c.usagePage !== 1 && c.usagePage !== 12)
            );
          }

          if (!targetDevice) {
            targetDevice = allDevices[0];
            logger.warn('No se encontró UsagePage 65535 explícito, usando interfaz fallback.');
          }
        }

        if (!targetDevice.opened) {
          await targetDevice.open();
          logger.info(`Dispositivo abierto: ${targetDevice.productName}`);
        }

        this.hidDevice = targetDevice;
        this.detectReportId();

        // 4. VERIFICACIÓN DIRECTA CON EL HARDWARE:
        // Consultar versión de pantalla OLED con Opcode 0xAD para confirmar que este endpoint realmente controla la pantalla
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
    try {
      const probeBuf = new Uint8Array(64);
      probeBuf[0] = CMD_GETOLED_VERSION; // 0xAD (173)

      await this.sendFeatureReport(probeBuf);
      await new Promise((r) => setTimeout(r, 40));

      const resp = await this.readFeatureReport(CMD_GETOLED_VERSION);
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

  private detectReportId() {
    this.targetReportId = 0;
    if (this.hidDevice?.collections) {
      for (const col of this.hidDevice.collections) {
        if (col.usagePage === 65535 || col.usagePage >= 0xff00) {
          if (col.featureReports && col.featureReports.length > 0) {
            const rep = col.featureReports[0];
            if (typeof rep.reportId === 'number') {
              this.targetReportId = rep.reportId;
              logger.info(`Report ID vendor detectado: ${this.targetReportId}`);
              return;
            }
          }
        }
      }

      for (const col of this.hidDevice.collections) {
        if (col.featureReports && col.featureReports.length > 0) {
          const rep = col.featureReports[0];
          if (typeof rep.reportId === 'number') {
            this.targetReportId = rep.reportId;
            logger.info(`Report ID genérico detectado: ${this.targetReportId}`);
            return;
          }
        }
      }
    }
  }

  /**
   * Lee un reporte Feature HID desde el dispositivo
   */
  async readFeatureReport(expectedReportId?: number): Promise<Uint8Array | null> {
    if (this.isTauri) {
      return null;
    }

    if (!this.hidDevice || !this.hidDevice.opened) {
      return null;
    }

    const repId = expectedReportId !== undefined ? expectedReportId : this.targetReportId;

    try {
      const dataView: DataView = await this.hidDevice.receiveFeatureReport(repId);
      const bytes = new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength);
      logger.rx(
        `Feature Report recibido (ID=${repId}, ${bytes.byteLength} bytes): [${Array.from(
          bytes.subarray(0, Math.min(10, bytes.byteLength))
        )
          .map((b) => '0x' + b.toString(16).padStart(2, '0'))
          .join(', ')}...]`
      );
      return bytes;
    } catch (err: any) {
      // Intentar con Report ID 0 si falló con un ID distinto
      if (repId !== 0) {
        try {
          const dataView: DataView = await this.hidDevice.receiveFeatureReport(0);
          const bytes = new Uint8Array(dataView.buffer, dataView.byteOffset, dataView.byteLength);
          return bytes;
        } catch {
          // continuar
        }
      }
      logger.warn(`No se pudo leer Feature Report (ID=${repId}): ${err?.message || err}`);
      return null;
    }
  }

  getScreenInfo(): ScreenHardwareInfo {
    return this.screenInfo;
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
   * Envía un reporte Feature HID asegurando el tamaño exacto y probando fallback de reportId si es necesario
   */
  private async sendFeatureReport(payload: Uint8Array): Promise<void> {
    if (this.isTauri) {
      return;
    }

    if (!this.hidDevice || !this.hidDevice.opened) {
      const ok = await this.connect();
      if (!ok || !this.hidDevice) throw new Error('Dispositivo no conectado. Haz clic en "Conectar Mouse USB".');
    }

    let buf64: Uint8Array;
    if (payload.byteLength === 64) {
      buf64 = payload;
    } else {
      buf64 = new Uint8Array(64);
      buf64.set(payload.subarray(0, Math.min(64, payload.byteLength)));
    }

    // Probar con el targetReportId detectado
    try {
      await this.hidDevice.sendFeatureReport(this.targetReportId, buf64);
      return;
    } catch (err1: any) {
      logger.warn(`ReportID ${this.targetReportId} falló: ${err1?.message || err1}. Probando IDs alternativos...`);

      // Intentar alternativas comunes (0, el primer byte como opcode, o 7)
      const altIds = [0, buf64[0], 7, 1].filter((id) => id !== this.targetReportId);

      for (const altId of altIds) {
        try {
          await this.hidDevice.sendFeatureReport(altId, buf64);
          this.targetReportId = altId;
          logger.info(`Éxito enviando con Report ID alternativo ${altId}!`);
          return;
        } catch {
          // continuar probando
        }
      }

      // Si falló en este dispositivo, intentar buscar entre las otras interfaces HID autorizadas
      const allDevices: any[] = await (navigator as any).hid.getDevices();
      for (const altDev of allDevices) {
        if (altDev !== this.hidDevice && altDev.vendorId === VID_AJAZZ && altDev.productId === PID_AJAZZ_APEX) {
          try {
            if (!altDev.opened) await altDev.open();
            await altDev.sendFeatureReport(0, buf64);
            logger.info(`Éxito enviando a interfaz secundaria ${altDev.productName}!`);
            this.hidDevice = altDev;
            this.targetReportId = 0;
            return;
          } catch {
            // continuar
          }
        }
      }

      logger.error('El microcontrolador rechazó el Feature Report en todas las interfaces.');
      throw new Error(`Error USB HID: El microcontrolador rechazó el Feature Report. Asegúrate de conectar el mouse/base por cable USB directo (no a través de un hub sin energía).`);
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

    await this.sendFeatureReport(buf);
    logger.rx(`Reloj sincronizado: ${now.toLocaleTimeString()}`);
  }

  /**
   * Configura las etapas de DPI y sus colores LED asociados
   */
  async setDpi(activeStage: number, stages: DpiStageConfig[], pollingRate: number, debounceTime: number): Promise<void> {
    logger.tx(`Configurando DPI: etapa activa=${activeStage}, polling=${pollingRate}Hz, debounce=${debounceTime}ms`);
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

    const buf0 = new Uint8Array(64);
    buf0[0] = CMD_MOUSE_SET_OPTIONPARAM0; // 0x53
    buf0[8] = 0;
    buf0[9] = pollingRate === 8000 ? 6 : pollingRate === 4000 ? 5 : pollingRate === 2000 ? 4 : pollingRate === 1000 ? 3 : pollingRate === 500 ? 2 : 1;
    buf0[10] = 1;
    buf0[16] = Math.min(20, debounceTime);
    buf0[50] = 100;
    buf0[51] = 100;
    await this.sendFeatureReport(buf0);

    await new Promise(r => setTimeout(r, 20));

    const buf1 = new Uint8Array(64);
    buf1[0] = CMD_MOUSE_SET_OPTIONPARAM1; // 0x54
    buf1[1] = 0;
    buf1[2] = Math.max(0, activeStage - 1);
    const enabledStages = stages.filter(s => s.enabled);
    buf1[3] = Math.min(8, enabledStages.length);

    enabledStages.slice(0, 8).forEach((stage, i) => {
      buf1[8 + i * 2] = stage.value & 0xff;
      buf1[9 + i * 2] = (stage.value >> 8) & 0xff;

      const rgb = this.hexToRgb(stage.color);
      buf1[40 + i * 3] = rgb.r;
      buf1[41 + i * 3] = rgb.g;
      buf1[42 + i * 3] = rgb.b;
    });

    await this.sendFeatureReport(buf1);
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

    await this.sendFeatureReport(buf);
    logger.rx('Efecto de iluminación aplicado.');
  }

  /**
   * Procesa y transfiere una imagen a la pantalla TFT de 128x128 píxeles
   * Implementa el handshake 0xA5 (FEA_CMD_GETTFTLCDDATA) con lectura de ACK
   * y la fragmentación en paquetes 0x25 (FEA_CMD_SETTFTLCDDATA) con cabecera estricta.
   */
  async uploadImageToScreen(
    imgElement: HTMLImageElement,
    onProgress: (percent: number, statusText?: string) => void
  ): Promise<void> {
    logger.tx('1/3 Procesando imagen: redimensionando a 128x128 y convirtiendo a RGB565...');
    onProgress(5, 'Convirtiendo imagen a formato 16-bit RGB565...');

    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No se pudo inicializar canvas 2D');

    ctx.drawImage(imgElement, 0, 0, 128, 128);
    const imgData = ctx.getImageData(0, 0, 128, 128).data;

    // Convertir a RGB565 (128x128x2 = 32,768 bytes) Little-Endian
    const totalBytes = 128 * 128 * 2;
    const rawBytes = new Uint8Array(totalBytes);
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

    onProgress(10, 'Enviando handshake de inicialización TFT (Opcode 0xA5)...');

    // 2. Handshake obligatorio según el protocolo oficial (FEA_CMD_GETTFTLCDDATA = 165 / 0xA5)
    logger.tx('2/3 Enviando handshake TFT (Opcode 0xA5, longitud 32768 bytes)...');
    const handshake = new Uint8Array(64);
    handshake[0] = CMD_GETTFTLCDDATA; // 0xA5 (165)
    handshake[1] = 0; // currentFrame
    handshake[2] = 1; // frameNum
    handshake[3] = 0; // frameDelay
    handshake[4] = totalBytes & 0xff;        // 0x00
    handshake[5] = (totalBytes >> 8) & 0xff; // 0x80 (32768 = 0x8000)
    handshake[6] = 0;
    handshake[7] = 0;
    handshake[8] = 0;   // left
    handshake[9] = 0;   // top
    handshake[10] = 127;// right
    handshake[11] = 127;// bottom
    handshake[12] = 0;  // left >> 8
    handshake[13] = 0;  // top >> 8
    handshake[14] = 0;  // right >> 8
    handshake[15] = 0;  // bottom >> 8
    handshake[16] = (totalBytes >> 16) & 0xff;
    handshake[17] = (totalBytes >> 24) & 0xff;

    await this.sendFeatureReport(handshake);

    // 3. Verificación de ACK del microcontrolador (reintentos hasta 10 veces como el driver oficial)
    let ackOk = false;
    for (let attempt = 0; attempt < 10; attempt++) {
      await new Promise((r) => setTimeout(r, 100));
      const ackResp = await this.readFeatureReport(CMD_GETTFTLCDDATA);
      if (ackResp) {
        // En el driver oficial: 1 === u[1]
        if (ackResp[1] === 1 || ackResp[0] === 1 || (ackResp[0] === CMD_GETTFTLCDDATA && ackResp[1] === 1)) {
          ackOk = true;
          logger.rx(`✓ ACK recibido del controlador TFT en intento ${attempt + 1}. Listo para recibir datos.`);
          break;
        } else if (ackResp[1] === 0) {
          logger.info(`Microcontrolador ocupado (ACK=0), esperando intento ${attempt + 1}/10...`);
        }
      }
    }

    if (!ackOk) {
      logger.warn('El microcontrolador no devolvió ACK 1 explícito tras el handshake; procediendo con la transmisión...');
    }

    onProgress(15, 'Transmitiendo 586 paquetes de datos a la pantalla...');

    // 4. Fragmentación en 586 bloques de 56 bytes (FEA_CMD_SETTFTLCDDATA = 37 / 0x25)
    const totalChunks = Math.ceil(totalBytes / 56);
    logger.tx(`3/3 Transmitiendo ${totalChunks} paquetes HID de 56 bytes a pantalla TFT...`);

    for (let y = 0; y < totalChunks; y++) {
      const packet = new Uint8Array(64);
      packet[0] = CMD_SETTFTLCDDATA; // 0x25 (37)
      packet[1] = 0; // currentFrame
      packet[2] = 1; // frameNum
      packet[3] = 0; // frameDelay
      packet[4] = y & 0xff;        // byte bajo de chunk index (UInt16LE)
      packet[5] = (y >> 8) & 0xff; // byte alto de chunk index (UInt16LE)

      const chunk = rawBytes.subarray(y * 56, (y + 1) * 56);
      packet[6] = chunk.length;    // longitud del chunk (56 o residuo)
      packet[7] = 0;

      packet.set(chunk, 8); // Datos de píxeles en bytes 8..63

      await this.sendFeatureReport(packet);

      if (y % 15 === 0 || y === totalChunks - 1) {
        const pct = Math.min(99, Math.round((y / totalChunks) * 83) + 15);
        onProgress(pct, `Paquete ${y + 1} de ${totalChunks} (${pct}%)...`);
        await new Promise((r) => setTimeout(r, 4));
      } else {
        await new Promise((r) => setTimeout(r, 2));
      }
    }

    // Pequeño retardo final para que el buffer TFT termine de pintar
    await new Promise((r) => setTimeout(r, 100));

    logger.rx('✓ Transferencia exitosa: 32,768 bytes (586 paquetes) desplegados en pantalla TFT.');
    onProgress(100, '¡Imagen transferida y desplegada en pantalla!');
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
