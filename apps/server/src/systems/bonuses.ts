import { GameConfig, TERRAIN, terrainAt, worldToTile } from "@rts/shared";
import { ArenaState } from "../schema/ArenaState";

export interface PlayerBonuses {
  goldMultiplier: number;
  damageMultiplier: number;
  speedMultiplier: number;
}

/** Bonus issus des zones pleinement contrôlées (captureProgress >= 1) par le joueur. */
export function getPlayerBonuses(state: ArenaState, sessionId: string): PlayerBonuses {
  const b: PlayerBonuses = { goldMultiplier: 1, damageMultiplier: 1, speedMultiplier: 1 };
  state.zones.forEach((z) => {
    if (z.controllerId !== sessionId || z.captureProgress < 1) return;
    if (z.bonusType === "gold") b.goldMultiplier *= GameConfig.ZONE_BONUSES.gold.goldMultiplier;
    else if (z.bonusType === "damage") b.damageMultiplier *= GameConfig.ZONE_BONUSES.damage.damageMultiplier;
    else if (z.bonusType === "speed") b.speedMultiplier *= GameConfig.ZONE_BONUSES.speed.speedMultiplier;
  });
  return b;
}

/** Bonus de terrain à une position MONDE (Phase 3). */
function tileMul(state: ArenaState, x: number, y: number): { dmg: number; range: number; defTaken: number } {
  if (state.tiles.length === 0) return { dmg: 1, range: 1, defTaken: 1 };
  const { tx, ty } = worldToTile(x, y);
  const d = TERRAIN[terrainAt(state.tiles, tx, ty)];
  return { dmg: d.damageBonus, range: d.rangeBonus, defTaken: 1 - d.defenseBonus };
}

/** Multiplicateur de dégâts INFLIGÉS par une unité sur cette tuile (colline > 1). */
export function terrainDamageMul(state: ArenaState, x: number, y: number): number {
  return tileMul(state, x, y).dmg;
}
/** Multiplicateur de portée d'attaque d'une unité sur cette tuile (colline > 1). */
export function terrainRangeMul(state: ArenaState, x: number, y: number): number {
  return tileMul(state, x, y).range;
}
/** Multiplicateur de dégâts SUBIS par une unité sur cette tuile (forêt < 1). */
export function terrainDamageTakenMul(state: ArenaState, x: number, y: number): number {
  return tileMul(state, x, y).defTaken;
}
