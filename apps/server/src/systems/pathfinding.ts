/**
 * Pathfinding A* sur la grille de tuiles (Phase 2).
 * 8 directions, coût par terrain (TERRAIN.moveCost), heuristique octile,
 * anti corner-cutting, cache LRU clé (tuile départ → tuile but).
 * Coords MONDE en entrée/sortie (waypoints = centres de tuiles, but inclus).
 */
import {
  TERRAIN,
  MAP_TILES_W,
  MAP_TILES_H,
  tileIndex,
  inBounds,
  worldToTile,
  tileToWorldCenter,
  terrainAt,
} from "@rts/shared";

const W = MAP_TILES_W;
const H = MAP_TILES_H;
const N = W * H;

function moveCost(tiles: ArrayLike<number>, tx: number, ty: number): number {
  return TERRAIN[terrainAt(tiles, tx, ty, W, H)].moveCost;
}
function passable(tiles: ArrayLike<number>, tx: number, ty: number): boolean {
  return TERRAIN[terrainAt(tiles, tx, ty, W, H)].passable;
}

/** Tuile passable la plus proche (anneaux croissants) si (tx,ty) est un obstacle. */
function nearestPassable(
  tiles: ArrayLike<number>,
  tx: number,
  ty: number,
): { tx: number; ty: number } | null {
  if (inBounds(tx, ty, W, H) && passable(tiles, tx, ty)) return { tx, ty };
  for (let r = 1; r <= 10; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const nx = tx + dx;
        const ny = ty + dy;
        if (inBounds(nx, ny, W, H) && passable(tiles, nx, ny)) return { tx: nx, ty: ny };
      }
    }
  }
  return null;
}

const DIRS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

/** Min-heap binaire (index de tuile, clé f). Suppression paresseuse. */
class MinHeap {
  private idx: number[] = [];
  private key: number[] = [];
  get size(): number {
    return this.idx.length;
  }
  push(i: number, f: number): void {
    this.idx.push(i);
    this.key.push(f);
    let c = this.idx.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (this.key[p] <= this.key[c]) break;
      this.swap(p, c);
      c = p;
    }
  }
  pop(): number {
    const top = this.idx[0];
    const lastI = this.idx.pop() as number;
    const lastK = this.key.pop() as number;
    if (this.idx.length > 0) {
      this.idx[0] = lastI;
      this.key[0] = lastK;
      let p = 0;
      const n = this.idx.length;
      for (;;) {
        const l = 2 * p + 1;
        const r = l + 1;
        let m = p;
        if (l < n && this.key[l] < this.key[m]) m = l;
        if (r < n && this.key[r] < this.key[m]) m = r;
        if (m === p) break;
        this.swap(p, m);
        p = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number): void {
    const ti = this.idx[a];
    this.idx[a] = this.idx[b];
    this.idx[b] = ti;
    const tk = this.key[a];
    this.key[a] = this.key[b];
    this.key[b] = tk;
  }
}

function octile(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
}

const _cache = new Map<string, { x: number; y: number }[] | null>();
const CACHE_MAX = 3000;

export function clearPathCache(): void {
  _cache.clear();
}

/** A* monde→monde. Retourne les waypoints (centres de tuiles), but inclus. null si injoignable. */
export function findPath(
  tiles: ArrayLike<number>,
  sx: number,
  sy: number,
  gx: number,
  gy: number,
): { x: number; y: number }[] | null {
  if (tiles.length < N) return [{ x: gx, y: gy }]; // pas de terrain chargé : ligne droite
  const s0 = worldToTile(sx, sy);
  const g0 = worldToTile(gx, gy);
  const sp = nearestPassable(tiles, s0.tx, s0.ty);
  const gp = nearestPassable(tiles, g0.tx, g0.ty);
  if (!sp || !gp) return null;
  if (sp.tx === gp.tx && sp.ty === gp.ty) return [tileToWorldCenter(gp.tx, gp.ty)];

  const key = `${sp.tx},${sp.ty},${gp.tx},${gp.ty}`;
  const cached = _cache.get(key);
  if (cached !== undefined) return cached;

  const startIdx = tileIndex(sp.tx, sp.ty, W);
  const goalIdx = tileIndex(gp.tx, gp.ty, W);
  const g = new Float64Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const heap = new MinHeap();
  g[startIdx] = 0;
  heap.push(startIdx, octile(sp.tx, sp.ty, gp.tx, gp.ty));

  let found = false;
  while (heap.size > 0) {
    const cur = heap.pop();
    if (closed[cur]) continue;
    if (cur === goalIdx) {
      found = true;
      break;
    }
    closed[cur] = 1;
    const cx = cur % W;
    const cy = (cur - cx) / W;
    for (const [dx, dy, dc] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inBounds(nx, ny, W, H) || !passable(tiles, nx, ny)) continue;
      if (dx !== 0 && dy !== 0) {
        // anti corner-cutting : les deux orthogonales doivent être passables
        if (!passable(tiles, cx + dx, cy) || !passable(tiles, cx, cy + dy)) continue;
      }
      const ni = tileIndex(nx, ny, W);
      if (closed[ni]) continue;
      const tentative = g[cur] + dc * moveCost(tiles, nx, ny);
      if (tentative < g[ni]) {
        came[ni] = cur;
        g[ni] = tentative;
        heap.push(ni, tentative + octile(nx, ny, gp.tx, gp.ty));
      }
    }
  }

  let result: { x: number; y: number }[] | null = null;
  if (found) {
    const rev: number[] = [];
    let c = goalIdx;
    while (c !== -1 && c !== startIdx) {
      rev.push(c);
      c = came[c];
    }
    rev.reverse();
    result = rev.map((idx) => {
      const tx = idx % W;
      const ty = (idx - tx) / W;
      return tileToWorldCenter(tx, ty);
    });
    if (result.length === 0) result = [tileToWorldCenter(gp.tx, gp.ty)];
  }

  if (_cache.size > CACHE_MAX) _cache.clear();
  _cache.set(key, result);
  return result;
}
