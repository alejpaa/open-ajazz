import { useState, useEffect } from 'react';
import { Save } from 'lucide-react';
import { mouseService, DpiStageConfig } from '../services/mouseProtocol';
import { errorManager } from '../services/errorHandler';
import { usePersistentState } from '../hooks/usePersistentState';

const DPI_MIN = 50;
const DPI_MAX = 26000;
const DPI_STEP = 50;
const POLLING_RATES = [125, 250, 500, 1000, 2000, 4000, 8000];

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

const clampDpi = (v: number) =>
  Math.min(DPI_MAX, Math.max(DPI_MIN, Math.round(v / DPI_STEP) * DPI_STEP));

function DpiInput({ value, disabled, onCommit }: { value: number; disabled: boolean; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    const parsed = Number(draft);
    if (Number.isFinite(parsed) && draft.trim() !== '') onCommit(clampDpi(parsed));
    else setDraft(String(value));
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      aria-label="Valor de DPI"
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value.replace(/\D/g, ''))}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      className="w-20 bg-neutral-950 border border-neutral-700 rounded px-2 py-1 text-xs text-right font-mono text-neutral-100 focus:outline-none focus:border-brand-500 disabled:opacity-40"
    />
  );
}

export function DpiSettings() {
  const [stages, setStages] = usePersistentState<DpiStageConfig[]>('openajazz.dpi.stages', DEFAULT_STAGES);
  const [activeStageId, setActiveStageId] = usePersistentState('openajazz.dpi.active', 3);
  const [pollingRate, setPollingRate] = usePersistentState('openajazz.dpi.polling', 1000);
  const [debounceTime, setDebounceTime] = usePersistentState('openajazz.dpi.debounce', 4);
  const [isSaving, setIsSaving] = useState(false);

  const enabledCount = stages.filter((s) => s.enabled).length;

  const patchStage = (id: number, patch: Partial<DpiStageConfig>) =>
    setStages((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const toggleStage = (stage: DpiStageConfig) => {
    if (stage.enabled && enabledCount === 1) return;
    patchStage(stage.id, { enabled: !stage.enabled });
    if (stage.enabled && stage.id === activeStageId) {
      const fallback = stages.find((s) => s.enabled && s.id !== stage.id);
      if (fallback) setActiveStageId(fallback.id);
    }
  };

  const save = async () => {
    setIsSaving(true);
    try {
      await mouseService.setDpi(activeStageId, stages, pollingRate, debounceTime);
      errorManager.showSuccess('Sensibilidad guardada', 'Las etapas de DPI y el sensor se aplicaron al mouse.');
    } catch (e) {
      errorManager.handle(e, 'Ajuste de DPI y sensor');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Sensibilidad</h2>
          <p className="text-sm text-neutral-400 mt-1">Etapas de DPI con color de LED, frecuencia de sondeo y rebote.</p>
        </div>
        <button
          onClick={save}
          disabled={isSaving}
          className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white transition cursor-pointer"
        >
          <Save className="w-4 h-4" aria-hidden />
          {isSaving ? 'Guardando…' : 'Guardar en el mouse'}
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="lg:col-span-2 bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-2">
          <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wide pb-2">Etapas</h3>
          {stages.map((stage) => {
            const isActive = stage.id === activeStageId;
            return (
              <div
                key={stage.id}
                className={`px-3 py-2.5 rounded-lg border flex items-center gap-3 transition ${
                  isActive ? 'border-brand-500 bg-neutral-800/60' : 'border-neutral-800'
                } ${stage.enabled ? '' : 'opacity-50'}`}
              >
                <label className="flex items-center gap-2 shrink-0 w-20 text-xs text-neutral-300 cursor-pointer">
                  <input
                    type="radio"
                    name="active-stage"
                    checked={isActive}
                    disabled={!stage.enabled}
                    onChange={() => setActiveStageId(stage.id)}
                    className="accent-brand-500"
                  />
                  Etapa {stage.id}
                </label>
                <input
                  type="range"
                  aria-label={`DPI de la etapa ${stage.id}`}
                  min={DPI_MIN}
                  max={DPI_MAX}
                  step={DPI_STEP}
                  value={stage.value}
                  disabled={!stage.enabled}
                  onChange={(e) => patchStage(stage.id, { value: Number(e.target.value) })}
                  className="flex-1 accent-brand-500 cursor-pointer disabled:cursor-not-allowed"
                />
                <DpiInput
                  value={stage.value}
                  disabled={!stage.enabled}
                  onCommit={(v) => patchStage(stage.id, { value: v })}
                />
                <input
                  type="color"
                  aria-label={`Color de la etapa ${stage.id}`}
                  value={stage.color}
                  disabled={!stage.enabled}
                  onChange={(e) => patchStage(stage.id, { color: e.target.value })}
                  className="w-7 h-7 rounded border border-neutral-700 bg-transparent cursor-pointer disabled:cursor-not-allowed p-0.5"
                />
                <button
                  onClick={() => toggleStage(stage)}
                  disabled={stage.enabled && enabledCount === 1}
                  aria-pressed={stage.enabled}
                  className="text-xs w-16 py-1 rounded bg-neutral-800 hover:bg-neutral-700 disabled:opacity-40 disabled:cursor-not-allowed text-neutral-200 transition cursor-pointer"
                >
                  {stage.enabled ? 'Activa' : 'Inactiva'}
                </button>
              </div>
            );
          })}
        </section>

        <div className="space-y-4">
          <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-3">
            <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wide">Frecuencia de sondeo</h3>
            <div className="grid grid-cols-3 gap-2">
              {POLLING_RATES.map((rate) => (
                <button
                  key={rate}
                  onClick={() => setPollingRate(rate)}
                  aria-pressed={pollingRate === rate}
                  className={`py-1.5 rounded-md text-xs font-mono border transition cursor-pointer ${
                    pollingRate === rate
                      ? 'bg-neutral-800 border-brand-500 text-white'
                      : 'border-neutral-800 text-neutral-400 hover:border-neutral-600 hover:text-neutral-100'
                  }`}
                >
                  {rate} Hz
                </button>
              ))}
            </div>
          </section>

          <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 space-y-3">
            <div className="flex justify-between items-center">
              <label htmlFor="debounce" className="text-xs font-medium text-neutral-400 uppercase tracking-wide">
                Tiempo de rebote
              </label>
              <span className="font-mono text-xs text-neutral-200">{debounceTime} ms</span>
            </div>
            <input
              id="debounce"
              type="range"
              min="0"
              max="20"
              value={debounceTime}
              onChange={(e) => setDebounceTime(Number(e.target.value))}
              className="w-full accent-brand-500 cursor-pointer"
            />
          </section>
        </div>
      </div>
    </div>
  );
}
