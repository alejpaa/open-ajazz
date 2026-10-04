import { useState, useEffect } from 'react';
import { ScreenStudio } from './components/ScreenStudio';
import { DpiSettings } from './components/DpiSettings';
import { LightingSettings } from './components/LightingSettings';
import { BatteryStatus } from './components/BatteryStatus';
import { mouseService } from './services/mouseProtocol';
import { Mouse, Image as ImageIcon, Sliders, Sparkles, Battery, Circle, Unplug, Check } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'screen' | 'dpi' | 'lighting' | 'battery'>('screen');
  const [isConnected, setIsConnected] = useState(false);
  const [deviceName, setDeviceName] = useState('AJAZZ APEX');

  const checkConnection = () => {
    setIsConnected(mouseService.isConnected());
    setDeviceName(mouseService.getDeviceName());
  };

  useEffect(() => {
    checkConnection();
  }, []);

  const handleConnect = async () => {
    try {
      const ok = await mouseService.connect();
      if (ok) {
        setIsConnected(true);
        setDeviceName(mouseService.getDeviceName());
      }
    } catch (e: any) {
      alert(`No se pudo conectar al mouse: ${e?.message || e}`);
    }
  };

  return (
    <div className="flex h-screen w-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
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

        {/* Footer info */}
        <div className="pt-4 border-t border-slate-800 text-[11px] text-slate-500 text-center">
          Open Source • WebHID & Tauri Ready
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden bg-slate-950">
        {/* Top Header Bar */}
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

        {/* Scrollable Tab Content */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-5xl mx-auto">
            {activeTab === 'screen' && <ScreenStudio />}
            {activeTab === 'dpi' && <DpiSettings />}
            {activeTab === 'lighting' && <LightingSettings />}
            {activeTab === 'battery' && <BatteryStatus />}
          </div>
        </div>
      </main>
    </div>
  );
}
