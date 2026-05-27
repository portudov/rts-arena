import { Schema, type } from "@colyseus/schema";
import type { ZoneBonus } from "@rts/shared";

export class Zone extends Schema {
  @type("string") id = "";
  @type("number") x = 0;
  @type("number") y = 0;
  @type("number") radius = 0;
  @type("string") controllerId = ""; // sessionId, "" = neutre
  @type("number") captureProgress = 0; // 0..1
  @type("string") bonusType: ZoneBonus = "gold";
}
