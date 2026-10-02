import { NavLink, Outlet, Link } from 'react-router-dom';
import { clsx } from 'clsx';
import { LayoutDashboard, Users, Spade, HeartHandshake, UserRound, FlaskConical, ShieldCheck, LogOut } from 'lucide-react';
import { DataProvider, useAppQuery } from '../app/data';
import { useAuth } from '../app/auth';
import { isAppAdmin } from '../lib/admin';
import { Avatar, Button, Spinner } from './ui';
import { Logo } from './Logo';
import { NotificationsBell } from './NotificationsBell';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/groups', label: 'Groups', icon: Users },
  { to: '/games', label: 'Club Games', icon: Spade },
  { to: '/friends', label: 'Friends', icon: HeartHandshake },
  { to: '/profile', label: 'Profile', icon: UserRound },
];
const ADMIN_NAV = { to: '/admin', label: 'Admin', icon: ShieldCheck, end: false };

export function Layout() {
  const q = useAppQuery();
  const { mode, signOut } = useAuth();

  if (q.isLoading) return <Spinner />;
  if (q.isError || !q.data) {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <p className="font-display text-lg font-medium">Couldn't load your data</p>
        <p className="mt-2 text-sm text-ink-2">{q.error instanceof Error ? q.error.message : 'Check your connection and try again.'}</p>
        <div className="mt-5 flex justify-center gap-2">
          <Button onClick={() => q.refetch()}>Try again</Button>
          <Button variant="ghost" onClick={() => signOut()}>Sign out</Button>
        </div>
      </div>
    );
  }
  const me = q.data.me;
  const nav = isAppAdmin(me.email) ? [...NAV, ADMIN_NAV] : NAV;

  return (
    <DataProvider data={q.data}>
      <div className="min-h-dvh md:flex">
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface px-3 py-5 md:flex">
          <div className="mb-6 flex items-center justify-between px-2">
            <Link to="/"><Logo /></Link>
            <NotificationsBell />
          </div>
          <nav className="flex flex-col gap-0.5">
            {nav.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end}
                className={({ isActive }) => clsx('flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition-colors',
                  isActive ? 'bg-felt text-felt-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink')}>
                <Icon size={18} aria-hidden="true" />{label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto flex items-center gap-2.5 rounded-xl px-2 py-2">
            <Avatar name={me.display_name} src={me.avatar_url} size={32} />
            <div className="min-w-0 text-sm">
              <p className="truncate font-semibold">{me.display_name}</p>
              <p className="truncate text-[12px] text-ink-2">{me.email}</p>
            </div>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {mode === 'demo' && (
            <div className="flex items-center justify-center gap-2 border-b border-brass/30 bg-brass/10 px-4 py-1.5 text-[13px] text-brass">
              <FlaskConical size={14} className="shrink-0" aria-hidden="true" />
              <span className="min-w-0">Demo mode<span className="hidden sm:inline">. Data stays in this browser.</span></span>
              <button type="button" onClick={() => signOut()}
                className="ml-1 inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-brass/40 px-2.5 font-semibold hover:bg-brass/15">
                <LogOut size={14} aria-hidden="true" />Exit demo
              </button>
            </div>
          )}
          <header className="flex items-center justify-between px-4 pb-1 pt-4 md:hidden">
            <Link to="/"><Logo /></Link>
            <div className="flex items-center gap-1">
              <NotificationsBell />
              <Link to="/profile" aria-label="Profile"><Avatar name={me.display_name} src={me.avatar_url} size={32} /></Link>
            </div>
          </header>
          <main className="mx-auto w-full max-w-5xl px-4 pb-28 pt-4 md:px-8 md:pb-12 md:pt-8">
            <Outlet />
          </main>
        </div>

        <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end}
              className={({ isActive }) => clsx('flex h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-semibold',
                isActive ? 'text-felt dark:text-gain' : 'text-ink-2')}>
              <Icon size={20} aria-hidden="true" />{label}
            </NavLink>
          ))}
        </nav>
      </div>
    </DataProvider>
  );
}
