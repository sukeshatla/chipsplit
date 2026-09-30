export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
        <rect width="64" height="64" rx="14" className="fill-felt" />
        <circle cx="32" cy="32" r="20" fill="none" stroke="rgb(var(--felt-ink))" strokeWidth="5" strokeDasharray="7 5.5" />
        <circle cx="32" cy="32" r="11" fill="rgb(var(--felt-ink))" />
        <path d="M32 25v14M27.5 29.5h9M27.5 34.5h9" stroke="rgb(var(--felt))" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
      <span className="font-display text-lg font-medium tracking-tight text-ink">ChipSplit</span>
    </span>
  );
}
