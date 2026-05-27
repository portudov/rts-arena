import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";
import type { GamePhase } from "@rts/shared";
import { Player } from "./Player";
import { Troop } from "./Troop";
import { Building } from "./Building";
import { Zone } from "./Zone";

export class ArenaState extends Schema {
  @type("string") phase: GamePhase = "lobby";
  @type("number") elapsedMs = 0;
  @type("number") timeLimitMs = 0;
  @type("number") lobbyCountdownMs = 0;
  @type("string") winnerId = "";

  @type({ map: Player }) players = new MapSchema<Player>();
  @type({ map: Troop }) troops = new MapSchema<Troop>();
  @type({ map: Building }) buildings = new MapSchema<Building>();
  @type([Zone]) zones = new ArraySchema<Zone>();
}
