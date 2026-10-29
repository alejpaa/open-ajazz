import { useState, useRef, useEffect, useMemo } from 'react';
import { Upload, Clock, Image as ImageIcon, Trash2, Cpu } from 'lucide-react';
import { mouseService } from '../services/mouseProtocol';
import { deviceStore, useDeviceStore } from '../services/deviceStore';
import { errorManager } from '../services/errorHandler';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const isGifFile = (f: File) => f.type === 'image/gif' || f.name.toLowerCase().endsWith('.gif');

export function ScreenStudio() {
  const { screenImage, screenInfo } = useDeviceStore();
  const [file, setFile] = useState<File | null>(null);
  const [frameDelay, setFrameDelay] = useState(60);
  const [progress, setProgress] = useState<number | null>(null);
  const [status, setStatus] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const pendingUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    if (!pendingUrl) return;
    return () => URL.revokeObjectURL(pendingUrl);
  }, [pendingUrl]);

  const isGif = file ? isGifFile(file) : false;
  const isUploading = progress !== null;
  const previewUrl = pendingUrl ?? screenImage;

  const selectFile = (candidate: File | undefined) => {
    if (!candidate) return;
    if (!candidate.type.startsWith('image/')) {
      errorManager.handle(new Error('Formato de image no soportado'), 'Selección de archivo');
      return;
    }
    if (candidate.size > MAX_FILE_BYTES) {
      errorManager.handle(new Error('image demasiado grande (máximo 10 MB)'), 'Selección de archivo');
      return;
    }
    setFile(candidate);
  };

  const clearSelection = () => {
    setFile(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const verifyScreen = async () => {
    setIsVerifying(true);
    try {
      const info = await mouseService.verifyHardwareConnection();
      deviceStore.setScreenInfo(info);
      if (info.verified) {
        errorManager.showSuccess('Pantalla verificada', `OLED ${info.oledVersion ?? 'OK'}, Flash ${info.flashVersion ?? 'OK'}.`);
      } else {
        errorManager.handle(new Error(info.details || 'Sin respuesta del chip TFT'), 'Verificación de pantalla');
      }
    } finally {
      setIsVerifying(false);
    }
  };

  const syncClock = async () => {
    try {
      await mouseService.syncClock();
      errorManager.showSuccess('Reloj sincronizado', 'La hora de la base se actualizó.');
    } catch (e) {
      errorManager.handle(e, 'Sincronización de hora');
    }
  };

  const upload = async () => {
    if (!file) return;
    setProgress(1);
    setStatus('Iniciando transferencia…');
    try {
      await mouseService.uploadImageToScreen(file, frameDelay, (pct, text) => {
        setProgress(pct);
        if (text) setStatus(text);
      });
      await deviceStore.rememberScreenImage(file);
      errorManager.showSuccess('Transferencia completada', isGif ? 'La animación está en la pantalla.' : 'La imagen está en la pantalla.');
      clearSelection();
    } catch (e) {
      errorManager.handle(e, 'Carga de contenido a la pantalla TFT');
    } finally {
      setProgress(null);
      setStatus('');
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Pantalla TFT</h2>
          <p className="text-sm text-neutral-400 mt-1">Imagen o GIF de 128 × 128 px para la base del mouse.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={verifyScreen}
            disabled={isVerifying}
            className="flex items-center gap-2 px-3.5 py-2 rounded-md text-sm bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-neutral-100 transition cursor-pointer"
          >
            <Cpu className="w-4 h-4" aria-hidden />
            {isVerifying ? 'Verificando…' : 'Verificar'}
          </button>
          <button
            onClick={syncClock}
            className="flex items-center gap-2 px-3.5 py-2 rounded-md text-sm bg-neutral-800 hover:bg-neutral-700 text-neutral-100 transition cursor-pointer"
          >
            <Clock className="w-4 h-4" aria-hidden />
            Sincronizar hora
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 flex flex-col items-center justify-center gap-3 min-h-[300px]">
          <span className="text-xs font-medium text-neutral-400 uppercase tracking-wide">
            {pendingUrl ? 'Seleccionada (sin enviar)' : 'En la pantalla'}
          </span>
          <div className="w-32 h-32 rounded-lg bg-black border border-neutral-700 flex items-center justify-center overflow-hidden">
            {previewUrl ? (
              <img src={previewUrl} alt="Vista previa de la pantalla" className="w-full h-full object-cover" />
            ) : (
              <ImageIcon className="w-8 h-8 text-neutral-700" aria-hidden />
            )}
          </div>
          <p className="text-xs text-neutral-500 text-center">
            {previewUrl
              ? 'Escala real (128 × 128 px, recorte centrado)'
              : 'Aún no has enviado ninguna imagen desde esta app.'}
          </p>
          {file && (
            <button
              onClick={clearSelection}
              disabled={isUploading}
              className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-neutral-100 disabled:opacity-50 px-2 py-1 rounded hover:bg-neutral-800 transition cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden />
              Descartar selección
            </button>
          )}
        </section>

        <section className="bg-neutral-900 border border-neutral-800 rounded-xl p-5 flex flex-col gap-4">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              selectFile(e.dataTransfer.files[0]);
            }}
            className={`border border-dashed rounded-lg p-6 flex flex-col items-center gap-1.5 transition cursor-pointer ${
              isDragging ? 'border-brand-500 bg-neutral-800/60' : 'border-neutral-700 hover:border-neutral-500'
            }`}
          >
            <Upload className="w-6 h-6 text-neutral-500" aria-hidden />
            <span className="text-sm text-neutral-200">Elige o arrastra un archivo</span>
            <span className="text-xs text-neutral-500">GIF, PNG, JPG o WebP · máx. 10 MB</span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".gif,.png,.jpg,.jpeg,.webp"
            onChange={(e) => selectFile(e.target.files?.[0])}
            className="hidden"
          />

          {file && (
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="text-neutral-300 truncate font-mono">{file.name}</span>
              <span className="text-neutral-500 shrink-0 font-mono">{(file.size / 1024).toFixed(1)} KB</span>
            </div>
          )}

          {isGif && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <label htmlFor="frame-delay" className="text-neutral-400">Retardo entre fotogramas</label>
                <span className="font-mono text-neutral-200">{frameDelay} ms</span>
              </div>
              <input
                id="frame-delay"
                type="range"
                min="20"
                max="200"
                step="5"
                value={frameDelay}
                onChange={(e) => setFrameDelay(Number(e.target.value))}
                className="w-full accent-brand-500 cursor-pointer"
              />
            </div>
          )}

          <div className="mt-auto space-y-3">
            {isUploading && (
              <div className="space-y-1.5" role="status">
                <div className="flex justify-between text-xs">
                  <span className="text-neutral-400 truncate">{status}</span>
                  <span className="text-neutral-200 font-mono">{progress}%</span>
                </div>
                <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                  <div className="h-full bg-brand-500 transition-all duration-150" style={{ width: `${progress}%` }} />
                </div>
              </div>
            )}
            <button
              onClick={upload}
              disabled={!file || isUploading}
              className="w-full py-2.5 rounded-md text-sm font-medium bg-brand-600 hover:bg-brand-500 disabled:bg-neutral-800 disabled:text-neutral-600 text-white transition cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Upload className="w-4 h-4" aria-hidden />
              {isUploading ? 'Enviando…' : isGif ? 'Enviar animación' : 'Enviar imagen'}
            </button>
          </div>
        </section>
      </div>

      <p className="text-xs text-neutral-500">
        Estado del chip:{' '}
        {screenInfo.verified
          ? `verificado (OLED ${screenInfo.oledVersion ?? 'OK'}, Flash ${screenInfo.flashVersion ?? 'OK'})`
          : 'sin verificar'}
      </p>
    </div>
  );
}
