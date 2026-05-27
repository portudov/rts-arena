import { Room, Client } from "colyseus";
import {
  GameConfig,
  ClientMessage,
  type AuthData,
  type MoveKingPayload,
  type BuildPayload,
  type TrainTroopPayload,
  type AttackTargetPayload,
  type AllianceRequestPayload,
  type AllianceAcceptPayload,
} from "@rts/shared";
import { ArenaState } from "../schema/ArenaState";
import { verifySupabaseJwt } from "../auth/verifyJwt";
import * as intents from "../intents";
import {
  createInitialZones,
  createPlayer,
  playerStartPositions,
  neutralizePlayer,
} from "../systems/setup";
import { updateEconomy } from "../systems/economy";
import { updateMovement } from "../systems/movement";
import { updateCombat } from "../systems/combat";
import { updateZones } from "../systems/zones";
import { checkWinCondition } from "../systems/wincondition";
import { persistMatch, type MatchPlayerResult } from "../persistence/supabase";

export class ArenaRoom extends Room<ArenaState> {
  override maxClients = GameConfig.MAX_PLAYERS;
  private pendingAlliances = new Map<string, Set<string>>();
  private colorCounter = 0;
  private ended = false;

  override async onAuth(_client: Client, options: { token?: string }): Promise<AuthData> {
    return verifySupabaseJwt(options?.token);
  }

  override onCreate(): void {
    this.setState(new ArenaState());
    this.state.timeLimitMs = GameConfig.MATCH_TIME_LIMIT_MS;
    createInitialZones(this.state);

    this.onMessage(ClientMessage.MoveKing, (c, m: MoveKingPayload) =>
      intents.moveKing(this.state, c.sessionId, m),
    );
    this.onMessage(ClientMessage.Build, (c, m: BuildPayload) =>
      intents.build(this.state, c.sessionId, m),
    );
    this.onMessage(ClientMessage.TrainTroop, (c, m: TrainTroopPayload) =>
      intents.trainTroop(this.state, c.sessionId, m),
    );
    this.onMessage(ClientMessage.AttackTarget, (c, m: AttackTargetPayload) =>
      intents.attackTarget(this.state, c.sessionId, m),
    );
    this.onMessage(ClientMessage.AllianceRequest, (c, m: AllianceRequestPayload) => {
      intents.allianceRequest(this.state, this.pendingAlliances, c.sessionId, m);
      // Notifier le joueur ciblé s'il a bien reçu une demande valide
      if (this.pendingAlliances.get(m?.targetPlayerId)?.has(c.sessionId)) {
        const requester = this.state.players.get(c.sessionId);
        const target = this.clients.find((cl) => cl.sessionId === m.targetPlayerId);
        if (requester && target) {
          target.send("alliance_invite", { fromPlayerId: c.sessionId, fromPseudo: requester.pseudo });
        }
      }
    });
    this.onMessage(ClientMessage.AllianceAccept, (c, m: AllianceAcceptPayload) =>
      intents.allianceAccept(this.state, this.pendingAlliances, c.sessionId, m),
    );

    this.setSimulationInterval((dt) => this.update(dt), 1000 / GameConfig.TICK_RATE);
  }

  override onJoin(client: Client, _options: unknown, auth: AuthData): void {
    const center = { x: GameConfig.MAP_WIDTH / 2, y: GameConfig.MAP_HEIGHT / 2 };
    createPlayer(this.state, client.sessionId, auth, center, this.colorCounter++);
  }

  override async onLeave(client: Client, consented: boolean): Promise<void> {
    const p = this.state.players.get(client.sessionId);
    if (p) p.connected = false;

    if (this.state.phase !== "playing") {
      this.state.players.delete(client.sessionId);
      return;
    }
    if (!consented) {
      try {
        await this.allowReconnection(client, 30);
        if (p) p.connected = true;
        return;
      } catch {
        // timeout: éliminé ci-dessous
      }
    }
    neutralizePlayer(this.state, client.sessionId);
  }

  private update(dt: number): void {
    const s = this.state;

    if (s.phase === "lobby") {
      if (this.clients.length >= GameConfig.MIN_PLAYERS) {
        s.lobbyCountdownMs =
          s.lobbyCountdownMs > 0 ? s.lobbyCountdownMs - dt : GameConfig.LOBBY_AUTOSTART_MS - dt;
        if (s.lobbyCountdownMs <= 0) this.startMatch();
      } else {
        s.lobbyCountdownMs = 0;
      }
      return;
    }

    if (s.phase !== "playing") return;

    s.elapsedMs += dt;
    updateEconomy(s, dt);
    updateMovement(s, dt);
    updateCombat(s, dt);
    updateZones(s, dt);

    const res = checkWinCondition(s);
    if (res.ended && !this.ended) {
      this.ended = true;
      s.phase = "ended";
      s.winnerId = res.winnerId;
      void this.onMatchEnd(res.winnerId);
    }
  }

  private startMatch(): void {
    const ids: string[] = [];
    this.state.players.forEach((p) => ids.push(p.sessionId));
    const positions = playerStartPositions(ids.length);
    ids.forEach((id, i) => {
      const p = this.state.players.get(id);
      if (!p) return;
      p.king.x = positions[i].x;
      p.king.y = positions[i].y;
      p.king.targetX = positions[i].x;
      p.king.targetY = positions[i].y;
    });
    this.state.phase = "playing";
    this.state.elapsedMs = 0;
    this.lock(); // pas de join en cours de partie (MVP)
  }

  private async onMatchEnd(winnerId: string): Promise<void> {
    const winner = winnerId ? this.state.players.get(winnerId) : undefined;
    const players: MatchPlayerResult[] = [];
    let winnerUserId = "";

    this.state.players.forEach((p) => {
      const isWinner =
        p.sessionId === winnerId ||
        (winner !== undefined && winner.allianceId !== "" && p.allianceId === winner.allianceId);
      if (isWinner) winnerUserId = p.profileId;
      players.push({
        userId: p.profileId,
        pseudo: p.pseudo,
        resultat: isWinner ? "win" : "loss",
        stats: { goldFinal: Math.floor(p.gold) },
      });
    });

    await persistMatch(winnerUserId, players, { mode: "arena", players: players.length });
    this.clock.setTimeout(() => this.disconnect(), 15000);
  }
}
