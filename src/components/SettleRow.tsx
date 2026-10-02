import { useState, type ReactNode } from 'react';
import { clsx } from 'clsx';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { AvatarButton } from './ui';

/** One "A → B  $amount" payment on a single line. Tapping the row reveals its actions
 *  (record, remind, mark paid); tapping the avatar opens that person's card instead. */
export function SettleRow({ fromName, fromShort, fromAvatar, toShort, amount, done, onAvatar, actions }: {
  fromName: string; fromShort: string; fromAvatar: string | null; toShort: string; amount: string;
  done?: boolean; onAvatar(): void; actions: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={clsx('border-b border-line last:border-b-0', open && 'bg-surface-2/40')}>
      <div className={clsx('flex items-center gap-3 px-4 py-3 md:px-5', done && 'opacity-60')}>
        <AvatarButton name={fromName} src={fromAvatar} size={32} onClick={onAvatar} />
        <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <span className="min-w-0 flex-1 truncate text-sm">
            <b className="font-semibold text-loss">{fromShort}</b>
            <ArrowRight size={14} className="mx-1 inline text-ink-2" aria-label="pays" />
            <b className="font-semibold text-gain">{toShort}</b>
          </span>
          <span className={clsx('amount shrink-0 font-display text-base font-medium', done && 'line-through')}>{amount}</span>
          <ChevronDown size={16} className={clsx('shrink-0 text-ink-2 transition-transform', open && 'rotate-180')} aria-hidden="true" />
        </button>
      </div>
      {open && <div className="flex flex-wrap justify-end gap-2 px-4 pb-3 md:px-5">{actions}</div>}
    </div>
  );
}
