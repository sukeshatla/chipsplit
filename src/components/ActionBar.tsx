import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { clsx } from 'clsx';

/** One strip of compact icon buttons for a page's actions -- Email summary first, then the rest. */
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
