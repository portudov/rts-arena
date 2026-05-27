/**
 * Contrat partagé du terrain (source unique client ↔ serveur).
 * La carte est une grille de tuiles ; l'état synchronise un tableau plat row-major
 * de types de terrain (entiers). Toute logique (déplacement, vision, combat) lit ce contrat.
 */
export const TILE_SIZE = 40;
export const MAP_TILES_W = 60;
export const MAP_TILES_H = 60;
// Monde dérivé : 60 * 40 = 2400 (cohérent avec GameConfig.MAP_WIDTH/HEIGHT).

export enum Terrain {
  Plain = 0,
  Mountain = 1,
  Water = 2,
  Forest = 3,
  Hill = 4,
  Road = 5,
  Bridge = 6,
}

export interface TerrainDef {
  name: string;
  passable: boolean;
  moveCost: number; // coût A* par tuile (1 = plaine)
  speedMul: number; // multiplicateur de vitesse de déplacement
  blocksVision: boolean;
  visionMul: number; // multiplicateur de portée de vision pour une unité dessus
  defenseBonus: number; // réduction des dégâts subis (0.2 = -20%) pour une unité dessus
  rangeBonus: number; // multiplicateur de portée d'attaque (1 = aucun)
  damageBonus: number; // multiplicateur de dégâts (1 = aucun)
  color: number; // couleur de rendu
}

export const TERRAIN: Record<Terrain, TerrainDef> = {
  [Terrain.Plain]: {
    name: "Plaine", passable: true, moveCost: 1, speedMul: 1, blocksVision: false,
    visionMul: 1, defenseBonus: 0, rangeBonus: 1, damageBonus: 1, color: 0x2c3a28,
  },
  [Terrain.Mountain]: {
    name: "Montagne", passable: false, moveCost: 999, speedMul: 0, blocksVision: true,
    visionMul: 1, defenseBonus: 0, rangeBonus: 1, damageBonus: 1, color: 0x57514b,
  },
  [Terrain.Water]: {
    name: "Eau", passable: false, moveCost: 999, speedMul: 0, blocksVision: false,
    visionMul: 1, defenseBonus: 0, rangeBonus: 1, damageBonus: 1, color: 0x1d3b63,
  },
  [Terrain.Forest]: {
    name: "Forêt", passable: true, moveCost: 2, speedMul: 0.6, blocksVision: true,
    visionMul: 0.6, defenseBonus: 0.2, rangeBonus: 1, damageBonus: 1, color: 0x1f3a22,
  },
  [Terrain.Hill]: {
    name: "Colline", passable: true, moveCost: 1.6, speedMul: 0.8, blocksVision: false,
    visionMul: 1.4, defenseBonus: 0.1, rangeBonus: 1.25, damageBonus: 1.15, color: 0x6b5e3a,
  },
  [Terrain.Road]: {
    name: "Route", passable: true, moveCost: 0.6, speedMul: 1.4, blocksVision: false,
    visionMul: 1, defenseBonus: 0, rangeBonus: 1, damageBonus: 1, color: 0x4a4036,
  },
  [Terrain.Bridge]: {
    name: "Pont", passable: true, moveCost: 0.8, speedMul: 1.2, blocksVision: false,
    visionMul: 1, defenseBonus: 0, rangeBonus: 1, damageBonus: 1, color: 0x6b4f2a,
  },
};

export function tileIndex(tx: number, ty: number, w = MAP_TILES_W): number {
  return ty * w + tx;
}
export function inBounds(tx: number, ty: number, w = MAP_TILES_W, h = MAP_TILES_H): boolean {
  return tx >= 0 && ty >= 0 && tx < w && ty < h;
}
export function worldToTile(x: number, y: number): { tx: number; ty: number } {
  return { tx: Math.floor(x / TILE_SIZE), ty: Math.floor(y / TILE_SIZE) };
}
export function tileToWorldCenter(tx: number, ty: number): { x: number; y: number } {
  return { x: tx * TILE_SIZE + TILE_SIZE / 2, y: ty * TILE_SIZE + TILE_SIZE / 2 };
}
/** Type de terrain à une tuile (hors-carte = Montagne / mur). */
export function terrainAt(
  tiles: ArrayLike<number>,
  tx: number,
  ty: number,
  w = MAP_TILES_W,
  h = MAP_TILES_H,
): Terrain {
  if (!inBounds(tx, ty, w, h)) return Terrain.Mountain;
  return (tiles[tileIndex(tx, ty, w)] ?? Terrain.Plain) as Terrain;
}
/** Définition de terrain à une position MONDE. */
export function terrainDefAtWorld(tiles: ArrayLike<number>, x: number, y: number): TerrainDef {
  const { tx, ty } = worldToTile(x, y);
  return TERRAIN[terrainAt(tiles, tx, ty)];
}
export function isPassableWorld(tiles: ArrayLike<number>, x: number, y: number): boolean {
  return terrainDefAtWorld(tiles, x, y).passable;
}
