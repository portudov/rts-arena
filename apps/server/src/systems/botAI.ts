import { GameConfig, unitDef, UNIT_KINDS, type UnitKind } from "@rts/shared";
import { ArenaState } from "../schema/ArenaState";
import { Player } from "../schema/Player";
import { areAllied } from "./setup";
import * as intents from "../intents";

export type Difficulty = "easy" | "normal" | "hard";

/** Réglages par niveau (pas de triche en Normal ; léger bonus éco en Difficile). */
const AI: Record<
  Difficulty,
  {
    actEvery: number; // agit 1 fois sur N appels (temps de réaction)
    attackAt: number; // nb de troupes avant d'attaquer
    ecoTrickle: number; // bonus d'or par action (Difficile)
    maxMines: number;
    barracks: number; // nb de casernes visées (production)
    retreatHp: number; // fraction de PV sous laquelle le Roi fuit
    focusHuman: boolean; // priorise le joueur humain
  }
> = {
  easy: { actEvery: 3, attackAt: 6, ecoTrickle: 0, maxMines: 3, barracks: 1, retreatHp: 0.2, focusHuman: false },
  normal: { actEvery: 1, attackAt: 4, ecoTrickle: 0, maxMines: 5, barracks: 2, retreatHp: 0.3, focusHuman: false },
  hard: { actEvery: 1, attackAt: 3, ecoTrickle: 12, maxMines: 7, barracks: 3, retreatHp: 0.4, focusHuman: true },
};

/** Quel type CONTRE le type donné (triangle). */
const COUNTER_OF: Record<UnitKind, UnitKind> = {
  infantry: "archer",
  archer: "cavalry",
  cavalry: "infantry",
};

let _tick = 0;

export function updateBotAI(state: ArenaState, difficulty: Difficulty = "normal"): void {
  _tick++;
  const cfg = AI[difficulty] ?? AI.normal;
  if (_tick % cfg.actEvery !== 0) return;

  state.players.forEach((bot) => {
    if (!bot.isBot || bot.eliminated || !bot.king.alive) return;

    let mines = 0;
    let barracks = 0;
    let towers = 0;
    let idleBarracks = 0;
    state.buildings.forEach((b) => {
      if (b.ownerId !== bot.sessionId) return;
      if (b.kind === "goldmine") mines++;
      else if (b.kind === "barracks") {
        barracks++;
        if (b.trainTimer < 0) idleBarracks++;
      } else if (b.kind === "tower") towers++;
    });

    let troops = 0;
    const myKinds: Record<string, number> = { infantry: 0, archer: 0, cavalry: 0 };
    const enemyKinds: Record<string, number> = { infantry: 0, archer: 0, cavalry: 0 };
    state.troops.forEach((t) => {
      if (t.ownerId === bot.sessionId) {
        troops++;
        if (t.kind in myKinds) myKinds[t.kind]++;
      } else if (!areAllied(state, bot.sessionId, t.ownerId) && t.kind in enemyKinds) {
        enemyKinds[t.kind]++;
      }
    });

    if (cfg.ecoTrickle > 0) bot.gold += cfg.ecoTrickle;

    const kx = bot.king.x;
    const ky = bot.king.y;
    const spot = (i: number) => {
      const a = i * 2.39996;
      const r = 110 + (i % 3) * 70;
      return { x: kx + Math.cos(a) * r, y: ky + Math.sin(a) * r };
    };

    // MACRO : 1 caserne -> 2 mines -> casernes supplémentaires -> reste des mines -> tour
    const bCost = GameConfig.BUILDINGS.barracks.cost;
    const mCost = GameConfig.BUILDINGS.goldmine.cost;
    const tCost = GameConfig.BUILDINGS.tower.cost;
    if (barracks === 0 && bot.gold >= bCost) {
      const s = spot(0);
      intents.build(state, bot.sessionId, { kind: "barracks", x: s.x, y: s.y });
    } else if (mines < 2 && bot.gold >= mCost) {
      const s = spot(mines + 1);
      intents.build(state, bot.sessionId, { kind: "goldmine", x: s.x, y: s.y });
    } else if (barracks < cfg.barracks && bot.gold >= bCost) {
      const s = spot(barracks + 5);
      intents.build(state, bot.sessionId, { kind: "barracks", x: s.x, y: s.y });
    } else if (mines < cfg.maxMines && bot.gold >= mCost) {
      const s = spot(mines + 1);
      intents.build(state, bot.sessionId, { kind: "goldmine", x: s.x, y: s.y });
    } else if (towers === 0 && bot.gold >= tCost) {
      const s = spot(4);
      intents.build(state, bot.sessionId, { kind: "tower", x: s.x, y: s.y });
    }

    // COMPOSITION : contrer le type ennemi dominant, sinon équilibrer
    if (idleBarracks > 0) {
      let unit: UnitKind = "infantry";
      const top = topKind(enemyKinds);
      if (top && enemyKinds[top] >= 2) unit = COUNTER_OF[top];
      else unit = leastKind(myKinds);
      if (bot.gold >= unitDef(unit).cost) intents.trainTroop(state, bot.sessionId, { unit });
    }

    // SÉCURITÉ DU ROI : fuir la menace si bas en PV
    if (bot.king.hp / bot.king.maxHp < cfg.retreatHp) {
      const threat = nearestEnemyKing(state, bot);
      if (threat) {
        const dx = kx - threat.x;
        const dy = ky - threat.y;
        const d = Math.hypot(dx, dy) || 1;
        bot.king.targetX = clamp(kx + (dx / d) * 320, 0, GameConfig.MAP_WIDTH);
        bot.king.targetY = clamp(ky + (dy / d) * 320, 0, GameConfig.MAP_HEIGHT);
      }
    }

    // ATTAQUE : ré-engage TOUTE l'armée à chaque action (les nouvelles troupes rejoignent l'assaut)
    if (troops >= cfg.attackAt) {
      const tgt = pickTarget(state, bot, cfg.focusHuman);
      if (tgt) intents.attackTarget(state, bot.sessionId, { targetPlayerId: tgt });
    }
  });
}

