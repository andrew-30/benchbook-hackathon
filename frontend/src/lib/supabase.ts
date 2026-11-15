import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY');
}

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    // Use the PKCE (authorization-code) flow instead of the default implicit
    // flow. Implicit flow returns the session in the URL hash
    // (#access_token=…&refresh_token=…), which leaks tokens into the address
    // bar, browser history, and server logs. PKCE returns a short-lived
    // ?code=… that detectSessionInUrl exchanges for the session, so tokens
    // never appear in the URL.
    flowType: 'pkce',
  },
});
