'use client';

import { createContext, ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X, AlertTriangle } from 'lucide-react';

type NotificationType = 'success' | 'error' | 'info' | 'warning';

type NotificationItem = {
  id: string;
  title?: string;
  message: string;
  type: NotificationType;
  durationMs?: number;
};

type NotificationInput = {
  title?: string;
  message: string;
  type?: NotificationType;
  durationMs?: number;
};

type ConfirmInput = {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  tone?: 'danger' | 'primary';
};

interface NotificationContextType {
  notifications: NotificationItem[];
  notify: (input: NotificationInput) => string;
  success: (message: string, title?: string) => string;
  error: (message: string, title?: string) => string;
  info: (message: string, title?: string) => string;
  warning: (message: string, title?: string) => string;
  remove: (id: string) => void;
  clear: () => void;
  confirm: (input: ConfirmInput) => Promise<boolean>;
}

const NotificationContext = createContext<NotificationContextType | null>(null);

const typeStyles: Record<NotificationType, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  error: 'border-red-200 bg-red-50 text-red-800',
  info: 'border-blue-200 bg-blue-50 text-blue-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
};

const typeIcons = {
  success: CheckCircle2,
  error: AlertCircle,
  info: Info,
  warning: AlertTriangle,
} satisfies Record<NotificationType, typeof CheckCircle2>;

function NotificationViewport({ items, onRemove }: { items: NotificationItem[]; onRemove: (id: string) => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[120] flex justify-center px-3 sm:justify-end sm:px-4">
      <div className="flex w-full max-w-md flex-col gap-3">
        {items.map((item) => {
          const Icon = typeIcons[item.type];
          return (
            <div
              key={item.id}
              className={`pointer-events-auto rounded-[22px] border px-4 py-3 shadow-lg backdrop-blur-xl ${typeStyles[item.type]}`}
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5 shrink-0">
                  <Icon size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  {item.title ? <p className="text-sm font-semibold">{item.title}</p> : null}
                  <p className="text-sm leading-5">{item.message}</p>
                </div>
                <button
                  type="button"
                  className="rounded-full p-1 transition hover:bg-white/60"
                  onClick={() => onRemove(item.id)}
                  aria-label="Fechar notificação"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ConfirmDialog({
  open,
  title,
  message,
  confirmText,
  cancelText,
  tone,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title?: string;
  message: string;
  confirmText: string;
  cancelText: string;
  tone: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;

  const confirmStyles =
    tone === 'danger'
      ? 'bg-red-600 text-white hover:bg-red-700'
      : 'bg-blue-600 text-white hover:bg-blue-700';

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/45 p-4">
      <div className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-5 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className={`mt-1 rounded-full p-2 ${tone === 'danger' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'}`}>
            <AlertTriangle size={18} />
          </div>
          <div className="min-w-0 flex-1">
            {title ? <h3 className="text-lg font-semibold text-slate-900">{title}</h3> : null}
            <p className="mt-1 text-sm leading-6 text-slate-600">{message}</p>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            onClick={onCancel}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className={`rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${confirmStyles}`}
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [confirmState, setConfirmState] = useState<(ConfirmInput & { open: boolean }) | null>(null);
  const confirmResolverRef = useRef<((value: boolean) => void) | null>(null);
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const remove = useCallback((id: string) => {
    const timer = timersRef.current[id];
    if (timer) {
      clearTimeout(timer);
      delete timersRef.current[id];
    }
    setNotifications((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback(
    ({ title, message, type = 'info', durationMs = 3500 }: NotificationInput) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const item: NotificationItem = { id, title, message, type, durationMs };
      setNotifications((prev) => [...prev, item]);
      timersRef.current[id] = setTimeout(() => remove(id), durationMs);
      return id;
    },
    [remove]
  );

  const clear = useCallback(() => {
    Object.values(timersRef.current).forEach(clearTimeout);
    timersRef.current = {};
    setNotifications([]);
  }, []);

  const closeConfirm = useCallback((value: boolean) => {
    if (confirmResolverRef.current) {
      confirmResolverRef.current(value);
      confirmResolverRef.current = null;
    }
    setConfirmState(null);
  }, []);

  const confirm = useCallback((input: ConfirmInput) => {
    return new Promise<boolean>((resolve) => {
      confirmResolverRef.current = resolve;
      setConfirmState({
        open: true,
        title: input.title,
        message: input.message,
        confirmText: input.confirmText || 'Confirmar',
        cancelText: input.cancelText || 'Cancelar',
        tone: input.tone || 'primary',
      });
    });
  }, []);

  const value = useMemo<NotificationContextType>(
    () => ({
      notifications,
      notify,
      success: (message, title) => notify({ type: 'success', message, title }),
      error: (message, title) => notify({ type: 'error', message, title, durationMs: 4500 }),
      info: (message, title) => notify({ type: 'info', message, title }),
      warning: (message, title) => notify({ type: 'warning', message, title, durationMs: 4200 }),
      remove,
      clear,
      confirm,
    }),
    [notifications, notify, remove, clear, confirm]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <NotificationViewport items={notifications} onRemove={remove} />
      <ConfirmDialog
        open={Boolean(confirmState?.open)}
        title={confirmState?.title}
        message={confirmState?.message || ''}
        confirmText={confirmState?.confirmText || 'Confirmar'}
        cancelText={confirmState?.cancelText || 'Cancelar'}
        tone={confirmState?.tone || 'primary'}
        onConfirm={() => closeConfirm(true)}
        onCancel={() => closeConfirm(false)}
      />
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications must be used within NotificationProvider');
  return context;
}
