import type { BuildingKind } from "./types";

/** Noms des messages d'INTENTION (client -> serveur). Le serveur décide du résultat. */
export const ClientMessage = {
  MoveKing: "move_king",
  Build: "build",
  TrainTroop: "train_troop",
  AttackTarget: "attack_target",
  AllianceRequest: "alliance_request",
  AllianceAccept: "alliance_accept",
} as const;

export type ClientMessageName = (typeof ClientMessage)[keyof typeof ClientMessage];

export interface MoveKingPayload {
  x: number;
  y: number;
}

export interface BuildPayload {
  kind: BuildingKind;
  x: number;
  y: number;
}

export interface TrainTroopPayload {
  /** Id de la caserne d'où produire (optionnel: première caserne dispo sinon). */
  buildingId?: string;
}

export interface AttackTargetPayload {
  /** sessionId du joueur/base ciblé. */
  targetPlayerId: string;
}

export interface AllianceRequestPayload {
  targetPlayerId: string;
}

export interface AllianceAcceptPayload {
  fromPlayerId: string;
}
