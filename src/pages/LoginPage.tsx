import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../app/auth';
import { useToast } from '../app/toast';
import { Button } from '../components/ui';
import { Logo } from '../components/Logo';
import { formatMoney } from '../lib/money';

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

const SAMPLE = [
  { name: 'Suki', net: 12000 }, { name: 'Kiran', net: 6000 }, { name: 'Vamsi', net: 4000 },
  { name: 'Teja', net: -4000 }, { name: 'Ravi', net: -8000 }, { name: 'Ajay', net: -10000 },
];

export function LoginPage() {
  const { status, supabaseReady, signInWithGoogle, startDemo } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (status === 'signedIn') return <Navigate to="/" replace />;

  const google = async () => {
    setBusy(true);
    try { await signInWithGoogle(); } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Google sign-in failed', 'error');
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-dvh md:grid-cols-[1.1fr_1fr]">
      <section className="felt relative hidden flex-col justify-between p-12 md:flex">
        <p className="font-display text-sm opacity-80">Friday night, 1:14 am</p>
        <div className="max-w-sm">
          <p className="mb-4 text-sm opacity-80">Six players, $700 on the table</p>
          <ul className="space-y-2">
            {SAMPLE.map((p) => (
              <li key={p.name} className="flex items-baseline justify-between border-b border-felt-ink/15 pb-2">
                <span className="text-base">{p.name}</span>
                <span className="amount font-display text-2xl">{formatMoney(p.net, 'USD', { sign: true })}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 font-display text-3xl leading-tight">Settled in four payments.</p>
        </div>
        <p className="text-sm opacity-70">Card nights and shared expenses, in one ledger.</p>
      </section>

      <section className="flex flex-col justify-center px-6 py-12 md:px-16">
        <div className="mx-auto w-full max-w-sm">
          <Logo size={36} />
          <h1 className="mt-8 font-display text-3xl font-medium leading-tight tracking-tight">Know who owes whom, every game and every trip.</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-2">
            Log each player's buy-in and cash-out, split the pizza, and get the fewest payments to square everyone up.
          </p>
          <div className="mt-8 flex flex-col gap-3">
            <Button onClick={google} loading={busy} disabled={!supabaseReady} className="h-12 border-line text-[15px]">
              <GoogleMark /> Continue with Google
            </Button>
            <p className="-mt-1 text-[13px] leading-relaxed text-ink-2">
              No Gmail? When creating a Google account, choose <b className="font-semibold text-ink">Use your existing email</b> (Yahoo, Outlook, any address), then sign in here with it.
            </p>
            <Button variant="primary" onClick={startDemo} className="mt-2 h-12 text-[15px]">Try the demo</Button>
          </div>
          {!supabaseReady && (
            <p className="mt-4 rounded-lg bg-surface-2 p-3 text-[13px] leading-relaxed text-ink-2">
              Sign-in turns on once you add your Supabase keys to <code className="font-semibold text-ink">.env.local</code>. The README walks through it.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
