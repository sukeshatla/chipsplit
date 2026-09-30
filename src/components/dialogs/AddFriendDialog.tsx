import { useState } from 'react';
import { Button, Field, Input, Modal } from '../ui';
import { useAction } from '../../app/data';

/** Adds someone straight to the signed-in user's own friends list, with no group involved. */
export function AddFriendDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const { run, busy } = useAction();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const n = name.trim();
    if (!n) { setError('Enter a name'); return; }
    if (email && !/^\S+@\S+\.\S+$/.test(email.trim())) { setError('That email looks incomplete'); return; }
    const id = await run((api) => api.addContact(n, email.trim() || null), `${n} added to your friends`);
    if (id) { setName(''); setEmail(''); onClose(); }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add a friend"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Add friend</Button></>}>
      <div className="space-y-4">
        <Field label="Name" error={error}>
          <Input autoFocus value={name} placeholder="Ravi" onChange={(e) => { setName(e.target.value); setError(null); }} />
        </Field>
        <Field label="Google email (optional)" hint="If they already have an account, you'll see their real balance right away. Otherwise they're a guest until they sign in with this email.">
          <Input type="email" value={email} placeholder="ravi@gmail.com" onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
        </Field>
      </div>
    </Modal>
  );
}
