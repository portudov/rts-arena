import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** null si Supabase non configuré -> le jeu bascule en mode invité. */
export const supabase: SupabaseClient | null = url && anon ? createClient(url, anon) : null;
