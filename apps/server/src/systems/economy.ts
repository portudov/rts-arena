import { GameConfig } from "@rts/shared";
import { ArenaState } from "../schema/ArenaState";
import { getPlayerBonuses } from "./bonuses";
import { spawnTroop } from "./setup";

/** Or généré par les mines (× bonus de zone) + production des casernes. */
export function updateEconomy(state: ArenaState, dtMs: number): void {
  const dt = dtMs / 1000;

  state.players.forEach((p) => {
    if (p.eliminated) return;
    let goldPerSec = 0;
    state.buildings.forEach((b) => {
      if (b.ownerId === p.sessionId && b.kind === "goldmine") {
        goldPerSec += GameConfig.BUILDINGS.goldmine.goldPerSec;
      }
    });
    if (goldPerSec > 0) {
      const bonus = getPlayerBonuses(state, p.sessionId);
      p.gold += goldPerSec * dt * bonus.goldMultiplier;
    }
  });

  state.buildings.forEach((b) => {
    if (b.kind !== "barracks" || b.trainTimer < 0) return;
    b.trainTimer -= dtMs;
    b.trainProgress = 1 - Math.max(0, b.trainTimer) / GameConfig.TROOP.trainTimeMs;
    if (b.trainTimer <= 0) {
      let count = 0;
      state.troops.forEach((t) => {
        if (t.ownerId === b.ownerId) count++;
      });
      if (count < GameConfig.MAX_TROOPS_PER_PLAYER) {
        const angle = Math.random() * Math.PI * 2;
        const r = GameConfig.TROOP.idleSpread * (0.4 + Math.random() * 0.6);
        spawnTroop(state, b.ownerId, b.x + Math.cos(angle) * r, b.y + Math.sin(angle) * r);
      }
      b.trainTimer = -1;
      b.trainProgress = 0;
    }
  });
}
