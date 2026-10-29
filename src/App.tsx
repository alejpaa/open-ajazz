import { useState, useEffect, useCallback } from 'react';
import { ScreenStudio } from './components/ScreenStudio';
import { DpiSettings } from './components/DpiSettings';
import { LightingSettings } from './components/LightingSettings';
import { BatteryStatus } from './components/BatteryStatus';
import { ErrorNotification } from './components/ErrorNotification';
import { LogsModal } from './components/LogsModal';
import { mouseService, type BatteryInfo } from './services/mouseProtocol';
import { deviceStore, useDeviceStore } from './services/deviceStore';
import { errorManager } from './services/errorHandler';
import {
  Mouse,
  Image as ImageIcon,
  Sliders,
  Sparkles,
  Battery,
  BatteryCharging,
  Terminal,
  type LucideIcon,
} from 'lucide-react';

type Tab = 'screen' | 'dpi' | 'lighting' | 'battery';

const TABS: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'screen', label: 'Pantalla TFT', icon: ImageIcon },
  { id: 'dpi', label: 'Sensibilidad', icon: Sliders },
  { id: 'lighting', label: 'Iluminación', icon: Sparkles },
  { id: 'battery', label: 'Batería y estado', icon: Battery },
];

const BATTERY_POLL_MS = 30_000;

const chargeLabel = (b: BatteryInfo) =>
  b.is_charging === true ? 'Cargando' : b.is_charging === false ? 'En batería' : b.source === 'bluetooth' ? 'Bluetooth' : '2.4G / USB';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('screen');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const { battery, screenImage } = useDeviceStore();

  const connect = useCallback(async (silent: boolean) => {
    setIsConnecting(true);
    try {
      await mouseService.connect(false);
      setIsConnected(mouseService.isConnected());
      const info = mouseService.getScreenInfo();
      deviceStore.setScreenInfo(info);
      if (!silent) {
        errorManager.showSuccess(
          'Dispositivo conectado',
          info.verified ? `Pantalla verificada (OLED ${info.oledVersion}, Flash ${info.flashVersion}).` : 'Enlace USB establecido.'
        );
      }
    } catch (e) {
      setIsConnected(false);
      if (!silent) errorManager.handle(e, 'Conexión con el dispositivo');
    } finally {
      setIsConnecting(false);
    }
  }, []);

  useEffect(() => {
    connect(true);
  }, [connect]);

  useEffect(() => {
    const poll = () => {
      if (!document.hidden) deviceStore.refreshBattery();
    };
    poll();
    const timer = setInterval(poll, BATTERY_POLL_MS);
    document.addEventListener('visibilitychange', poll);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', poll);
    };
  }, []);

  const viaBluetooth = battery?.source === 'bluetooth';
  const isOnline = isConnected || viaBluetooth;
  const statusLabel = isConnected ? 'Conectado' : viaBluetooth ? 'Bluetooth' : 'Desconectado';

  const BatteryIcon = battery?.is_charging === true ? BatteryCharging : Battery;

  return (
    <div className="flex h-screen w-screen bg-neutral-950 text-neutral-100 overflow-hidden font-sans">
      <ErrorNotification />

      <aside className="w-60 bg-neutral-900 border-r border-neutral-800 flex flex-col p-4 shrink-0 select-none">
        <div className="flex items-center gap-2.5 px-1 pb-5">
          <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
            <Mouse className="w-4 h-4 text-white" aria-hidden />
          </div>
          <h1 className="font-semibold text-sm text-white">OpenAJAZZ</h1>
        </div>

        <section className="border border-neutral-800 rounded-lg p-3 space-y-3 mb-5" aria-label="Dispositivo">
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-neutral-300">
              <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-ok-500' : 'bg-neutral-600'}`} />
              {statusLabel}
            </span>
            <span className="font-mono text-neutral-500">3151:5007</span>
          </div>

          {isOnline && (
            <div className="flex items-center gap-3">
              {screenImage && (
                <img
                  src={screenImage}
                  alt="Imagen en la pantalla de la base"
                  title="Imagen en la pantalla de la base"
                  className="w-12 h-12 rounded border border-neutral-700 object-cover bg-black"
                />
              )}
              <div className="min-w-0 flex-1 text-xs">
                <div className="flex items-center gap-1.5 text-neutral-200">
                  <BatteryIcon
                    className={`w-4 h-4 shrink-0 ${battery && battery.level <= 20 && battery.is_charging !== true ? 'text-danger-400' : 'text-neutral-400'}`}
                    aria-hidden
                  />
                  <span className="font-mono">{battery ? `${battery.level}%` : '--'}</span>
                </div>
                <p className="text-neutral-500 mt-0.5 truncate">
                  {battery ? chargeLabel(battery) : 'Sin lectura'}
                </p>
              </div>
            </div>
          )}

          <button
            onClick={() => connect(false)}
            disabled={isConnecting}
            className="w-full py-1.5 rounded-md text-xs font-medium bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-neutral-100 transition cursor-pointer"
          >
            {isConnecting ? 'Buscando…' : isConnected ? 'Reconectar' : 'Conectar'}
          </button>
        </section>

        <nav className="space-y-1 flex-1" aria-label="Secciones">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              aria-current={activeTab === id ? 'page' : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition cursor-pointer ${
                activeTab === id
                  ? 'bg-neutral-800 text-white'
                  : 'text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800/60'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" aria-hidden />
              {label}
            </button>
          ))}
        </nav>

        <button
          onClick={() => setShowLogs(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-md text-xs text-neutral-500 hover:text-neutral-200 hover:bg-neutral-800/60 transition cursor-pointer"
        >
          <Terminal className="w-3.5 h-3.5" aria-hidden />
          Registro de eventos
        </button>
      </aside>

      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-5xl mx-auto">
          <div hidden={activeTab !== 'screen'}><ScreenStudio /></div>
          <div hidden={activeTab !== 'dpi'}><DpiSettings /></div>
          <div hidden={activeTab !== 'lighting'}><LightingSettings /></div>
          <div hidden={activeTab !== 'battery'}><BatteryStatus /></div>
        </div>
      </main>

      {showLogs && <LogsModal onClose={() => setShowLogs(false)} />}
    </div>
  );
}
