import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { Check } from 'lucide-react';
import { Avatar, Button, Field, Input, Modal, MoneyInput } from '../ui';
import { parseMoney } from '../../lib/money';
import { useAction } from '../../app/data';
import type { Group } from '../../lib/types';
import type { NewRummyPlayer } from '../../api/types';

const POINT_LIMITS = [101, 151, 201] as const;

/** A new rummy game in a Rummy group (SPEC RUMMY-7): players come from the group's members,
 *  everyone picked to start with since the usual case is the whole group at the table. */
export function NewRummyGameDialog({ open, onClose, group }: { open: boolean; onClose(): void; group: Group }) {
  const { run, busy } = useAction();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [pointLimit, setPointLimit] = useState<101 | 151 | 201>(101);
  const [buyIn, setBuyIn] = useState('');
  const [left, setLeft] = useState<string[]>([]); // members sitting this one out
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) => setLeft((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));
  const close = () => { setName(''); setPointLimit(101); setBuyIn(''); setLeft([]); setError(null); onClose(); };

  const submit = async () => {
    const players: NewRummyPlayer[] = group.members.filter((m) => !left.includes(m.id)).map((m) => ({ name: m.name, userId: m.user_id }));
    if (players.length < 2) { setError('Pick at least two players'); return; }
    const buyInCents = buyIn.trim() ? parseMoney(buyIn) : 0;
    if (buyInCents === null || buyInCents < 0) { setError('Enter a valid buy-in, or leave it empty'); return; }
    const id = await run((api) => api.createRummyGame({ groupId: group.id, name, pointLimit, buyInCents, players }), 'Rummy game started');
    if (id) { close(); nav(`/rummy/${id}`); }
  };

  const playing = group.members.length - left.length;
  return (
    <Modal open={open} onClose={close} title="New rummy game"
      footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Start with {playing}</Button></>}>
      <div className="space-y-4">
        <div>
          <span className="mb-1.5 block text-[13px] font-semibold">Out at</span>
          <div role="radiogroup" aria-label="Out at" className="grid grid-cols-3 gap-2">
            {POINT_LIMITS.map((p) => (
              <button key={p} type="button" role="radio" aria-checked={pointLimit === p} onClick={() => setPointLimit(p)}
                className={clsx('h-11 rounded-xl border-2 text-sm font-semibold transition-colors',
                  pointLimit === p ? 'border-felt bg-felt/10 text-ink' : 'border-line text-ink-2 hover:bg-surface-2')}>
                {p} points
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Buy-in (optional)">
            <MoneyInput currency={group.currency} value={buyIn} placeholder="0" enterKeyHint="done" onChange={(e) => setBuyIn(e.target.value)} />
          </Field>
          <Field label="Name (optional)">
            <Input value={name} placeholder="Game 1" enterKeyHint="done" autoComplete="off" onChange={(e) => setName(e.target.value)} />
          </Field>
        </div>
        <p className="-mt-2 text-[12px] text-ink-2">
          Reach the limit and you're out; last one standing wins. With a buy-in, the winner takes the pot, and anyone knocked out can rejoin for another buy-in.
        </p>
        <div>
          <span className="mb-1.5 block text-[13px] font-semibold">Players ({playing})</span>
          <div className="grid grid-cols-2 gap-2">
            {group.members.map((m) => {
              const on = !left.includes(m.id);
              return (
                <button key={m.id} type="button" role="checkbox" aria-checked={on} onClick={() => { toggle(m.id); setError(null); }}
                  className={clsx('flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm font-semibold transition-colors',
                    on ? 'border-felt bg-felt/10' : 'border-line text-ink-2 hover:bg-surface-2')}>
                  <Avatar name={m.name} src={m.avatar_url} size={26} />
                  <span className="flex-1 truncate">{m.name}</span>
                  {on && <Check size={14} className="shrink-0 text-felt dark:text-gain" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
          {error && <p className="mt-2 text-[13px] text-loss">{error}</p>}
        </div>
      </div>
    </Modal>
  );
}
