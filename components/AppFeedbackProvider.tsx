import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

type FeedbackTone = 'info' | 'success' | 'warning' | 'danger';

type BaseDialogOptions = {
  title: string;
  message: string;
  tone?: FeedbackTone;
};

type AlertOptions = BaseDialogOptions & {
  buttonLabel?: string;
};

type ConfirmOptions = BaseDialogOptions & {
  confirmLabel?: string;
  cancelLabel?: string;
};

type DialogState =
  | ({ kind: 'alert' } & AlertOptions)
  | ({ kind: 'confirm' } & ConfirmOptions);

type FeedbackContextValue = {
  alert: (options: AlertOptions) => Promise<void>;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
};

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

const toneStyles: Record<FeedbackTone, { icon: string; badge: string; panel: string; confirm: string }> = {
  info: {
    icon: 'fa-circle-info',
    badge: 'bg-blue-50 text-blue-700 border-blue-200',
    panel: 'from-blue-600/10 via-cyan-500/5 to-transparent',
    confirm: 'bg-blue-600 hover:bg-blue-700',
  },
  success: {
    icon: 'fa-circle-check',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    panel: 'from-emerald-600/10 via-green-500/5 to-transparent',
    confirm: 'bg-emerald-600 hover:bg-emerald-700',
  },
  warning: {
    icon: 'fa-triangle-exclamation',
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    panel: 'from-amber-500/15 via-orange-500/5 to-transparent',
    confirm: 'bg-amber-500 hover:bg-amber-600',
  },
  danger: {
    icon: 'fa-trash-can',
    badge: 'bg-rose-50 text-rose-700 border-rose-200',
    panel: 'from-rose-600/15 via-red-500/5 to-transparent',
    confirm: 'bg-rose-600 hover:bg-rose-700',
  },
};

export const AppFeedbackProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const resolverRef = useRef<((value: boolean | void) => void) | null>(null);

  const closeDialog = useCallback((value: boolean | void) => {
    const resolver = resolverRef.current;
    resolverRef.current = null;
    setDialog(null);
    resolver?.(value);
  }, []);

  const alert = useCallback((options: AlertOptions) => {
    setDialog({ kind: 'alert', tone: 'info', ...options });
    return new Promise<void>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    setDialog({ kind: 'confirm', tone: 'warning', ...options });
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  useEffect(() => {
    if (!dialog) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeDialog(dialog.kind === 'confirm' ? false : undefined);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeDialog, dialog]);

  const value = useMemo(() => ({ alert, confirm }), [alert, confirm]);
  const tone = toneStyles[dialog?.tone || 'info'];

  return (
    <FeedbackContext.Provider value={value}>
      {children}

      {dialog && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-[3px]"
            onClick={() => closeDialog(dialog.kind === 'confirm' ? false : undefined)}
          />

          <div className="relative w-full max-w-lg overflow-hidden rounded-[2rem] border border-white/60 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.22)]">
            <div className={`absolute inset-x-0 top-0 h-32 bg-gradient-to-br ${tone.panel}`} />

            <div className="relative p-7">
              <div className="flex items-start gap-4">
                <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.4rem] border ${tone.badge}`}>
                  <i className={`fas ${tone.icon} text-lg`}></i>
                </div>

                <div className="min-w-0 flex-1">
                  <div className={`inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] ${tone.badge}`}>
                    {dialog.kind === 'confirm' ? 'Confirmation' : 'Information'}
                  </div>
                  <h3 className="mt-4 text-2xl font-black tracking-tight text-slate-900">{dialog.title}</h3>
                  <p className="mt-3 text-sm font-medium leading-6 text-slate-500">{dialog.message}</p>
                </div>
              </div>

              <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                {dialog.kind === 'confirm' && (
                  <button
                    onClick={() => closeDialog(false)}
                    className="rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-600 transition hover:bg-slate-50"
                  >
                    {dialog.cancelLabel || 'Annuler'}
                  </button>
                )}

                <button
                  onClick={() => closeDialog(dialog.kind === 'confirm' ? true : undefined)}
                  className={`rounded-2xl px-5 py-3 text-sm font-black text-white shadow-lg transition ${tone.confirm}`}
                >
                  {dialog.kind === 'confirm'
                    ? dialog.confirmLabel || 'Confirmer'
                    : dialog.buttonLabel || 'Fermer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </FeedbackContext.Provider>
  );
};

export const useAppFeedback = () => {
  const context = useContext(FeedbackContext);
  if (!context) {
    throw new Error("useAppFeedback doit être utilisé à l'intérieur de AppFeedbackProvider");
  }
  return context;
};
