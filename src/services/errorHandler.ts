/**
 * OpenAJAZZ - Sistema Centralizado de Manejo y Diagnóstico de Errores
 */

export type ErrorSeverity = 'error' | 'warning' | 'info' | 'success';

export interface AppError {
  id: string;
  title: string;
  message: string;
  solution?: string;
  technicalDetails?: string;
  severity: ErrorSeverity;
  timestamp: Date;
  dismissible?: boolean;
}

type ErrorListener = (error: AppError | null) => void;

class ErrorManagerService {
  private listeners: Set<ErrorListener> = new Set();
  private currentError: AppError | null = null;

  subscribe(listener: ErrorListener): () => void {
    this.listeners.add(listener);
    listener(this.currentError);
    return () => {
      this.listeners.delete(listener);
    };
  }

  notify(error: AppError | null) {
    this.currentError = error;
    this.listeners.forEach((l) => l(error));
  }

  clear() {
    this.notify(null);
  }

  /**
   * Analiza un error de hardware o comunicación y devuelve un diagnóstico humano comprensible
   */
  handle(err: any, context?: string): AppError {
    const rawMessage = (err?.message || err?.toString() || 'Error desconocido').toLowerCase();
    const stack = err?.stack || '';

    let title = 'Error de Comunicación USB';
    let message = 'Ocurrió un problema inesperado al comunicarse con el dispositivo.';
    let solution: string | undefined = 'Verifica que el mouse esté encendido y conectado por cable.';
    let severity: ErrorSeverity = 'error';

    // 1. Error de cancelación o selección de dispositivo
    if (rawMessage.includes('no device selected') || rawMessage.includes('cancelled') || rawMessage.includes('cancel')) {
      title = 'Conexión Cancelada';
      message = 'No seleccionaste ningún dispositivo en la ventana emergente.';
      solution = 'Vuelve a pulsar "Conectar Mouse USB" y selecciona la entrada "AJAZZ APEX (0x3151)".';
      severity = 'info';
    }
    // 2. Error de Feature Report rechazado (buffer / permissions / reportId)
    else if (rawMessage.includes('failed to write the feature report') || rawMessage.includes('feature report')) {
      title = 'Transferencia USB Rechazada';
      message = 'El microcontrolador del mouse o base no aceptó el paquete de datos HID.';
      solution = '1. Conecta la base magnética mediante su cable USB directo a la PC (evita extensiones o HUBs USB sin energía externa).\n2. Si el mouse estaba en reposo, muévelo una vez para despertarlo antes de transferir.';
      severity = 'error';
    }
    // 3. Error de navegador no compatible con WebHID
    else if (rawMessage.includes('webhid') || rawMessage.includes('navigator.hid')) {
      title = 'Navegador No Compatible';
      message = 'El navegador que estás usando no tiene habilitada la API WebHID.';
      solution = 'Abre la aplicación en Google Chrome, Microsoft Edge, Brave u Opera, o utiliza el instalador de escritorio compilado.';
      severity = 'warning';
    }
    // 4. Dispositivo ocupado o bloqueado por otra aplicación
    else if (rawMessage.includes('access denied') || rawMessage.includes('busy') || rawMessage.includes('locked')) {
      title = 'Dispositivo Ocupado o Bloqueado';
      message = 'Otro programa en Windows/macOS tiene el control exclusivo del mouse.';
      solution = 'Cierra la app oficial de AJAZZ si está abierta en segundo plano en la barra de tareas.';
      severity = 'error';
    }
    // 5. Desconexión en medio de la transferencia
    else if (rawMessage.includes('disconnected') || rawMessage.includes('not open') || rawMessage.includes('device is not opened')) {
      title = 'Mouse Desconectado';
      message = 'Se perdió la conexión USB con el mouse o la base magnética.';
      solution = 'Vuelve a conectar el cable USB y pulsa "Conectar Mouse USB".';
      severity = 'warning';
    }
    // 6. Error de imagen o formato
    else if (rawMessage.includes('canvas') || rawMessage.includes('image')) {
      title = 'Error en Procesamiento de Imagen';
      message = 'No se pudo decodificar o recortar el archivo cargado.';
      solution = 'Prueba con otra imagen en formato PNG, JPG o GIF estándar de menos de 10 MB.';
      severity = 'warning';
    }

    const appError: AppError = {
      id: Math.random().toString(36).substring(2, 9),
      title,
      message,
      solution,
      technicalDetails: `${context ? `[Contexto: ${context}]\n` : ''}${err?.name || 'Error'}: ${err?.message || rawMessage}\n${stack}`,
      severity,
      timestamp: new Date(),
      dismissible: true,
    };

    this.notify(appError);
    return appError;
  }

  showSuccess(title: string, message: string) {
    this.notify({
      id: Math.random().toString(36).substring(2, 9),
      title,
      message,
      severity: 'success',
      timestamp: new Date(),
      dismissible: true,
    });
  }
}

export const errorManager = new ErrorManagerService();
