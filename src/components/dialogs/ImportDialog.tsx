import { useState } from 'react';
import { FileSpreadsheet, Download } from 'lucide-react';
import { Button, Modal } from '../ui';
import { useAction } from '../../app/data';
import { formatMoney, parseMoney, splitEqual } from '../../lib/money';
import type { Group, NewExpense, Split } from '../../lib/types';

interface ParsedRow { line: number; expense?: NewExpense; error?: string; raw: Record<string, string> }

const TEMPLATE = [
  'Date,Description,Amount,Paid By,Split With,Category',
  '2026-09-12,Pizza,60,Suki,all,food',
  '2026-09-12,Drinks,45.50,Ravi,Suki;Ravi;Kiran,drinks',
  '2026-09-13,Cab,30,Suki:20;Kiran:10,Suki:15;Kiran:15,transport',
].join('\n');

function toISODate(v: string): string | null {
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Parses "Suki" or "Suki:20;Kiran:10". Returns member ids with optional explicit cents. */
function parsePeople(v: string, group: Group): { id: string; cents: number | null }[] | string {
  const parts = v.split(/[;,|]/).map((p) => p.trim()).filter(Boolean);
  const out: { id: string; cents: number | null }[] = [];
  for (const p of parts) {
    const [name, amt] = p.split(':').map((x) => x.trim());
    const m = group.members.find((x) => x.name.toLowerCase() === name!.toLowerCase());
    if (!m) return `No one named "${name}" in this group`;
    out.push({ id: m.id, cents: amt !== undefined ? parseMoney(amt) : null });
  }
  return out;
}

function parseRow(raw: Record<string, string>, line: number, group: Group): ParsedRow {
  const get = (k: string) => (raw[Object.keys(raw).find((x) => x.trim().toLowerCase() === k) ?? ''] ?? '').toString();
  const date = toISODate(get('date'));
  const description = get('description').trim();
  const total = parseMoney(get('amount'));
  if (!date) return { line, raw, error: 'Date is missing or unreadable' };
  if (!description) return { line, raw, error: 'Description is missing' };
  if (!total || total <= 0) return { line, raw, error: 'Amount is missing' };

  const payerSpec = parsePeople(get('paid by'), group);
  if (typeof payerSpec === 'string') return { line, raw, error: payerSpec };
  if (payerSpec.length === 0) return { line, raw, error: 'Paid By is missing' };
  let payers: Split[];
  if (payerSpec.length === 1 && payerSpec[0]!.cents === null) payers = [{ member_id: payerSpec[0]!.id, amount_cents: total }];
  else {
    if (payerSpec.some((p) => p.cents === null)) return { line, raw, error: 'With several payers, give each an amount like Suki:20' };
    payers = payerSpec.map((p) => ({ member_id: p.id, amount_cents: p.cents! }));
    if (payers.reduce((a, p) => a + p.amount_cents, 0) !== total) return { line, raw, error: 'Payer amounts don\'t add up to the total' };
  }

  const splitRaw = get('split with').trim();
  let shares: Split[];
  if (!splitRaw || splitRaw.toLowerCase() === 'all') shares = splitEqual(total, group.members.map((m) => m.id));
  else {
    const spec = parsePeople(splitRaw, group);
    if (typeof spec === 'string') return { line, raw, error: spec };
    if (spec.every((s) => s.cents === null)) shares = splitEqual(total, spec.map((s) => s.id));
    else if (spec.every((s) => s.cents !== null)) {
      shares = spec.map((s) => ({ member_id: s.id, amount_cents: s.cents! }));
      if (shares.reduce((a, s) => a + s.amount_cents, 0) !== total) return { line, raw, error: 'Split amounts don\'t add up to the total' };
    } else return { line, raw, error: 'Give amounts for everyone in Split With, or for no one' };
  }
  const category = get('category').trim().toLowerCase() || 'general';
  return { line, raw, expense: { group_id: group.id, description, category, amount_cents: total, spent_on: date, payers, shares } };
}

export function ImportDialog({ group, open, onClose }: { group: Group; open: boolean; onClose(): void }) {
  const { run, busy } = useAction();
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [fileName, setFileName] = useState('');
  const [readError, setReadError] = useState<string | null>(null);

  const close = () => { setRows(null); setFileName(''); setReadError(null); onClose(); };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name); setReadError(null);
    try {
      const XLSX = await import('xlsx'); // loaded only when someone imports a file
      const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]!]!;
      const json = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '', raw: false, dateNF: 'yyyy-mm-dd' });
      if (json.length === 0) { setReadError('That sheet has no rows under the header'); setRows(null); return; }
      setRows(json.map((r, i) => parseRow(r, i + 2, group)));
    } catch {
      setReadError('Couldn\'t read that file. Use .xlsx, .xls, or .csv.');
      setRows(null);
    }
  };

  const downloadTemplate = () => {
    const url = URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'chipsplit-import-template.csv' });
    a.click();
    URL.revokeObjectURL(url);
  };

  const good = rows?.filter((r) => r.expense) ?? [];
  const bad = rows?.filter((r) => r.error) ?? [];

  const submit = async () => {
    const ok = await run(async (api) => { for (const r of good) await api.saveExpense(r.expense!); return true; },
      `${good.length} expense${good.length === 1 ? '' : 's'} imported`);
    if (ok) close();
  };

  return (
    <Modal open={open} onClose={close} title="Import expenses" wide
      footer={<><Button variant="ghost" onClick={close}>Cancel</Button>
        <Button variant="primary" loading={busy} disabled={good.length === 0} onClick={submit}>Import {good.length || ''} expenses</Button></>}>
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-ink-2">
          Columns: <b className="text-ink">Date, Description, Amount, Paid By, Split With</b>, and optionally Category.
          Split With can be <b className="text-ink">all</b>, names separated by semicolons, or exact amounts like <b className="text-ink">Suki:15;Kiran:15</b>.
          Names must match the group's members.
        </p>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg bg-felt px-4 text-sm font-semibold text-felt-ink hover:bg-felt/90">
            <FileSpreadsheet size={16} aria-hidden="true" /> Choose file
            <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          <Button variant="ghost" onClick={downloadTemplate}><Download size={16} aria-hidden="true" /> Template</Button>
          {fileName && <span className="self-center text-[13px] text-ink-2">{fileName}</span>}
        </div>
        {readError && <p className="rounded-lg bg-loss/10 px-3 py-2 text-[13px] text-loss">{readError}</p>}
        {rows && (
          <div className="overflow-x-auto rounded-xl border border-line">
            <table className="w-full min-w-[480px] text-left text-[13px]">
              <thead className="bg-surface-2 text-ink-2">
                <tr><th className="px-3 py-2 font-semibold">Row</th><th className="px-3 py-2 font-semibold">Description</th><th className="px-3 py-2 font-semibold">Date</th><th className="px-3 py-2 text-right font-semibold">Amount</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.line} className="border-t border-line align-top">
                    <td className="px-3 py-2 text-ink-2">{r.line}</td>
                    <td className="px-3 py-2">
                      {r.expense?.description ?? Object.values(r.raw)[1]}
                      {r.error && <span className="block text-loss">{r.error}</span>}
                    </td>
                    <td className="px-3 py-2">{r.expense?.spent_on ?? ''}</td>
                    <td className="amount px-3 py-2 text-right">{r.expense ? formatMoney(r.expense.amount_cents, group.currency) : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows && bad.length > 0 && <p className="text-[13px] text-ink-2">{bad.length} row{bad.length === 1 ? '' : 's'} will be skipped. Fix them in the sheet and import again.</p>}
      </div>
    </Modal>
  );
}
