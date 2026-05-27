import { Schema, type } from "@colyseus/schema";
import { King } from "./King";

export class Player extends Schema {
  @type("string") sessionId = "";
  @type("string") profileId = "";
  @type("string") pseudo = "";
  @type("number") gold = 0;
  @type("string") allianceId = ""; // "" = pas d'alliance
  @type("boolean") eliminated = false;
  @type("boolean") connected = true;
  @type("number") color = 0xffffff;
  @type("string") currentTargetId = ""; // cible d'attaque courante (UI)
  @type(King) king = new King();
}
