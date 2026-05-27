/**
 * Génération de carte (Phase 1 — terrain).
 *
 * Produit une grille 60×60 row-major de valeurs `Terrain`, déterministe pour un seed donné
 * (mulberry32), ROTATIONNELLEMENT SYMÉTRIQUE autour du centre : tout ce qui est dessiné est
 * répliqué pour chaque joueur (jusqu'à 8) par rotation, ce qui garantit l'équilibre des départs.
 *
 * Garanties :
 *  - Montagnes + eau forment des points d'étranglement (couloirs étroits passables entre régions).
 *  - Plaine dégagée autour de chaque départ ET du centre.
 *  - Connectivité : chaque départ peut atteindre le centre (flood-fill ; sinon on creuse un couloir).
 *  - Zones de bonus toutes sur des tuiles passables (centre exposé + 4 réparties, en miroir).
 *
 * Le pathfinding (A*) viendra plus tard : ici on ne fait que poser le terrain.
 */
import {
  Terrain,
  TERRAIN,
  MAP_TILES_W,
  MAP_TILES_H,
  tileIndex,
  inBounds,
  tileToWorldCenter,
} from "@rts/shared";

export type ZoneBonus = "gold" | "damage" | "speed";

export interface GeneratedMap {
  tiles: number[];
  startPositions: { x: number; y: number }[];
  zones: { x: number; y: number; bonus: ZoneBonus }[];
}

/** RNG déterministe (mulberry32) : un seed reproduit exactement la même carte. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = MAP_TILES_W;
const H = MAP_TILES_H;
const CX = (W - 1) / 2; // centre en coordonnées tuile (29.5 pour 60)
const CY = (H - 1) / 2;

function passable(t: Terrain): boolean {
  return TERRAIN[t].passable;
}

/** Grille de travail avec accès borné et helpers de dessin. */
class Grid {
  readonly cells: Uint8Array;
  constructor() {
    this.cells = new Uint8Array(W * H).fill(Terrain.Plain);
  }
  get(tx: number, ty: number): Terrain {
    if (!inBounds(tx, ty, W, H)) return Terrain.Mountain;
    return this.cells[tileIndex(tx, ty, W)] as Terrain;
  }
  set(tx: number, ty: number, t: Terrain): void {
    if (inBounds(tx, ty, W, H)) this.cells[tileIndex(tx, ty, W)] = t;
  }
  /** Pose `t` seulement si la tuile actuelle est de l'un des types autorisés à écraser. */
  setIf(tx: number, ty: number, t: Terrain, over: ReadonlySet<Terrain>): void {
    if (!inBounds(tx, ty, W, H)) return;
    if (over.has(this.get(tx, ty))) this.set(tx, ty, t);
  }
  disk(cx: number, cy: number, r: number, t: Terrain): void {
    const r2 = r * r;
    for (let ty = Math.floor(cy - r); ty <= Math.ceil(cy + r); ty++) {
      for (let tx = Math.floor(cx - r); tx <= Math.ceil(cx + r); tx++) {
        const dx = tx - cx;
        const dy = ty - cy;
        if (dx * dx + dy * dy <= r2) this.set(tx, ty, t);
      }
    }
  }
  diskIf(cx: number, cy: number, r: number, t: Terrain, over: ReadonlySet<Terrain>): void {
    const r2 = r * r;
    for (let ty = Math.floor(cy - r); ty <= Math.ceil(cy + r); ty++) {
      for (let tx = Math.floor(cx - r); tx <= Math.ceil(cx + r); tx++) {
        const dx = tx - cx;
        const dy = ty - cy;
        if (dx * dx + dy * dy <= r2) this.setIf(tx, ty, t, over);
      }
    }
  }
}

/** Rotation d'un point autour du centre de la carte (sens horaire, angle en radians). */
function rotate(tx: number, ty: number, angle: number): { tx: number; ty: number } {
  const dx = tx - CX;
  const dy = ty - CY;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { tx: CX + dx * c - dy * s, ty: CY + dx * s + dy * c };
}

/** Applique une fonction de dessin pour chaque secteur (rotation symétrique sur `starts` parts). */
function forEachSector(starts: number, draw: (angle: number) => void): void {
  const n = Math.max(1, starts);
  for (let i = 0; i < n; i++) draw((i / n) * Math.PI * 2);
}

const OVER_PLAIN: ReadonlySet<Terrain> = new Set([Terrain.Plain]);

