import { Schema, type } from "@colyseus/schema";

export class King extends Schema {
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") targetX = 0;
  @type("number") targetY = 0;
  @type("number") hp = 0;
  @type("number") maxHp = 0;
  @type("boolean") alive = true;

  // server-only (non synchronisé)
  atkCd = 0;
  // server-only (pathfinding A*)
  path: { x: number; y: number }[] = [];
  pathIdx = 0;
  pathGoalKey = "";
}
