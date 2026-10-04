import React, { useState, useEffect } from 'react';
import { Battery, BatteryCharging, Wifi, Cpu, RefreshCw, CheckCircle2 } from 'lucide-react';

export const BatteryStatus: React.FC = () => {
  const [batteryLevel, setBatteryLevel] = useState<number>(85);
  const [isCharging, setIsCharging] = useState<boolean>(true);
  const [oledVersion] = useState<string>('v1.0.4');
  const [flashVersion] = useState<string>('v2.1.0');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const refreshStatus = async () => {
    setIsRefreshing(true);
    try {
      if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
        const { invoke } = await import('@tauri-apps/api/core');
        const res: any = await invoke('get_battery_status');
        if (res) {
          setBatteryLevel(res.level);
          setIsCharging(res.is_charging);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  useEffect(() => {
    refreshStatus();
    const interval = setInterval(refreshStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6">
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-lg backdrop-blur flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Battery className="w-6 h-6 text-indigo-400" />
            Telemetría, Batería y Firmware
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Monitoreo en tiempo real del estado de energía, base de carga magnética y versiones internas de hardware.
          </p>
        </div>
        <button
          onClick={refreshStatus}
          disabled={isRefreshing}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-sm font-medium transition shadow-sm"
        >
          <RefreshCw className={`w-4 h-4 text-indigo-400 ${isRefreshing ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Battery Card */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 flex flex-col justify-between space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Carga de Batería</span>
            {isCharging ? (
              <span className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded-full border border-amber-800/40">
                <BatteryCharging className="w-3.5 h-3.5" />
                Cargando en Base
              </span>
            ) : (
              <span className="text-xs text-slate-400">En Batería</span>
            )}
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-5xl font-black text-white font-mono">{batteryLevel}%</span>
            <span className="text-xs text-slate-500 font-medium">Capacidad</span>
          </div>

          <div className="w-full h-3 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-800">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                batteryLevel > 50
                  ? 'bg-emerald-500'
                  : batteryLevel > 20
                  ? 'bg-amber-500'
                  : 'bg-red-500'
              }`}
              style={{ width: `${batteryLevel}%` }}
            />
          </div>
        </div>

        {/* Connection Card */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 flex flex-col justify-between space-y-4">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Conexión y Base</span>

          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-indigo-950/50 border border-indigo-800/40 flex items-center justify-center text-indigo-400">
              <Wifi className="w-6 h-6" />
            </div>
            <div>
              <div className="text-base font-bold text-white flex items-center gap-1.5">
                <span>Inalámbrico 2.4 GHz</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </div>
              <p className="text-xs text-slate-400 mt-0.5">Base Dongle APEX (`3151:5007`)</p>
            </div>
          </div>

          <div className="text-xs text-slate-500 flex justify-between border-t border-slate-800/80 pt-3">
            <span>Estado de enlace:</span>
            <span className="text-emerald-400 font-medium">Excelente (Sin interferencia)</span>
          </div>
        </div>

        {/* Firmware Card */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 flex flex-col justify-between space-y-4">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Microcontrolador y Pantalla</span>

          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                Chip TFT LCD:
              </span>
              <span className="font-mono text-slate-200">{oledVersion}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400">Memoria Flash SPI:</span>
              <span className="font-mono text-slate-200">{flashVersion}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400">Sensor Óptico:</span>
              <span className="font-mono text-indigo-400">PixArt PAW3950</span>
            </div>
          </div>

          <div className="text-xs text-slate-500 flex justify-between border-t border-slate-800/80 pt-3">
            <span>Fabricante:</span>
            <span className="text-slate-300">Yichip / AJAZZ</span>
          </div>
        </div>
      </div>
    </div>
  );
};
