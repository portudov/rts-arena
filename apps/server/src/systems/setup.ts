import { GameConfig, unitDef, type BuildingKind, type ZoneBonus } from "@rts/shared";
import { ArenaState } from "../schema/ArenaState";
import { Player } from "../schema/Player";
import { Building } from "../schema/Building";
import { Troop } from "../schema/Troop";
import { Zone } from "../schema/Zone";

let _idCounter = 0;
export function nextId(prefix: string): string {
  _idCounter += 1;
  return `${prefix}_${_idCounter.toString(36)}`;
}

const COLORS = [0xff5555, 0x5599ff, 0x55cc66, 0xffcc44, 0xcc66ff, 0x44cccc, 0xff8844, 0xbbbbbb];

/** Crée les zones capturables à partir des définitions issues de la génération de carte. */
export function createZones(
  state: ArenaState,
  defs: { x: number; y: number; bonus: ZoneBonus }[],
): void {
  for (const d of defs) {
    const z = new Zone();
    z.id = nextId("zone");
    z.x = d.x;
    z.y = d.y;
    z.radius = GameConfig.ZONE.RADIUS;
    z.bonusType = d.bonus;
    state.zones.push(z);
  }
}

export function createPlayer(
  state: ArenaState,
  sessionId: string,
  auth: { profileId: string; pseudo: string },
  pos: { x: number; y: number },
  colorIndex: number,
): Player {
  const p = new Player();
  p.sessionId = sessionId;
  p.profileId = auth.profileId;
  p.pseudo = auth.pseudo;
  p.gold = GameConfig.STARTING_GOLD;
  p.color = COLORS[colorIndex % COLORS.length];
  p.king.x = pos.x;
  p.king.y = pos.y;
  p.king.targetX = pos.x;
  p.king.targetY = pos.y;
  p.king.maxHp = GameConfig.KING.MAX_HP;
  p.king.hp = GameConfig.KING.MAX_HP;
  p.king.alive = true;
  state.players.set(sessionId, p);
  return p;
}

export function createBot(
  state: ArenaState,
  id: string,
  pseudo: string,
  pos: { x: number; y: number },
  colorIndex: number,
): Player {
  const p = new Player();
  p.sessionId = id;
  p.profileId = id;
  p.pseudo = pseudo;
  p.gold = GameConfig.STARTING_GOLD;
  p.color = COLORS[colorIndex % COLORS.length];
  p.isBot = true;
  p.king.x = pos.x;
  p.king.y = pos.y;
  p.king.targetX = pos.x;
  p.king.targetY = pos.y;
  p.king.maxHp = GameConfig.KING.MAX_HP;
  p.king.hp = GameConfig.KING.MAX_HP;
  p.king.alive = true;
  state.players.set(id, p);
  return p;
}

export function addBuilding(
  state: ArenaState,
  ownerId: string,
  kind: BuildingKind,
  x: number,
  y: number,
): Building {
  const b = new Building();
  b.id = nextId("bld");
  b.ownerId = ownerId;
  b.kind = kind;
  b.x = x;
  b.y = y;
  b.maxHp = GameConfig.BUILDINGS[kind].maxHp;
  b.hp = b.maxHp;
  state.buildings.set(b.id, b);
  return b;
}

export function spawnTroop(
  state: ArenaState,
  ownerId: string,
  x: number,
  y: number,
  kind = "infantry",
): Troop {
  const def = unitDef(kind);
  const t = new Troop();
  t.id = nextId("trp");
  t.ownerId = ownerId;
  t.kind = kind;
  t.x = x;
  t.y = y;
  t.targetX = x;
  t.targetY = y;
  t.maxHp = def.hp;
  t.hp = def.hp;
  t.state = "idle";
  state.troops.set(t.id, t);
  return t;
}

/** Deux joueurs alliés partagent un allianceId non vide. */
export function areAllied(state: ArenaState, aId: string, bId: string): boolean {
  if (aId === bId) return true;
  const a = state.players.get(aId);
  const b = state.players.get(bId);
  if (!a || !b) return false;
  return a.allianceId !== "" && a.allianceId === b.allianceId;
}

/** Mort d'un Roi: élimination, troupes retirées, bâtiments neutralisés, zones libérées. */
export function neutralizePlayer(state: ArenaState, sessionId: string): void {
  const p = state.players.get(sessionId);
  if (p) {
    p.eliminated = true;
    p.king.alive = false;
    p.king.hp = 0;
  }
  const toDelete: string[] = [];
  state.troops.forEach((t, id) => {
    if (t.ownerId === sessionId) toDelete.push(id);
  });
  for (const id of toDelete) state.troops.delete(id);
  state.buildings.forEach((b) => {
    if (b.ownerId === sessionId) b.ownerId = "";
  });
  state.zones.forEach((z) => {
    if (z.controllerId === sessionId) {
      z.controllerId = "";
      z.captureProgress = 0;
    }
  });
}
