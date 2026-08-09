import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X, Trash2 } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  title?: string;
  duration?: number;
}

export interface ConfirmConfig {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel?: () => void;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, title?: string, duration?: number) => void;
  showConfirm: (config: ConfirmConfig) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let globalToastHandler: ((message: string, type?: ToastType, title?: string, duration?: number) => void) | null = null;

/** Helper function that can be imported anywhere, including non-React utilities */
export function softToast(message: string, type: ToastType = 'info', title?: string, duration?: number) {
  if (globalToastHandler) {
    globalToastHandler(message, type, title, duration);
  } else {
    console.log(`[Soft Toast] ${type.toUpperCase()}: ${message}`);
  }
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmModal, setConfirmModal] = useState<ConfirmConfig | null>(null);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', title?: string, duration: number = 3500) => {
      const id = Date.now().toString() + Math.random().toString(36).substring(2, 5);
      setToasts((prev) => [...prev.slice(-3), { id, message, type, title, duration }]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast]
  );

  const showConfirm = useCallback((config: ConfirmConfig) => {
    setConfirmModal(config);
  }, []);

  useEffect(() => {
    globalToastHandler = showToast;
    return () => {
      globalToastHandler = null;
    };
  }, [showToast]);

  const handleConfirmAction = () => {
    if (confirmModal) {
      confirmModal.onConfirm();
      setConfirmModal(null);
    }
  };

  const handleCancelAction = () => {
    if (confirmModal) {
      if (confirmModal.onCancel) confirmModal.onCancel();
      setConfirmModal(null);
    }
  };

  return (
    <ToastContext.Provider value={{ showToast, showConfirm }}>
      {children}

      {/* Floating Soft Toast Bar */}
      <div className="fixed top-4 right-4 left-4 sm:left-auto z-[99999] pointer-events-none flex flex-col gap-2.5 sm:max-w-md w-full">
        <AnimatePresence>
          {toasts.map((toast) => {
            const isSuccess = toast.type === 'success';
            const isError = toast.type === 'error';
            const isWarning = toast.type === 'warning';

            return (
              <motion.div
                key={toast.id}
                initial={{ opacity: 0, y: -20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className={`pointer-events-auto flex items-start gap-3 p-3.5 sm:p-4 rounded-2xl shadow-xl backdrop-blur-xl border transition-all ${
                  isSuccess
                    ? 'bg-emerald-500/15 dark:bg-emerald-950/85 border-emerald-500/30 dark:border-emerald-700/50 text-emerald-900 dark:text-emerald-100'
                    : isError
                    ? 'bg-rose-500/15 dark:bg-rose-950/85 border-rose-500/30 dark:border-rose-700/50 text-rose-900 dark:text-rose-100'
                    : isWarning
                    ? 'bg-amber-500/15 dark:bg-amber-950/85 border-amber-500/30 dark:border-amber-700/50 text-amber-900 dark:text-amber-100'
                    : 'bg-slate-900/90 dark:bg-slate-900/95 border-slate-700/80 text-white'
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {isSuccess && <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />}
                  {isError && <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400" />}
                  {isWarning && <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />}
                  {toast.type === 'info' && <Info className="w-5 h-5 text-sky-400" />}
                </div>

                <div className="flex-1 min-w-0 pr-1">
                  {toast.title && (
                    <h4 className="text-[11px] font-extrabold uppercase tracking-wider mb-0.5 opacity-80">
                      {toast.title}
                    </h4>
                  )}
                  <p className="text-xs sm:text-sm font-semibold leading-snug break-words">
                    {toast.message}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => removeToast(toast.id)}
                  className="p-1 rounded-lg opacity-60 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 transition-all cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Soft Modal Confirm Dialog */}
      <AnimatePresence>
        {confirmModal && (
          <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 12 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-5 sm:p-6 shadow-2xl border border-slate-200/80 dark:border-slate-800 space-y-4"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`p-3 rounded-2xl shrink-0 ${
                    confirmModal.type === 'danger'
                      ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-600 dark:text-rose-400'
                      : 'bg-amber-100 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {confirmModal.type === 'danger' ? (
                    <Trash2 className="w-5 h-5" />
                  ) : (
                    <AlertTriangle className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white font-display">
                    {confirmModal.title || 'Konfirmasi'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    Harap konfirmasi tindakan Anda.
                  </p>
                </div>
              </div>

              <p className="text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-2xl border border-slate-200/60 dark:border-slate-700/60">
                {confirmModal.message}
              </p>

              <div className="flex items-center justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleCancelAction}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all cursor-pointer"
                >
                  {confirmModal.cancelText || 'Batal'}
                </button>
                <button
                  type="button"
                  onClick={handleConfirmAction}
                  className={`px-4 py-2 rounded-xl text-xs font-bold text-white transition-all cursor-pointer shadow-md ${
                    confirmModal.type === 'danger'
                      ? 'bg-rose-600 hover:bg-rose-700'
                      : 'bg-amber-600 hover:bg-amber-700'
                  }`}
                >
                  {confirmModal.confirmText || 'Ya, Hapus'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
