const formatters = new Map<string, Intl.NumberFormat>();

function fmt(currency: string, whole: boolean) {
  const key = `${currency}:${whole}`;
  let f = formatters.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
        minimumFractionDigits: whole ? 0 : 2,
        maximumFractionDigits: 2,
      });
    } catch {
      f = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' });
    }
    formatters.set(key, f);
  }
  return f;
}

/** Format integer cents. Negative values use a true minus sign. */
export function formatMoney(cents: number, currency = 'USD', opts: { sign?: boolean } = {}) {
  const s = fmt(currency, cents % 100 === 0).format(Math.abs(cents) / 100);
  if (cents < 0) return `−${s}`;
  if (opts.sign && cents > 0) return `+${s}`;
  return s;
}

/** Parse user input like "$1,250.5" into cents. Returns null when empty or invalid. */
export function parseMoney(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const cleaned = String(input).replace(/[^0-9.\-]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
}

export function centsToInput(cents: number) {
  if (!cents) return '';
  return (cents / 100).toFixed(2).replace(/\.00$/, '');
}

/** Split total evenly; leftover cents go to the first members so the sum is exact. */
export function splitEqual(total: number, ids: string[]) {
  if (ids.length === 0) return [];
  const base = Math.floor(total / ids.length);
  let rem = total - base * ids.length;
  return ids.map((id) => {
    const extra = rem > 0 ? 1 : 0;
    rem -= extra;
    return { member_id: id, amount_cents: base + extra };
  });
}

/** Split total by weights (percentages or shares) using the largest-remainder method. */
export function splitByWeights(total: number, entries: { id: string; weight: number }[]) {
  const valid = entries.filter((e) => e.weight > 0);
  const sum = valid.reduce((a, e) => a + e.weight, 0);
  if (sum <= 0) return [];
  const raw = valid.map((e) => ({ id: e.id, exact: (total * e.weight) / sum }));
  const out = raw.map((r) => ({ id: r.id, cents: Math.floor(r.exact), frac: r.exact - Math.floor(r.exact) }));
  let rem = total - out.reduce((a, o) => a + o.cents, 0);
  [...out].sort((a, b) => b.frac - a.frac).forEach((o) => {
    if (rem > 0) { o.cents += 1; rem -= 1; }
  });
  return out.map((o) => ({ member_id: o.id, amount_cents: o.cents }));
}

/** n percentages that always sum to exactly 100.00 — a sensible starting point instead of 0. */
export function equalPercents(n: number): string[] {
  if (n <= 0) return [];
  const base = Math.floor(10000 / n);
  const rem = 10000 - base * n;
  return Array.from({ length: n }, (_, i) => ((i < rem ? base + 1 : base) / 100).toFixed(2));
}

export function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, opts);
}
