import { useState } from 'react';
import { BatteryCharging, Battery, RefreshCw } from 'lucide-react';
import { deviceStore, useDeviceStore } from '../services/deviceStore';

function levelColor(level: number) {
  if (level > 50) return 'bg-ok-500';
  if (level > 20) return 'bg-warn-500';
  return 'bg-danger-500';
}

export function BatteryStatus() {
  const { battery, batteryError, screenInfo } = useDeviceStore();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const refresh = async () => {
    setIsRefreshing(true);
    await deviceStore.refreshBattery();
    setIsRefreshing(false);
  };

  const Icon = battery?.is_charging === true ? BatteryCharging : Battery;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Batería y estado</h2>
          <p className="text-sm text-neutral-400 mt-1">Lectura en vivo del mouse y la base. Se actualiza cada 30 s.</p>
        </div>
        <button
          onClick={refresh}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-3.5 py-2 rounded-md text-sm bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-neutral-100 transition cursor-pointer"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} aria-hidden />
          Actualizar
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
          <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wide">Batería</h3>
          <div className="flex items-center gap-3">
            <Icon className="w-6 h-6 text-neutral-400" aria-hidden />
            <span className="text-4xl font-semibold font-mono text-white">
              {battery ? `${battery.level}%` : '--'}
            </span>
          </div>
          <div className="w-full h-2 bg-neutral-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${battery ? levelColor(battery.level) : ''}`}
              style={{ width: `${battery?.level ?? 0}%` }}
            />
          </div>
          <p className="text-xs text-neutral-500">
            {battery
              ? `${battery.is_charging === true ? 'Cargando · ' : battery.is_charging === false ? 'Usando batería · ' : ''}${battery.source === 'bluetooth' ? 'vía Bluetooth (macOS)' : 'vía receptor 2.4G'}`
              : batteryError ?? 'Conecta el dispositivo para leer la batería.'}
          </p>
          {!battery && (
            <p className="text-xs text-neutral-600">
              Enciende el mouse en modo 2.4G (receptor conectado) o en Bluetooth para leer la batería.
            </p>
          )}
        </section>

        <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-4">
          <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wide">Pantalla TFT</h3>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-neutral-400">Controlador OLED</dt>
              <dd className="font-mono text-neutral-200">{screenInfo.oledVersion || '--'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-400">Memoria Flash</dt>
              <dd className="font-mono text-neutral-200">{screenInfo.flashVersion || '--'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-400">Estado</dt>
              <dd className={screenInfo.verified ? 'text-ok-400' : 'text-neutral-500'}>
                {screenInfo.verified ? 'Verificado' : 'Sin verificar'}
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
