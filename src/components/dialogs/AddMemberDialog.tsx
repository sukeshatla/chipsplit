import { useMemo, useState } from 'react';
import { Mail, Search, UserPlus } from 'lucide-react';
import { Avatar, Input, Modal } from '../ui';
import { useAction, useData } from '../../app/data';
import { STATUS_LABEL, statusFromKey, friendKey } from '../../lib/ledger';
import type { Group } from '../../lib/types';

/**
 * Add someone to a group in one compact sheet: one box that both searches your friends and
 * names a new person. Nothing opens the keyboard until you tap the box, and the "add new" action
 * sits right under it -- not in a footer the phone keyboard would cover.
 */
export function AddMemberDialog({ group, open, onClose, onAdded }: { group: Group; open: boolean; onClose(): void; onAdded?(id: string): void }) {
  const data = useData();
  const { run, busy } = useAction();
  const [q, setQ] = useState('');
  const [withEmail, setWithEmail] = useState(false);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const inGroup = useMemo(() => new Set(group.members.map((m) => m.contact_id).filter((x): x is string => !!x)), [group.members]);
  const available = data.contacts.filter((c) => !inGroup.has(c.id));
  const term = q.trim();
  const shown = available.filter((c) => c.name.toLowerCase().includes(term.toLowerCase()));
  const exact = available.some((c) => c.name.toLowerCase() === term.toLowerCase());

  const close = () => { setQ(''); setWithEmail(false); setEmail(''); setError(null); onClose(); };
  const done = (id: string | undefined) => { if (id) { onAdded?.(id); close(); } };

  const addExisting = async (contactId: string) => done(await run((api) => api.addMemberFromContact(group.id, contactId), 'Added'));
  const addNew = async () => {
    if (!term) { setError('Type a name first'); return; }
    if (group.members.some((m) => m.name.toLowerCase() === term.toLowerCase())) { setError('Someone in this group already has that name'); return; }
    const em = withEmail ? email.trim() : '';
    if (em && !/^\S+@\S+\.\S+$/.test(em)) { setError('That email looks incomplete'); return; }
    done(await run((api) => api.addMember(group.id, term, em || null), `${term} added`));
  };

  return (
    <Modal open={open} onClose={close} title={`Add to ${group.name}`}>
      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-2" aria-hidden="true" />
        <Input aria-label="Search friends or type a new name" className="pl-9" placeholder="Search friends or type a new name" value={q}
          enterKeyHint="done" onChange={(e) => { setQ(e.target.value); setError(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && term && !exact && shown.length === 0) { e.preventDefault(); void addNew(); } }} />
      </div>

      {term && !exact && (
        <div className="mt-2 rounded-xl border border-felt/40 bg-felt/5 p-2">
          <button type="button" disabled={busy} onClick={addNew}
            className="flex w-full items-center gap-3 rounded-lg px-1.5 py-1.5 text-left disabled:opacity-50">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-felt text-felt-ink"><UserPlus size={16} aria-hidden="true" /></span>
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">Add “{term}” as a new person</span>
          </button>
          {withEmail ? (
            <Input type="email" autoFocus className="mt-1.5" placeholder="Their Google email" value={email} enterKeyHint="done"
              onChange={(e) => { setEmail(e.target.value); setError(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addNew(); } }} />
          ) : (
            <button type="button" className="ml-1.5 mt-0.5 inline-flex items-center gap-1 text-[12px] font-semibold text-ink-2 hover:text-ink" onClick={() => setWithEmail(true)}>
              <Mail size={12} aria-hidden="true" />Add their email (optional)
            </button>
          )}
          {withEmail && <p className="mt-1 px-1 text-[11px] text-ink-2">When they sign in with this email they'll see this group, and their own account name is shown everywhere.</p>}
        </div>
      )}
      {error && <p className="mt-2 text-[13px] text-loss">{error}</p>}

      <div className="-mx-1 mt-2 max-h-[40dvh] space-y-0.5 overflow-y-auto">
        {shown.map((c) => {
          const status = statusFromKey(friendKey(c));
          return (
            <button key={c.id} type="button" disabled={busy} onClick={() => addExisting(c.id)}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-surface-2 disabled:opacity-50">
              <Avatar name={c.name} src={c.avatar_url} size={30} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{c.name}</p>
                <p className="truncate text-[11px] text-ink-2">{STATUS_LABEL[status]}</p>
              </div>
              <UserPlus size={16} className="shrink-0 text-ink-2" aria-hidden="true" />
            </button>
          );
        })}
        {!term && available.length === 0 && (
          <p className="px-1 py-4 text-center text-[13px] text-ink-2">
            {data.contacts.length === 0 ? 'Type a name above to add someone new.' : 'All your friends are already here. Type a name to add someone new.'}
          </p>
        )}
      </div>
    </Modal>
  );
}
