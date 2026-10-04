import { useState, useEffect } from 'react';
import { ScreenStudio } from './components/ScreenStudio';
import { DpiSettings } from './components/DpiSettings';
import { LightingSettings } from './components/LightingSettings';
import { BatteryStatus } from './components/BatteryStatus';
import { ErrorNotification } from './components/ErrorNotification';
import { mouseService } from './services/mouseProtocol';
import { errorManager } from './services/errorHandler';
import { logger, LogEntry } from './services/logger';
import { Mouse, Image as ImageIcon, Sliders, Sparkles, Battery, Circle, Unplug, Check, Terminal, Copy, Trash2, X } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'screen' | 'dpi' | 'lighting' | 'battery'>('screen');
  const [isConnected, setIsConnected] = useState(false);
  const [deviceName, setDeviceName] = useState('AJAZZ APEX');
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [copiedReport, setCopiedReport] = useState(false);

  useEffect(() => {
    setIsConnected(mouseService.isConnected());
    setDeviceName(mouseService.getDeviceName());
    return logger.subscribe(setLogs);
  }, []);

  const handleConnect = async () => {
    try {
      const ok = await mouseService.connect();
      if (ok) {
        setIsConnected(true);
        setDeviceName(mouseService.getDeviceName());
        errorManager.showSuccess('Mouse Conectado', 'Enlace USB HID establecido con el mouse AJAZZ APEX.');
      }
    } catch (e: any) {
      errorManager.handle(e, 'Emparejamiento inicial USB');
    }
  };

  const handleCopyLogs = () => {
    const report = logger.generateDiagnosticReport();
    navigator.clipboard.writeText(report);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 2000);
  };

  return (
    <div className="flex h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans relative">
      {/* Toast / Global Error Notification System */}
      <ErrorNotification />

      {/* Sidebar Navigation */}
      <aside className="w-64 bg-slate-900/90 border-r border-slate-800 flex flex-col justify-between p-4 shrink-0 select-none">
        <div className="space-y-6">
          {/* Logo Brand */}
          <div className="flex items-center gap-3 px-2 pt-2">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Mouse className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-extrabold text-base tracking-tight text-white flex items-center gap-1.5">
                OpenAJAZZ
                <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 font-semibold border border-indigo-500/30">
                  APEX
                </span>
              </h1>
              <p className="text-[11px] text-slate-400">Suite Multiplataforma</p>
            </div>
          </div>

          {/* Device Status Card & Connect Button */}
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Dispositivo:</span>
              <span className={`flex items-center gap-1.5 font-medium ${isConnected ? 'text-emerald-400' : 'text-amber-400'}`}>
                <Circle className={`w-2 h-2 ${isConnected ? 'fill-emerald-400 text-emerald-400' : 'fill-amber-400 text-amber-400'}`} />
                {isConnected ? 'Conectado' : 'Sin vincular'}
              </span>
            </div>
            <div className="text-xs font-semibold text-slate-200 truncate">
              {deviceName}
            </div>

            {!isConnected ? (
              <button
                onClick={handleConnect}
                className="w-full py-1.5 px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 transition shadow cursor-pointer"
              >
                <Unplug className="w-3.5 h-3.5" />
                Conectar Mouse USB
              </button>
            ) : (
              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/60 font-mono">
                <span className="text-emerald-400 flex items-center gap-1">
                  <Check className="w-3 h-3" /> HID Activo
                </span>
                <span>3151:5007</span>
              </div>
            )}
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1.5">
            <button
              onClick={() => setActiveTab('screen')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                activeTab === 'screen'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <ImageIcon className="w-4 h-4 shrink-0" />
              <span>Pantalla TFT & GIFs</span>
            </button>

            <button
              onClick={() => setActiveTab('dpi')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                activeTab === 'dpi'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Sliders className="w-4 h-4 shrink-0" />
              <span>Sensibilidad & DPI</span>
            </button>

            <button
              onClick={() => setActiveTab('lighting')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                activeTab === 'lighting'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Sparkles className="w-4 h-4 shrink-0" />
              <span>Iluminación RGB</span>
            </button>

            <button
              onClick={() => setActiveTab('battery')}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                activeTab === 'battery'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/25'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Battery className="w-4 h-4 shrink-0" />
              <span>Batería & Estado</span>
            </button>
          </nav>
        </div>

        {/* Footer info & Logs trigger */}
        <div className="pt-3 border-t border-slate-800 space-y-2">
          <button
            onClick={() => setShowLogsModal(true)}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 px-2 bg-slate-800/60 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg text-[11px] font-mono transition cursor-pointer"
          >
            <Terminal className="w-3.5 h-3.5 text-indigo-400" />
            <span>Ver Logs / Diagnóstico</span>
          </button>
          <div className="text-[10px] text-slate-500 text-center">
            Open Source • WebHID & Tauri Ready
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden bg-slate-950">
        <header className="h-14 border-b border-slate-800/80 px-6 flex items-center justify-between bg-slate-900/40 backdrop-blur shrink-0">
          <div className="flex items-center gap-3 text-xs">
            <span className="text-slate-400">Perfil Activo:</span>
            <span className="bg-slate-800 text-slate-200 px-2 py-0.5 rounded font-mono font-medium border border-slate-700">
              Perfil 1 (Juego / Predeterminado)
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-1.5 text-slate-300">
              <span className="text-slate-500">DPI:</span>
              <span className="text-indigo-400 font-bold">1200</span>
            </div>
            <div className="w-px h-3 bg-slate-800" />
            <div className="flex items-center gap-1.5 text-slate-300">
              <span className="text-slate-500">Sondeo:</span>
              <span className="text-emerald-400 font-bold">1000Hz</span>
            </div>
            <div className="w-px h-3 bg-slate-800" />
            <div className="flex items-center gap-1.5 text-slate-300">
              <span className="text-slate-500">Batería:</span>
              <span className="text-white font-bold">85%</span>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-5xl mx-auto">
            {activeTab === 'screen' && <ScreenStudio />}
            {activeTab === 'dpi' && <DpiSettings />}
            {activeTab === 'lighting' && <LightingSettings />}
            {activeTab === 'battery' && <BatteryStatus />}
          </div>
        </div>
      </main>

      {/* Logs & Diagnostic Modal */}
      {showLogsModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full flex flex-col max-h-[80vh] shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-bold text-white">Registro de Eventos y Diagnóstico USB</h3>
              </div>
              <button
                onClick={() => setShowLogsModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body / Terminal window */}
            <div className="flex-1 p-4 overflow-y-auto bg-slate-950 font-mono text-xs space-y-1.5 select-text">
              {logs.length === 0 ? (
                <div className="text-slate-600 text-center py-10">No hay registros aún. Conecta el mouse para ver eventos.</div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="flex items-start gap-2 leading-relaxed">
                    <span className="text-slate-500 text-[10px] shrink-0">{log.timestamp}</span>
                    <span
                      className={`uppercase text-[10px] px-1 py-0.5 rounded font-bold shrink-0 ${
                        log.type === 'error'
                          ? 'bg-red-950 text-red-400 border border-red-800/40'
                          : log.type === 'warn'
                          ? 'bg-amber-950 text-amber-400 border border-amber-800/40'
                          : log.type === 'tx'
                          ? 'bg-indigo-950 text-indigo-400 border border-indigo-800/40'
                          : log.type === 'rx'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/40'
                          : 'bg-slate-900 text-slate-400'
                      }`}
                    >
                      {log.type}
                    </span>
                    <span
                      className={`break-all ${
                        log.type === 'error'
                          ? 'text-red-300 font-medium'
                          : log.type === 'warn'
                          ? 'text-amber-300'
                          : 'text-slate-300'
                      }`}
                    >
                      {log.message}
                    </span>
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-slate-800 bg-slate-900 flex justify-between items-center">
              <button
                onClick={() => logger.clear()}
                className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition px-2 py-1 rounded hover:bg-slate-800 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Limpiar Logs
              </button>

              <button
                onClick={handleCopyLogs}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition cursor-pointer border ${
                  copiedReport
                    ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20'
                }`}
              >
                {copiedReport ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copiedReport ? '¡Reporte copiado al portapapeles!' : 'Copiar Reporte Completo para el Asistente'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
