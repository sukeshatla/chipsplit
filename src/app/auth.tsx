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
  /** The 6-digit code from the same email -- works in any browser or mail app, unlike the link. */
  verifyEmailCode(email: string, code: string): Promise<void>;
  /** Why the last sign-in link didn't work (expired, opened in another browser), if it didn't. */
  authError: string | null;
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
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (mode === 'demo') { setStatus('signedIn'); return; }
    if (!supabase) { setStatus('signedOut'); return; }
    let alive = true;
    const url = new URL(window.location.href);
    const hadCode = url.searchParams.has('code');
    const urlError = url.searchParams.get('error_description');
    supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return;
      setStatus(data.session ? 'signedIn' : 'signedOut');
      // A link opened in a different browser or app than the one it was asked from can't finish
      // (PKCE keeps half the secret in the asking browser) -- say so instead of silently looping.
      if (!data.session && (urlError || error || hadCode)) {
        setAuthError(urlError ?? "That sign-in link didn't work here. It may have expired, or been opened in a different browser or mail app. Type your email below, then use the 6-digit code from that same email, or send a new one.");
      }
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

  /** Emails a one-time sign-in link and 6-digit code; no password ever exists. The link completes
   *  via the same PKCE ?code= redirect as Google; the code via verifyEmailCode. */
  const sendMagicLink = useCallback(async (email: string) => {
    if (!supabase) throw new Error('Supabase is not configured');
    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
    if (error) throw error;
  }, []);

  const verifyEmailCode = useCallback(async (email: string, code: string) => {
    if (!supabase) throw new Error('Supabase is not configured');
    const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
    if (error) throw new Error(/expired|invalid/i.test(error.message) ? 'That code is wrong or has expired. Check the latest email, or send a new one.' : error.message);
    setAuthError(null);
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
    signInWithGoogle, sendMagicLink, verifyEmailCode, authError, startDemo, signOut,
  }), [status, mode, signInWithGoogle, sendMagicLink, verifyEmailCode, authError, startDemo, signOut]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth must be inside AuthProvider');
  return c;
}
