import { useRef, useState } from 'react';
import { clsx } from 'clsx';
import { LogOut, Sun, Moon, Monitor, RotateCcw, Camera, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useAction, useData } from '../app/data';
import { useAuth } from '../app/auth';
import { useToast } from '../app/toast';
import { getTheme, setTheme, type Theme } from '../lib/theme';
import { resizeImage } from '../lib/image';
import { resetDemo } from '../api/demoApi';
import { Avatar, Button, Card, Field, Input, PageHeader, Select } from '../components/ui';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { CURRENCIES } from '../components/dialogs/CreateGroupDialog';

export function ProfilePage() {
  const data = useData();
  const { me } = data;
  const { mode, signOut } = useAuth();
  const { run, busy } = useAction();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(me.display_name);
  const [currency, setCurrency] = useState(me.default_currency || 'USD');
  const [theme, setThemeState] = useState<Theme>(getTheme());
  const [confirmingReset, setConfirmingReset] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dirty = name.trim() !== me.display_name || currency !== me.default_currency;

  const handlePhoto = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.push('Choose an image file', 'error'); return; }
    if (file.size > 15 * 1024 * 1024) { toast.push('That image is too large', 'error'); return; }
    try {
      const blob = await resizeImage(file);
      await run((api) => api.uploadAvatar(blob), 'Profile photo updated');
    } catch (e) {
      toast.push(e instanceof Error ? e.message : 'Could not process that image', 'error');
    }
  };

  const themes: { value: Theme; label: string; icon: typeof Sun }[] = [
    { value: 'light', label: 'Light', icon: Sun }, { value: 'dark', label: 'Dark', icon: Moon }, { value: 'system', label: 'System', icon: Monitor },
  ];

  return (
    <>
      <PageHeader title="Profile" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.2fr_1fr]">
        <Card className="p-5">
          <div className="mb-5 flex items-center gap-4">
            <div className="relative shrink-0">
              <Avatar name={me.display_name} src={me.avatar_url} size={64} />
              <button type="button" aria-label="Change photo" title="Change photo" disabled={busy} onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-surface bg-felt text-felt-ink disabled:opacity-50">
                <Camera size={12} aria-hidden="true" />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; void handlePhoto(f); }} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-lg font-medium md:text-xl">{me.display_name}</p>
              <p className="truncate text-sm text-ink-2">{me.email}{mode === 'supabase' && ', signed in with Google'}</p>
              {me.avatar_url && (
                <button type="button" disabled={busy} onClick={() => run((api) => api.removeAvatar(), 'Profile photo removed')}
                  className="mt-1 inline-flex items-center gap-1 text-[12px] font-semibold text-ink-2 hover:text-loss disabled:opacity-50">
                  <X size={12} aria-hidden="true" />Remove photo
                </button>
              )}
            </div>
          </div>
          <div className="space-y-4">
            <Field label="Display name" hint="Everyone sees this name for you, in every group and friends list.">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Currency for totals">
              <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</Select>
            </Field>
            <div className="flex justify-end">
              <Button variant="primary" disabled={!dirty || !name.trim()} loading={busy}
                onClick={() => run((api) => api.updateProfile({ display_name: name.trim(), default_currency: currency }), 'Profile saved')}>
                Save changes
              </Button>
            </div>
          </div>
        </Card>

        <div className="space-y-5">
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
              <Button className="w-full" onClick={() => setConfirmingReset(true)}><RotateCcw size={16} aria-hidden="true" />Reset demo data</Button>
            )}
            <Button variant="danger" className="w-full" onClick={() => signOut()}>
              <LogOut size={16} aria-hidden="true" />{mode === 'demo' ? 'Leave demo' : 'Sign out'}
            </Button>
          </Card>
        </div>
      </div>
      <ConfirmDialog open={confirmingReset} onClose={() => setConfirmingReset(false)} title="Reset demo data?" tone="primary" icon={RotateCcw}
        confirmLabel="Reset" body="This replaces everything in the demo with the original sample groups, games, and expenses. Anything you've added or changed in demo mode is lost."
        onConfirm={() => {
          setConfirmingReset(false);
          resetDemo(); qc.invalidateQueries({ queryKey: ['all'] }); toast.push('Demo data reset');
        }} />
    </>
  );
}
