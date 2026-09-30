import { useState } from 'react';
import { Button, Field, Input, Modal } from '../ui';
import { useAction } from '../../app/data';
import type { Group } from '../../lib/types';

export function AddMemberDialog({ group, open, onClose, onAdded }: { group: Group; open: boolean; onClose(): void; onAdded?(id: string): void }) {
  const { run, busy } = useAction();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const n = name.trim();
    if (!n) { setError('Enter a name'); return; }
    if (group.members.some((m) => m.name.toLowerCase() === n.toLowerCase())) { setError('Someone in this group already has that name'); return; }
    if (email && !/^\S+@\S+\.\S+$/.test(email.trim())) { setError('That email looks incomplete'); return; }
    const id = await run((api) => api.addMember(group.id, n, email.trim() || null), `${n} added`);
    if (id) { onAdded?.(id); setName(''); setEmail(''); onClose(); }
  };

  return (
    <Modal open={open} onClose={onClose} title={`Add to ${group.name}`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Add friend</Button></>}>
      <div className="space-y-4">
        <Field label="Name" error={error}>
          <Input autoFocus value={name} placeholder="Ravi" onChange={(e) => { setName(e.target.value); setError(null); }} />
        </Field>
        <Field label="Google email (optional)" hint="When they sign in with this email, they'll see this group and their balances.">
          <Input type="email" value={email} placeholder="ravi@gmail.com" onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
        </Field>
      </div>
    </Modal>
  );
}
