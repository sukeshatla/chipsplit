import { clsx } from 'clsx';
import { AlertTriangle, Lock, type LucideIcon } from 'lucide-react';
import { Button, Modal } from './ui';
import type { ReactNode } from 'react';

/**
 * A styled stand-in for window.confirm() for destructive or otherwise consequential actions:
 * an icon, a clear title, and body copy that can include specifics (counts, warnings).
 * When `blocked` is set, the confirm button is replaced with a locked, non-actionable state
 * and `blocked` itself becomes the explanation -- for "you can't do this yet" cases like an
 * unsettled group or game, as opposed to "are you sure" cases.
 */
export function ConfirmDialog({
  open, onClose, onConfirm, title, body, confirmLabel = 'Delete', tone = 'danger', busy, icon: Icon = AlertTriangle, blocked,
}: {
  open: boolean;
  onClose(): void;
  onConfirm(): void;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
  busy?: boolean;
  icon?: LucideIcon;
  blocked?: ReactNode;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        {!blocked && (
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} loading={busy} onClick={onConfirm}>{confirmLabel}</Button>
        )}
      </>}>
      <div className="flex gap-3.5">
        <span className={clsx('flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
          blocked ? 'bg-brass/15 text-brass' : tone === 'danger' ? 'bg-loss/10 text-loss' : 'bg-felt/10 text-felt dark:text-gain')}>
          {blocked ? <Lock size={20} aria-hidden="true" /> : <Icon size={20} aria-hidden="true" />}
        </span>
        <div className="min-w-0 flex-1 pt-1.5 text-[15px] leading-relaxed text-ink-2">
          {body}
          {blocked && <p className="mt-2 rounded-lg bg-brass/10 px-3 py-2 text-[13px] font-medium text-brass">{blocked}</p>}
        </div>
      </div>
    </Modal>
  );
}
