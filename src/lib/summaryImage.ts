import { formatMoney } from './money';
import type { Summary } from './ledger';

// The light theme's colors (src/index.css), fixed so the picture looks the same wherever it's sent.
const FELT = 'rgb(14 77 58)', FELT_INK = 'rgb(230 243 236)', GAIN = 'rgb(21 122 80)', LOSS = 'rgb(190 58 40)';
const INK = 'rgb(20 33 29)', INK_2 = 'rgb(84 102 95)', PAPER = '#ffffff';
const BRASS = 'rgb(150 112 20)', ZEBRA = 'rgb(242 246 244)';
const FONT = 'Manrope, system-ui, -apple-system, "Segoe UI", sans-serif';
const DISPLAY = '"Bricolage Grotesque", system-ui, sans-serif';

/** A colored PNG of a summary -- name per row, green for up, red for down, then who pays whom. */
export async function summaryPng(d: Summary, names: (id: string) => string): Promise<Blob> {
  // Tables (games, leaderboard) need the width; a balances picture reads better narrow.
  const W = d.board || d.live ? 720 : 560, PAD = 40, HEAD = 150;
  const LROW = 50, BROW = 44;
  const open = d.rows.filter((r) => r.cents !== 0), settled = d.rows.filter((r) => r.cents === 0);
  const H = d.board ? HEAD + 24 + 36 + Math.max(1, d.board.length) * LROW + 60
    : d.live ? HEAD + 24 + 36 + d.rows.length * LROW + LROW + (d.live.final ? 56 + Math.max(1, d.transfers.length) * 40 : 70) + 50
    : HEAD + 20 + 36 + Math.max(1, open.length) * BROW + (settled.length ? 34 : 0) + 28 + 36 + Math.max(1, d.transfers.length) * BROW + 50;
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
  x.fillText(fit(x, [d.when, d.place && `📍 ${d.place}`, d.live && !d.live.final && 'In progress'].filter(Boolean).join('   ·   '), W - 2 * PAD), PAD, 104);
  x.globalAlpha = 1;

  let y = HEAD + 24;
  if (d.board) return drawBoard(c, x, d, y, W, H, PAD, LROW);
  if (d.live) return drawLiveTable(c, x, d, y, W, H, PAD, LROW);
  return drawBalances(c, x, d, open, settled, names, y - 4, W, H, PAD, BROW);

}

/** A game still being played, as a table: buy-ins, money in, chips given back, cash-outs, and
 *  each player's profit or loss once they've cashed out (green up, red down), then the pot. */
function drawLiveTable(c: HTMLCanvasElement, x: CanvasRenderingContext2D, d: Summary, top: number, W: number, H: number, PAD: number, ROWH: number) {
  const L = d.live!;
  const money = (v: number) => formatMoney(v, d.currency);
  // Right edges of the number columns; the name gets everything to the left of the first one.
  const COLS = [{ label: 'Buy-ins', x: 296 }, { label: 'Bought in', x: 390 }, { label: 'Gave back', x: 487 }, { label: 'Cash-out', x: 582 }, { label: 'Net', x: W - PAD }];
  const NAME_X = PAD + 22, NAME_W = 296 - 64 - NAME_X;
  let y = top;

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

  if (L.final) {
    // Finished: who pays whom, with payments already recorded marked paid.
    y += 26;
    x.fillStyle = INK; x.font = `600 21px ${DISPLAY}`; x.textAlign = 'left'; x.fillText('Settle up', PAD, y);
    y += 10;
    const anyPaid = d.transfers.some((t) => t.paid);
    if (d.transfers.length === 0) { x.fillStyle = GAIN; x.font = `600 18px ${FONT}`; x.fillText('Everyone is settled up', PAD, y + 28); }
    for (const t of d.transfers) {
      x.textAlign = 'left'; x.fillStyle = t.paid ? INK_2 : INK; x.font = `500 18px ${FONT}`;
      const who = (id: string) => d.rows.find((row) => row.id === id)?.name ?? '';
      x.fillText(fit(x, `${who(t.from)}  →  ${who(t.to)}`, W - 2 * PAD - 220), PAD, y + 28);
      x.textAlign = 'right'; x.font = `600 18px ${FONT}`;
      x.fillText(money(t.cents), W - PAD - (anyPaid ? 92 : 0), y + 28);
      if (t.paid) { x.fillStyle = GAIN; x.fillText('Paid ✓', W - PAD, y + 28); }
      y += 40;
    }
    x.textAlign = 'left';
    x.fillStyle = INK_2; x.font = `500 14px ${FONT}`; x.fillText('Chip n Split', PAD, H - 24);
    return toPng(c);
  }

  // The pot, on the felt.
  x.fillStyle = FELT; roundRect(x, PAD - 12, y, W - 2 * PAD + 24, 54, 12); x.fill();
  x.fillStyle = FELT_INK; x.textAlign = 'left'; x.font = `600 19px ${FONT}`;
  x.fillText(L.buyInAmount ? `Pot on the table  ·  ${money(L.buyInAmount)} buy-in` : 'Pot on the table', PAD + 6, y + 34);
  x.textAlign = 'right'; x.font = `600 26px ${DISPLAY}`; x.fillText(money(L.pot), W - PAD - 6, y + 36);
  x.textAlign = 'left';

  x.fillStyle = INK_2; x.font = `500 14px ${FONT}`; x.fillText('Chip n Split', PAD, H - 24);
  return toPng(c);
}

