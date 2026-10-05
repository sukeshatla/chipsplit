import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';

type Tone = 'success' | 'error';
/** An optional button on the toast, e.g. Undo; tapping it runs `onClick` and dismisses the toast. */
interface ToastAction { label: string; onClick(): void }
interface Toast { id: number; message: string; tone: Tone; action?: ToastAction }
const Ctx = createContext<{ push(message: string, tone?: Tone, action?: ToastAction): void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback((message: string, tone: Tone = 'success', action?: ToastAction) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone, action }]);
    // Long enough to reach an Undo; plain confirmations clear quickly.
    setTimeout(() => dismiss(id), tone === 'error' || action ? 6000 : 2800);
  }, [dismiss]);
  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[60] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div key={t.id} role="status"
            className="toast-in pointer-events-auto flex max-w-md items-center gap-2 rounded-xl bg-ink px-4 py-3 text-sm font-medium text-bg shadow-lg">
            {t.tone === 'error' ? <AlertCircle size={16} className="text-loss" /> : <CheckCircle2 size={16} className="text-gain" />}
            {t.message}
            {t.action && (
              <button type="button" className="ml-2 rounded-md px-2 py-0.5 font-bold text-gain hover:bg-bg/10"
                onClick={() => { t.action!.onClick(); dismiss(t.id); }}>
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useToast must be inside ToastProvider');
  return c;
}
