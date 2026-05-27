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
  createBot,
  playerStartPositions,
  neutralizePlayer,
} from "../systems/setup";
import { updateBotAI } from "../systems/botAI";
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
  private solo = false;
  private botTimer = 0;

  override async onAuth(_client: Client, options: { token?: string }): Promise<AuthData> {
    return verifySupabaseJwt(options?.token);
  }

  override onCreate(options?: { mode?: string; bots?: number }): void {
    this.setState(new ArenaState());
    this.state.timeLimitMs = GameConfig.MATCH_TIME_LIMIT_MS;
    createInitialZones(this.state);

    // Mode SOLO : 1 humain vs bots (IA). Room privée + verrouillée, démarrage immédiat.
    if (options?.mode === "solo") {
      this.solo = true;
      const n = Math.max(1, Math.min(3, Math.floor(options.bots ?? 1)));
      const center = { x: GameConfig.MAP_WIDTH / 2, y: GameConfig.MAP_HEIGHT / 2 };
      for (let i = 0; i < n; i++) {
        createBot(this.state, "bot:" + i, "🤖 Bot " + (i + 1), center, this.colorCounter++);
      }
      this.setPrivate(true);
      this.lock();
    }

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
    // En solo, la partie démarre dès que l'humain a rejoint (bots déjà créés).
    if (this.solo && this.state.phase === "lobby") this.startMatch();
  }

  override async onLeave(client: Client, consented: boolean): Promise<void> {
    const p = this.state.players.get(client.sessionId);
    if (p) p.connected = false;

    if (this.state.phase !== "playing") {
      this.state.players.delete(client.sessionId);
      return;
    }
    // En solo, pas de reconnexion à attendre : on libère.
    if (!consented && !this.solo) {
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
    if (this.solo) {
      this.botTimer += dt;
      if (this.botTimer >= 700) {
        updateBotAI(s);
        this.botTimer = 0;
      }
    }
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
    this.lock();
  }

  private async onMatchEnd(winnerId: string): Promise<void> {
    const winner = winnerId ? this.state.players.get(winnerId) : undefined;
    const players: MatchPlayerResult[] = [];
    let winnerUserId = "";

    this.state.players.forEach((p) => {
      if (p.isBot) return; // on ne persiste pas les bots
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

    if (players.length > 0) {
      await persistMatch(winnerUserId, players, { mode: this.solo ? "solo" : "arena", players: players.length });
    }
    this.clock.setTimeout(() => this.disconnect(), 15000);
  }
}
