import { ArenaState } from "../schema/ArenaState";
import { areAllied, neutralizePlayer } from "./setup";

export interface EnemyHit {
  x: number;
  y: number;
  dist: number;
  /** Type d'unité de la cible (pour les contres), si c'est une troupe. */
  defKind?: string;
  /** Applique des dégâts; gère la mort/retrait. Retourne true si la cible est détruite. */
  hit: (dmg: number) => boolean;
}

/** Ennemi le plus proche (roi / troupe / bâtiment) dans maxRange, hors alliés. */
export function nearestEnemy(
  state: ArenaState,
  x: number,
  y: number,
  ownerId: string,
  maxRange: number,
): EnemyHit | null {
  let best: EnemyHit | null = null;
  let bestD = maxRange;

  const consider = (ex: number, ey: number, makeHit: (d: number) => EnemyHit) => {
    const d = Math.hypot(ex - x, ey - y);
    if (d <= bestD) {
      bestD = d;
      best = makeHit(d);
    }
  };

  state.players.forEach((p) => {
    if (p.eliminated || !p.king.alive) return;
    if (p.sessionId === ownerId || areAllied(state, ownerId, p.sessionId)) return;
    consider(p.king.x, p.king.y, (d) => ({
      x: p.king.x,
      y: p.king.y,
      dist: d,
      hit: (dmg: number) => {
        p.king.hp -= dmg;
        if (p.king.hp <= 0) {
          p.king.hp = 0;
          neutralizePlayer(state, p.sessionId);
          return true;
        }
        return false;
      },
    }));
  });

  state.troops.forEach((t, id) => {
    if (t.ownerId === ownerId || areAllied(state, ownerId, t.ownerId)) return;
    consider(t.x, t.y, (d) => ({
      x: t.x,
      y: t.y,
      dist: d,
      defKind: t.kind,
      hit: (dmg: number) => {
        t.hp -= dmg;
        if (t.hp <= 0) {
          state.troops.delete(id);
          return true;
        }
        return false;
      },
    }));
  });

  state.buildings.forEach((b, id) => {
    if (b.ownerId === "" || b.ownerId === ownerId || areAllied(state, ownerId, b.ownerId)) return;
    consider(b.x, b.y, (d) => ({
      x: b.x,
      y: b.y,
      dist: d,
      hit: (dmg: number) => {
        b.hp -= dmg;
        if (b.hp <= 0) {
          state.buildings.delete(id);
          return true;
        }
        return false;
      },
    }));
  });

  return best;
}
