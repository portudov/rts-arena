export type BuildingKind = "goldmine" | "barracks" | "tower";
export type TroopState = "idle" | "moving" | "engaging";
export type GamePhase = "lobby" | "playing" | "ended";
export type ZoneBonus = "gold" | "damage" | "speed";
export type MatchResult = "win" | "loss" | "draw" | "abandon";

export interface ProfileDTO {
  id: string;
  pseudo: string;
  parties_jouees: number;
  victoires: number;
}

/** Données d'auth retournées par onAuth (vérification du JWT Supabase). */
export interface AuthData {
  profileId: string;
  pseudo: string;
  userId: string;
}
