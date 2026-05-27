import { GameConfig } from "@rts/shared";
import { ArenaState } from "../schema/ArenaState";
import * as intents from "../intents";

/**
 * IA simple des bots (mode solo) : construit son économie, produit des troupes,
 * puis attaque le Roi ennemi le plus proche. Appelée de façon throttlée par la Room.
 * Réutilise les intents serveur (mêmes validations gold/distance que les humains).
 */
export function updateBotAI(state: ArenaState): void {
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
    state.troops.forEach((t) => {
      if (t.ownerId === bot.sessionId) troops++;
    });

    const kx = bot.king.x;
    const ky = bot.king.y;
    const spot = (i: number) => {
      const a = i * 2.39996; // angle d'or -> placements espacés
      const r = 110 + (i % 3) * 70;
      return { x: kx + Math.cos(a) * r, y: ky + Math.sin(a) * r };
    };

    // Ordre de construction
    if (barracks === 0 && bot.gold >= GameConfig.BUILDINGS.barracks.cost) {
      const s = spot(0);
      intents.build(state, bot.sessionId, { kind: "barracks", x: s.x, y: s.y });
    } else if (mines < 2 && bot.gold >= GameConfig.BUILDINGS.goldmine.cost) {
      const s = spot(mines + 1);
      intents.build(state, bot.sessionId, { kind: "goldmine", x: s.x, y: s.y });
    } else if (towers === 0 && bot.gold >= GameConfig.BUILDINGS.tower.cost) {
      const s = spot(4);
      intents.build(state, bot.sessionId, { kind: "tower", x: s.x, y: s.y });
    }

    // Produire des troupes dès que possible
    if (idleBarracks > 0 && bot.gold >= GameConfig.TROOP.cost) {
      intents.trainTroop(state, bot.sessionId, {});
    }

    // Attaquer l'ennemi le plus proche dès qu'une petite armée est prête
    if (troops >= 3) {
      let bestId = "";
      let bestD = Infinity;
      state.players.forEach((e) => {
        if (e.sessionId === bot.sessionId || e.eliminated || !e.king.alive) return;
        if (e.allianceId !== "" && e.allianceId === bot.allianceId) return;
        const d = Math.hypot(e.king.x - kx, e.king.y - ky);
        if (d < bestD) {
          bestD = d;
          bestId = e.sessionId;
        }
      });
      if (bestId && bot.currentTargetId !== bestId) {
        intents.attackTarget(state, bot.sessionId, { targetPlayerId: bestId });
      }
    }
  });
}
