import { GameConfig } from "@rts/shared";
import { ArenaState } from "../schema/ArenaState";
import { getPlayerBonuses } from "./bonuses";
import { nearestEnemy } from "./targeting";

/** Combat temps réel par DPS: Rois, troupes et tours frappent l'ennemi le plus proche à portée. */
export function updateCombat(state: ArenaState, dtMs: number): void {
  state.players.forEach((p) => {
    if (p.eliminated || !p.king.alive) return;
    p.king.atkCd -= dtMs;
    if (p.king.atkCd > 0) return;
    const tgt = nearestEnemy(state, p.king.x, p.king.y, p.sessionId, GameConfig.KING.RANGE);
    if (tgt) {
      tgt.hit(GameConfig.KING.DAMAGE * getPlayerBonuses(state, p.sessionId).damageMultiplier);
      p.king.atkCd = GameConfig.KING.ATTACK_COOLDOWN_MS;
    }
  });

  state.troops.forEach((t) => {
    t.atkCd -= dtMs;
    if (t.atkCd > 0) return;
    const tgt = nearestEnemy(state, t.x, t.y, t.ownerId, GameConfig.TROOP.range);
    if (tgt) {
      tgt.hit(GameConfig.TROOP.damage * getPlayerBonuses(state, t.ownerId).damageMultiplier);
      t.atkCd = GameConfig.TROOP.attackCooldownMs;
    }
  });

  state.buildings.forEach((b) => {
    if (b.kind !== "tower" || b.ownerId === "") return;
    b.atkCd -= dtMs;
    if (b.atkCd > 0) return;
    const cfg = GameConfig.BUILDINGS.tower;
    const tgt = nearestEnemy(state, b.x, b.y, b.ownerId, cfg.range);
    if (tgt) {
      tgt.hit(cfg.damage * getPlayerBonuses(state, b.ownerId).damageMultiplier);
      b.atkCd = cfg.attackCooldownMs;
    }
  });
}
