import { useState } from 'react';
import { Sun } from 'lucide-react';
import { mouseService } from '../services/mouseProtocol';
import { errorManager } from '../services/errorHandler';
import { usePersistentState } from '../hooks/usePersistentState';

interface LightEffect {
  id: string;
  name: string;
  hasColor: boolean;
  hasSpeed: boolean;
}

const EFFECTS: LightEffect[] = [
  { id: 'static', name: 'Color fijo', hasColor: true, hasSpeed: false },
  { id: 'breath', name: 'Respiración', hasColor: true, hasSpeed: true },
  { id: 'wave', name: 'Onda RGB', hasColor: false, hasSpeed: true },
  { id: 'neon', name: 'Neón', hasColor: false, hasSpeed: true },
  { id: 'off', name: 'Apagado', hasColor: false, hasSpeed: false },
];

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#10b981', '#06b6d4',
  '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#ffffff',
];

export function LightingSettings() {
  const [effectId, setEffectId] = usePersistentState('openajazz.light.effect', 'wave');
  const [color, setColor] = usePersistentState('openajazz.light.color', '#6366f1');
  const [brightness, setBrightness] = usePersistentState('openajazz.light.brightness', 80);
  const [speed, setSpeed] = usePersistentState('openajazz.light.speed', 3);
  const [isApplying, setIsApplying] = useState(false);

  const effect = EFFECTS.find((e) => e.id === effectId) ?? EFFECTS[0];

  const apply = async () => {
    setIsApplying(true);
    try {
      await mouseService.setLighting(effect.id, color, brightness, speed);
      errorManager.showSuccess('Iluminación aplicada', `Efecto "${effect.name}" activo en el mouse.`);
    } catch (e) {
      errorManager.handle(e, 'Configuración de iluminación');
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Iluminación</h2>
          <p className="text-sm text-neutral-400 mt-1">Efecto, color, brillo y velocidad de los LED.</p>
        </div>
        <button
          onClick={apply}
          disabled={isApplying}
          className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white transition cursor-pointer"
        >
          <Sun className="w-4 h-4" aria-hidden />
          {isApplying ? 'Aplicando…' : 'Aplicar'}
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-3">
          <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wide">Efecto</h3>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Efecto de iluminación">
            {EFFECTS.map((e) => (
              <button
                key={e.id}
                role="radio"
                aria-checked={e.id === effectId}
                onClick={() => setEffectId(e.id)}
                className={`px-3 py-2.5 rounded-lg border text-left text-sm transition cursor-pointer ${
                  e.id === effectId
                    ? 'bg-neutral-800 border-brand-500 text-white'
                    : 'border-neutral-800 text-neutral-400 hover:border-neutral-600 hover:text-neutral-100'
                }`}
              >
                {e.name}
              </button>
            ))}
          </div>
        </section>

        <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-5">
          <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wide">Parámetros</h3>

          {effect.hasColor && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-neutral-400">Color</span>
                <span className="font-mono text-neutral-200 uppercase">{color}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    style={{ backgroundColor: c }}
                    aria-label={`Color ${c}`}
                    aria-pressed={color.toLowerCase() === c}
                    className={`w-7 h-7 rounded-md border-2 transition cursor-pointer ${
                      color.toLowerCase() === c ? 'border-white' : 'border-transparent hover:border-neutral-500'
                    }`}
                  />
                ))}
                <input
                  type="color"
                  aria-label="Color personalizado"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-7 h-7 rounded-md border border-neutral-700 bg-transparent cursor-pointer p-0.5"
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <label htmlFor="brightness" className="text-neutral-400">Brillo</label>
              <span className="font-mono text-neutral-200">{brightness}%</span>
            </div>
            <input
              id="brightness"
              type="range"
              min="0"
              max="100"
              value={brightness}
              onChange={(e) => setBrightness(Number(e.target.value))}
              className="w-full accent-brand-500 cursor-pointer"
            />
          </div>

          {effect.hasSpeed && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <label htmlFor="speed" className="text-neutral-400">Velocidad</label>
                <span className="font-mono text-neutral-200">Nivel {speed}</span>
              </div>
              <input
                id="speed"
                type="range"
                min="1"
                max="5"
                value={speed}
                onChange={(e) => setSpeed(Number(e.target.value))}
                className="w-full accent-brand-500 cursor-pointer"
              />
            </div>
          )}

          {!effect.hasColor && !effect.hasSpeed && effect.id === 'off' && (
            <p className="text-xs text-neutral-500">Este modo apaga los LED; no tiene más parámetros.</p>
          )}
        </section>
      </div>
    </div>
  );
}
