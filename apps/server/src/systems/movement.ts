import { GameConfig, moveToward } from "@rts/shared";
import { ArenaState } from "../schema/ArenaState";
import { getPlayerBonuses } from "./bonuses";
import { nearestEnemy } from "./targeting";

/** Déplacement autoritatif: Roi (intention joueur) + steering/engagement des troupes. */
export function updateMovement(state: ArenaState, dtMs: number): void {
  const dt = dtMs / 1000;

  state.players.forEach((p) => {
    if (p.eliminated || !p.king.alive) return;
    const speed = GameConfig.KING.SPEED * getPlayerBonuses(state, p.sessionId).speedMultiplier;
    const r = moveToward(p.king.x, p.king.y, p.king.targetX, p.king.targetY, speed * dt);
    p.king.x = r.x;
    p.king.y = r.y;
  });

  state.troops.forEach((t) => {
    const owner = state.players.get(t.ownerId);
    if (!owner || owner.eliminated) return;
    const speed = GameConfig.TROOP.speed * getPlayerBonuses(state, t.ownerId).speedMultiplier;

    // 1) ennemi proche -> engagement (le combat gère les dégâts)
    const near = nearestEnemy(state, t.x, t.y, t.ownerId, GameConfig.TROOP.aggroRange);
    if (near) {
      if (near.dist <= GameConfig.TROOP.range) {
        t.state = "engaging";
      } else {
        t.state = "moving";
        const r = moveToward(t.x, t.y, near.x, near.y, speed * dt);
        t.x = r.x;
        t.y = r.y;
      }
      return;
    }

    // 2) cible désignée -> foncer vers le Roi ennemi
    if (t.targetPlayerId) {
      const dest = targetDestination(state, t.targetPlayerId);
      if (dest) {
        t.state = "moving";
        const r = moveToward(t.x, t.y, dest.x, dest.y, speed * dt);
        t.x = r.x;
        t.y = r.y;
        return;
      }
      t.targetPlayerId = ""; // cible disparue
    }

    // 3) sinon: rester près de la base
    const home = homePosition(state, t.ownerId);
    if (Math.hypot(home.x - t.x, home.y - t.y) > GameConfig.TROOP.idleSpread) {
      t.state = "moving";
      const r = moveToward(t.x, t.y, home.x, home.y, speed * dt);
      t.x = r.x;
      t.y = r.y;
    } else {
      t.state = "idle";
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
