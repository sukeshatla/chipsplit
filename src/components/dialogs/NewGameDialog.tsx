import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { Check, UserPlus } from 'lucide-react';
import { Avatar, Button, Field, Input, Modal, MoneyInput, Select } from '../ui';
import { useAction, useData } from '../../app/data';
import { centsToInput, formatMoney, parseMoney, todayISO } from '../../lib/money';
import { AddMemberDialog } from './AddMemberDialog';

export function NewGameDialog({ open, onClose, groupId }: { open: boolean; onClose(): void; groupId?: string }) {
  const data = useData();
  const clubGroups = data.groups.filter((g) => g.kind === 'club');
  const { run, busy } = useAction();
  const nav = useNavigate();
  const [gid, setGid] = useState(groupId ?? clubGroups[0]?.id ?? '');
  const group = data.groups.find((g) => g.id === gid);
  const last = useMemo(() => group?.sessions.slice().sort((a, b) => b.played_on.localeCompare(a.played_on))[0], [group]);
  const [date, setDate] = useState(todayISO());
  const [location, setLocation] = useState('');
  const [buyIn, setBuyIn] = useState('');
  const [players, setPlayers] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [buyInError, setBuyInError] = useState<string | null>(null);
  const [addingPerson, setAddingPerson] = useState(false);

  useEffect(() => {
    if (!open || !group) return;
    setPlayers(last ? last.results.map((r) => r.member_id) : group.members.map((m) => m.id));
    // Required every time, so nobody starts a game on a stale amount; last game's is one tap away.
    setBuyIn(''); setBuyInError(null);
    setDate(todayISO()); setLocation(''); setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, gid]);

  const toggle = (id: string) => setPlayers((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const submit = async () => {
    if (!group) { setError('Create a Club first'); return; }
    const cents = parseMoney(buyIn) ?? 0;
    if (cents <= 0) { setBuyInError('Enter the buy-in per player'); return; }
    if (players.length < 2) { setError('Pick at least two players'); return; }
    const id = await run(async (api) => {
      const sid = await api.createSession({ group_id: group.id, played_on: date, location: location.trim() || null, notes: null, default_buy_in_cents: cents });
      await api.saveSessionResults(sid, players.map((m) => ({ member_id: m, buy_in_cents: cents, cash_out_cents: 0 })));
      return sid;
    }, 'Game started');
    if (id) { onClose(); nav(`/groups/${group.id}/games/${id}`); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Start a game"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Start game</Button></>}>
      {clubGroups.length === 0 ? (
        <p className="text-sm text-ink-2">Create a Club first, then start a game from it.</p>
      ) : (
        <div className="space-y-4">
          {!groupId && (
            <Field label="Group">
              <Select value={gid} onChange={(e) => setGid(e.target.value)}>
                {clubGroups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </Select>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Buy-in per player *" error={buyInError}>
              <MoneyInput currency={group?.currency} value={buyIn} required aria-required="true" inputMode="decimal" placeholder="Amount"
                onChange={(e) => { setBuyIn(e.target.value); setBuyInError(null); }} />
            </Field>
            {last && last.default_buy_in_cents > 0 && !buyIn && (
              <button type="button" className="col-span-2 -mt-1 justify-self-start text-[13px] font-semibold text-felt hover:underline dark:text-gain"
                onClick={() => { setBuyIn(centsToInput(last.default_buy_in_cents)); setBuyInError(null); }}>
                Same as last game: {formatMoney(last.default_buy_in_cents, group?.currency)}
              </button>
            )}
            <Field label="Where you're playing (optional)" className="col-span-2">
              <Input value={location} placeholder="Ravi's place" onChange={(e) => setLocation(e.target.value)} />
            </Field>
          </div>
          <div>
            <span className="mb-1.5 block text-[13px] font-semibold">Who's playing</span>
            <div className="grid grid-cols-2 gap-2">
              {group?.members.map((m) => {
                const on = players.includes(m.id);
                return (
                  <button key={m.id} type="button" onClick={() => toggle(m.id)} aria-pressed={on}
                    className={clsx('flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm font-semibold transition-colors',
                      on ? 'border-felt bg-felt/10' : 'border-line text-ink-2 hover:bg-surface-2')}>
                    <Avatar name={m.name} src={m.avatar_url} size={26} />
                    <span className="flex-1 truncate">{m.name}</span>
                    {on && <Check size={16} className="text-felt dark:text-gain" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
            {group && (
              <Button type="button" size="sm" className="mt-2" onClick={() => setAddingPerson(true)}>
                <UserPlus size={14} aria-hidden="true" />Add someone not in the group
              </Button>
            )}
            {error && <p className="mt-2 text-[13px] text-loss">{error}</p>}
          </div>
        </div>
      )}
      {group && (
        <AddMemberDialog group={group} open={addingPerson} onClose={() => setAddingPerson(false)}
          onAdded={(id) => setPlayers((p) => [...p, id])} />
      )}
    </Modal>
  );
}
