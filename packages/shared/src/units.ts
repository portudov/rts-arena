/**
 * Types d'unités + triangle de contres (Phase 4) — source unique client ↔ serveur.
 * Triangle : Infanterie > Cavalerie > Archer > Infanterie.
 */
export type UnitKind = "infantry" | "archer" | "cavalry";

export interface UnitDef {
  name: string;
  hp: number;
  damage: number;
  range: number;
  speed: number; // px/seconde
  cost: number;
  trainMs: number;
  attackCooldownMs: number;
  radius: number;
  color: number; // teinte de rendu
}

export const UNITS: Record<UnitKind, UnitDef> = {
  infantry: {
    name: "Infanterie", hp: 170, damage: 14, range: 40, speed: 150,
    cost: 25, trainMs: 2400, attackCooldownMs: 700, radius: 11, color: 0xe6e6e6,
  },
  archer: {
    name: "Archer", hp: 80, damage: 18, range: 135, speed: 165,
    cost: 30, trainMs: 2800, attackCooldownMs: 950, radius: 9, color: 0xa6e22e,
  },
  cavalry: {
    name: "Cavalerie", hp: 130, damage: 17, range: 42, speed: 300,
    cost: 35, trainMs: 3200, attackCooldownMs: 650, radius: 12, color: 0xff9f43,
  },
};

export const UNIT_KINDS: UnitKind[] = ["infantry", "archer", "cavalry"];

/** Multiplicateur de dégâts attaquant → défenseur (le triangle de contres). */
export const COUNTERS: Record<UnitKind, Record<UnitKind, number>> = {
  infantry: { infantry: 1, archer: 0.8, cavalry: 1.5 },
  archer: { infantry: 1.5, archer: 1, cavalry: 0.7 },
  cavalry: { infantry: 0.6, archer: 1.6, cavalry: 1 },
};

export function unitDef(kind: string): UnitDef {
  return UNITS[kind as UnitKind] ?? UNITS.infantry;
}

/** Multiplicateur de contre (1 si l'un des deux n'est pas une unité typée). */
export function counterMul(attacker: string, defender: string): number {
  const a = UNITS[attacker as UnitKind] ? (attacker as UnitKind) : null;
  const d = UNITS[defender as UnitKind] ? (defender as UnitKind) : null;
  if (!a || !d) return 1;
  return COUNTERS[a][d];
}
