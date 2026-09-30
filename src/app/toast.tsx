import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';

type Tone = 'success' | 'error';
interface Toast { id: number; message: string; tone: Tone }
const Ctx = createContext<{ push(message: string, tone?: Tone): void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, tone: Tone = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'error' ? 6000 : 2800);
  }, []);
  return (
    <Ctx.Provider value={{ push }}>
      {children}
      <div aria-live="polite" className="fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6">
        {toasts.map((t) => (
          <div key={t.id} role="status"
            className="toast-in flex max-w-md items-center gap-2 rounded-xl bg-ink px-4 py-3 text-sm font-medium text-bg shadow-lg">
            {t.tone === 'error' ? <AlertCircle size={16} className="text-loss" /> : <CheckCircle2 size={16} className="text-gain" />}
            {t.message}
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
