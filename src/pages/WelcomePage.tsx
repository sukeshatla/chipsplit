import { useState } from 'react';
import { useAction, useData } from '../app/data';
import { useAuth } from '../app/auth';
import { Avatar, Button, Field, Input } from '../components/ui';
import { Logo } from '../components/Logo';

/** First sign-in only: confirm the name everyone will see for you. It's yours alone to change
 *  (Profile, any time); nobody else in the app can rename you. */
export function WelcomePage() {
  const { me } = useData();
  const { signOut } = useAuth();
  const { run, busy } = useAction();
  const [name, setName] = useState(me.display_name);
  const clean = name.trim();
  const confirm = () => clean && run((api) => api.updateProfile({ display_name: clean, name_confirmed: true }), `Welcome, ${clean.split(' ')[0]}`);

  return (
    <div className="flex min-h-dvh items-center justify-center px-5 py-10">
      <div className="w-full max-w-sm">
        <Logo size={36} />
        <h1 className="mt-8 font-display text-3xl font-medium leading-tight tracking-tight">Welcome! Is this your name?</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
          Everyone sees this name for you, in every group, friends list, and game. Change it here, or later on your Profile.
        </p>
        <div className="mt-6 flex items-center gap-3 rounded-xl bg-surface-2 px-4 py-3">
          <Avatar name={clean || me.display_name} src={me.avatar_url} size={44} />
          <div className="min-w-0">
            <p className="truncate font-semibold">{clean || 'Your name'}</p>
            <p className="truncate text-[13px] text-ink-2">{me.email}</p>
          </div>
        </div>
        <Field label="Your name" className="mt-5">
          <Input autoFocus value={name} maxLength={60} placeholder="First and last name" onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void confirm(); }} className="h-12" />
        </Field>
        <Field label="Email" hint="From your Google account. Friends who added you by this email are already linked to you." className="mt-4">
          <Input value={me.email} disabled className="h-12" />
        </Field>
        <Button variant="primary" className="mt-6 h-12 w-full text-[15px]" loading={busy} disabled={!clean} onClick={() => void confirm()}>
          Continue
        </Button>
        <button type="button" className="mt-4 w-full text-center text-[13px] font-semibold text-ink-2 hover:text-ink" onClick={() => signOut()}>
          Not you? Sign out
        </button>
      </div>
    </div>
  );
}
