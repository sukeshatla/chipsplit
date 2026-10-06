import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { useAction, useData } from '../../app/data';
import { memberAvatar, memberName, memberShort, myMemberId } from '../../lib/ledger';
import { formatDate, formatMoney } from '../../lib/money';
import { Amount, Avatar, Button, Modal } from '../ui';
import { ConfirmDialog } from '../ConfirmDialog';
import type { Expense, Group, Split } from '../../lib/types';

/** Read-only summary of one expense -- who paid, who's in, how much -- with Edit and Delete
 *  for anyone in the group (0025). */
export function ExpenseDetailDialog({ group: g, expense: e, onClose, onEdit }: { group: Group; expense: Expense | null; onClose(): void; onEdit(e: Expense): void }) {
  const { me } = useData();
  const { run, busy } = useAction();
  const [confirming, setConfirming] = useState(false);
  if (!e) return null;

  const mine = myMemberId(g, me.id);
  const paid = e.payers.find((p) => p.member_id === mine)?.amount_cents ?? 0;
  const share = e.shares.find((s) => s.member_id === mine)?.amount_cents ?? 0;
  const impact = paid - share;
  const category = e.category ? e.category[0]!.toUpperCase() + e.category.slice(1) : 'General';

  const remove = async () => {
    setConfirming(false);
    const ok = await run((api) => api.deleteExpense(e.id), 'Expense deleted');
    if (ok !== undefined) onClose();
  };

  return (
    <>
      <Modal open onClose={onClose} title={e.description}
        footer={mine ? <>
          <Button variant="danger" onClick={() => setConfirming(true)}><Trash2 size={16} aria-hidden="true" />Delete</Button>
          <Button variant="primary" onClick={() => onEdit(e)}><Pencil size={16} aria-hidden="true" />Edit</Button>
        </> : <Button onClick={onClose}>Close</Button>}>
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="amount font-display text-3xl font-medium">{formatMoney(e.amount_cents, g.currency)}</p>
            <p className="mt-0.5 text-[13px] text-ink-2">{formatDate(e.spent_on)} · {category}</p>
          </div>
          {(paid > 0 || share > 0) && (
            <div className="text-right">
              <p className="text-[12px] text-ink-2">{impact > 0 ? 'You lent' : impact < 0 ? 'You borrowed' : 'You are even'}</p>
              {impact !== 0 && <Amount cents={impact} currency={g.currency} className="text-base" />}
            </div>
          )}
        </div>

        <SplitList g={g} title="Paid by" rows={e.payers} />
        <SplitList g={g} title={`Split between ${e.shares.length}`} rows={e.shares} />

      </Modal>
      <ConfirmDialog open={confirming} onClose={() => setConfirming(false)} title="Delete this expense?" icon={Trash2} busy={busy}
        body={<>This removes <b>&ldquo;{e.description}&rdquo;</b> ({formatMoney(e.amount_cents, g.currency)}) from everyone's balance. Anyone in the group can restore it from the History tab.</>}
        onConfirm={remove} />
    </>
  );
}

function SplitList({ g, title, rows }: { g: Group; title: string; rows: Split[] }) {
  return (
    <div className="mt-4">
      <p className="mb-1 text-[12px] font-semibold text-ink-2">{title}</p>
      <div className="divide-y divide-line rounded-xl border border-line">
        {rows.map((r) => (
          <div key={r.member_id} className="flex items-center gap-2.5 px-3 py-2">
            <Avatar name={memberName(g, r.member_id)} src={memberAvatar(g, r.member_id)} size={26} />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{memberShort(g, r.member_id)}</span>
            <span className="amount text-sm">{formatMoney(r.amount_cents, g.currency)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
