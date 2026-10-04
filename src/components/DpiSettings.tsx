import React, { useState } from 'react';
import { Sliders, Gauge, Zap, Check, Save } from 'lucide-react';
import { mouseService, DpiStageConfig } from '../services/mouseProtocol';

const DEFAULT_STAGES: DpiStageConfig[] = [
  { id: 1, value: 400, color: '#ef4444', enabled: true },
  { id: 2, value: 800, color: '#3b82f6', enabled: true },
  { id: 3, value: 1200, color: '#10b981', enabled: true },
  { id: 4, value: 1600, color: '#f59e0b', enabled: true },
  { id: 5, value: 2400, color: '#06b6d4', enabled: true },
  { id: 6, value: 3200, color: '#8b5cf6', enabled: true },
  { id: 7, value: 6400, color: '#ec4899', enabled: false },
  { id: 8, value: 26000, color: '#ffffff', enabled: false },
];

export const DpiSettings: React.FC = () => {
  const [stages, setStages] = useState<DpiStageConfig[]>(DEFAULT_STAGES);
  const [activeStageId, setActiveStageId] = useState<number>(3); // 1200 DPI por defecto
  const [pollingRate, setPollingRate] = useState<number>(1000); // 1000 Hz
  const [debounceTime, setDebounceTime] = useState<number>(4); // 4ms
  const [lod, setLod] = useState<number>(1); // 1mm
  const [smoothMode, setSmoothMode] = useState<boolean>(false);
  const [isSaved, setIsSaved] = useState<boolean>(false);

  const handleDpiChange = (id: number, val: number) => {
    setStages((prev) =>
      prev.map((s) => (s.id === id ? { ...s, value: Math.max(50, Math.min(26000, val)) } : s))
    );
  };

  const handleColorChange = (id: number, color: string) => {
    setStages((prev) => prev.map((s) => (s.id === id ? { ...s, color } : s)));
  };

  const handleToggleStage = (id: number) => {
    setStages((prev) => prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)));
  };

  const handleSave = async () => {
    try {
      await mouseService.setDpi(activeStageId, stages, pollingRate, debounceTime);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2500);
    } catch (e: any) {
      alert(`Error al guardar configuración: ${e?.message || e}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-lg backdrop-blur flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Sliders className="w-6 h-6 text-indigo-400" />
            Configuración de Sensibilidad (DPI) y Sensor
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Personaliza los niveles de resolución, asigna colores LED a cada etapa y ajusta la tasa de sondeo del sensor óptico.
          </p>
        </div>
        <button
          onClick={handleSave}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg text-sm transition shadow-lg shadow-indigo-600/20 cursor-pointer"
        >
          {isSaved ? <Check className="w-4 h-4 text-emerald-300" /> : <Save className="w-4 h-4" />}
          {isSaved ? '¡Guardado en el Mouse!' : 'Guardar Cambios'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* DPI Stages (2 cols) */}
        <div className="lg:col-span-2 bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-4">
          <div className="flex justify-between items-center border-b border-slate-800 pb-3">
            <h3 className="text-sm font-semibold text-slate-200">Etapas de DPI (Hasta 8 niveles)</h3>
            <span className="text-xs text-slate-400">Haz clic en el indicador para cambiar etapa activa</span>
          </div>

          <div className="space-y-3.5 pt-2">
            {stages.map((stage) => {
              const isActive = stage.id === activeStageId;
              return (
                <div
                  key={stage.id}
                  className={`p-3 rounded-xl border transition flex items-center gap-4 ${
                    isActive
                      ? 'bg-slate-800/80 border-indigo-500/80 shadow-md ring-1 ring-indigo-500/30'
                      : stage.enabled
                      ? 'bg-slate-950/40 border-slate-800 hover:border-slate-700'
                      : 'bg-slate-950/20 border-slate-900 opacity-40'
                  }`}
                >
                  <button
                    onClick={() => setActiveStageId(stage.id)}
                    className="flex items-center gap-2 shrink-0 cursor-pointer"
                  >
                    <div
                      className={`w-5 h-5 rounded-full border flex items-center justify-center transition ${
                        isActive ? 'border-indigo-400 bg-indigo-600' : 'border-slate-600 bg-slate-900'
                      }`}
                    >
                      {isActive && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                    <span className="text-xs font-semibold text-slate-300">Etapa {stage.id}</span>
                  </button>

                  <div className="flex-1 flex items-center gap-3">
                    <input
                      type="range"
                      min="50"
                      max="26000"
                      step="50"
                      value={stage.value}
                      disabled={!stage.enabled}
                      onChange={(e) => handleDpiChange(stage.id, Number(e.target.value))}
                      className="w-full accent-indigo-500 cursor-pointer disabled:cursor-not-allowed"
                    />
                    <input
                      type="number"
                      min="50"
                      max="26000"
                      step="50"
                      value={stage.value}
                      disabled={!stage.enabled}
                      onChange={(e) => handleDpiChange(stage.id, Number(e.target.value))}
                      className="w-20 bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-right font-mono text-indigo-300 focus:outline-none focus:border-indigo-500"
                    />
                    <span className="text-xs text-slate-500 font-mono">DPI</span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      type="color"
                      value={stage.color}
                      disabled={!stage.enabled}
                      onChange={(e) => handleColorChange(stage.id, e.target.value)}
                      className="w-7 h-7 rounded border border-slate-700 bg-transparent cursor-pointer disabled:cursor-not-allowed p-0.5"
                    />
                  </div>

                  <button
                    onClick={() => handleToggleStage(stage.id)}
                    className={`text-xs px-2 py-1 rounded transition shrink-0 cursor-pointer ${
                      stage.enabled
                        ? 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                        : 'bg-slate-900 text-slate-600 hover:text-slate-400'
                    }`}
                  >
                    {stage.enabled ? 'Activo' : 'Inactivo'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sensor & Hardware Settings */}
        <div className="space-y-6">
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Gauge className="w-4 h-4 text-emerald-400" />
              Tasa de Sondeo (Polling Rate)
            </h3>
            <p className="text-xs text-slate-400">Frecuencia con la que el mouse reporta su posición al sistema.</p>

            <div className="grid grid-cols-3 gap-2 pt-1">
              {[125, 250, 500, 1000, 2000, 4000, 8000].map((rate) => (
                <button
                  key={rate}
                  onClick={() => setPollingRate(rate)}
                  className={`py-2 px-3 rounded-lg text-xs font-mono font-medium border transition cursor-pointer ${
                    pollingRate === rate
                      ? 'bg-indigo-600/30 border-indigo-500 text-white shadow-sm'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  {rate} Hz
                </button>
              ))}
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              Parámetros Avanzados del Sensor
            </h3>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Tiempo de rebote (Debounce Time):</span>
                <span className="font-mono text-indigo-400">{debounceTime} ms</span>
              </div>
              <input
                type="range"
                min="0"
                max="20"
                value={debounceTime}
                onChange={(e) => setDebounceTime(Number(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
            </div>

            <div className="space-y-1.5 pt-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Distancia de despegue (LOD):</span>
                <span className="font-mono text-indigo-400">{lod} mm</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[1, 2].map((l) => (
                  <button
                    key={l}
                    onClick={() => setLod(l)}
                    className={`py-1.5 text-xs font-medium rounded-lg border transition cursor-pointer ${
                      lod === l
                        ? 'bg-indigo-600/30 border-indigo-500 text-white'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    {l} mm
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <span className="text-xs text-slate-300">Suavizado de sensor (Smooth):</span>
              <button
                onClick={() => setSmoothMode(!smoothMode)}
                className={`w-10 h-5 rounded-full transition relative p-0.5 cursor-pointer ${
                  smoothMode ? 'bg-indigo-600' : 'bg-slate-800'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white transition-all transform ${
                    smoothMode ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
