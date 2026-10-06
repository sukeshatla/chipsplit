import { useRef, useState } from 'react';
import { clsx } from 'clsx';
import { Button, Field, Input, Modal } from '../ui';
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
        {/* A small switch rather than full-size tabs, so the whole form fits above a phone keyboard. */}
        <div role="radiogroup" aria-label="Kind of friend" className="flex gap-1 rounded-lg bg-surface-2 p-0.5">
          {([['email', 'With email'], ['guest', 'Guest, no email']] as const).map(([k, label]) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => { setKind(k); setError(null); }}
              className={clsx('h-8 flex-1 rounded-md text-[13px] font-semibold transition-colors', kind === k ? 'bg-surface text-ink shadow-sm' : 'text-ink-2')}>
              {label}
            </button>
          ))}
        </div>
        <form id="add-friend" className="space-y-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <Field label="Name" error={error?.field === 'name' ? error.text : null}>
            <Input autoFocus value={name} placeholder="Ravi" autoComplete="off" enterKeyHint={kind === 'guest' ? 'done' : 'next'}
              onChange={(e) => { setName(e.target.value); setError(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && kind === 'email' && !email) { e.preventDefault(); emailRef.current?.focus(); } }} />
          </Field>
          {kind === 'email' && (
            <Field label="Google email" error={error?.field === 'email' ? error.text : null} hint="They see balances once they sign in with it.">
              <Input ref={emailRef} type="email" inputMode="email" autoCapitalize="none" autoComplete="off" enterKeyHint="done" value={email} placeholder="ravi@gmail.com"
              onFocus={(e) => { const el = e.currentTarget; setTimeout(() => el.scrollIntoView({ block: 'nearest' }), 300); }}
                onChange={(e) => { setEmail(e.target.value); setError(null); }} />
            </Field>
          )}
        </form>
      </div>
    </Modal>
  );
}
