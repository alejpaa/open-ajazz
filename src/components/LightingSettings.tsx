import React, { useState } from 'react';
import { Sun, Sparkles, Check } from 'lucide-react';
import { mouseService } from '../services/mouseProtocol';

interface LightEffect {
  id: string;
  name: string;
  hasColor: boolean;
  hasSpeed: boolean;
}

const EFFECTS: LightEffect[] = [
  { id: 'static', name: 'Color Fijo (Static)', hasColor: true, hasSpeed: false },
  { id: 'breath', name: 'Respiración (Breathing)', hasColor: true, hasSpeed: true },
  { id: 'wave', name: 'Onda RGB (Wave)', hasColor: false, hasSpeed: true },
  { id: 'neon', name: 'Neón Arcoíris (Neon)', hasColor: false, hasSpeed: true },
  { id: 'off', name: 'Apagado (Off)', hasColor: false, hasSpeed: false },
];

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#10b981', '#06b6d4',
  '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#ffffff'
];

export const LightingSettings: React.FC = () => {
  const [selectedEffect, setSelectedEffect] = useState<string>('wave');
  const [color, setColor] = useState<string>('#6366f1');
  const [brightness, setBrightness] = useState<number>(80);
  const [speed, setSpeed] = useState<number>(3);
  const [isApplied, setIsApplied] = useState<boolean>(false);

  const currentEffectConfig = EFFECTS.find((e) => e.id === selectedEffect);

  const handleApply = async () => {
    try {
      await mouseService.setLighting(selectedEffect, color, brightness, speed);
      setIsApplied(true);
      setTimeout(() => setIsApplied(false), 2000);
    } catch (e: any) {
      alert(`Error al aplicar iluminación: ${e?.message || e}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-lg backdrop-blur flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-indigo-400" />
            Iluminación y Efectos RGB
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Controla los patrones de iluminación de la base magnética y los indicadores LED del mouse.
          </p>
        </div>
        <button
          onClick={handleApply}
          className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg text-sm transition shadow-lg shadow-indigo-600/20 cursor-pointer"
        >
          {isApplied ? <Check className="w-4 h-4 text-emerald-300" /> : <Sun className="w-4 h-4" />}
          {isApplied ? '¡Aplicado al Mouse!' : 'Aplicar Efecto'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Efectos */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-4">
          <h3 className="text-sm font-semibold text-slate-200">Modos de Iluminación</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {EFFECTS.map((eff) => {
              const isSel = eff.id === selectedEffect;
              return (
                <button
                  key={eff.id}
                  onClick={() => setSelectedEffect(eff.id)}
                  className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between h-24 cursor-pointer ${
                    isSel
                      ? 'bg-indigo-950/40 border-indigo-500/80 text-white shadow-md ring-1 ring-indigo-500/30'
                      : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <div className="flex justify-between items-center w-full">
                    <span className="text-xs font-semibold">{eff.name}</span>
                    <div
                      className={`w-3 h-3 rounded-full border ${
                        isSel ? 'bg-indigo-500 border-indigo-400' : 'border-slate-700'
                      }`}
                    />
                  </div>
                  <span className="text-[11px] text-slate-500">
                    {eff.id === 'off' ? 'Apaga los LEDs' : 'Efecto dinámico LED'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Ajustes de Parámetros */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-5">
          <h3 className="text-sm font-semibold text-slate-200">Parámetros del Efecto</h3>

          {/* Color selector */}
          {currentEffectConfig?.hasColor && (
            <div className="space-y-2.5">
              <label className="text-xs text-slate-400 flex items-center justify-between">
                <span>Color Primario:</span>
                <span className="font-mono text-indigo-400 uppercase">{color}</span>
              </label>

              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    style={{ backgroundColor: c }}
                    className={`w-7 h-7 rounded-lg border transition cursor-pointer ${
                      color.toLowerCase() === c.toLowerCase()
                        ? 'border-white scale-110 shadow-lg'
                        : 'border-transparent opacity-80 hover:opacity-100'
                    }`}
                  />
                ))}
                <div className="relative">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-7 h-7 rounded-lg border border-slate-700 bg-transparent cursor-pointer p-0.5"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Brillo */}
          <div className="space-y-2 pt-2 border-t border-slate-800">
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Brillo de Iluminación:</span>
              <span className="font-mono text-indigo-400">{brightness}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={brightness}
              onChange={(e) => setBrightness(Number(e.target.value))}
              className="w-full accent-indigo-500 cursor-pointer"
            />
          </div>

          {/* Velocidad */}
          {currentEffectConfig?.hasSpeed && (
            <div className="space-y-2 pt-2 border-t border-slate-800">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Velocidad del Efecto:</span>
                <span className="font-mono text-indigo-400">Nivel {speed}</span>
              </div>
              <input
                type="range"
                min="1"
                max="5"
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
