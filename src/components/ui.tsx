import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes, type KeyboardEvent as ReactKeyboardEvent, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Link } from 'react-router-dom';
import { clsx } from 'clsx';
import { ArrowLeft, X, Loader2 } from 'lucide-react';
import { formatMoney } from '../lib/money';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md'; loading?: boolean }>(
  function Button({ variant = 'secondary', size = 'md', loading, className, children, disabled, ...p }, ref) {
    return (
      <button ref={ref} disabled={disabled || loading}
        className={clsx(
          'inline-flex shrink-0 items-center justify-center gap-2 rounded-lg font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
          size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-10 px-4 text-sm',
          variant === 'primary' && 'bg-felt text-felt-ink hover:bg-felt/90',
          variant === 'secondary' && 'border border-line bg-surface text-ink hover:bg-surface-2',
          variant === 'ghost' && 'text-ink-2 hover:bg-surface-2 hover:text-ink',
          variant === 'danger' && 'border border-loss/40 text-loss hover:bg-loss/10',
          className,
        )} {...p}>
        {loading && <Loader2 size={16} className="animate-spin" />}
        {children}
      </button>
    );
  });

export function IconButton({ label, className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button aria-label={label} title={label}
    className={clsx('inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-2 hover:bg-surface-2 hover:text-ink disabled:opacity-40', className)} {...p} />;
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={clsx('rounded-2xl border border-line bg-surface', className)}>{children}</section>;
}

export function CardHeader({ title, action, className }: { title: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={clsx('flex items-center justify-between gap-3 px-4 pt-4 md:px-5', className)}>
      <h2 className="font-display text-base font-medium text-ink">{title}</h2>
      {action}
    </div>
  );
}

const field = 'w-full rounded-lg border border-line bg-surface text-sm text-ink placeholder:text-ink-2/60 focus:border-felt focus:outline-none focus:ring-2 focus:ring-felt/30 disabled:bg-surface-2 disabled:text-ink-2';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={clsx(field, 'h-10 px-3', className)} {...p} />;
});

export function MoneyInput({ className, compact, ...p }: InputHTMLAttributes<HTMLInputElement> & { compact?: boolean }) {
  return (
    <div className={clsx('relative', className)}>
      <span className={clsx('pointer-events-none absolute top-1/2 -translate-y-1/2 text-sm text-ink-2', compact ? 'left-2' : 'left-3')}>$</span>
      <input inputMode="decimal" autoComplete="off" className={clsx(field, 'amount pr-2 text-right', compact ? 'h-9 pl-5' : 'h-10 pl-6')} {...p} />
    </div>
  );
}

/** For a column of number boxes (buy-ins, scores): give each the same `data-entry` and this as
 *  onKeyDown, and the keyboard's Next/Enter key jumps to the next visible box in that column
 *  instead of closing the keyboard -- no scrolling between players. The last one closes it. */
export function enterToNext(e: ReactKeyboardEvent<HTMLInputElement>) {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const entry = e.currentTarget.dataset.entry;
  const all = [...document.querySelectorAll<HTMLInputElement>(`input[data-entry="${entry}"]`)].filter((x) => x.offsetParent !== null);
  const next = all[all.indexOf(e.currentTarget) + 1];
  if (next) next.focus(); else e.currentTarget.blur();
}

export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={clsx(field, 'h-10 px-3', className)} {...p}>{children}</select>;
}

export function Textarea({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={clsx(field, 'min-h-[72px] px-3 py-2', className)} {...p} />;
}

export function Field({ label, error, hint, children, className }: { label: string; error?: string | null; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={clsx('block', className)}>
      <span className="mb-1.5 block text-[13px] font-semibold text-ink">{label}</span>
      {children}
      {error ? <span className="mt-1 block text-[13px] text-loss">{error}</span>
        : hint ? <span className="mt-1 block text-[13px] text-ink-2">{hint}</span> : null}
    </label>
  );
}

export function Amount({ cents, currency = 'USD', sign, className }: { cents: number; currency?: string; sign?: boolean; className?: string }) {
  return (
    <span className={clsx('amount font-display font-medium', cents > 0 ? 'text-gain' : cents < 0 ? 'text-loss' : 'text-ink-2', className)}>
      {formatMoney(cents, currency, { sign })}
    </span>
  );
}

/** "owes you $20" / "you owe $20" / "settled up" (perspective "you"), or "gets back $20" / "owes $20" (perspective "them"). */
export function BalanceText({ cents, currency = 'USD', perspective = 'you' }: { cents: number; currency?: string; perspective?: 'you' | 'them' }) {
  if (cents === 0) return <span className="text-[13px] text-ink-2">settled up</span>;
  const label = perspective === 'you' ? (cents > 0 ? 'owes you' : 'you owe') : (cents > 0 ? 'gets back' : 'owes');
  return (
    <span className="text-right leading-tight">
      <span className={clsx('block text-[12px] font-semibold', cents > 0 ? 'text-gain' : 'text-loss')}>{label}</span>
      <span className={clsx('amount font-display text-base font-medium', cents > 0 ? 'text-gain' : 'text-loss')}>{formatMoney(Math.abs(cents), currency)}</span>
    </span>
  );
}

export function Avatar({ name, src, size = 36, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  if (src) {
    return (
      <img src={src} alt="" referrerPolicy="no-referrer" style={{ width: size, height: size }}
        className={clsx('inline-block shrink-0 rounded-full object-cover', className)} />
    );
  }
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0]!.toUpperCase()).join('') || '?';
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 4;
  const tones = ['bg-felt/10 text-felt', 'bg-brass/15 text-brass', 'bg-gain/10 text-gain', 'bg-ink/5 text-ink'];
  return (
    <span aria-hidden="true" style={{ width: size, height: size, fontSize: Math.max(11, size * 0.36) }}
      className={clsx('inline-flex shrink-0 items-center justify-center rounded-full font-display font-medium', tones[hue], className)}>
      {initials}
    </span>
  );
}

