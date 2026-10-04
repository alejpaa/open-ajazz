import React, { useState, useEffect } from 'react';
import { errorManager, AppError } from '../services/errorHandler';
import { logger } from '../services/logger';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X, ChevronDown, ChevronUp, Copy, Check, Send } from 'lucide-react';

export const ErrorNotification: React.FC = () => {
  const [error, setError] = useState<AppError | null>(null);
  const [showDetails, setShowDetails] = useState<boolean>(false);
  const [copiedReport, setCopiedReport] = useState<boolean>(false);
  const [copiedDetails, setCopiedDetails] = useState<boolean>(false);

  useEffect(() => {
    return errorManager.subscribe((err) => {
      setError(err);
      setShowDetails(false);

      if (err && (err.severity === 'success' || err.severity === 'info')) {
        const timer = setTimeout(() => {
          errorManager.clear();
        }, 5000);
        return () => clearTimeout(timer);
      }
    });
  }, []);

  if (!error) return null;

  const handleCopyDiagnosticReport = () => {
    const report = logger.generateDiagnosticReport(error);
    navigator.clipboard.writeText(report);
    setCopiedReport(true);
    setTimeout(() => setCopiedReport(false), 2500);
  };

  const handleCopyDetails = () => {
    if (error.technicalDetails) {
      navigator.clipboard.writeText(error.technicalDetails);
      setCopiedDetails(true);
      setTimeout(() => setCopiedDetails(false), 2000);
    }
  };

  const getIcon = () => {
    switch (error.severity) {
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />;
      case 'success':
        return <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />;
      case 'info':
      default:
        return <Info className="w-5 h-5 text-indigo-400 shrink-0" />;
    }
  };

  const getBorderColor = () => {
    switch (error.severity) {
      case 'error':
        return 'border-red-500/60 bg-slate-900/95 shadow-red-950/50';
      case 'warning':
        return 'border-amber-500/60 bg-slate-900/95 shadow-amber-950/50';
      case 'success':
        return 'border-emerald-500/60 bg-slate-900/95 shadow-emerald-950/50';
      case 'info':
      default:
        return 'border-indigo-500/60 bg-slate-900/95 shadow-indigo-950/50';
    }
  };

  return (
    <div className="fixed top-5 right-5 z-50 max-w-md w-full animate-in fade-in slide-in-from-top-4 duration-200">
      <div className={`border rounded-xl p-4 shadow-2xl backdrop-blur-md transition-all ${getBorderColor()}`}>
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            {getIcon()}
            <div>
              <h4 className="text-sm font-bold text-white tracking-tight">{error.title}</h4>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">{error.message}</p>
            </div>
          </div>
          <button
            onClick={() => errorManager.clear()}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Suggested Solution Box */}
        {error.solution && (
          <div className="mt-3.5 bg-black/40 border border-white/10 rounded-lg p-3 text-xs space-y-1">
            <span className="font-semibold text-slate-200 flex items-center gap-1.5">
              💡 Solución recomendada:
            </span>
            <p className="text-slate-300 whitespace-pre-line leading-relaxed text-[11px]">
              {error.solution}
            </p>
          </div>
        )}

        {/* Action button to copy diagnostic report to send to assistant */}
        {error.severity === 'error' && (
          <div className="mt-3">
            <button
              onClick={handleCopyDiagnosticReport}
              className={`w-full py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer border ${
                copiedReport
                  ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300'
                  : 'bg-indigo-600/30 hover:bg-indigo-600/50 border-indigo-500/60 text-indigo-200'
              }`}
            >
              {copiedReport ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>¡Reporte copiado! Pégalo aquí en el chat</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Copiar reporte completo para el asistente</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Collapsible Technical Details */}
        {error.technicalDetails && (
          <div className="mt-3 pt-2 border-t border-white/10">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="flex items-center justify-between w-full text-[11px] text-slate-400 hover:text-slate-200 transition cursor-pointer"
            >
              <span>Detalles técnicos internos</span>
              {showDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showDetails && (
              <div className="mt-2 space-y-2">
                <pre className="p-2.5 bg-black/60 rounded border border-white/5 font-mono text-[10px] text-slate-400 overflow-x-auto max-h-36 whitespace-pre-wrap">
                  {error.technicalDetails}
                </pre>
                <button
                  onClick={handleCopyDetails}
                  className="flex items-center gap-1.5 text-[10px] font-mono text-indigo-400 hover:text-indigo-300 transition cursor-pointer"
                >
                  {copiedDetails ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  {copiedDetails ? 'Copiado al portapapeles' : 'Copiar solo este mensaje técnico'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
