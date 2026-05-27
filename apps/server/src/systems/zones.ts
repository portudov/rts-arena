import { GameConfig } from "@rts/shared";
import { ArenaState } from "../schema/ArenaState";

/** Capture de zones: présence majoritaire fait progresser; vide/contesté décroît. */
export function updateZones(state: ArenaState, dtMs: number): void {
  const dt = dtMs / 1000;

  state.zones.forEach((z) => {
    const counts = new Map<string, number>();
    const add = (id: string) => counts.set(id, (counts.get(id) ?? 0) + 1);

    state.players.forEach((p) => {
      if (p.eliminated || !p.king.alive) return;
      if (Math.hypot(p.king.x - z.x, p.king.y - z.y) <= z.radius) add(p.sessionId);
    });
    state.troops.forEach((t) => {
      if (Math.hypot(t.x - z.x, t.y - z.y) <= z.radius) add(t.ownerId);
    });

    let topId = "";
    let topN = 0;
    let contested = false;
    counts.forEach((n, id) => {
      if (n > topN) {
        topN = n;
        topId = id;
        contested = false;
      } else if (n === topN && id !== topId) {
        contested = true;
      }
    });

    if (topN === 0 || contested) {
      z.captureProgress = Math.max(0, z.captureProgress - GameConfig.ZONE.DECAY_PER_SEC * dt);
      if (z.captureProgress === 0) z.controllerId = "";
      return;
    }

    const delta = (1000 / GameConfig.ZONE.CAPTURE_TIME_MS) * dt * topN;
    if (z.controllerId === topId) {
      z.captureProgress = Math.min(1, z.captureProgress + delta);
    } else {
      z.captureProgress -= delta;
      if (z.captureProgress <= 0) {
        z.controllerId = topId;
        z.captureProgress = Math.min(1, -z.captureProgress);
      }
    }
  });
}