function topKind(m: Record<string, number>): UnitKind | null {
  let best: UnitKind | null = null;
  let v = 0;
  for (const k of UNIT_KINDS) {
    if ((m[k] ?? 0) > v) {
      v = m[k];
      best = k;
    }
  }
  return best;
}

function leastKind(m: Record<string, number>): UnitKind {
  let best: UnitKind = "infantry";
  let v = Infinity;
  for (const k of UNIT_KINDS) {
    if ((m[k] ?? 0) < v) {
      v = m[k] ?? 0;
      best = k;
    }
  }
  return best;
}

function nearestEnemyKing(state: ArenaState, bot: Player): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bd = Infinity;
  state.players.forEach((e) => {
    if (e.sessionId === bot.sessionId || e.eliminated || !e.king.alive) return;
    if (areAllied(state, bot.sessionId, e.sessionId)) return;
    const d = Math.hypot(e.king.x - bot.king.x, e.king.y - bot.king.y);
    if (d < bd) {
      bd = d;
      best = { x: e.king.x, y: e.king.y };
    }
  });
  return best;
}

function pickTarget(state: ArenaState, bot: Player, focusHuman: boolean): string {
  let bestId = "";
  let bestScore = Infinity;
  state.players.forEach((e) => {
    if (e.sessionId === bot.sessionId || e.eliminated || !e.king.alive) return;
    if (areAllied(state, bot.sessionId, e.sessionId)) return;
    let score = Math.hypot(e.king.x - bot.king.x, e.king.y - bot.king.y);
    if (focusHuman && !e.isBot) score -= 5000; // priorité à l'humain
    score += e.king.hp * 0.3; // préférer les plus faibles
    if (score < bestScore) {
      bestScore = score;
      bestId = e.sessionId;
    }
  });
  return bestId;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
