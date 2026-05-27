import { Application, Container, Graphics, Text } from "pixi.js";
import { GameConfig, TERRAIN, Terrain, TILE_SIZE, unitDef } from "@rts/shared";

// Vues typées de l'état Colyseus décodé côté client.
interface KingView {
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  alive: boolean;
}
interface PlayerView {
  sessionId: string;
  pseudo: string;
  color: number;
  gold: number;
  eliminated: boolean;
  allianceId: string;
  currentTargetId: string;
  king: KingView;
}
interface TroopView {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  state: string;
  kind: string;
}
interface BuildingView {
  id: string;
  ownerId: string;
  kind: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  trainProgress: number;
}
interface ZoneView {
  x: number;
  y: number;
  radius: number;
  controllerId: string;
  captureProgress: number;
  bonusType: string;
}
export interface StateView {
  phase: string;
  elapsedMs: number;
  timeLimitMs: number;
  lobbyCountdownMs: number;
  winnerId: string;
  tilesW: number;
  tilesH: number;
  tiles: ArrayLike<number>;
  players: {
    forEach: (cb: (p: PlayerView, k: string) => void) => void;
    get: (k: string) => PlayerView | undefined;
  };
  troops: { forEach: (cb: (t: TroopView, k: string) => void) => void };
  buildings: { forEach: (cb: (b: BuildingView, k: string) => void) => void };
  zones: { forEach: (cb: (z: ZoneView, i: number) => void) => void };
}

export interface RendererCallbacks {
  onWorldClick: (x: number, y: number, enemyOwnerId: string | null) => void;
}

const BONUS_COLOR: Record<string, number> = {
  gold: 0xffcc44,
  damage: 0xff5555,
  speed: 0x55ccff,
};

const FLASH_MS = 160;
const FLOATER_TTL = 850;
const BURST_TTL = 550;
const PING_TTL = 700;
const MAX_FX = 160;
const ATTACK_LINE_TROOP_CAP = 280;

interface Entity {
  key: string;
  owner: string;
  x: number;
  y: number;
  range: number; // portée d'attaque (0 = ne tire pas)
  canAttack: boolean;
}
interface Floater {
  x: number;
  y: number;
  age: number;
  text: string;
  color: number;
}
interface Burst {
  x: number;
  y: number;
  age: number;
  ttl: number;
  color: number;
  big: boolean;
}
interface Ping {
  x: number;
  y: number;
  age: number;
}

export class PixiRenderer {
  private app = new Application();
  private world = new Container();
  private tileLayer = new Graphics(); // grille de terrain statique (construite une seule fois)
  private tilesBuilt = false;
  private g = new Graphics();
  private labels = new Map<string, Text>();
  private floaterTexts: Text[] = [];
  private renderPos = new Map<string, { x: number; y: number }>();
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private zoom = 1.1; // niveau de zoom de la caméra (molette)
  private started = false;

  // effets / lisibilité combat
  private prevHp = new Map<string, number>();
  private flash = new Map<string, number>();
  private floaters: Floater[] = [];
  private bursts: Burst[] = [];
  private pings: Ping[] = [];
  private alliance = new Map<string, string>();
  private prevTargetId = "";
  private clock = 0;
  private hoverScreen: { x: number; y: number } | null = null;
  private onResize: (() => void) | null = null;
  private drawErrored = false;

  constructor(
    private parent: HTMLElement,
    private getState: () => StateView | undefined,
    private mySessionId: () => string,
    private cb: RendererCallbacks,
  ) {}

