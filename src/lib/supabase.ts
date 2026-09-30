import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && key);

// PKCE puts the OAuth code in the query string (?code=...), which keeps it clear of the
// HashRouter's #/ routes on GitHub Pages.
export const supabase = supabaseConfigured
  ? createClient(url!, key!, { auth: { flowType: 'pkce', persistSession: true, detectSessionInUrl: true } })
  : null;
