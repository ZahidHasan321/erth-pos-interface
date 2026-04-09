/**
 * Database client facade.
 *
 * Uses createClient with default localStorage storage. The @supabase/ssr
 * createBrowserClient was removed because it breaks Realtime postgres_changes
 * subscriptions. Since both apps are pure SPAs (no server), cookie-based
 * auth via document.cookie provides no XSS advantage over localStorage.
 */

import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('Missing database environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)');
}

export const db = createClient(url, anonKey);
