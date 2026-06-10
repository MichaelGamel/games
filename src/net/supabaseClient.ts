/**
 * The shared Supabase client, created from build-time env vars.
 *
 * Online play uses only Realtime broadcast/presence — no database, no auth — so
 * the public anon key is all that's needed. This module (and the Supabase SDK
 * it imports) only loads inside the lazy online chunk.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from './config'

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 20 } },
    })
  : null
