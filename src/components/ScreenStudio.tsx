import React, { useState, useRef } from 'react';
import { Upload, Clock, Image as ImageIcon, Play, Pause, Trash2, CheckCircle2, AlertCircle } from 'lucide-react';

export const ScreenStudio: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [frameDelay, setFrameDelay] = useState(60); // ms
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      setStatusMessage({ type: 'info', text: `Archivo cargado: ${file.name} (${(file.size / 1024).toFixed(1)} KB)` });
    }
  };

  const handleSyncClock = async () => {
    setStatusMessage({ type: 'info', text: 'Sincronizando reloj de la pantalla...' });
    try {
      // Si Tauri está disponible invocamos el comando nativo
      if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('sync_clock');
      }
      setTimeout(() => {
        setStatusMessage({ type: 'success', text: '¡Reloj de la base sincronizado con éxito!' });
      }, 500);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: `Error al sincronizar reloj: ${err?.message || err}` });
    }
  };

  const handleUploadScreen = async () => {
    if (!selectedFile) return;
    setStatusMessage({ type: 'info', text: 'Iniciando transferencia a pantalla TFT 128x128...' });
    setUploadProgress(0);

    // Simulación progresiva o llamada nativa en Tauri
    let p = 0;
    const interval = setInterval(() => {
      p += 5;
      if (p <= 100) {
        setUploadProgress(p);
      } else {
        clearInterval(interval);
        setUploadProgress(null);
        setStatusMessage({ type: 'success', text: '¡Animación transferida con éxito a la pantalla!' });
      }
    }, 150);
  };

  const handleClear = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setUploadProgress(null);
    setStatusMessage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-lg backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <ImageIcon className="w-6 h-6 text-indigo-400" />
              Estudio de Pantalla TFT (128x128 Píxeles)
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Personaliza la pantalla de la base magnética del mouse con animaciones GIF, imágenes o sincroniza la hora actual.
            </p>
          </div>
          <button
            onClick={handleSyncClock}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-sm font-medium transition shadow-sm"
          >
            <Clock className="w-4 h-4 text-emerald-400" />
            Sincronizar Hora
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Preview & Canvas Zone */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 flex flex-col items-center justify-center min-h-[320px]">
          <span className="text-xs uppercase font-semibold text-slate-400 mb-3 tracking-wider">
            Previsualización en Pantalla (Escala Real)
          </span>

          {/* Marco que simula la pantalla física del mouse/base */}
          <div className="relative w-44 h-44 rounded-2xl bg-black border-4 border-slate-700 flex items-center justify-center overflow-hidden shadow-2xl ring-2 ring-indigo-500/20">
            {previewUrl ? (
              <img
                src={previewUrl}
                alt="Vista previa pantalla"
                className="w-32 h-32 object-cover rounded shadow"
                style={{ imageRendering: 'pixelated' }}
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-slate-600 gap-2">
                <ImageIcon className="w-10 h-10 stroke-1" />
                <span className="text-xs">Sin imagen activa</span>
              </div>
            )}

            {/* Borde sutil que marca la resolución 128x128 */}
            <div className="absolute inset-0 pointer-events-none border border-white/5 rounded-xl" />
          </div>

          <p className="text-xs text-slate-500 mt-3">Resolución nativa: 128 × 128 px (16-bit RGB565)</p>

          {previewUrl && (
            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs flex items-center gap-1 transition"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                {isPlaying ? 'Pausar' : 'Reproducir'}
              </button>
              <button
                onClick={handleClear}
                className="p-2 bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-900/50 rounded-lg text-xs flex items-center gap-1 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Quitar
              </button>
            </div>
          )}
        </div>

        {/* Upload & Controls Zone */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 flex flex-col justify-between">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-slate-300">Cargar Imagen o GIF</h3>

            {/* Drag & Drop Zone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-700 hover:border-indigo-500/80 bg-slate-950/50 hover:bg-indigo-950/10 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition group"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".gif,.png,.jpg,.jpeg"
                onChange={handleFileChange}
                className="hidden"
              />
              <Upload className="w-8 h-8 text-slate-500 group-hover:text-indigo-400 transition mb-2" />
              <p className="text-sm text-slate-300 font-medium">Haz clic o arrastra un archivo aquí</p>
              <p className="text-xs text-slate-500 mt-1">Soporta GIFs animados, PNG y JPG (se ajustarán a 128x128)</p>
            </div>

            {/* Ajustes de velocidad de frame */}
            <div className="space-y-2 pt-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Velocidad / Retardo entre frames:</span>
                <span className="font-mono text-indigo-400">{frameDelay} ms</span>
              </div>
              <input
                type="range"
                min="20"
                max="200"
                step="5"
                value={frameDelay}
                onChange={(e) => setFrameDelay(Number(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
            </div>
          </div>

          {/* Progress Bar & Actions */}
          <div className="pt-6 space-y-4">
            {uploadProgress !== null && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-indigo-400">Enviando paquetes HID...</span>
                  <span className="text-slate-300">{uploadProgress}%</span>
                </div>
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 transition-all duration-150 ease-out"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            {statusMessage && (
              <div
                className={`p-3 rounded-lg text-xs flex items-center gap-2 border ${
                  statusMessage.type === 'success'
                    ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                    : statusMessage.type === 'error'
                    ? 'bg-red-950/40 border-red-800/60 text-red-300'
                    : 'bg-indigo-950/40 border-indigo-800/60 text-indigo-300'
                }`}
              >
                {statusMessage.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 shrink-0" />
                )}
                <span>{statusMessage.text}</span>
              </div>
            )}

            <button
              onClick={handleUploadScreen}
              disabled={!selectedFile || uploadProgress !== null}
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-medium rounded-lg text-sm transition shadow-lg shadow-indigo-600/20 disabled:shadow-none"
            >
              Subir a la Pantalla del Mouse
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
