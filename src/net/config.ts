/**
 * Online configuration flags derived from build-time env vars.
 *
 * Kept free of any `@supabase/supabase-js` import so the main bundle can read
 * `isSupabaseConfigured` without pulling the (large) Supabase SDK in. The SDK
 * lives in the lazily-loaded online chunk instead.
 */
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
