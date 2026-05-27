import { GameConfig } from "@rts/shared";
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
