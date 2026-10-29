/**
 * OpenAJAZZ - Sistema de Registro y Telemetría para Diagnóstico
 */

export interface LogEntry {
  id: string;
  timestamp: string;
  type: 'info' | 'tx' | 'rx' | 'warn' | 'error';
  message: string;
  data?: any;
}

type LogListener = (logs: LogEntry[]) => void;

class LoggerService {
  private logs: LogEntry[] = [];
  private listeners: Set<LogListener> = new Set();
  private maxLogs = 100;

  subscribe(listener: LogListener): () => void {
    this.listeners.add(listener);
    listener([...this.logs]);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    const copy = [...this.logs];
    this.listeners.forEach((l) => l(copy));
  }

  log(type: LogEntry['type'], message: string, data?: any) {
    const entry: LogEntry = {
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      type,
      message,
      data: data ? (typeof data === 'object' ? JSON.stringify(data) : String(data)) : undefined,
    };

    this.logs.unshift(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }

    console.log(`[OpenAJAZZ][${type.toUpperCase()}] ${message}`, data || '');
    this.notify();
  }

  info(msg: string, data?: any) { this.log('info', msg, data); }
  tx(msg: string, data?: any) { this.log('tx', msg, data); }
  rx(msg: string, data?: any) { this.log('rx', msg, data); }
  warn(msg: string, data?: any) { this.log('warn', msg, data); }
  error(msg: string, data?: any) { this.log('error', msg, data); }

  clear() {
    this.logs = [];
    this.notify();
  }

  /**
   * Genera un reporte completo en formato Markdown listo para copiar y enviar al asistente
   */
  generateDiagnosticReport(currentError?: any): string {
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : 'Desconocido';
    const isWebHID = typeof navigator !== 'undefined' && 'hid' in navigator;
    const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;

    const logLines = this.logs
      .slice(0, 30)
      .map((l) => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.message}${l.data ? ` -> ${l.data}` : ''}`)
      .reverse()
      .join('\n');

    return `### Reporte de Diagnóstico OpenAJAZZ
**Fecha:** ${new Date().toLocaleString()}
**Entorno:** ${isTauri ? 'Tauri (App Nativa)' : 'Navegador Web (WebHID: ' + (isWebHID ? 'Disponible' : 'No disponible') + ')'}
**Navegador / Plataforma:** \`${userAgent}\`

---

#### Detalle del Error:
${currentError ? `* **Título:** ${currentError.title || 'Error'}
* **Mensaje:** ${currentError.message || currentError}
* **Solución sugerida:** ${currentError.solution || 'N/A'}
* **Registro Técnico:**
\`\`\`text
${currentError.technicalDetails || currentError}
\`\`\`` : '_Sin errores activos registrados._'}

---

#### Registros Recientes de Comunicación USB (Logs):
\`\`\`text
${logLines || 'No hay eventos registrados aún.'}
\`\`\`
`;
  }
}

export const logger = new LoggerService();
