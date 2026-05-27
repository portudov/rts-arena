import { Schema, type } from "@colyseus/schema";
import type { BuildingKind } from "@rts/shared";

export class Building extends Schema {
  @type("string") id = "";
  @type("string") ownerId = ""; // "" = neutre
  @type("string") kind: BuildingKind = "goldmine";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") hp = 0;
  @type("number") maxHp = 0;
  @type("number") trainProgress = 0; // caserne: 0..1

  // server-only
  atkCd = 0; // tour
  trainTimer = -1; // caserne: ms restant, -1 = inactif
  trainKind = "infantry"; // caserne: type d'unité en production
}
