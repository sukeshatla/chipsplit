import { forwardRef, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { ChevronDown, Image, Mail, Share2 } from 'lucide-react';

/** One strip of compact icon buttons for a page's actions -- Share first, then the rest. */
export function ActionBar({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-stretch divide-x divide-line rounded-xl border border-line bg-surface">
      {children}
    </div>
  );
}

export const ActionButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { icon: ReactNode; primary?: boolean }>(
  function ActionButton({ icon, children, primary, className, ...p }, ref) {
  return (
    <button ref={ref} type="button"
      className={clsx('flex h-10 flex-1 items-center justify-center gap-1.5 whitespace-nowrap px-3 text-[13px] font-semibold transition-colors first:rounded-l-xl last:rounded-r-xl sm:flex-none',
        primary ? 'bg-felt text-felt-ink hover:bg-felt/90' : 'text-ink hover:bg-surface-2', className)} {...p}>
      {icon}{children}
    </button>
  );
});

const MENU_W = 192;

/** Share, opening a small menu: share it as a picture (first), or email the summary. */
export function ShareMenu({ onEmail, onImage }: { onEmail(): void; onImage(): void }) {
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const open = at !== null;
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent | TouchEvent) => { if (!ref.current?.contains(e.target as Node)) setAt(null); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAt(null); };
    const close = () => setAt(null);
    document.addEventListener('mousedown', away);
    document.addEventListener('touchstart', away);
    document.addEventListener('keydown', esc);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', away); document.removeEventListener('touchstart', away); document.removeEventListener('keydown', esc);
      window.removeEventListener('resize', close); window.removeEventListener('scroll', close, true);
    };
  }, [open]);
  // Placed against the screen, not the button's row, and kept 8px inside both edges, so the whole
  // menu is always visible on a phone (SPEC SHARE-11).
  const toggle = () => {
    if (open) { setAt(null); return; }
    const r = button.current!.getBoundingClientRect();
    setAt({ left: Math.max(8, Math.min(r.left, window.innerWidth - MENU_W - 8)), top: r.bottom + 4 });
  };
  const pick = (f: () => void) => () => { setAt(null); f(); };

  return (
    <div ref={ref} className="flex flex-1 sm:flex-none">
      <ActionButton ref={button} icon={<Share2 size={16} aria-hidden="true" />} aria-haspopup="menu" aria-expanded={open} onClick={toggle}
        className="w-full rounded-l-xl">
        Share<ChevronDown size={14} className="text-ink-2" aria-hidden="true" />
      </ActionButton>
      {at && (
        <div role="menu" style={{ left: at.left, top: at.top, width: MENU_W }}
          className="fixed z-50 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-lg">
          <button role="menuitem" type="button" onClick={pick(onImage)} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-surface-2">
            <Image size={16} className="text-ink-2" aria-hidden="true" />Share image
          </button>
          <button role="menuitem" type="button" onClick={pick(onEmail)} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-surface-2">
            <Mail size={16} className="text-ink-2" aria-hidden="true" />Email summary
          </button>
        </div>
      )}
    </div>
  );
}
