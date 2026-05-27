import { jwtVerify } from "jose";
import type { AuthData } from "@rts/shared";

const SECRET = process.env.SUPABASE_JWT_SECRET ?? "";

/**
 * Vérifie le JWT Supabase (HS256) et renvoie l'identité du joueur.
 * En dev (pas de secret configuré), bascule en mode invité: le token sert de pseudo.
 */
export async function verifySupabaseJwt(token: string | undefined): Promise<AuthData> {
  if (!SECRET) {
    const pseudo =
      token && token.trim() ? token.trim().slice(0, 24) : `Invité-${Math.floor(Math.random() * 9999)}`;
    const id = `guest:${pseudo}`;
    return { profileId: id, pseudo, userId: id };
  }

  if (!token) throw new Error("Token manquant");
  const { payload } = await jwtVerify(token, new TextEncoder().encode(SECRET));
  const userId = String(payload.sub ?? "");
  if (!userId) throw new Error("JWT invalide");
  const meta = (payload as Record<string, unknown>).user_metadata as Record<string, unknown> | undefined;
  const pseudo = String((meta?.pseudo as string) ?? (payload.email as string) ?? userId).slice(0, 24);
  // profileId = userId ici; la persistance résout le vrai profiles.id via user_id.
  return { profileId: userId, pseudo, userId };
}
