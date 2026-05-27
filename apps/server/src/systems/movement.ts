import { GameConfig, TERRAIN, terrainAt, worldToTile, unitDef } from "@rts/shared";
import { ArenaState } from "../schema/ArenaState";
import { getPlayerBonuses } from "./bonuses";
import { nearestEnemy } from "./targeting";
import { findPath } from "./pathfinding";

/** Entité disposant de champs de chemin (Roi/Troupe). */
type Pathed = {
  x: number;
  y: number;
  path: { x: number; y: number }[];
  pathIdx: number;
  pathGoalKey: string;
};

function terrainSpeedMul(state: ArenaState, x: number, y: number): number {
  if (state.tiles.length === 0) return 1;
  const { tx, ty } = worldToTile(x, y);
  const m = TERRAIN[terrainAt(state.tiles, tx, ty)].speedMul;
  return m > 0 ? m : 0.05; // ne jamais bloquer totalement (sécurité)
}

/** Avance `e` vers (gx,gy) via A* d'au plus `step` ; (re)calcule le chemin si le but change. */
function stepAlong(state: ArenaState, e: Pathed, gx: number, gy: number, step: number): void {
  const gt = worldToTile(gx, gy);
  const goalKey = `${gt.tx},${gt.ty}`;
  if (e.pathGoalKey !== goalKey || e.path.length === 0 || e.pathIdx >= e.path.length) {
    const p = findPath(state.tiles, e.x, e.y, gx, gy);
    e.path = p && p.length > 0 ? p : [{ x: gx, y: gy }];
    e.pathIdx = 0;
    e.pathGoalKey = goalKey;
  }
  let remaining = step;
  let x = e.x;
  let y = e.y;
  while (remaining > 0.0001 && e.pathIdx < e.path.length) {
    const wp = e.path[e.pathIdx];
    const d = Math.hypot(wp.x - x, wp.y - y);
    if (d <= remaining) {
      x = wp.x;
      y = wp.y;
      remaining -= d;
      e.pathIdx++;
    } else {
      x += ((wp.x - x) / d) * remaining;
      y += ((wp.y - y) / d) * remaining;
      remaining = 0;
    }
  }
  e.x = x;
  e.y = y;
}

function clearPath(e: Pathed): void {
  e.path = [];
  e.pathIdx = 0;
  e.pathGoalKey = "";
}

/** Déplacement autoritatif via A* (contourne les obstacles) + steering/engagement des troupes. */
export function updateMovement(state: ArenaState, dtMs: number): void {
  const dt = dtMs / 1000;

  state.players.forEach((p) => {
    if (p.eliminated || !p.king.alive) return;
    const k = p.king;
    if (Math.hypot(k.targetX - k.x, k.targetY - k.y) < 4) {
      clearPath(k);
      return;
    }
    const speed =
      GameConfig.KING.SPEED *
      getPlayerBonuses(state, p.sessionId).speedMultiplier *
      terrainSpeedMul(state, k.x, k.y);
    stepAlong(state, k, k.targetX, k.targetY, speed * dt);
  });

  state.troops.forEach((t) => {
    const owner = state.players.get(t.ownerId);
    if (!owner || owner.eliminated) return;
    const def = unitDef(t.kind);
    const speed =
      def.speed *
      getPlayerBonuses(state, t.ownerId).speedMultiplier *
      terrainSpeedMul(state, t.x, t.y);
    const step = speed * dt;

    // 1) ennemi proche -> engagement (le combat gère les dégâts)
    const near = nearestEnemy(state, t.x, t.y, t.ownerId, GameConfig.TROOP.aggroRange);
    if (near) {
      if (near.dist <= def.range) {
        t.state = "engaging";
        clearPath(t);
      } else {
        t.state = "moving";
        stepAlong(state, t, near.x, near.y, step);
      }
      return;
    }

    // 2) cible désignée -> Roi ennemi
    if (t.targetPlayerId) {
      const dest = targetDestination(state, t.targetPlayerId);
      if (dest) {
        t.state = "moving";
        stepAlong(state, t, dest.x, dest.y, step);
        return;
      }
      t.targetPlayerId = "";
    }

    // 3) sinon: rester près de la base
    const home = homePosition(state, t.ownerId);
    if (Math.hypot(home.x - t.x, home.y - t.y) > GameConfig.TROOP.idleSpread) {
      t.state = "moving";
      stepAlong(state, t, home.x, home.y, step);
    } else {
      t.state = "idle";
      clearPath(t);
    }
  });
}

function targetDestination(state: ArenaState, targetPlayerId: string): { x: number; y: number } | null {
  const tp = state.players.get(targetPlayerId);
  if (!tp || tp.eliminated || !tp.king.alive) return null;
  return { x: tp.king.x, y: tp.king.y };
}

function homePosition(state: ArenaState, ownerId: string): { x: number; y: number } {
  let found: { x: number; y: number } | null = null;
  state.buildings.forEach((b) => {
    if (!found && b.ownerId === ownerId && b.kind === "barracks") found = { x: b.x, y: b.y };
  });
  if (found) return found;
  const owner = state.players.get(ownerId);
  if (owner) return { x: owner.king.x, y: owner.king.y };
  return { x: GameConfig.MAP_WIDTH / 2, y: GameConfig.MAP_HEIGHT / 2 };
}
