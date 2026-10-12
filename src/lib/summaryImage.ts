import { formatMoney } from './money';
import type { Summary } from './ledger';

// The light theme's colors (src/index.css), fixed so the picture looks the same wherever it's sent.
const FELT = 'rgb(14 77 58)', FELT_INK = 'rgb(230 243 236)', GAIN = 'rgb(21 122 80)', LOSS = 'rgb(190 58 40)';
const INK = 'rgb(20 33 29)', INK_2 = 'rgb(84 102 95)', PAPER = '#ffffff';
const BRASS = 'rgb(150 112 20)', ZEBRA = 'rgb(242 246 244)';
const FONT = 'Manrope, system-ui, -apple-system, "Segoe UI", sans-serif';
const DISPLAY = '"Bricolage Grotesque", system-ui, sans-serif';

/** One picture, of one card. A game: its results `table`, or its `settle` up. A group: where
 *  everyone `stands`, or its `settle` up. */
export type Part = 'stands' | 'settle' | 'table';

/** Which picture a card's Share sends (SPEC SHARE-8): always one, of just that card. */
export function imageParts(d: Summary, section?: 'settle'): Part[] {
  if (d.rummy) return ['table'];
  if (d.live) return [section === 'settle' && d.live.final ? 'settle' : 'table'];
  return [section === 'settle' ? 'settle' : 'stands'];
}

export interface Banner { label: string; title: string; details: string[] }

/** What the banner at the top of a picture says (SPEC SHARE-7): what it is, the group, and when. */
export function imageBanner(d: Summary, part: Part): Banner {
  const place = d.place ? `📍 ${d.place}` : null;
  if (d.rummy) {
    const R = d.rummy;
    const stake = R.buyIn ? `${formatMoney(R.buyIn, d.currency)} buy-in` : null;
    return { label: R.final ? 'Rummy · Final' : 'Rummy · In progress', title: d.title, details: [d.when, d.place, `Out at ${R.limit}`, stake].filter(Boolean) as string[] };
  }
  if (d.live) {
    if (part === 'settle') return { label: 'Game · Settle up', title: d.title, details: [d.when, place].filter(Boolean) as string[] };
    const buyIn = d.live.buyInAmount ? `${formatMoney(d.live.buyInAmount, d.currency)} buy-in` : null;
    return { label: d.live.final ? 'Game · Final results' : 'Game · In progress', title: d.title, details: [d.when, place, buyIn].filter(Boolean) as string[] };
  }
  return { label: part === 'settle' ? 'Group · Settle up' : 'Group · Balances', title: d.title, details: [d.when] };
}

/** The picture(s) to share, one per part. */
export async function summaryPngs(d: Summary, names: (id: string) => string, section?: 'settle'): Promise<Blob[]> {
  return Promise.all(imageParts(d, section).map((part) => summaryPng(d, names, part)));
}

/** A colored PNG of a summary -- name per row, green for up, red for down, then who pays whom. */
export async function summaryPng(d: Summary, names: (id: string) => string, part: Part): Promise<Blob> {
  // A game's table needs the width; balances and settle up read better narrow.
  const W = d.live && part === 'table' ? 720 : 560, PAD = 40, HEAD = 172;
  const open = d.rows.filter((r) => r.cents !== 0), settled = d.rows.filter((r) => r.cents === 0);
  // Longer lists get tighter rows (same text size) so the picture doesn't run long (SHARE-5).
  const count = d.rummy ? d.rummy.rows.length : part === 'settle' ? d.transfers.length : d.live ? d.rows.length : open.length;
  const big = count > 8;
  const LROW = big ? 42 : 50, BROW = big ? 36 : 44;
  // The banner says which card this is, so the body is just the rows.
  const standsH = Math.max(1, open.length) * BROW + (settled.length ? 34 : 0);
  const settleH = Math.max(1, d.transfers.length) * BROW;
  const H = d.rummy ? HEAD + 24 + 36 + d.rummy.rows.length * LROW + 28 : HEAD + 24 + (part === 'settle' ? settleH
    : d.live ? 36 + d.rows.length * LROW + LROW + (d.live.final ? 0 : 70) : standsH) + 28;
  const scale = 2;
  const c = document.createElement('canvas');
  c.width = W * scale; c.height = H * scale;
  const x = c.getContext('2d')!;
  x.scale(scale, scale);
  await document.fonts?.ready;

  x.fillStyle = PAPER; x.fillRect(0, 0, W, H);
  drawBanner(x, imageBanner(d, part), W, PAD, HEAD);

  const y = HEAD + 24;
  if (d.rummy) return drawRummy(c, x, d, y, W, PAD, LROW);
  if (d.live) return drawLiveTable(c, x, d, y, W, PAD, LROW, BROW, part);
  return drawBalances(c, x, d, open, settled, names, y - 4, W, PAD, BROW, part);
}

