import { Application, Container, Graphics, Text } from "pixi.js";
import { GameConfig } from "@rts/shared";

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

export class PixiRenderer {
  private app = new Application();
  private world = new Container();
  private g = new Graphics();
  private labels = new Map<string, Text>();
  private renderPos = new Map<string, { x: number; y: number }>();
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private started = false;

  constructor(
    private parent: HTMLElement,
    private getState: () => StateView | undefined,
    private mySessionId: () => string,
    private cb: RendererCallbacks,
  ) {}

  async init(): Promise<void> {
    await this.app.init({ resizeTo: this.parent, background: 0x0b0e14, antialias: true });
    this.parent.appendChild(this.app.canvas);
    this.world.addChild(this.g);
    this.app.stage.addChild(this.world);

    this.app.stage.eventMode = "static";
    this.app.stage.hitArea = this.app.screen;
    this.app.stage.on("pointerdown", (e) => this.onPointerDown(e.global.x, e.global.y));

    this.app.ticker.add(() => this.draw());
    this.started = true;
  }

  private computeTransform(): void {
    const w = this.app.renderer.width;
    const h = this.app.renderer.height;
    this.scale = Math.min(w / GameConfig.MAP_WIDTH, h / GameConfig.MAP_HEIGHT);
    this.ox = (w - GameConfig.MAP_WIDTH * this.scale) / 2;
    this.oy = (h - GameConfig.MAP_HEIGHT * this.scale) / 2;
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

  private draw(): void {
    this.computeTransform();
    const g = this.g;
    g.clear();
    this.world.position.set(this.ox, this.oy);
    this.world.scale.set(this.scale);

    g.rect(0, 0, GameConfig.MAP_WIDTH, GameConfig.MAP_HEIGHT)
      .fill(0x10141d)
      .stroke({ color: 0x2a3142, width: 4 });

    const st = this.getState();
    if (!st) return;
    const me = this.mySessionId();
    const seen = new Set<string>();
    const usedLabels = new Set<string>();

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

    st.buildings.forEach((b) => {
      seen.add(b.id);
      const owner = st.players.get(b.ownerId);
      const color = owner ? owner.color : 0x666666;
      const rp = this.lerpPos(b.id, b.x, b.y);
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
    });

    st.troops.forEach((t) => {
      seen.add(t.id);
      const owner = st.players.get(t.ownerId);
      const color = owner ? owner.color : 0x999999;
      const rp = this.lerpPos(t.id, t.x, t.y);
      g.circle(rp.x, rp.y, GameConfig.TROOP.radius)
        .fill(color)
        .stroke({ color: 0x000000, width: 1 });
      if (t.state === "engaging") {
        g.circle(rp.x, rp.y, GameConfig.TROOP.radius + 3).stroke({ color: 0xff3333, width: 1.5 });
      }
    });

    st.players.forEach((p) => {
      if (p.eliminated) return;
      const key = "k:" + p.sessionId;
      seen.add(key);
      const rp = this.lerpPos(key, p.king.x, p.king.y);
      const R = GameConfig.KING.RADIUS;

      if (p.sessionId === me && p.currentTargetId) {
        const tp = st.players.get(p.currentTargetId);
        if (tp && !tp.eliminated && tp.king.alive) {
          g.moveTo(rp.x, rp.y)
            .lineTo(tp.king.x, tp.king.y)
            .stroke({ color: 0xff5555, width: 2, alpha: 0.5 });
        }
      }

      g.circle(rp.x, rp.y, R).fill(p.color).stroke({ color: 0x000000, width: 3 });
      g.star(rp.x, rp.y - 1, 5, R * 0.55).fill(0xffe680);
      if (p.sessionId === me) g.circle(rp.x, rp.y, R + 5).stroke({ color: 0xffffff, width: 2 });
      this.hpBar(g, rp.x, rp.y - R - 12, R * 2.2, p.king.hp / p.king.maxHp);

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

    this.labels.forEach((lbl, id) => {
      if (!usedLabels.has(id)) lbl.visible = false;
    });
    for (const id of this.renderPos.keys()) {
      if (!seen.has(id)) this.renderPos.delete(id);
    }
  }

  destroy(): void {
    if (!this.started) return;
    this.app.ticker.stop();
    this.app.destroy(true, { children: true });
  }
}
