import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

let client: SupabaseClient | null = null;
function getClient(): SupabaseClient | null {
  if (!url || !serviceKey) return null;
  if (!client) client = createClient(url, serviceKey, { auth: { persistSession: false } });
  return client;
}

export interface MatchPlayerResult {
  userId: string;
  pseudo: string;
  resultat: "win" | "loss" | "draw" | "abandon";
  stats: Record<string, unknown>;
}

/**
 * Écrit le résultat de partie via service_role (bypass RLS). No-op si Supabase non configuré.
 * Le serveur de jeu est la seule autorité à écrire matches / match_players.
 */
export async function persistMatch(
  winnerUserId: string,
  players: MatchPlayerResult[],
  settings: Record<string, unknown>,
): Promise<void> {
  const db = getClient();
  if (!db) {
    console.log("[persistence] Supabase non configuré — résultat non écrit (dev).");
    return;
  }
  try {
    const userIds = players.map((p) => p.userId).filter((u) => !u.startsWith("guest:"));
    const profileByUser = new Map<string, string>();
    if (userIds.length) {
      const { data } = await db.from("profiles").select("id,user_id").in("user_id", userIds);
      for (const row of data ?? []) profileByUser.set(row.user_id as string, row.id as string);
    }

    const winnerProfile = profileByUser.get(winnerUserId) ?? null;
    const { data: match } = await db
      .from("matches")
      .insert({ ended_at: new Date().toISOString(), winner_profile_id: winnerProfile, settings })
      .select("id")
      .single();
    if (!match) return;

    const rows = players
      .map((p) => {
        const pid = profileByUser.get(p.userId);
        return pid ? { match_id: match.id, profile_id: pid, resultat: p.resultat, stats: p.stats } : null;
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    if (rows.length) await db.from("match_players").insert(rows);

    for (const p of players) {
      const pid = profileByUser.get(p.userId);
      if (!pid) continue;
      await db.rpc("increment_match_stats", { p_profile_id: pid, p_win: p.resultat === "win" ? 1 : 0 });
    }
  } catch (e) {
    console.error("[persistence] échec écriture:", e);
  }
}