/** An avatar that opens that person's card. Names stay plain text; the avatar is the way in. */
export function AvatarButton({ name, src, size = 32, onClick }: { name: string; src?: string | null; size?: number; onClick(): void }) {
  return (
    <button type="button" aria-label={`About ${name}`} onClick={onClick} className="shrink-0 rounded-full active:opacity-70">
      <Avatar name={name} src={src} size={size} />
    </button>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'gain' | 'loss' | 'brass' | 'felt'; children: ReactNode }) {
  return (
    <span className={clsx('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] font-semibold',
      tone === 'neutral' && 'bg-surface-2 text-ink-2', tone === 'gain' && 'bg-gain/10 text-gain',
      tone === 'loss' && 'bg-loss/10 text-loss', tone === 'brass' && 'bg-brass/15 text-brass', tone === 'felt' && 'bg-felt/10 text-felt')}>
      {children}
    </span>
  );
}

export function Modal({ open, onClose, title, children, footer, wide }: { open: boolean; onClose(): void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 backdrop-blur-sm md:items-center md:p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={title}
        className={clsx('sheet-in flex max-h-[92dvh] w-full flex-col rounded-t-2xl border border-line bg-surface shadow-2xl md:rounded-2xl', wide ? 'md:max-w-2xl' : 'md:max-w-lg')}>
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="font-display text-base font-medium text-ink md:text-lg">{title}</h2>
          <IconButton label="Close" onClick={onClose}><X size={18} /></IconButton>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { value: T; label: string }[]; value: T; onChange(v: T): void }) {
  const list = useRef<HTMLDivElement>(null);
  // When the tabs overflow on a phone, keep the selected one scrolled into view (horizontally only).
  useEffect(() => {
    const c = list.current;
    const el = c?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (c && el && c.scrollWidth > c.clientWidth) c.scrollLeft = el.offsetLeft - (c.clientWidth - el.offsetWidth) / 2;
  }, [value]);
  return (
    <div ref={list} role="tablist" className="no-scrollbar flex gap-1 overflow-x-auto rounded-xl bg-surface-2 p-1">
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}
          className={clsx('h-11 flex-1 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition-colors md:h-9 md:text-[13px]',
            value === t.value ? 'bg-surface text-ink shadow-sm' : 'text-ink-2 hover:text-ink')}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <div className="mb-3 text-ink-2">{icon}</div>
      <p className="font-display text-base font-medium text-ink">{title}</p>
      <p className="mt-1 max-w-xs text-sm text-ink-2">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** "Back to …" link above a page title. Sized as a real tap target, not just an arrow glyph. */
export function BackLink({ to, label, className }: { to: string; label: ReactNode; className?: string }) {
  return (
    <Link to={to}
      className={clsx('-ml-2 mb-2 inline-flex h-10 max-w-full items-center gap-1.5 rounded-lg pl-1.5 pr-3 text-sm font-semibold text-ink-2 hover:bg-surface-2 hover:text-ink active:bg-surface-2', className)}>
      <ArrowLeft size={20} className="shrink-0" aria-hidden="true" /><span className="truncate">{label}</span>
    </Link>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <header className="mb-4 flex flex-wrap items-end justify-between gap-3 md:mb-5">
      <div className="min-w-0">
        {back}
        <h1 className="truncate font-display text-[22px] font-medium leading-tight tracking-tight text-ink md:text-[30px]">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function Row({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp onClick={onClick} className={clsx('flex w-full items-center gap-3 border-b border-line px-4 py-3 text-left last:border-b-0 md:px-5', onClick && 'hover:bg-surface-2/60', className)}>
      {children}
    </Comp>
  );
}

export function Spinner() {
  return <div className="flex justify-center py-16"><Loader2 className="animate-spin text-felt" size={28} /></div>;
}
