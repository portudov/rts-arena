import {
  GameConfig,
  clamp,
  isPassableWorld,
  unitDef,
  type MoveKingPayload,
  type BuildPayload,
  type TrainTroopPayload,
  type AttackTargetPayload,
  type AllianceRequestPayload,
  type AllianceAcceptPayload,
} from "@rts/shared";
import { ArenaState } from "../schema/ArenaState";
import { Building } from "../schema/Building";
import { addBuilding, areAllied, nextId } from "../systems/setup";

function finiteNum(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function moveKing(state: ArenaState, sessionId: string, payload: MoveKingPayload): void {
  const p = state.players.get(sessionId);
  if (!p || p.eliminated || !p.king.alive) return;
  const x = finiteNum(payload?.x);
  const y = finiteNum(payload?.y);
  if (x === null || y === null) return;
  p.king.targetX = clamp(x, 0, GameConfig.MAP_WIDTH);
  p.king.targetY = clamp(y, 0, GameConfig.MAP_HEIGHT);
}

export function build(state: ArenaState, sessionId: string, payload: BuildPayload): void {
  const p = state.players.get(sessionId);
  if (!p || p.eliminated || !p.king.alive) return;
  const kind = payload?.kind;
  if (kind !== "goldmine" && kind !== "barracks" && kind !== "tower") return;
  const x = finiteNum(payload?.x);
  const y = finiteNum(payload?.y);
  if (x === null || y === null) return;
  if (x < 0 || y < 0 || x > GameConfig.MAP_WIDTH || y > GameConfig.MAP_HEIGHT) return;
  if (Math.hypot(x - p.king.x, y - p.king.y) > GameConfig.BUILD_RANGE_FROM_KING) return;
  // Pas de construction sur une tuile impassable (montagne/eau), si le terrain est chargé.
  if (state.tiles.length > 0 && !isPassableWorld(state.tiles, x, y)) return;

  let tooClose = false;
  state.buildings.forEach((b) => {
    if (Math.hypot(b.x - x, b.y - y) < GameConfig.BUILD_MIN_DISTANCE) tooClose = true;
  });
  if (tooClose) return;

  const cost = GameConfig.BUILDINGS[kind].cost;
  if (p.gold < cost) return;
  p.gold -= cost;
  addBuilding(state, sessionId, kind, x, y);
}

export function trainTroop(state: ArenaState, sessionId: string, payload: TrainTroopPayload): void {
  const p = state.players.get(sessionId);
  if (!p || p.eliminated) return;

  let count = 0;
  state.troops.forEach((t) => {
    if (t.ownerId === sessionId) count++;
  });
  if (count >= GameConfig.MAX_TROOPS_PER_PLAYER) return;

  const unit: "infantry" | "archer" | "cavalry" =
    payload?.unit === "archer" || payload?.unit === "cavalry" ? payload.unit : "infantry";

  let chosen: Building | null = null;
  state.buildings.forEach((b) => {
    if (chosen) return;
    if (b.ownerId !== sessionId || b.kind !== "barracks" || b.trainTimer >= 0) return;
    if (payload?.buildingId && b.id !== payload.buildingId) return;
    chosen = b;
  });
  if (!chosen) return;
  const def = unitDef(unit);
  if (p.gold < def.cost) return;
  p.gold -= def.cost;
  (chosen as Building).trainKind = unit;
  (chosen as Building).trainTimer = def.trainMs;
  (chosen as Building).trainProgress = 0;
}

export function attackTarget(state: ArenaState, sessionId: string, payload: AttackTargetPayload): void {
  const p = state.players.get(sessionId);
  if (!p || p.eliminated) return;
  const targetId = payload?.targetPlayerId;
  if (typeof targetId !== "string" || targetId === "" || targetId === sessionId) return;
  const target = state.players.get(targetId);
  if (!target || target.eliminated) return;
  if (areAllied(state, sessionId, targetId)) return;

  p.currentTargetId = targetId;
  state.troops.forEach((t) => {
    if (t.ownerId === sessionId) t.targetPlayerId = targetId;
  });
}

export function allianceRequest(
  state: ArenaState,
  pending: Map<string, Set<string>>,
  sessionId: string,
  payload: AllianceRequestPayload,
): void {
  const p = state.players.get(sessionId);
  const targetId = payload?.targetPlayerId;
  if (!p || p.eliminated) return;
  if (typeof targetId !== "string" || targetId === sessionId) return;
  const target = state.players.get(targetId);
  if (!target || target.eliminated || areAllied(state, sessionId, targetId)) return;
  if (!pending.has(targetId)) pending.set(targetId, new Set());
  pending.get(targetId)!.add(sessionId);
}

export function allianceAccept(
  state: ArenaState,
  pending: Map<string, Set<string>>,
  sessionId: string,
  payload: AllianceAcceptPayload,
): void {
  const p = state.players.get(sessionId);
  const fromId = payload?.fromPlayerId;
  if (!p || p.eliminated) return;
  const reqs = pending.get(sessionId);
  if (!reqs || typeof fromId !== "string" || !reqs.has(fromId)) return;
  const from = state.players.get(fromId);
  if (!from || from.eliminated) return;
  reqs.delete(fromId);

  const allianceId = p.allianceId || from.allianceId || nextId("ally");
  const oldIds = new Set([p.allianceId, from.allianceId].filter((x) => x !== ""));
  state.players.forEach((pl) => {
    if (
      pl.sessionId === sessionId ||
      pl.sessionId === fromId ||
      (pl.allianceId !== "" && oldIds.has(pl.allianceId))
    ) {
      pl.allianceId = allianceId;
    }
  });
}
