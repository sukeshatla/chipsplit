import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
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

export function ActionButton({ icon, children, primary, className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: ReactNode; primary?: boolean }) {
  return (
    <button type="button"
      className={clsx('flex h-10 flex-1 items-center justify-center gap-1.5 whitespace-nowrap px-3 text-[13px] font-semibold transition-colors first:rounded-l-xl last:rounded-r-xl sm:flex-none',
        primary ? 'bg-felt text-felt-ink hover:bg-felt/90' : 'text-ink hover:bg-surface-2', className)} {...p}>
      {icon}{children}
    </button>
  );
}

/** Share, opening a small menu: email the summary, or share it as a picture. */
export function ShareMenu({ onEmail, onImage }: { onEmail(): void; onImage(): void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc); };
  }, [open]);
  const pick = (f: () => void) => () => { setOpen(false); f(); };

  return (
    <div ref={ref} className="relative flex flex-1 sm:flex-none">
      <ActionButton icon={<Share2 size={16} aria-hidden="true" />} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className="w-full rounded-l-xl">
        Share<ChevronDown size={14} className="text-ink-2" aria-hidden="true" />
      </ActionButton>
      {open && (
        <div role="menu" className="absolute left-0 top-full z-20 mt-1 w-48 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-lg">
          <button role="menuitem" type="button" onClick={pick(onEmail)} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-surface-2">
            <Mail size={16} className="text-ink-2" aria-hidden="true" />Email summary
          </button>
          <button role="menuitem" type="button" onClick={pick(onImage)} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-surface-2">
            <Image size={16} className="text-ink-2" aria-hidden="true" />Share image
          </button>
        </div>
      )}
    </div>
  );
}
