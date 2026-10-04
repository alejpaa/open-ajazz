import React, { useState, useRef, useEffect } from 'react';
import { Upload, Clock, Image as ImageIcon, Play, Pause, Trash2, CheckCircle2, Cpu } from 'lucide-react';
import { mouseService, ScreenHardwareInfo } from '../services/mouseProtocol';
import { errorManager } from '../services/errorHandler';

export const ScreenStudio: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [frameDelay, setFrameDelay] = useState(60); // ms
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadStatusText, setUploadStatusText] = useState<string>('');
  const [screenInfo, setScreenInfo] = useState<ScreenHardwareInfo>(mouseService.getScreenInfo());
  const [isVerifying, setIsVerifying] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    setScreenInfo(mouseService.getScreenInfo());
  }, []);

  const handleVerifyScreen = async () => {
    setIsVerifying(true);
    try {
      const info = await mouseService.verifyHardwareConnection();
      setScreenInfo(info);
      if (info.verified) {
        errorManager.showSuccess(
          'Pantalla TFT Verificada',
          `Controlador OLED y memoria Flash confirmados por hardware (OLED: ${info.oledVersion || 'OK'}, Flash: ${info.flashVersion || 'OK'}).`
        );
      }
    } catch (e: any) {
      errorManager.handle(e, 'Verificación de pantalla TFT');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      errorManager.showSuccess('Imagen Cargada', `${file.name} listo para transferir.`);
    }
  };

  const handleSyncClock = async () => {
    try {
      await mouseService.syncClock();
      errorManager.showSuccess('Reloj Sincronizado', 'La hora y fecha de la base magnética se actualizaron correctamente.');
    } catch (err: any) {
      errorManager.handle(err, 'Sincronización de hora en pantalla');
    }
  };

  const isGif = Boolean(
    selectedFile && (selectedFile.type === 'image/gif' || selectedFile.name.toLowerCase().endsWith('.gif'))
  );

  const handleUploadScreen = async () => {
    if (!selectedFile) return;
    setUploadProgress(1);
    setUploadStatusText('Iniciando transferencia a pantalla TFT...');

    try {
      await mouseService.uploadImageToScreen(
        selectedFile,
        frameDelay,
        (progress, statusText) => {
          setUploadProgress(progress);
          if (statusText) setUploadStatusText(statusText);
        }
      );

      setUploadProgress(null);
      setUploadStatusText('');
      errorManager.showSuccess(
        'Transferencia Completada',
        isGif
          ? '¡La animación GIF se cargó y desplegó en la pantalla de la base exitosamente!'
          : '¡La imagen se envió exitosamente a la pantalla TFT del mouse!'
      );
    } catch (err: any) {
      setUploadProgress(null);
      setUploadStatusText('');
      errorManager.handle(err, 'Carga de contenido a pantalla TFT 128x128');
    }
  };

  const handleClear = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setUploadProgress(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-lg backdrop-blur space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <ImageIcon className="w-6 h-6 text-indigo-400" />
              Estudio de Pantalla TFT (128x128 Píxeles)
            </h2>
            <p className="text-sm text-slate-400 mt-1">
              Personaliza la pantalla de la base magnética del mouse con imágenes, animaciones GIF o sincroniza la hora actual.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleVerifyScreen}
              disabled={isVerifying}
              className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition shadow-sm cursor-pointer disabled:opacity-50"
              title="Envía Opcode 0xAD para consultar firmware del controlador TFT"
            >
              <Cpu className={`w-3.5 h-3.5 text-indigo-400 ${isVerifying ? 'animate-spin' : ''}`} />
              {isVerifying ? 'Probando...' : 'Verificar Chip TFT'}
            </button>
            <button
              onClick={handleSyncClock}
              className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition shadow-sm cursor-pointer"
            >
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              Sincronizar Hora
            </button>
          </div>
        </div>

        {/* Hardware Status Strip */}
        <div className="flex items-center gap-3 pt-2 border-t border-slate-800/60 text-xs">
          <span className="text-slate-500 flex items-center gap-1 font-mono">
            <CheckCircle2 className={`w-3.5 h-3.5 ${screenInfo.verified ? 'text-emerald-400' : 'text-slate-600'}`} />
            Estado Pantalla:
          </span>
          {screenInfo.verified ? (
            <span className="text-emerald-400 font-medium">
              Controlador Verificado (OLED: {screenInfo.oledVersion || 'OK'} | Flash: {screenInfo.flashVersion || 'OK'})
            </span>
          ) : (
            <span className="text-amber-400/90 font-medium">
              Sin verificación de respuesta de chip TFT (Haz clic en "Verificar Chip TFT" o conecta el mouse)
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Preview Zone */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 flex flex-col items-center justify-center min-h-[320px]">
          <span className="text-xs uppercase font-semibold text-slate-400 mb-3 tracking-wider">
            Previsualización en Pantalla (Escala Real)
          </span>

          <div className="relative w-44 h-44 rounded-2xl bg-black border-4 border-slate-700 flex items-center justify-center overflow-hidden shadow-2xl ring-2 ring-indigo-500/20">
            {previewUrl ? (
              <img
                ref={imgRef}
                src={previewUrl}
                alt="Vista previa pantalla"
                className="w-32 h-32 object-cover rounded shadow"
                style={{ imageRendering: 'pixelated' }}
                crossOrigin="anonymous"
              />
            ) : (
              <div className="flex flex-col items-center justify-center text-slate-600 gap-2">
                <ImageIcon className="w-10 h-10 stroke-1" />
                <span className="text-xs">Sin imagen activa</span>
              </div>
            )}
            <div className="absolute inset-0 pointer-events-none border border-white/5 rounded-xl" />
          </div>

          <p className="text-xs text-slate-500 mt-3">Resolución nativa: 128 × 128 px (16-bit RGB565)</p>

          {previewUrl && (
            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs flex items-center gap-1 transition cursor-pointer"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                {isPlaying ? 'Pausar' : 'Reproducir'}
              </button>
              <button
                onClick={handleClear}
                className="p-2 bg-red-950/40 hover:bg-red-900/60 text-red-300 border border-red-900/50 rounded-lg text-xs flex items-center gap-1 transition cursor-pointer"
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
            <h3 className="text-sm font-semibold text-slate-300">Cargar Imagen o Animación GIF</h3>

            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-700 hover:border-indigo-500/80 bg-slate-950/50 hover:bg-indigo-950/10 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition group"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".gif,.png,.jpg,.jpeg,.webp"
                onChange={handleFileChange}
                className="hidden"
              />
              <Upload className="w-8 h-8 text-slate-500 group-hover:text-indigo-400 transition mb-2" />
              <p className="text-sm text-slate-300 font-medium">Haz clic o arrastra un archivo aquí</p>
              <p className="text-xs text-slate-500 mt-1">Soporta GIFs animados multicapa, PNG y JPG (128x128)</p>
            </div>

            {selectedFile && (
              <div className="flex items-center justify-between px-3 py-2 bg-slate-800/60 border border-slate-700/60 rounded-lg text-xs">
                <div className="flex items-center gap-2 truncate">
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase ${
                      isGif
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                    }`}
                  >
                    {isGif ? 'GIF Animado' : 'Imagen'}
                  </span>
                  <span className="text-slate-300 truncate font-mono">{selectedFile.name}</span>
                </div>
                <span className="text-slate-400 text-[11px] shrink-0 font-mono">
                  {(selectedFile.size / 1024).toFixed(1)} KB
                </span>
              </div>
            )}

            {isGif && (
              <div className="space-y-2 pt-2 p-3 bg-slate-950/40 border border-slate-800 rounded-lg">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Velocidad de Animación (Retardo):</span>
                  <span className="font-mono text-amber-400 font-semibold">{frameDelay} ms</span>
                </div>
                <input
                  type="range"
                  min="20"
                  max="200"
                  step="5"
                  value={frameDelay}
                  onChange={(e) => setFrameDelay(Number(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>Rápido (20ms / 50 FPS)</span>
                  <span>Estándar (60ms)</span>
                  <span>Lento (200ms / 5 FPS)</span>
                </div>
              </div>
            )}
          </div>

          <div className="pt-6 space-y-4">
            {uploadProgress !== null && (
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-indigo-400 truncate max-w-[80%]">
                    {uploadStatusText || 'Enviando paquetes HID a pantalla TFT...'}
                  </span>
                  <span className="text-slate-300 font-mono">{uploadProgress}%</span>
                </div>
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-amber-500 transition-all duration-150 ease-out"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            )}

            <button
              onClick={handleUploadScreen}
              disabled={!selectedFile || uploadProgress !== null}
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-medium rounded-lg text-sm transition shadow-lg shadow-indigo-600/20 disabled:shadow-none cursor-pointer flex items-center justify-center gap-2"
            >
              <Upload className="w-4 h-4" />
              {uploadProgress !== null
                ? 'Transfiriendo a pantalla...'
                : isGif
                ? 'Subir Animación GIF a la Pantalla'
                : 'Subir Imagen a la Pantalla'}
            </button>
          </div>

        </div>
      </div>
    </div>
  );
};
