import { useEffect, useState } from 'react';
import { Terminal, Copy, Check, Trash2, X } from 'lucide-react';
import { logger, LogEntry } from '../services/logger';

const TYPE_STYLES: Record<LogEntry['type'], string> = {
  error: 'text-danger-400',
  warn: 'text-warn-400',
  tx: 'text-brand-400',
  rx: 'text-ok-400',
  info: 'text-neutral-500',
};

export function LogsModal({ onClose }: { onClose: () => void }) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => logger.subscribe(setLogs), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(logger.generateDiagnosticReport());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // portapapeles no disponible
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Registro de eventos"
        onClick={(e) => e.stopPropagation()}
        className="bg-neutral-900 border border-neutral-800 rounded-xl max-w-2xl w-full flex flex-col max-h-[80vh] overflow-hidden"
      >
        <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Terminal className="w-4 h-4 text-neutral-400" aria-hidden />
            Registro de eventos
          </h3>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="text-neutral-400 hover:text-white p-1 rounded hover:bg-neutral-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 p-4 overflow-y-auto bg-neutral-950 font-mono text-xs space-y-1 select-text">
          {logs.length === 0 ? (
            <p className="text-neutral-600 text-center py-10">Sin eventos todavía.</p>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="flex items-start gap-2 leading-relaxed">
                <span className="text-neutral-600 shrink-0">{log.timestamp}</span>
                <span className={`uppercase w-9 shrink-0 ${TYPE_STYLES[log.type]}`}>{log.type}</span>
                <span className="text-neutral-300 break-all">{log.message}</span>
              </div>
            ))
          )}
        </div>

        <div className="px-3 py-2.5 border-t border-neutral-800 flex justify-between items-center">
          <button
            onClick={() => logger.clear()}
            className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-100 px-2 py-1 rounded hover:bg-neutral-800 transition cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" aria-hidden />
            Limpiar
          </button>
          <button
            onClick={copyReport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-brand-600 hover:bg-brand-500 text-white transition cursor-pointer"
          >
            {copied ? <Check className="w-3.5 h-3.5" aria-hidden /> : <Copy className="w-3.5 h-3.5" aria-hidden />}
            {copied ? 'Copiado' : 'Copiar reporte'}
          </button>
        </div>
      </div>
    </div>
  );
}