/** Dessine un segment de couloir « passable » en effaçant tout obstacle sur son passage. */
function carveCorridor(
  g: Grid,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  half: number,
  fill: Terrain,
): void {
  const steps = Math.ceil(Math.hypot(bx - ax, by - ay));
  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps;
    const x = ax + (bx - ax) * t;
    const y = ay + (by - ay) * t;
    for (let oy = -half; oy <= half; oy++) {
      for (let ox = -half; ox <= half; ox++) {
        const tx = Math.round(x + ox);
        const ty = Math.round(y + oy);
        const cur = g.get(tx, ty);
        // On efface les obstacles ; on pose la route sur la plaine traversée.
        if (cur === Terrain.Mountain) g.set(tx, ty, Terrain.Plain);
        else if (cur === Terrain.Water) g.set(tx, ty, Terrain.Bridge);
        else if (fill === Terrain.Road && cur === Terrain.Plain) g.set(tx, ty, Terrain.Road);
      }
    }
  }
}

/** Trace une route start→centre ; pose des ponts là où elle franchit de l'eau. */
function drawRoad(g: Grid, ax: number, ay: number, bx: number, by: number): void {
  const steps = Math.ceil(Math.hypot(bx - ax, by - ay) * 1.5);
  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps;
    const x = Math.round(ax + (bx - ax) * t);
    const y = Math.round(ay + (by - ay) * t);
    for (const [ox, oy] of [
      [0, 0],
      [1, 0],
      [0, 1],
    ] as const) {
      const cur = g.get(x + ox, y + oy);
      if (cur === Terrain.Water) g.set(x + ox, y + oy, Terrain.Bridge);
      else if (cur === Terrain.Mountain) g.set(x + ox, y + oy, Terrain.Road);
      else if (passable(cur) && cur !== Terrain.Bridge) g.set(x + ox, y + oy, Terrain.Road);
    }
  }
}

/** Position de départ d'un secteur (proche d'un coin/bord, sur secteur tourné). */
function startTile(angle: number): { tx: number; ty: number } {
  // Rayon proche du bord ; arrondi pour rester sur une tuile.
  const r = Math.min(W, H) * 0.42;
  const base = { tx: CX, ty: CY - r }; // « nord » avant rotation
  const p = rotate(base.tx, base.ty, angle);
  return { tx: Math.round(p.tx), ty: Math.round(p.ty) };
}

/** Flood-fill : l'ensemble des tuiles passables atteignables depuis (sx,sy). */
function reachable(g: Grid, sx: number, sy: number): Uint8Array {
  const seen = new Uint8Array(W * H);
  if (!inBounds(sx, sy, W, H) || !passable(g.get(sx, sy))) return seen;
  const stack: number[] = [tileIndex(sx, sy, W)];
  seen[stack[0]] = 1;
  while (stack.length) {
    const idx = stack.pop() as number;
    const tx = idx % W;
    const ty = (idx - tx) / W;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nx = tx + dx;
      const ny = ty + dy;
      if (!inBounds(nx, ny, W, H)) continue;
      const nIdx = tileIndex(nx, ny, W);
      if (seen[nIdx] || !passable(g.get(nx, ny))) continue;
      seen[nIdx] = 1;
      stack.push(nIdx);
    }
  }
  return seen;
}