/** Label pill colors: a game in progress stands out in brass; everything else is light on the felt. */
const pillColors = (label: string) => (label.endsWith('In progress') ? { bg: 'rgb(232 178 48)', ink: INK } : { bg: FELT_INK, ink: FELT });

/** The banner: the Chip n Split logo and name with the label pill across the top, then the group
 *  name large, then when (and where, and the buy-in for a game). */
function drawBanner(x: CanvasRenderingContext2D, b: Banner, W: number, PAD: number, HEAD: number) {
  x.fillStyle = FELT; x.fillRect(0, 0, W, HEAD);
  drawLogo(x, PAD, 22, 32);
  x.fillStyle = FELT_INK; x.textAlign = 'left'; x.font = `600 18px ${DISPLAY}`;
  x.fillText('Chip n Split', PAD + 42, 44);

  const pill = pillColors(b.label);
  x.font = `800 14px ${FONT}`;
  const text = b.label.toUpperCase(), tw = x.measureText(text).width + 2 * 1.2 * text.length, pw = tw + 28;
  x.fillStyle = pill.bg; roundRect(x, W - PAD - pw, 20, pw, 34, 17); x.fill();
  x.fillStyle = pill.ink; x.textAlign = 'center';
  (x as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '1.2px';
  x.fillText(text, W - PAD - pw / 2, 42);
  (x as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '0px';

  x.textAlign = 'left'; x.fillStyle = FELT_INK;
  x.font = `600 32px ${DISPLAY}`; x.fillText(fit(x, b.title, W - 2 * PAD), PAD, 108);
  x.globalAlpha = 0.88; x.font = `500 17px ${FONT}`;
  x.fillText(fit(x, b.details.join('   ·   '), W - 2 * PAD), PAD, 144);
  x.globalAlpha = 1;
}

/** The app icon (public/icon.svg), drawn on a lighter square so it shows on the felt banner. */
function drawLogo(x: CanvasRenderingContext2D, left: number, top: number, size: number) {
  const s = size / 64;
  x.save(); x.translate(left, top); x.scale(s, s);
  x.fillStyle = 'rgb(26 122 90)'; roundRect(x, 0, 0, 64, 64, 14); x.fill();
  x.strokeStyle = FELT_INK; x.lineWidth = 5; x.setLineDash([7, 5.5]);
  x.beginPath(); x.arc(32, 32, 20, 0, Math.PI * 2); x.stroke(); x.setLineDash([]);
  x.fillStyle = FELT_INK; x.beginPath(); x.arc(32, 32, 11, 0, Math.PI * 2); x.fill();
  x.strokeStyle = FELT; x.lineWidth = 2.4; x.lineCap = 'round';
  x.beginPath(); x.moveTo(32, 25); x.lineTo(32, 39); x.moveTo(27.5, 29.5); x.lineTo(36.5, 29.5); x.moveTo(27.5, 34.5); x.lineTo(36.5, 34.5); x.stroke();
  x.restore();
}

/** A game still being played, as a table: buy-ins, money in, chips given back, cash-outs, and
 *  each player's profit or loss once they've cashed out (green up, red down), then the pot. */
function drawLiveTable(c: HTMLCanvasElement, x: CanvasRenderingContext2D, d: Summary, top: number, W: number, PAD: number, ROWH: number,
  SROW: number, part: Part) {
  const L = d.live!;
  const money = (v: number) => formatMoney(v, d.currency);
  // Right edges of the number columns; the name gets everything to the left of the first one.
  const COLS = [{ label: 'Buy-ins', x: 296 }, { label: 'Bought in', x: 390 }, { label: 'Gave back', x: 487 }, { label: 'Cash-out', x: 582 }, { label: 'Net', x: W - PAD }];
  const NAME_X = PAD + 22, NAME_W = 296 - 64 - NAME_X;
  let y = top;

  if (part !== 'settle') {
  x.fillStyle = INK_2; x.font = `700 13px ${FONT}`;
  x.textAlign = 'left'; x.fillText('Player', NAME_X, y + 18);
  x.textAlign = 'right'; COLS.forEach((col) => x.fillText(col.label, col.x, y + 18));
  y += 36;

  d.rows.forEach((r, i) => {
    const cashedOut = (r.cashOut ?? 0) > 0;
    const net = L.final || cashedOut ? (r.cashOut ?? 0) + (r.back ?? 0) - (r.buyIn ?? 0) : null;
    const tone = net === null ? BRASS : net > 0 ? GAIN : net < 0 ? LOSS : INK_2;
    if (i % 2 === 0) { x.fillStyle = ZEBRA; x.fillRect(PAD - 12, y, W - 2 * PAD + 24, ROWH); }
    const mid = y + ROWH / 2 + 6;
    x.fillStyle = tone; x.beginPath(); x.arc(PAD + 4, y + ROWH / 2, 6, 0, Math.PI * 2); x.fill();
    x.fillStyle = INK; x.font = `600 18px ${FONT}`; x.textAlign = 'left';
    x.fillText(fit(x, r.name, NAME_W), NAME_X, mid);
    x.textAlign = 'right'; x.font = `500 18px ${FONT}`;
    x.fillText(r.buyIns != null ? String(r.buyIns) : '–', COLS[0]!.x, mid);
    x.fillText(money(r.buyIn ?? 0), COLS[1]!.x, mid);
    x.fillStyle = r.back ? INK : INK_2; x.fillText(r.back ? money(r.back) : '–', COLS[2]!.x, mid);
    x.fillStyle = cashedOut || L.final ? INK : INK_2; x.fillText(cashedOut || L.final ? money(r.cashOut ?? 0) : '–', COLS[3]!.x, mid);
    x.fillStyle = tone; x.font = `700 18px ${FONT}`;
    x.fillText(net === null ? 'playing' : net === 0 ? 'even' : formatMoney(net, d.currency, { sign: true }), COLS[4]!.x, mid);
    y += ROWH;
  });

  // Totals row.
  x.fillStyle = INK; x.fillRect(PAD - 12, y, W - 2 * PAD + 24, 2);
  const mid = y + ROWH / 2 + 7;
  x.font = `700 18px ${FONT}`; x.textAlign = 'left'; x.fillText('Total', NAME_X, mid);
  x.textAlign = 'right';
  x.fillText(L.buyIns != null ? String(L.buyIns) : '–', COLS[0]!.x, mid);
  x.fillText(money(L.totalIn), COLS[1]!.x, mid);
  x.fillText(L.totalBack ? money(L.totalBack) : '–', COLS[2]!.x, mid);
  x.fillText(L.totalCashOut ? money(L.totalCashOut) : '–', COLS[3]!.x, mid);
  y += ROWH + 12;

  }

  if (part === 'settle') {
    // Its own picture: who pays whom, striped like the table, with payments already recorded marked paid.
    const anyPaid = d.transfers.some((t) => t.paid);
    if (d.transfers.length === 0) { x.fillStyle = GAIN; x.font = `600 18px ${FONT}`; x.fillText('Everyone is settled up', PAD, y + 28); }
    const who = (id: string) => d.rows.find((row) => row.id === id)?.name ?? '';
    d.transfers.forEach((t, i) => {
      if (i % 2 === 0) { x.fillStyle = ZEBRA; x.fillRect(PAD - 12, y, W - 2 * PAD + 24, SROW); }
      const mid = y + SROW / 2 + 6;
      x.textAlign = 'left'; x.fillStyle = t.paid ? INK_2 : INK; x.font = `600 18px ${FONT}`;
      x.fillText(fit(x, `${who(t.from)}  →  ${who(t.to)}`, W - 2 * PAD - 220), PAD, mid);
      x.textAlign = 'right'; x.font = `700 18px ${FONT}`;
      x.fillText(money(t.cents), W - PAD - (anyPaid ? 92 : 0), mid);
      if (t.paid) { x.fillStyle = GAIN; x.font = `600 16px ${FONT}`; x.fillText('Paid ✓', W - PAD, mid); }
      y += SROW;
    });
    x.textAlign = 'left';
    return toPng(c);
  }
  if (L.final) return toPng(c);

  // The pot, on the felt.
  x.fillStyle = FELT; roundRect(x, PAD - 12, y, W - 2 * PAD + 24, 54, 12); x.fill();
  x.fillStyle = FELT_INK; x.textAlign = 'left'; x.font = `600 19px ${FONT}`;
  x.fillText('Pot on the table', PAD + 6, y + 34);
  x.textAlign = 'right'; x.font = `600 26px ${DISPLAY}`; x.fillText(money(L.pot), W - PAD - 6, y + 36);
  x.textAlign = 'left';
  return toPng(c);
}

/** Group balances, narrow and striped: who's up or down (settled-up people on one line), or the
 *  fewest payments to clear it all. */
function drawBalances(c: HTMLCanvasElement, x: CanvasRenderingContext2D, d: Summary, open: Summary['rows'], settled: Summary['rows'],
  names: (id: string) => string, top: number, W: number, PAD: number, ROWH: number, part: Part) {
  const money = (v: number) => formatMoney(v, d.currency);
  const band = (i: number, y: number) => { if (i % 2 === 0) { x.fillStyle = ZEBRA; x.fillRect(PAD - 12, y, W - 2 * PAD + 24, ROWH); } };
  let y = top;

  if (part === 'stands') {
  if (open.length === 0) { x.fillStyle = GAIN; x.font = `600 17px ${FONT}`; x.fillText('Everyone is settled up', PAD, y + 28); y += ROWH; }
  open.forEach((r, i) => {
    band(i, y);
    const mid = y + ROWH / 2 + 6, tone = r.cents > 0 ? GAIN : LOSS;
    x.fillStyle = tone; x.beginPath(); x.arc(PAD + 4, y + ROWH / 2, 5.5, 0, Math.PI * 2); x.fill();
    x.fillStyle = INK; x.font = `600 17px ${FONT}`; x.textAlign = 'left'; x.fillText(fit(x, r.name, W - 2 * PAD - 190), PAD + 20, mid);
    x.textAlign = 'right';
    x.fillStyle = tone; x.font = `700 18px ${FONT}`; x.fillText(money(Math.abs(r.cents)), W - PAD, mid);
    const amountW = x.measureText(money(Math.abs(r.cents))).width;
    x.fillStyle = INK_2; x.font = `500 14px ${FONT}`; x.fillText(r.cents > 0 ? 'gets back' : 'owes', W - PAD - amountW - 10, mid);
    y += ROWH;
  });
  if (settled.length) {
    x.textAlign = 'left'; x.fillStyle = INK_2; x.font = `500 14px ${FONT}`;
    x.fillText(fit(x, `Settled up: ${settled.map((r) => r.name).join(', ')}`, W - 2 * PAD), PAD, y + 24);
    y += 34;
  }

  }

  if (part === 'settle') {
  if (d.transfers.length === 0) { x.textAlign = 'left'; x.fillStyle = GAIN; x.font = `600 17px ${FONT}`; x.fillText('Nothing to pay', PAD, y + 28); }
  const anyPaid = d.transfers.some((t) => t.paid);
  d.transfers.forEach((t, i) => {
    band(i, y);
    const mid = y + ROWH / 2 + 6;
    x.textAlign = 'left'; x.font = `600 17px ${FONT}`;
    x.fillStyle = t.paid ? INK_2 : INK; x.fillText(fit(x, `${names(t.from)}  →  ${names(t.to)}`, W - 2 * PAD - 170), PAD, mid);
    x.textAlign = 'right'; x.font = `700 18px ${FONT}`;
    x.fillText(money(t.cents), W - PAD - (anyPaid ? 80 : 0), mid);
    if (t.paid) { x.fillStyle = GAIN; x.font = `600 15px ${FONT}`; x.fillText('Paid ✓', W - PAD, mid); }
    y += ROWH;
  });
  }

  x.textAlign = 'left';
  return toPng(c);
}

/** A rummy game: place, player, points (red once out), and what happened to them. */
function drawRummy(c: HTMLCanvasElement, x: CanvasRenderingContext2D, d: Summary, top: number, W: number, PAD: number, ROWH: number) {
  const R = d.rummy!;
  const RANK_X = PAD + 8, NAME_X = PAD + 34, POINTS_X = W - PAD - 110;
  let y = top;
  x.fillStyle = INK_2; x.font = `700 13px ${FONT}`;
  x.textAlign = 'center'; x.fillText('#', RANK_X, y + 18);
  x.textAlign = 'left'; x.fillText('Player', NAME_X, y + 18);
  x.textAlign = 'right'; x.fillText('Points', POINTS_X, y + 18);
  y += 36;
  R.rows.forEach((r, i) => {
    if (i % 2 === 0) { x.fillStyle = ZEBRA; x.fillRect(PAD - 12, y, W - 2 * PAD + 24, ROWH); }
    const mid = y + ROWH / 2 + 6;
    x.fillStyle = INK_2; x.font = `700 17px ${FONT}`; x.textAlign = 'center'; x.fillText(String(i + 1), RANK_X, mid);
    x.fillStyle = r.out ? INK_2 : INK; x.font = `600 18px ${FONT}`; x.textAlign = 'left';
    x.fillText(fit(x, r.name, POINTS_X - 70 - NAME_X), NAME_X, mid);
    x.textAlign = 'right'; x.fillStyle = r.out ? LOSS : INK; x.font = `700 18px ${FONT}`; x.fillText(String(r.total), POINTS_X, mid);
    const status = r.winner ? 'Winner' : r.out ? 'Out' : R.final ? 'In' : 'Playing';
    x.fillStyle = r.winner ? GAIN : r.out ? LOSS : BRASS; x.font = `600 15px ${FONT}`;
    x.fillText(r.rejoins ? `${status} · ↺${r.rejoins}` : status, W - PAD, mid);
    y += ROWH;
  });
  x.textAlign = 'left';
  return toPng(c);
}

function roundRect(x: CanvasRenderingContext2D, left: number, top: number, w: number, h: number, rad: number) {
  x.beginPath();
  x.moveTo(left + rad, top);
  x.arcTo(left + w, top, left + w, top + h, rad);
  x.arcTo(left + w, top + h, left, top + h, rad);
  x.arcTo(left, top + h, left, top, rad);
  x.arcTo(left, top, left + w, top, rad);
  x.closePath();
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
export async function shareSummaryImage(d: Summary, names: (id: string) => string, section?: 'settle') {
  const blobs = await summaryPngs(d, names, section);
  const base = `${d.title}${d.place ? ` ${d.place}` : ''} ${d.when}`.replace(/[^\w ,-]+/g, '').trim().replace(/\s+/g, '-');
  const parts = imageParts(d, section);
  const suffix = (p: Part, i: number) => (p === 'settle' ? '-settle-up' : parts.length > 1 ? `-${i + 1}` : '');
  const files = blobs.map((b, i) => new File([b], `${base}${suffix(parts[i]!, i)}.png`, { type: 'image/png' }));
  if (navigator.canShare?.({ files })) {
    // Just the pictures (SPEC SHARE-9): the banner already names the group, so no title text.
    try { await navigator.share({ files }); } catch (e) {
      if ((e as Error).name !== 'AbortError') throw e;
    }
    return;
  }
  for (const f of files) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(f); a.download = f.name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
}
