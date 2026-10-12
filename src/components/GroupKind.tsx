import { clsx } from 'clsx';
import { Club, Receipt, Spade } from 'lucide-react';
import type { GroupKind } from '../lib/types';

/** What each group type is called everywhere ('club' is the database name for Poker). */
export const KIND_LABEL: Record<GroupKind, string> = { club: 'Poker', rummy: 'Rummy', expenses: 'Expense' };

export const KIND_ICON: Record<GroupKind, typeof Spade> = { club: Spade, rummy: Club, expenses: Receipt };
const KIND_TONE: Record<GroupKind, string> = { club: 'felt', rummy: 'bg-brass/15 text-brass', expenses: 'bg-surface-2 text-ink' };

export function GroupIcon({ kind, size = 40 }: { kind: GroupKind; size?: number }) {
  const Icon = KIND_ICON[kind];
  return (
    <span style={{ width: size, height: size }} className={clsx('inline-flex shrink-0 items-center justify-center rounded-xl', KIND_TONE[kind])}>
      <Icon size={size * 0.5} strokeWidth={2.4} aria-hidden="true" />
    </span>
  );
}

/** The group's type, clear but quiet: an outlined pill, never green, so only the page's main
 *  action button stands out (SPEC GROUP-3). */
export function KindBadge({ kind }: { kind: GroupKind }) {
  const Icon = KIND_ICON[kind];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-ink/25 px-2.5 py-0.5 text-[12px] font-bold uppercase tracking-wide text-ink">
      <Icon size={13} strokeWidth={2.6} aria-hidden="true" />{KIND_LABEL[kind]}
    </span>
  );
}