export function generateMap(seed: number, starts: number): GeneratedMap {
  const rng = mulberry32(seed);
  const g = new Grid();
  const n = Math.max(1, Math.min(8, Math.floor(starts) || 1));

  // IMPORTANT pour la symétrie : tous les paramètres aléatoires sont tirés UNE SEULE FOIS
  // (hors boucle de secteurs). Chaque secteur est ainsi une rotation EXACTE du même motif,
  // ce qui garantit l'équilibre des départs (jusqu'à 8).
  const span = Math.min(W, H);
  const halfSector = Math.PI / n;

  // 1) Anneau de montagnes secteur par secteur → forme des points d'étranglement.
  //    Chaque secteur reçoit une crête radiale percée d'un couloir étroit (le « choke »).
  const ringR = span * (0.26 + rng() * 0.05);
  const spread = halfSector * 0.7; // largeur angulaire de la crête
  const arcSteps = 14;
  forEachSector(n, (angle) => {
    for (let s = -arcSteps; s <= arcSteps; s++) {
      const a = angle + (s / arcSteps) * spread;
      const base = { tx: CX + Math.sin(a) * ringR, ty: CY - Math.cos(a) * ringR };
      g.diskIf(base.tx, base.ty, 1.6, Terrain.Mountain, OVER_PLAIN);
    }
    // Le couloir d'étranglement : on perce la crête près du milieu du secteur.
    const inner = { tx: CX + Math.sin(angle) * (ringR - 4), ty: CY - Math.cos(angle) * (ringR - 4) };
    const outer = { tx: CX + Math.sin(angle) * (ringR + 4), ty: CY - Math.cos(angle) * (ringR + 4) };
    carveCorridor(g, inner.tx, inner.ty, outer.tx, outer.ty, 1, Terrain.Plain);
  });

  // 2) Plans d'eau (impassables) entre les crêtes → étranglements + ponts (routes) plus tard.
  const lakeR = span * (0.17 + rng() * 0.04);
  const lakeRad = 3 + rng() * 2;
  forEachSector(n, (angle) => {
    const edge = angle + halfSector; // entre deux secteurs
    const c = { tx: CX + Math.sin(edge) * lakeR, ty: CY - Math.cos(edge) * lakeR };
    g.diskIf(c.tx, c.ty, lakeRad, Terrain.Water, OVER_PLAIN);
  });

  // 3) Forêts (couvert) — deux taches par secteur (mêmes offsets pour tous les secteurs).
  const forest = [
    { rr: span * (0.12 + rng() * 0.22), off: (rng() - 0.5) * halfSector, rad: 2 + rng() * 2 },
    { rr: span * (0.12 + rng() * 0.22), off: (rng() - 0.5) * halfSector, rad: 2 + rng() * 2 },
  ];
  forEachSector(n, (angle) => {
    for (const f of forest) {
      const a = angle + f.off;
      const c = { tx: CX + Math.sin(a) * f.rr, ty: CY - Math.cos(a) * f.rr };
      g.diskIf(c.tx, c.ty, f.rad, Terrain.Forest, OVER_PLAIN);
    }
  });

  // 4) Collines (haut-fort) — une proche du centre (contestée) + une plus éloignée.
  const contestedR = span * 0.13;
  const farR = span * (0.3 + rng() * 0.05);
  const hillOff = (rng() - 0.5) * halfSector * 0.4;
  const hillRadNear = 2 + rng();
  const hillRadFar = 1 + rng();
  forEachSector(n, (angle) => {
    const a = angle + hillOff;
    g.diskIf(CX + Math.sin(a) * contestedR, CY - Math.cos(a) * contestedR, hillRadNear, Terrain.Hill, OVER_PLAIN);
    g.diskIf(CX + Math.sin(a) * farR, CY - Math.cos(a) * farR, hillRadFar, Terrain.Hill, OVER_PLAIN);
  });

  // 5) Dégager une plaine autour de chaque départ et du centre.
  const startsTiles: { tx: number; ty: number }[] = [];
  forEachSector(n, (angle) => {
    const st = startTile(angle);
    startsTiles.push(st);
    g.disk(st.tx, st.ty, 3.5, Terrain.Plain);
  });
  g.disk(CX, CY, 4.5, Terrain.Plain);

  // 6) Routes start → centre (avec ponts sur l'eau). Tracées après les obstacles.
  for (const st of startsTiles) {
    drawRoad(g, st.tx, st.ty, CX, CY);
  }

  // 7) Connectivité : chaque départ doit atteindre le centre. Sinon, on creuse un couloir.
  const centerIdx = tileIndex(Math.round(CX), Math.round(CY), W);
  for (const st of startsTiles) {
    let reach = reachable(g, st.tx, st.ty);
    if (!reach[centerIdx]) {
      // On force un couloir droit start→centre puis on revérifie.
      carveCorridor(g, st.tx, st.ty, CX, CY, 1, Terrain.Road);
      reach = reachable(g, st.tx, st.ty);
      if (!reach[centerIdx]) {
        // Filet de sécurité : couloir large, garanti passable.
        carveCorridor(g, st.tx, st.ty, CX, CY, 2, Terrain.Plain);
      }
    }
  }

  // 8) Zones de bonus : centre exposé (open/colline) + 4 réparties, toutes passables, en miroir.
  const zoneTiles: { tx: number; ty: number; bonus: ZoneBonus }[] = [];
  // Centre exposé.
  g.diskIf(CX, CY, 1.5, Terrain.Hill, OVER_PLAIN); // haut-fort exposé au centre
  zoneTiles.push({ tx: Math.round(CX), ty: Math.round(CY), bonus: "gold" });

  // 4 zones réparties : on les place sur un anneau intermédiaire, réparties symétriquement.
  const zoneBonuses: ZoneBonus[] = ["damage", "speed", "damage", "speed"];
  const zoneRing = Math.min(W, H) * 0.2;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    let tx = Math.round(CX + Math.sin(a) * zoneRing);
    let ty = Math.round(CY - Math.cos(a) * zoneRing);
    // Garantir une assise passable : dégager un petit disque de plaine si obstacle.
    if (!passable(g.get(tx, ty))) g.disk(tx, ty, 2, Terrain.Plain);
    tx = clampTile(tx, W);
    ty = clampTile(ty, H);
    zoneTiles.push({ tx, ty, bonus: zoneBonuses[i] });
  }

  // 9) Conversion en sorties monde.
  const tiles = Array.from(g.cells, (v) => v as number);
  const startPositions = startsTiles.map((s) => tileToWorldCenter(s.tx, s.ty));
  const zones = zoneTiles.map((z) => ({ ...tileToWorldCenter(z.tx, z.ty), bonus: z.bonus }));

  return { tiles, startPositions, zones };
}

function clampTile(v: number, max: number): number {
  return v < 0 ? 0 : v >= max ? max - 1 : v;
}
