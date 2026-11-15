import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';

// Server-side admin client — uses the secret key, bypasses RLS.
// Use this only after verifying the caller's identity via the Authorization header.
export const supabaseAdmin = createClient(config.supabase.url, config.supabase.secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Build a per-request client scoped to the caller's JWT — RLS applies.
export function supabaseForUser(accessToken: string) {
  return createClient(config.supabase.url, config.supabase.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}
