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
import { MAP_TILES_W, MAP_TILES_H } from "@rts/shared";
import { ArenaState } from "../schema/ArenaState";
import { verifySupabaseJwt } from "../auth/verifyJwt";
import * as intents from "../intents";
import {
  createZones,
  createPlayer,
  createBot,
  neutralizePlayer,
} from "../systems/setup";
import { generateMap } from "../systems/mapgen";
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
  // Positions de départ équilibrées (rotation symétrique) issues de la génération de carte.
  private startPositions: { x: number; y: number }[] = [];

  override async onAuth(_client: Client, options: { token?: string }): Promise<AuthData> {
    return verifySupabaseJwt(options?.token);
  }

  override onCreate(options?: { mode?: string; bots?: number; seed?: number }): void {
    this.setState(new ArenaState());
    this.state.timeLimitMs = GameConfig.MATCH_TIME_LIMIT_MS;

    // Génération de la carte (terrain) : seed déterministe, symétrie rotationnelle.
    const seed =
      typeof options?.seed === "number" && Number.isFinite(options.seed)
        ? Math.floor(options.seed)
        : Math.floor(Math.random() * 1e9);
    const map = generateMap(seed, GameConfig.MAX_PLAYERS);
    this.startPositions = map.startPositions;
    this.state.mapSeed = seed;
    this.state.tilesW = MAP_TILES_W;
    this.state.tilesH = MAP_TILES_H;
    for (const t of map.tiles) this.state.tiles.push(t);
    createZones(this.state, map.zones);

    // Mode SOLO : 1 humain vs bots (IA). Room privée + verrouillée, démarrage immédiat.
    if (options?.mode === "solo") {
      this.solo = true;
      const n = Math.max(1, Math.min(3, Math.floor(options.bots ?? 1)));
      for (let i = 0; i < n; i++) {
        // Les bots prennent les dernières positions de départ (l'humain prendra la première).
        const pos = this.startPositions[(this.startPositions.length - 1 - i + this.startPositions.length) % this.startPositions.length];
        createBot(this.state, "bot:" + i, "🤖 Bot " + (i + 1), pos, this.colorCounter++);
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
    // Position provisoire = première position de départ ; startMatch() réassigne proprement.
    const pos = this.startPositions[0] ?? { x: GameConfig.MAP_WIDTH / 2, y: GameConfig.MAP_HEIGHT / 2 };
    createPlayer(this.state, client.sessionId, auth, pos, this.colorCounter++);
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
    // Positions équilibrées (rotation symétrique) issues de la génération de carte.
    const positions = this.startPositions;
    const fallback = { x: GameConfig.MAP_WIDTH / 2, y: GameConfig.MAP_HEIGHT / 2 };
    ids.forEach((id, i) => {
      const p = this.state.players.get(id);
      if (!p) return;
      const pos = positions.length > 0 ? positions[i % positions.length] : fallback;
      p.king.x = pos.x;
      p.king.y = pos.y;
      p.king.targetX = pos.x;
      p.king.targetY = pos.y;
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
