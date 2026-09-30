import { useState } from 'react';
import { clsx } from 'clsx';
import { LogOut, Sun, Moon, Monitor, RotateCcw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAction, useData } from '../app/data';
import { useAuth } from '../app/auth';
import { useToast } from '../app/toast';
import { pokerStats } from '../lib/ledger';
import { getTheme, setTheme, type Theme } from '../lib/theme';
import { resetDemo } from '../api/demoApi';
import { Amount, Avatar, Button, Card, Field, Input, PageHeader, Select } from '../components/ui';
import { CURRENCIES } from '../components/dialogs/CreateGroupDialog';

export function ProfilePage() {
  const data = useData();
  const { me } = data;
  const { mode, signOut } = useAuth();
  const { run, busy } = useAction();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(me.display_name);
  const [handle, setHandle] = useState(me.payment_handle ?? '');
  const [currency, setCurrency] = useState(me.default_currency || 'USD');
  const [theme, setThemeState] = useState<Theme>(getTheme());
  const stats = pokerStats(data);
  const dirty = name.trim() !== me.display_name || handle.trim() !== (me.payment_handle ?? '') || currency !== me.default_currency;

  const themes: { value: Theme; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: 'Light', icon: Sun }, { value: 'dark', label: 'Dark', icon: Moon }, { value: 'system', label: 'System', icon: Monitor },
  ];

  return (
    <>
      <PageHeader title="Profile" />
      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <Card className="p-5">
          <div className="mb-5 flex items-center gap-4">
            {me.avatar_url ? <img src={me.avatar_url} alt="" referrerPolicy="no-referrer" className="h-16 w-16 rounded-full object-cover" /> : <Avatar name={me.display_name} size={64} />}
            <div className="min-w-0">
              <p className="truncate font-display text-xl font-medium">{me.display_name}</p>
              <p className="truncate text-sm text-ink-2">{me.email}{mode === 'supabase' && ', signed in with Google'}</p>
            </div>
          </div>
          <div className="space-y-4">
            <Field label="Display name" hint="New groups you create will use this name for you.">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="How friends can pay you" hint="Shown to you as a reminder when you settle up.">
              <Input value={handle} placeholder="Zelle: suki@example.com" onChange={(e) => setHandle(e.target.value)} />
            </Field>
            <Field label="Currency for totals">
              <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select>
            </Field>
            <div className="flex justify-end">
              <Button variant="primary" disabled={!dirty || !name.trim()} loading={busy}
                onClick={() => run((api) => api.updateProfile({ display_name: name.trim(), payment_handle: handle.trim() || null, default_currency: currency }), 'Profile saved')}>
                Save changes
              </Button>
            </div>
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="mb-3 font-display text-base font-medium">Your poker</h2>
            {stats.games === 0 ? <p className="text-sm text-ink-2">Play a finalized game day to see your numbers.</p> : (
              <dl className="grid grid-cols-2 gap-y-4">
                <div><dt className="text-[13px] text-ink-2">All-time</dt><dd><Amount cents={stats.net} currency={currency} sign className="text-xl" /></dd></div>
                <div><dt className="text-[13px] text-ink-2">Winning nights</dt><dd className="font-display text-xl font-medium">{stats.wins} of {stats.games}</dd></div>
                <div><dt className="text-[13px] text-ink-2">Best night</dt><dd><Amount cents={stats.best} currency={currency} sign className="text-xl" /></dd></div>
                <div><dt className="text-[13px] text-ink-2">Worst night</dt><dd><Amount cents={stats.worst} currency={currency} sign className="text-xl" /></dd></div>
              </dl>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-3 font-display text-base font-medium">Appearance</h2>
            <div role="radiogroup" className="grid grid-cols-3 gap-2">
              {themes.map(({ value, label, icon: Icon }) => (
                <button key={value} role="radio" aria-checked={theme === value} onClick={() => { setTheme(value); setThemeState(value); }}
                  className={clsx('flex flex-col items-center gap-1.5 rounded-xl border py-3 text-[13px] font-semibold',
                    theme === value ? 'border-felt bg-felt/10' : 'border-line text-ink-2 hover:bg-surface-2')}>
                  <Icon size={18} aria-hidden="true" />{label}
                </button>
              ))}
            </div>
          </Card>

          <Card className="space-y-2 p-5">
            {mode === 'demo' && (
              <Button className="w-full" onClick={() => {
                if (!confirm('Reset the demo to its sample data?')) return;
                resetDemo(); qc.invalidateQueries({ queryKey: ['all'] }); toast.push('Demo data reset');
              }}><RotateCcw size={16} aria-hidden="true" />Reset demo data</Button>
            )}
            <Button variant="danger" className="w-full" onClick={() => signOut()}>
              <LogOut size={16} aria-hidden="true" />{mode === 'demo' ? 'Leave demo' : 'Sign out'}
            </Button>
          </Card>
        </div>
      </div>
    </>
  );
}
