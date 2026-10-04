import { formatMoney } from './money';
import type { Summary } from './ledger';

// The light theme's colors (src/index.css), fixed so the picture looks the same wherever it's sent.
const FELT = 'rgb(14 77 58)', FELT_INK = 'rgb(230 243 236)', GAIN = 'rgb(21 122 80)', LOSS = 'rgb(190 58 40)';
const INK = 'rgb(20 33 29)', INK_2 = 'rgb(84 102 95)', LINE = 'rgb(218 226 222)', PAPER = '#ffffff';
const BRASS = 'rgb(150 112 20)';
const FONT = 'Manrope, system-ui, -apple-system, "Segoe UI", sans-serif';
const DISPLAY = '"Bricolage Grotesque", system-ui, sans-serif';

/** A colored PNG of a summary -- name per row, green for up, red for down, then who pays whom. */
export async function summaryPng(d: Summary, names: (id: string) => string, game: boolean): Promise<Blob> {
  const W = 720, PAD = 40, ROW = 52, HEAD = 150;
  const rowH = d.live ? 70 : ROW;
  const liveLines = d.live ? 2 + (d.live.totalBack ? 1 : 0) + (d.live.totalCashOut ? 1 : 0) : 0;
  const H = HEAD + 24 + d.rows.length * rowH + 70 + (d.live ? liveLines : Math.max(1, d.transfers.length)) * 40 + (d.live ? 50 : 80);
  const scale = 2;
  const c = document.createElement('canvas');
  c.width = W * scale; c.height = H * scale;
  const x = c.getContext('2d')!;
  x.scale(scale, scale);
  await document.fonts?.ready;

  x.fillStyle = PAPER; x.fillRect(0, 0, W, H);
  x.fillStyle = FELT; x.fillRect(0, 0, W, HEAD);
  x.fillStyle = FELT_INK;
  x.font = `600 34px ${DISPLAY}`; x.fillText(fit(x, d.title, W - 2 * PAD), PAD, 64);
  x.globalAlpha = 0.85; x.font = `500 18px ${FONT}`;
  x.fillText(fit(x, [d.when, d.place && `📍 ${d.place}`, d.live && 'In progress'].filter(Boolean).join('   ·   '), W - 2 * PAD), PAD, 104);
  x.globalAlpha = 1;

  let y = HEAD + 24;
  for (const r of d.rows) {
    if (d.live) {
      // Name, then "3 buy-ins · gave back $40 · cashed out $80" under it; what they've put in on the right.
      x.fillStyle = BRASS; x.beginPath(); x.arc(PAD + 7, y + 30, 7, 0, Math.PI * 2); x.fill();
      x.fillStyle = INK; x.font = `600 20px ${FONT}`; x.textAlign = 'left';
      x.fillText(fit(x, r.name, W - 2 * PAD - 200), PAD + 28, y + 36);
      const bits = [r.buyIns != null ? `${r.buyIns} buy-in${r.buyIns === 1 ? '' : 's'}` : null,
        r.back ? `gave back ${formatMoney(r.back, d.currency)}` : null,
        r.cashOut ? `cashed out ${formatMoney(r.cashOut, d.currency)}` : null].filter(Boolean).join('  ·  ');
      if (bits) { x.fillStyle = INK_2; x.font = `500 15px ${FONT}`; x.fillText(fit(x, bits, W - 2 * PAD - 200), PAD + 28, y + 58); }
      x.fillStyle = INK; x.font = `600 22px ${FONT}`; x.textAlign = 'right';
      x.fillText(formatMoney(r.buyIn ?? 0, d.currency), W - PAD, y + 44);
      x.textAlign = 'left';
      y += rowH;
      x.fillStyle = LINE; x.fillRect(PAD, y - 1, W - 2 * PAD, 1);
      continue;
    }
    const tone = r.cents > 0 ? GAIN : r.cents < 0 ? LOSS : INK_2;
    x.fillStyle = tone; x.beginPath(); x.arc(PAD + 7, y + ROW / 2, 7, 0, Math.PI * 2); x.fill();
    x.fillStyle = INK; x.font = `600 20px ${FONT}`; x.textAlign = 'left';
    x.fillText(fit(x, r.name, W - 2 * PAD - 260), PAD + 28, y + ROW / 2 + 7);
    x.fillStyle = tone; x.font = `600 22px ${FONT}`; x.textAlign = 'right';
    x.fillText(r.cents === 0 ? (game ? 'even' : 'settled') : formatMoney(r.cents, d.currency, { sign: true }), W - PAD, y + ROW / 2 + 8);
    x.textAlign = 'left';
    y += ROW;
    x.fillStyle = LINE; x.fillRect(PAD, y - 1, W - 2 * PAD, 1);
  }

  y += 44;
  if (d.live) {
    // Still playing: nobody owes anything yet, so show what's on the table instead of payments.
    const L = d.live;
    const line = (label: string, cents: number, strong = false) => {
      x.fillStyle = strong ? FELT : INK_2; x.font = `${strong ? 700 : 500} ${strong ? 21 : 19}px ${FONT}`; x.textAlign = 'left'; x.fillText(label, PAD, y);
      x.fillStyle = strong ? FELT : INK; x.font = `600 ${strong ? 26 : 21}px ${DISPLAY}`; x.textAlign = 'right'; x.fillText(formatMoney(cents, d.currency), W - PAD, y);
      x.textAlign = 'left'; y += 40;
    };
    line(L.buyIns != null ? `Bought in (${L.buyIns} × ${formatMoney(L.buyInAmount, d.currency)})` : 'Bought in', L.totalIn);
    if (L.totalBack) line('Given back to the bank', L.totalBack);
    if (L.totalCashOut) line('Cashed out', L.totalCashOut);
    y += 6; x.fillStyle = LINE; x.fillRect(PAD, y - 30, W - 2 * PAD, 1);
    line('Pot on the table', L.pot, true);
    x.fillStyle = INK_2; x.font = `500 14px ${FONT}`; x.fillText('Chip n Split', PAD, H - 28);
    return toPng(c);
  }
  x.fillStyle = INK; x.font = `600 22px ${DISPLAY}`; x.fillText('Settle up', PAD, y);
  y += 16;
  x.font = `500 19px ${FONT}`;
  if (d.transfers.length === 0) { x.fillStyle = GAIN; x.fillText('Everyone is settled up', PAD, y + 26); y += 40; }
  const anyPaid = d.transfers.some((t) => t.paid);
  for (const t of d.transfers) {
    x.fillStyle = t.paid ? INK_2 : INK; x.textAlign = 'left';
    x.fillText(fit(x, `${names(t.from)}  →  ${names(t.to)}`, W - 2 * PAD - 260), PAD, y + 26);
    x.textAlign = 'right'; x.font = `600 19px ${FONT}`; x.fillText(formatMoney(t.cents, d.currency), W - PAD - (anyPaid ? 92 : 0), y + 26);
    if (t.paid) { x.fillStyle = GAIN; x.fillText('Paid ✓', W - PAD, y + 26); }
    x.textAlign = 'left'; x.font = `500 19px ${FONT}`;
    y += 40;
  }
  x.fillStyle = INK_2; x.font = `500 14px ${FONT}`; x.fillText('Chip n Split', PAD, H - 28);

  return toPng(c);
}

function toPng(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not draw the image'))), 'image/png'));
}

/** Shrinks `s` with an ellipsis until it fits `max` pixels in the current font. */
function fit(x: CanvasRenderingContext2D, s: string, max: number) {
  if (x.measureText(s).width <= max) return s;
  while (s.length > 1 && x.measureText(s + '…').width > max) s = s.slice(0, -1);
  return s + '…';
}

/** Phone: the share sheet (Mail, WhatsApp, ...) with the image attached. Desktop: downloads it. */
export async function shareSummaryImage(d: Summary, names: (id: string) => string, game: boolean) {
  const blob = await summaryPng(d, names, game);
  const name = `${d.title}${d.place ? ` ${d.place}` : ''} ${d.when}`.replace(/[^\w ,-]+/g, '').trim().replace(/\s+/g, '-') + '.png';
  const file = new File([blob], name, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: `Chip n Split summary — ${d.title}` }); } catch (e) {
      if ((e as Error).name !== 'AbortError') throw e;
    }
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
