import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { Search, UserPlus, X } from 'lucide-react';
import { Avatar, Badge, Button, Field, Input, Modal, Select } from '../ui';
import { useAction, useData } from '../../app/data';
import { friendsList, STATUS_LABEL, type FriendStatus } from '../../lib/ledger';
import type { Group } from '../../lib/types';
import type { NewRummyPlayer } from '../../api/types';

const STATUS_TONE: Record<FriendStatus, 'felt' | 'brass' | 'neutral'> = { friend: 'felt', invited: 'brass', guest: 'neutral' };
const POINT_LIMITS = [100, 150, 200] as const;

/** `group` set = launched from inside a club, roster comes from its members.
 *  `group` omitted = the standalone tracker, roster comes from friends plus typed-in guests. */
export function NewRummyGameDialog({ open, onClose, group }: { open: boolean; onClose(): void; group?: Group }) {
  const data = useData();
  const { run, busy } = useAction();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [pointLimit, setPointLimit] = useState<100 | 150 | 200>(100);
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guests, setGuests] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const friends = group ? [] : friendsList(data);
  const shown = friends.filter((f) => f.name.toLowerCase().includes(q.trim().toLowerCase()));
  const toggle = (key: string) => setPicked((xs) => (xs.includes(key) ? xs.filter((x) => x !== key) : [...xs, key]));

  const addGuest = () => {
    const n = guestName.trim();
    if (!n) return;
    setGuests((gs) => [...gs, n]);
    setGuestName('');
  };

  const close = () => {
    setName(''); setPointLimit(100); setPicked([]); setQ(''); setGuestName(''); setGuests([]); setError(null);
    onClose();
  };

  const submit = async () => {
    const players: NewRummyPlayer[] = group
      ? group.members.filter((m) => picked.includes(m.id)).map((m) => ({ name: m.name, userId: m.user_id }))
      : [
          ...friends.filter((f) => picked.includes(f.key)).map((f) => ({ name: f.name, userId: f.status === 'friend' ? f.key.slice(2) : null })),
          ...guests.map((n) => ({ name: n, userId: null })),
        ];
    if (players.length < 2) { setError('Pick at least two players'); return; }
    const id = await run((api) => api.createRummyGame({ groupId: group?.id ?? null, name, pointLimit, players }), 'Rummy game started');
    if (id) { close(); nav(`/rummy/${id}`); }
  };

  return (
    <Modal open={open} onClose={close} title="New rummy game" wide
      footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Start game</Button></>}>
      <div className="space-y-4">
        <Field label="Name (optional)">
          <Input value={name} placeholder={group ? `${group.name} rummy` : 'Friday night rummy'} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Points to eliminate a player" hint="Cross this total and you're out, marked in red. Last player standing wins.">
          <Select value={pointLimit} onChange={(e) => setPointLimit(Number(e.target.value) as 100 | 150 | 200)}>
            {POINT_LIMITS.map((p) => <option key={p} value={p}>{p} points</option>)}
          </Select>
        </Field>
        <div>
          <span className="mb-1.5 block text-[13px] font-semibold">Players</span>
          {group ? (
            <div className="grid grid-cols-2 gap-2">
              {group.members.map((m) => {
                const on = picked.includes(m.id);
                return (
                  <button key={m.id} type="button" aria-pressed={on} onClick={() => toggle(m.id)}
                    className={clsx('flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm font-semibold transition-colors',
                      on ? 'border-felt bg-felt/10' : 'border-line text-ink-2 hover:bg-surface-2')}>
                    <Avatar name={m.name} src={m.avatar_url} size={26} />
                    <span className="flex-1 truncate">{m.name}</span>
                  </button>
                );
              })}
            </div>
          ) : (
            <>
              <div className="relative mb-2">
                <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-2" aria-hidden="true" />
                <Input aria-label="Search friends" className="h-9 pl-8 text-sm" placeholder="Search friends" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              {friends.length === 0 ? (
                <p className="text-[13px] text-ink-2">No friends yet — add players by name below instead.</p>
              ) : (
                <div className="-mx-1 max-h-40 space-y-1 overflow-y-auto">
                  {shown.map((f) => {
                    const on = picked.includes(f.key);
                    return (
                      <button key={f.key} type="button" aria-pressed={on} onClick={() => toggle(f.key)}
                        className={clsx('flex w-full items-center gap-2.5 rounded-lg border px-2.5 py-1.5 text-left transition-colors',
                          on ? 'border-felt bg-felt/10' : 'border-transparent hover:bg-surface-2')}>
                        <Avatar name={f.name} src={f.avatar_url} size={28} />
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{f.name}</span>
                        <Badge tone={STATUS_TONE[f.status]}>{STATUS_LABEL[f.status]}</Badge>
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="mt-2 flex gap-2">
                <Input className="h-9 flex-1 text-sm" placeholder="Playing without an account? Add by name"
                  value={guestName} onChange={(e) => setGuestName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addGuest(); } }} />
                <Button type="button" size="sm" onClick={addGuest}><UserPlus size={14} aria-hidden="true" />Add</Button>
              </div>
              {guests.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {guests.map((n, i) => (
                    <span key={`${n}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-surface-2 py-1 pl-2.5 pr-1.5 text-[13px] font-semibold">
                      {n}
                      <button type="button" aria-label={`Remove ${n}`} className="text-ink-2 hover:text-ink" onClick={() => setGuests((gs) => gs.filter((_, x) => x !== i))}>
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
          {error && <p className="mt-2 text-[13px] text-loss">{error}</p>}
        </div>
      </div>
    </Modal>
  );
}