/** Group balances, narrow and striped: who's up or down (settled-up people on one line), then
 *  the fewest payments to clear it all, with any recorded game payments marked paid. */
function drawBalances(c: HTMLCanvasElement, x: CanvasRenderingContext2D, d: Summary, open: Summary['rows'], settled: Summary['rows'],
  names: (id: string) => string, top: number, W: number, H: number, PAD: number, ROWH: number) {
  const money = (v: number) => formatMoney(v, d.currency);
  const band = (i: number, y: number) => { if (i % 2 === 0) { x.fillStyle = ZEBRA; x.fillRect(PAD - 12, y, W - 2 * PAD + 24, ROWH); } };
  const title = (text: string, y: number) => { x.fillStyle = INK; x.font = `600 19px ${DISPLAY}`; x.textAlign = 'left'; x.fillText(text, PAD, y + 24); };
  let y = top;

  title('Where everyone stands', y); y += 36;
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

  y += 28;
  title('Settle up', y); y += 36;
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

  x.textAlign = 'left'; x.fillStyle = INK_2; x.font = `500 14px ${FONT}`; x.fillText('Chip n Split', PAD, H - 22);
  return toPng(c);
}

/** Rank, player, games, nights won, best night, and all-time total (green up, red down). */
function drawBoard(c: HTMLCanvasElement, x: CanvasRenderingContext2D, d: Summary, top: number, W: number, H: number, PAD: number, ROWH: number) {
  const rows = d.board!;
  const money = (v: number) => formatMoney(v, d.currency);
  const COLS = [{ label: 'Games', x: 420 }, { label: 'Won', x: 495 }, { label: 'Best', x: 585 }, { label: 'Total', x: W - PAD }];
  const RANK_X = PAD + 8, NAME_X = PAD + 34, NAME_W = 420 - 70 - NAME_X;
  let y = top;
  x.fillStyle = INK_2; x.font = `700 13px ${FONT}`;
  x.textAlign = 'center'; x.fillText('#', RANK_X, y + 18);
  x.textAlign = 'left'; x.fillText('Player', NAME_X, y + 18);
  x.textAlign = 'right'; COLS.forEach((col) => x.fillText(col.label, col.x, y + 18));
  y += 36;
  if (rows.length === 0) { x.textAlign = 'left'; x.font = `500 18px ${FONT}`; x.fillText('Finish a game to start the leaderboard.', PAD, y + 30); }
  rows.forEach((r, i) => {
    const tone = r.net > 0 ? GAIN : r.net < 0 ? LOSS : INK_2;
    if (i % 2 === 0) { x.fillStyle = ZEBRA; x.fillRect(PAD - 12, y, W - 2 * PAD + 24, ROWH); }
    const mid = y + ROWH / 2 + 6;
    x.fillStyle = i < 3 ? BRASS : INK_2; x.font = `700 17px ${FONT}`; x.textAlign = 'center'; x.fillText(String(i + 1), RANK_X, mid);
    x.fillStyle = INK; x.font = `600 18px ${FONT}`; x.textAlign = 'left'; x.fillText(fit(x, r.name, NAME_W), NAME_X, mid);
    x.textAlign = 'right'; x.font = `500 18px ${FONT}`;
    x.fillText(String(r.games), COLS[0]!.x, mid);
    x.fillText(String(r.wins), COLS[1]!.x, mid);
    x.fillText(r.best > 0 ? formatMoney(r.best, d.currency, { sign: true }) : '–', COLS[2]!.x, mid);
    x.fillStyle = tone; x.font = `700 18px ${FONT}`;
    x.fillText(r.net === 0 ? money(0) : formatMoney(r.net, d.currency, { sign: true }), COLS[3]!.x, mid);
    y += ROWH;
  });
  x.textAlign = 'left';
  x.fillStyle = INK_2; x.font = `500 14px ${FONT}`; x.fillText('Table results only, not current balances  ·  Chip n Split', PAD, H - 24);
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
export async function shareSummaryImage(d: Summary, names: (id: string) => string) {
  const blob = await summaryPng(d, names);
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