  async init(): Promise<void> {
    await this.app.init({ resizeTo: this.parent, background: 0x0b0e14, antialias: true });
    this.parent.appendChild(this.app.canvas);

    // Robustesse : récupérer d'une perte de contexte WebGL (sinon canvas noir jusqu'au refresh).
    (this.app.canvas as HTMLCanvasElement).addEventListener(
      "webglcontextlost",
      (e) => e.preventDefault(),
      false,
    );
    // Garantir une taille non nulle (selon le timing de layout).
    const fit = () => {
      const w = this.parent.clientWidth || window.innerWidth;
      const h = this.parent.clientHeight || window.innerHeight;
      if (w > 0 && h > 0) this.app.renderer.resize(w, h);
    };
    fit();
    this.onResize = fit;
    window.addEventListener("resize", fit);

    // Zoom à la molette (la caméra suit le Roi).
    (this.app.canvas as HTMLCanvasElement).addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const f = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        this.zoom = Math.max(0.18, Math.min(2.5, this.zoom * f));
      },
      { passive: false },
    );

    this.world.addChild(this.tileLayer); // terrain SOUS les entités
    this.world.addChild(this.g);
    this.app.stage.addChild(this.world);

    this.app.stage.eventMode = "static";
    this.app.stage.hitArea = this.app.screen;
    this.app.stage.on("pointerdown", (e) => this.onPointerDown(e.global.x, e.global.y));
    this.app.stage.on("pointermove", (e) => (this.hoverScreen = { x: e.global.x, y: e.global.y }));

    this.app.ticker.add(() => this.draw());
    this.started = true;
  }

  private computeTransform(): void {
    const w = this.app.renderer.width;
    const h = this.app.renderer.height;
    const MW = GameConfig.MAP_WIDTH;
    const MH = GameConfig.MAP_HEIGHT;
    this.scale = this.zoom;
    // Caméra centrée sur MON Roi (sinon centre de la carte).
    let cx = MW / 2;
    let cy = MH / 2;
    const me = this.mySessionId();
    const rp = this.renderPos.get("k:" + me);
    if (rp) {
      cx = rp.x;
      cy = rp.y;
    } else {
      const st = this.getState();
      const p = st?.players?.get(me);
      if (p) {
        cx = p.king.x;
        cy = p.king.y;
      }
    }
    // Clamp : ne pas montrer hors carte (sauf si la vue dépasse la carte → centrée).
    const halfW = w / (2 * this.scale);
    const halfH = h / (2 * this.scale);
    cx = MW > halfW * 2 ? Math.max(halfW, Math.min(MW - halfW, cx)) : MW / 2;
    cy = MH > halfH * 2 ? Math.max(halfH, Math.min(MH - halfH, cy)) : MH / 2;
    this.ox = w / 2 - cx * this.scale;
    this.oy = h / 2 - cy * this.scale;
  }

  /** Construit la grille de terrain UNE SEULE FOIS (statique, synchronisée une fois). */
  private buildTiles(): void {
    if (this.tilesBuilt) return;
    const st = this.getState();
    if (!st || !st.tilesW || st.tiles.length < st.tilesW * st.tilesH) return;
    const w = st.tilesW;
    const h = st.tilesH;
    const tl = this.tileLayer;
    tl.clear();
    for (let ty = 0; ty < h; ty++) {
      for (let tx = 0; tx < w; tx++) {
        const t = (st.tiles[ty * w + tx] ?? 0) as Terrain;
        const def = TERRAIN[t] ?? TERRAIN[Terrain.Plain];
        const x = tx * TILE_SIZE;
        const y = ty * TILE_SIZE;
        tl.rect(x, y, TILE_SIZE, TILE_SIZE).fill(def.color);
        if (t === Terrain.Hill) tl.rect(x, y, TILE_SIZE, 4).fill({ color: 0xffffff, alpha: 0.18 });
        if (!def.passable) {
          tl.rect(x + 0.5, y + 0.5, TILE_SIZE - 1, TILE_SIZE - 1).stroke({
            color: 0x000000,
            width: 1,
            alpha: 0.3,
          });
        }
      }
    }
    this.tilesBuilt = true;
  }

  private screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx - this.ox) / this.scale, y: (sy - this.oy) / this.scale };
  }

  private onPointerDown(sx: number, sy: number): void {
    const st = this.getState();
    if (!st) return;
    const { x, y } = this.screenToWorld(sx, sy);
    const me = this.mySessionId();
    let enemyOwner: string | null = null;
    let bestD = 44;
    st.players.forEach((p) => {
      if (p.sessionId === me || p.eliminated || !p.king.alive) return;
      const d = Math.hypot(p.king.x - x, p.king.y - y);
      if (d < bestD + GameConfig.KING.RADIUS) {
        bestD = d;
        enemyOwner = p.sessionId;
      }
    });
    st.buildings.forEach((b) => {
      if (b.ownerId === "" || b.ownerId === me) return;
      if (Math.hypot(b.x - x, b.y - y) < 30) enemyOwner = b.ownerId;
    });
    this.cb.onWorldClick(x, y, enemyOwner);
  }

  private lerpPos(id: string, tx: number, ty: number): { x: number; y: number } {
    let r = this.renderPos.get(id);
    if (!r) {
      r = { x: tx, y: ty };
      this.renderPos.set(id, r);
    }
    r.x += (tx - r.x) * 0.25;
    r.y += (ty - r.y) * 0.25;
    return r;
  }

  private hpBar(g: Graphics, cx: number, cy: number, width: number, ratio: number): void {
    const r = Math.max(0, Math.min(1, ratio));
    g.rect(cx - width / 2, cy, width, 5).fill(0x331111);
    g.rect(cx - width / 2, cy, width * r, 5).fill(r > 0.5 ? 0x44dd55 : r > 0.25 ? 0xddaa33 : 0xdd3333);
  }

  private isAllied(a: string, b: string): boolean {
    if (a === b) return true;
    const al = this.alliance.get(a);
    return !!al && al === this.alliance.get(b);
  }

  private damageCheck(key: string, hp: number, x: number, y: number, isKing: boolean): void {
    const prev = this.prevHp.get(key);
    if (prev !== undefined && hp < prev - 0.01) {
      this.flash.set(key, FLASH_MS);
      if (isKing && this.floaters.length < MAX_FX) {
        this.floaters.push({ x, y, age: 0, text: "-" + Math.round(prev - hp), color: 0xff7777 });
      }
    }
    this.prevHp.set(key, hp);
  }

  private flashOverlay(g: Graphics, key: string, x: number, y: number, radius: number): void {
    const f = this.flash.get(key);
    if (f && f > 0) {
      g.circle(x, y, radius + 2).fill({ color: 0xffffff, alpha: 0.55 * (f / FLASH_MS) });
    }
  }

  private ageEffects(dt: number): void {
    for (const [k, v] of this.flash) {
      const nv = v - dt;
      if (nv <= 0) this.flash.delete(k);
      else this.flash.set(k, nv);
    }
    this.floaters = this.floaters.filter((f) => (f.age += dt) < FLOATER_TTL);
    this.bursts = this.bursts.filter((b) => (b.age += dt) < b.ttl);
    this.pings = this.pings.filter((p) => (p.age += dt) < PING_TTL);
  }

  private draw(): void {
    try {
      this.renderFrame();
    } catch (e) {
      if (!this.drawErrored) {
        this.drawErrored = true;
        console.error("[render] erreur dans renderFrame():", e);
      }
    }
  }

  private renderFrame(): void {
    const dt = this.app.ticker.deltaMS;
    this.clock += dt;
    this.ageEffects(dt);
    this.computeTransform();

    const g = this.g;
    g.clear();
    this.world.position.set(this.ox, this.oy);
    this.world.scale.set(this.scale);

    this.buildTiles(); // grille de terrain (sous les entités, construite une fois)
    g.rect(0, 0, GameConfig.MAP_WIDTH, GameConfig.MAP_HEIGHT).stroke({ color: 0x2a3142, width: 4 });

    const st = this.getState();
    // Attendre que toutes les collections d'état soient synchronisées (évite undefined.forEach en début de partie).
    if (!st || !st.players || !st.zones || !st.buildings || !st.troops) return;
    const me = this.mySessionId();

    // alliances
    this.alliance.clear();
    st.players.forEach((p) => this.alliance.set(p.sessionId, p.allianceId));

    const seen = new Set<string>();
    const usedLabels = new Set<string>();
    const entities: Entity[] = [];
    let troopCount = 0;

    // ZONES
    st.zones.forEach((z) => {
      const col = BONUS_COLOR[z.bonusType] ?? 0xffffff;
      g.circle(z.x, z.y, z.radius)
        .fill({ color: col, alpha: 0.06 })
        .stroke({ color: col, width: 2, alpha: 0.45 });
      if (z.captureProgress > 0) {
        g.circle(z.x, z.y, z.radius * (0.3 + 0.7 * z.captureProgress)).stroke({
          color: col,
          width: 3,
          alpha: 0.85,
        });
      }
    });

    // BÂTIMENTS
    st.buildings.forEach((b) => {
      seen.add(b.id);
      const owner = st.players.get(b.ownerId);
      const color = owner ? owner.color : 0x666666;
      const rp = this.lerpPos(b.id, b.x, b.y);
      this.damageCheck(b.id, b.hp, rp.x, rp.y, false);
      const size = b.kind === "barracks" ? 16 : b.kind === "tower" ? 12 : 14;
      g.rect(rp.x - size, rp.y - size, size * 2, size * 2)
        .fill(color)
        .stroke({ color: 0x000000, width: 2 });
      if (b.kind === "tower") g.circle(rp.x, rp.y, 4).fill(0x222222);
      if (b.kind === "goldmine") g.circle(rp.x, rp.y, 4).fill(0xffd700);
      this.hpBar(g, rp.x, rp.y - size - 8, size * 2, b.hp / b.maxHp);
      if (b.kind === "barracks" && b.trainProgress > 0) {
        g.rect(rp.x - size, rp.y + size + 3, size * 2 * b.trainProgress, 4).fill(0x55ccff);
      }
      this.flashOverlay(g, b.id, rp.x, rp.y, size);
      if (b.ownerId !== "") {
        entities.push({
          key: b.id,
          owner: b.ownerId,
          x: rp.x,
          y: rp.y,
          range: b.kind === "tower" ? GameConfig.BUILDINGS.tower.range : 0,
          canAttack: b.kind === "tower",
        });
      }
    });

    // TROUPES
    st.troops.forEach((t) => {
      seen.add(t.id);
      troopCount++;
      const owner = st.players.get(t.ownerId);
      const color = owner ? owner.color : 0x999999;
      const rp = this.lerpPos(t.id, t.x, t.y);
      this.damageCheck(t.id, t.hp, rp.x, rp.y, false);
      const engaging = t.state === "engaging";
      const ud = unitDef(t.kind);
      const tr = ud.radius;
      g.circle(rp.x, rp.y, tr).fill(color).stroke({ color: 0x000000, width: 1 });
      g.circle(rp.x, rp.y, tr * 0.5).fill(ud.color); // marqueur de type d'unité
      if (engaging) {
        const pulse = 0.5 + 0.5 * Math.sin(this.clock / 90);
        g.circle(rp.x, rp.y, tr + 3).stroke({
          color: 0xff3333,
          width: 1.5,
          alpha: 0.5 + 0.5 * pulse,
        });
      }
      this.flashOverlay(g, t.id, rp.x, rp.y, tr);
      entities.push({
        key: t.id,
        owner: t.ownerId,
        x: rp.x,
        y: rp.y,
        range: GameConfig.TROOP.range,
        canAttack: engaging,
      });
    });

    // ROIS
    st.players.forEach((p) => {
      if (p.eliminated) return;
      const key = "k:" + p.sessionId;
      seen.add(key);
      const rp = this.lerpPos(key, p.king.x, p.king.y);
      this.damageCheck(key, p.king.hp, rp.x, rp.y, true);
      const R = GameConfig.KING.RADIUS;
      g.circle(rp.x, rp.y, R).fill(p.color).stroke({ color: 0x000000, width: 3 });
      g.star(rp.x, rp.y - 1, 5, R * 0.55).fill(0xffe680);
      if (p.sessionId === me) g.circle(rp.x, rp.y, R + 5).stroke({ color: 0xffffff, width: 2 });
      this.hpBar(g, rp.x, rp.y - R - 12, R * 2.2, p.king.hp / p.king.maxHp);
      this.flashOverlay(g, key, rp.x, rp.y, R);
      entities.push({
        key,
        owner: p.sessionId,
        x: rp.x,
        y: rp.y,
        range: GameConfig.KING.RANGE,
        canAttack: p.king.alive,
      });

      let label = this.labels.get(p.sessionId);
      if (!label) {
        label = new Text({ text: p.pseudo, style: { fill: 0xffffff, fontSize: 13 } });
        label.anchor.set(0.5, 1);
        this.world.addChild(label);
        this.labels.set(p.sessionId, label);
      }
      label.text = p.pseudo;
      label.position.set(rp.x, rp.y - R - 16);
      label.scale.set(1 / this.scale);
      label.visible = true;
      usedLabels.add(p.sessionId);
    });

    // LIGNES D'ATTAQUE + étincelles (qui frappe qui)
    const doTroopLines = troopCount <= ATTACK_LINE_TROOP_CAP;
    const sparks: { x: number; y: number }[] = [];
    for (const a of entities) {
      if (!a.canAttack || a.range <= 0) continue;
      if (a.key.startsWith("trp_") && !doTroopLines) continue;
      const tgt = this.nearestEnemy(entities, a);
      if (!tgt) continue;
      const isTower = !a.key.startsWith("trp_") && !a.key.startsWith("k:");
      g.moveTo(a.x, a.y)
        .lineTo(tgt.x, tgt.y)
        .stroke({ color: isTower ? 0x66ddff : 0xff5544, width: isTower ? 2 : 1.2, alpha: 0.6 });
      sparks.push({ x: tgt.x, y: tgt.y });
    }
    const sp = 0.6 + 0.4 * Math.sin(this.clock / 60);
    for (const s of sparks) {
      g.star(s.x, s.y, 4, 6 * sp, 2).fill({ color: 0xffdd66, alpha: 0.9 });
    }

    // RÉTICULE de la cible désignée (mon joueur)
    const meP = st.players.get(me);
    if (meP && meP.currentTargetId) {
      if (this.prevTargetId !== meP.currentTargetId) {
        const tp0 = st.players.get(meP.currentTargetId);
        if (tp0 && !tp0.eliminated) this.spawnPing(tp0.king.x, tp0.king.y);
        this.prevTargetId = meP.currentTargetId;
      }
      const tp = st.players.get(meP.currentTargetId);
      if (tp && !tp.eliminated && tp.king.alive) {
        const trp = this.renderPos.get("k:" + tp.sessionId) ?? { x: tp.king.x, y: tp.king.y };
        const mrp = this.renderPos.get("k:" + me) ?? { x: meP.king.x, y: meP.king.y };
        // ligne pointillée animée
        this.dashedLine(g, mrp.x, mrp.y, trp.x, trp.y);
        // réticule pulsant + crochets tournants
        const rr = GameConfig.KING.RADIUS + 10 + 3 * Math.sin(this.clock / 120);
        g.circle(trp.x, trp.y, rr).stroke({ color: 0xff4444, width: 2, alpha: 0.9 });
        this.bracket(g, trp.x, trp.y, rr + 4, this.clock / 400);
      }
    } else {
      this.prevTargetId = "";
    }

    // SURBRILLANCE ennemi survolé
    if (this.hoverScreen) {
      const hw = this.screenToWorld(this.hoverScreen.x, this.hoverScreen.y);
      let hk: Entity | null = null;
      let hd = 40;
      for (const e of entities) {
        if (e.owner === "" || this.isAllied(me, e.owner)) continue;
        const d = Math.hypot(e.x - hw.x, e.y - hw.y);
        if (d < hd) {
          hd = d;
          hk = e;
        }
      }
      if (hk) {
        g.circle(hk.x, hk.y, 20).stroke({ color: 0xffffff, width: 1.5, alpha: 0.8 });
      }
    }

    // EXPLOSIONS de mort / PINGS
    for (const b of this.bursts) {
      const k = b.age / b.ttl;
      const rad = (b.big ? 40 : 20) * (0.2 + k);
      g.circle(b.x, b.y, rad).stroke({ color: b.color, width: (b.big ? 4 : 2) * (1 - k), alpha: 1 - k });
      const n = b.big ? 8 : 5;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const r0 = rad * 0.6;
        const r1 = rad * 1.1;
        g.moveTo(b.x + Math.cos(a) * r0, b.y + Math.sin(a) * r0)
          .lineTo(b.x + Math.cos(a) * r1, b.y + Math.sin(a) * r1)
          .stroke({ color: b.color, width: 2 * (1 - k), alpha: 1 - k });
      }
    }
    for (const p of this.pings) {
      const k = p.age / PING_TTL;
      for (let i = 0; i < 2; i++) {
        const kk = (k + i * 0.3) % 1;
        g.circle(p.x, p.y, 12 + 50 * kk).stroke({ color: 0xff5555, width: 3 * (1 - kk), alpha: 1 - kk });
      }
    }

    // NOMBRES de dégâts flottants (Rois)
    this.drawFloaters();

    // nettoyage des entités disparues -> explosion + purge
    for (const key of [...this.prevHp.keys()]) {
      if (!seen.has(key)) {
        const last = this.renderPos.get(key);
        if (last) this.spawnBurst(last.x, last.y, key.startsWith("k:") ? 0xffaa33 : 0xff5544, key.startsWith("k:"));
        this.prevHp.delete(key);
        this.flash.delete(key);
        this.renderPos.delete(key);
      }
    }
    this.labels.forEach((lbl, id) => {
      if (!usedLabels.has(id)) lbl.visible = false;
    });
  }

  private nearestEnemy(entities: Entity[], a: Entity): Entity | null {
    let best: Entity | null = null;
    let bestD = a.range;
    for (const t of entities) {
      if (t.key === a.key || t.owner === "" || this.isAllied(a.owner, t.owner)) continue;
      const d = Math.hypot(t.x - a.x, t.y - a.y);
      if (d <= bestD) {
        bestD = d;
        best = t;
      }
    }
    return best;
  }

  private dashedLine(g: Graphics, x1: number, y1: number, x2: number, y2: number): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;
    const ux = dx / len;
    const uy = dy / len;
    const dash = 14;
    const off = (this.clock / 30) % (dash * 2);
    for (let d = -off; d < len; d += dash * 2) {
      const s = Math.max(0, d);
      const e = Math.min(len, d + dash);
      if (e <= s) continue;
      g.moveTo(x1 + ux * s, y1 + uy * s)
        .lineTo(x1 + ux * e, y1 + uy * e)
        .stroke({ color: 0xff5555, width: 2, alpha: 0.6 });
    }
  }

  private bracket(g: Graphics, cx: number, cy: number, r: number, rot: number): void {
    for (let i = 0; i < 4; i++) {
      const a = rot + (i / 4) * Math.PI * 2;
      const a2 = a + 0.4;
      g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
        .lineTo(cx + Math.cos(a2) * r, cy + Math.sin(a2) * r)
        .stroke({ color: 0xff4444, width: 2, alpha: 0.9 });
    }
  }

  private spawnBurst(x: number, y: number, color: number, big: boolean): void {
    if (this.bursts.length >= MAX_FX) this.bursts.shift();
    this.bursts.push({ x, y, age: 0, ttl: big ? BURST_TTL * 1.6 : BURST_TTL, color, big });
  }

  private spawnPing(x: number, y: number): void {
    if (this.pings.length >= 20) this.pings.shift();
    this.pings.push({ x, y, age: 0 });
  }

  private drawFloaters(): void {
    for (let i = 0; i < this.floaters.length; i++) {
      const f = this.floaters[i];
      let t = this.floaterTexts[i];
      if (!t) {
        t = new Text({ text: "", style: { fill: 0xffffff, fontSize: 14, fontWeight: "bold" } });
        t.anchor.set(0.5, 1);
        this.world.addChild(t);
        this.floaterTexts[i] = t;
      }
      const k = f.age / FLOATER_TTL;
      t.text = f.text;
      t.style.fill = f.color;
      t.position.set(f.x, f.y - 24 - 26 * k);
      t.alpha = 1 - k;
      t.scale.set(1 / this.scale);
      t.visible = true;
    }
    for (let i = this.floaters.length; i < this.floaterTexts.length; i++) {
      this.floaterTexts[i].visible = false;
    }
  }

  destroy(): void {
    if (!this.started) return;
    if (this.onResize) window.removeEventListener("resize", this.onResize);
    this.app.ticker.stop();
    this.app.destroy(true, { children: true });
  }
}
