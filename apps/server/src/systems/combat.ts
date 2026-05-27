import { GameConfig, unitDef, counterMul } from "@rts/shared";
import { ArenaState } from "../schema/ArenaState";
import {
  getPlayerBonuses,
  terrainDamageMul,
  terrainRangeMul,
  terrainDamageTakenMul,
} from "./bonuses";
import { nearestEnemy } from "./targeting";

/**
 * Combat temps réel par DPS, avec bonus de terrain (Phase 3) :
 * - portée et dégâts de l'attaquant majorés par le terrain (colline),
 * - dégâts subis réduits par le terrain du défenseur (forêt).
 */
export function updateCombat(state: ArenaState, dtMs: number): void {
  // Rois
  state.players.forEach((p) => {
    if (p.eliminated || !p.king.alive) return;
    p.king.atkCd -= dtMs;
    if (p.king.atkCd > 0) return;
    const range = GameConfig.KING.RANGE * terrainRangeMul(state, p.king.x, p.king.y);
    const tgt = nearestEnemy(state, p.king.x, p.king.y, p.sessionId, range);
    if (tgt) {
      const dmg =
        GameConfig.KING.DAMAGE *
        getPlayerBonuses(state, p.sessionId).damageMultiplier *
        terrainDamageMul(state, p.king.x, p.king.y) *
        terrainDamageTakenMul(state, tgt.x, tgt.y);
      tgt.hit(dmg);
      p.king.atkCd = GameConfig.KING.ATTACK_COOLDOWN_MS;
    }
  });

  // Troupes
  state.troops.forEach((t) => {
    t.atkCd -= dtMs;
    if (t.atkCd > 0) return;
    const def = unitDef(t.kind);
    const range = def.range * terrainRangeMul(state, t.x, t.y);
    const tgt = nearestEnemy(state, t.x, t.y, t.ownerId, range);
    if (tgt) {
      const dmg =
        def.damage *
        getPlayerBonuses(state, t.ownerId).damageMultiplier *
        terrainDamageMul(state, t.x, t.y) *
        terrainDamageTakenMul(state, tgt.x, tgt.y) *
        counterMul(t.kind, tgt.defKind ?? "");
      tgt.hit(dmg);
      t.atkCd = def.attackCooldownMs;
    }
  });

  // Tours
  state.buildings.forEach((b) => {
    if (b.kind !== "tower" || b.ownerId === "") return;
    b.atkCd -= dtMs;
    if (b.atkCd > 0) return;
    const cfg = GameConfig.BUILDINGS.tower;
    const range = cfg.range * terrainRangeMul(state, b.x, b.y);
    const tgt = nearestEnemy(state, b.x, b.y, b.ownerId, range);
    if (tgt) {
      const dmg =
        cfg.damage *
        getPlayerBonuses(state, b.ownerId).damageMultiplier *
        terrainDamageMul(state, b.x, b.y) *
        terrainDamageTakenMul(state, tgt.x, tgt.y);
      tgt.hit(dmg);
      b.atkCd = cfg.attackCooldownMs;
    }
  });
}
