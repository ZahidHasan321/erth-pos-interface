/**
 * Database client facade.
 *
 * Every file that talks to the database imports `db` from here — never from
 * a vendor SDK directly. To swap backends (e.g. raw PostgREST, custom API
 * server, Drizzle HTTP), replace the implementation in this file. The rest
 * of the app stays untouched.
 *
 * Current backend: Supabase (PostgREST + RPC via @supabase/supabase-js)
 */

import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('Missing database environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)');
}

export const db = createClient(url, anonKey);
