import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../app/auth';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { Check } from 'lucide-react';
import { Avatar, Button, Field, Input, Modal, MoneyInput } from '../ui';
import { parseMoney } from '../../lib/money';
import { useAction } from '../../app/data';
import type { Group } from '../../lib/types';
import type { NewRummyPlayer } from '../../api/types';
import { RUMMY_MAX_PLAYERS } from '../../lib/rummy';

const POINT_LIMITS = [101, 151, 201] as const;

/** A new rummy game in a Rummy group (SPEC RUMMY-7): players come from the group's members,
 *  everyone picked to start with since the usual case is the whole group at the table. */
export function NewRummyGameDialog({ open, onClose, group }: { open: boolean; onClose(): void; group: Group }) {
  const { run, busy } = useAction();
  const { api } = useAuth();
  const nav = useNavigate();
  // One rummy game in progress per group (SPEC RUMMY-15): same list the Games tab shows.
  const games = useQuery({ queryKey: ['rummy-list', group.id], queryFn: () => api.loadRummyGames(group.id), enabled: open });
  const inProgress = games.data?.find((x) => x.status === 'active');
  const [name, setName] = useState('');
  const [pointLimit, setPointLimit] = useState<101 | 151 | 201>(101);
  const [buyIn, setBuyIn] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Everyone to start with when the whole group fits at one table (up to 7, SPEC RUMMY-16).
  useEffect(() => {
    if (open) setPicked(group.members.length <= RUMMY_MAX_PLAYERS ? group.members.map((m) => m.id) : []);
  }, [open, group.members]);
  const toggle = (id: string) => {
    if (picked.includes(id)) { setPicked((xs) => xs.filter((x) => x !== id)); setError(null); return; }
    if (picked.length >= RUMMY_MAX_PLAYERS) { setError(`A rummy table takes up to ${RUMMY_MAX_PLAYERS} players. Untick someone first.`); return; }
    setPicked((xs) => [...xs, id]); setError(null);
  };
  const close = () => { setName(''); setPointLimit(101); setBuyIn(''); setPicked([]); setError(null); onClose(); };

  const submit = async () => {
    const players: NewRummyPlayer[] = group.members.filter((m) => picked.includes(m.id)).map((m) => ({ name: m.name, userId: m.user_id }));
    if (players.length < 2) { setError('Pick at least two players'); return; }
    const buyInCents = buyIn.trim() ? parseMoney(buyIn) : 0;
    if (buyInCents === null || buyInCents < 0) { setError('Enter a valid buy-in, or leave it empty'); return; }
    const id = await run((api) => api.createRummyGame({ groupId: group.id, name, pointLimit, buyInCents, players }), 'Rummy game started');
    if (id) { close(); nav(`/rummy/${id}`); }
  };

  const playing = picked.length;
  return (
    <Modal open={open} onClose={close} title="New rummy game"
      footer={inProgress
        ? <><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" onClick={() => { close(); nav(`/rummy/${inProgress.id}`); }}>Open that game</Button></>
        : <><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Start with {playing}</Button></>}>
      {inProgress ? (
        <p className="rounded-xl border border-brass/40 bg-brass/10 px-3 py-3 text-sm text-ink">
          <b>{inProgress.name || 'A rummy game'}</b> is still in progress in {group.name}. Close it (or delete it) before starting a new one, so there's only one game at a time.
        </p>
      ) : (
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
          <span className="mb-1.5 block text-[13px] font-semibold">Players ({playing} of up to {RUMMY_MAX_PLAYERS})</span>
          <div className="grid grid-cols-2 gap-2">
            {group.members.map((m) => {
              const on = picked.includes(m.id);
              return (
                <button key={m.id} type="button" role="checkbox" aria-checked={on} onClick={() => toggle(m.id)}
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
      )}
    </Modal>
  );
}
