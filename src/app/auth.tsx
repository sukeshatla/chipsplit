import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase, supabaseConfigured } from '../lib/supabase';
import { demoApi } from '../api/demoApi';
import { supabaseApi } from '../api/supabaseApi';
import type { DataApi } from '../api/types';

type Status = 'loading' | 'signedOut' | 'signedIn';
type Mode = 'demo' | 'supabase';

interface AuthCtx {
  status: Status;
  mode: Mode;
  api: DataApi;
  supabaseReady: boolean;
  signInWithGoogle(): Promise<void>;
  sendMagicLink(email: string): Promise<void>;
  startDemo(): void;
  signOut(): Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);
const MODE_KEY = 'chipsplit_mode';

function readMode(): Mode {
  try { return localStorage.getItem(MODE_KEY) === 'demo' ? 'demo' : 'supabase'; } catch { return 'supabase'; }
}

/** Remove the one-time OAuth ?code= from the address bar after Supabase exchanges it. */
function cleanOAuthParams() {
  const url = new URL(window.location.href);
  if (url.searchParams.has('code') || url.searchParams.has('error')) {
    url.searchParams.delete('code');
    url.searchParams.delete('error');
    url.searchParams.delete('error_description');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>(readMode);
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    if (mode === 'demo') { setStatus('signedIn'); return; }
    if (!supabase) { setStatus('signedOut'); return; }
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setStatus(data.session ? 'signedIn' : 'signedOut');
      cleanOAuthParams();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setStatus(session ? 'signedIn' : 'signedOut');
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [mode]);

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) throw new Error('Supabase is not configured');
    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    if (error) throw error;
  }, []);

  /** Emails a one-time sign-in link; no password ever exists. Completes via the same
   *  PKCE ?code= redirect handling as Google, once the person clicks the link. */
  const sendMagicLink = useCallback(async (email: string) => {
    if (!supabase) throw new Error('Supabase is not configured');
    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
    if (error) throw error;
  }, []);

  const startDemo = useCallback(() => {
    localStorage.setItem(MODE_KEY, 'demo');
    qc.clear();
    setMode('demo');
    setStatus('signedIn');
  }, [qc]);

  const signOut = useCallback(async () => {
    qc.clear();
    if (mode === 'demo') {
      localStorage.removeItem(MODE_KEY);
      setStatus('signedOut');
      setMode('supabase');
      return;
    }
    await supabase?.auth.signOut();
    setStatus('signedOut');
  }, [mode, qc]);

  const value = useMemo<AuthCtx>(() => ({
    status, mode, api: mode === 'demo' ? demoApi : supabaseApi, supabaseReady: supabaseConfigured,
    signInWithGoogle, sendMagicLink, startDemo, signOut,
  }), [status, mode, signInWithGoogle, sendMagicLink, startDemo, signOut]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth must be inside AuthProvider');
  return c;
}
