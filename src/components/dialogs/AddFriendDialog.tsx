import { useRef, useState } from 'react';
import { Button, Field, Input, Modal, Tabs } from '../ui';
import { useAction } from '../../app/data';

type Kind = 'email' | 'guest';

/** Adds someone straight to the signed-in user's own friends list, with no group involved:
 *  with their Google email, or as a guest with just a name. */
export function AddFriendDialog({ open, onClose }: { open: boolean; onClose(): void }) {
  const { run, busy } = useAction();
  const [kind, setKind] = useState<Kind>('email');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<{ field: 'name' | 'email'; text: string } | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  const close = () => { setName(''); setEmail(''); setError(null); onClose(); };
  const submit = async () => {
    const n = name.trim(), em = kind === 'email' ? email.trim() : '';
    if (!n) { setError({ field: 'name', text: 'Enter a name' }); return; }
    if (kind === 'email' && !/^\S+@\S+\.\S+$/.test(em)) { setError({ field: 'email', text: 'Enter their Google email, or add them as a guest' }); return; }
    const id = await run((api) => api.addContact(n, em || null), `${n} added to your friends`);
    if (id) close();
  };

  return (
    <Modal open={open} onClose={close} title="Add a friend"
      footer={<><Button type="button" variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" type="submit" form="add-friend" loading={busy}>{kind === 'guest' ? 'Add guest' : 'Add friend'}</Button></>}>
      <div className="space-y-3">
        <Tabs<Kind> value={kind} onChange={(k) => { setKind(k); setError(null); }}
          tabs={[{ value: 'email', label: 'With email' }, { value: 'guest', label: 'Guest, no email' }]} />
        <form id="add-friend" className="space-y-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <Field label="Name" error={error?.field === 'name' ? error.text : null}>
            <Input autoFocus value={name} placeholder="Ravi" autoComplete="off" enterKeyHint={kind === 'guest' ? 'done' : 'next'}
              onChange={(e) => { setName(e.target.value); setError(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && kind === 'email' && !email) { e.preventDefault(); emailRef.current?.focus(); } }} />
          </Field>
          {kind === 'email' && (
            <Field label="Google email" error={error?.field === 'email' ? error.text : null} hint="They see your balances once they sign in with it.">
              <Input ref={emailRef} type="email" inputMode="email" autoCapitalize="none" autoComplete="off" enterKeyHint="done" value={email} placeholder="ravi@gmail.com"
                onChange={(e) => { setEmail(e.target.value); setError(null); }} />
            </Field>
          )}
        </form>
      </div>
    </Modal>
  );
}
