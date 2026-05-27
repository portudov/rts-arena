import { Schema, type } from "@colyseus/schema";
import type { TroopState } from "@rts/shared";

export class Troop extends Schema {
  @type("string") id = "";
  @type("string") ownerId = ""; // sessionId du propriétaire
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") targetX = 0;
  @type("number") targetY = 0;
  @type("number") hp = 0;
  @type("number") maxHp = 0;
  @type("string") kind = "soldier";
  @type("string") state: TroopState = "idle";
  @type("string") targetPlayerId = ""; // joueur/base désigné comme cible

  // server-only
  atkCd = 0;
  // server-only (pathfinding A*)
  path: { x: number; y: number }[] = [];
  pathIdx = 0;
  pathGoalKey = "";
}
