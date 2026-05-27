import { ArenaState } from "../schema/ArenaState";

export interface MatchEndResult {
  ended: boolean;
  winnerId: string; // sessionId du vainqueur ("" si nul)
  reason: "elimination" | "timeout" | "";
}

/** Dernier Roi (ou dernière alliance) debout = victoire; limite de temps = plus de PV. */
export function checkWinCondition(state: ArenaState): MatchEndResult {
  if (state.phase !== "playing") return { ended: false, winnerId: "", reason: "" };

  const alive: string[] = [];
  state.players.forEach((p) => {
    if (!p.eliminated && p.king.alive) alive.push(p.sessionId);
  });

  const factions = new Set<string>();
  for (const id of alive) {
    const p = state.players.get(id)!;
    factions.add(p.allianceId !== "" ? `a:${p.allianceId}` : `s:${id}`);
  }

  if (alive.length === 0) return { ended: true, winnerId: "", reason: "elimination" };
  if (factions.size <= 1) return { ended: true, winnerId: alive[0], reason: "elimination" };

  if (state.timeLimitMs > 0 && state.elapsedMs >= state.timeLimitMs) {
    let bestId = alive[0];
    let bestHp = -1;
    for (const id of alive) {
      const hp = state.players.get(id)!.king.hp;
      if (hp > bestHp) {
        bestHp = hp;
        bestId = id;
      }
    }
    return { ended: true, winnerId: bestId, reason: "timeout" };
  }

  return { ended: false, winnerId: "", reason: "" };
}
