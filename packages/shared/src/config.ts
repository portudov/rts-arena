/**
 * Source unique de vérité pour l'équilibrage (voir aussi BALANCING.md).
 * Importé par le serveur (autorité) ET le client (affichage). Toute décision
 * de jeu utilise ces constantes côté serveur.
 */
export const GameConfig = {
  // Boucle & réseau
  TICK_RATE: 20, // ticks/seconde (serveur autoritatif)

  // Joueurs / partie
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 8,
  MATCH_TIME_LIMIT_MS: 15 * 60 * 1000, // limite de secours: 15 min
  LOBBY_AUTOSTART_MS: 3000, // délai avant démarrage quand MIN_PLAYERS atteint

  // Carte (unités = pixels monde)
  MAP_WIDTH: 2400,
  MAP_HEIGHT: 2400,

  // Or de départ
  STARTING_GOLD: 200,

  // Le Roi
  KING: {
    MAX_HP: 1000,
    DAMAGE: 45,
    RANGE: 70,
    ATTACK_COOLDOWN_MS: 800,
    SPEED: 190, // px/seconde
    RADIUS: 18,
  },

  // Bâtiments
  BUILDINGS: {
    goldmine: { cost: 100, maxHp: 300, goldPerSec: 6, radius: 24 },
    barracks: { cost: 150, maxHp: 400, radius: 26 },
    tower: {
      cost: 120,
      maxHp: 350,
      damage: 28,
      range: 200,
      attackCooldownMs: 700,
      radius: 22,
    },
  },
  BUILD_MIN_DISTANCE: 70, // distance min entre 2 bâtiments
  BUILD_RANGE_FROM_KING: 450, // on ne peut bâtir qu'autour de son Roi

  // Troupes
  TROOP: {
    cost: 25,
    trainTimeMs: 2500,
    maxHp: 120,
    damage: 12,
    range: 42,
    attackCooldownMs: 600,
    speed: 130, // px/seconde
    radius: 10,
    idleSpread: 70, // rayon d'attente autour de la caserne
    aggroRange: 220, // distance à laquelle une troupe engage un ennemi proche en chemin
  },
  MAX_TROOPS_PER_PLAYER: 40,

  // Zones capturables
  ZONE: {
    RADIUS: 170,
    CAPTURE_TIME_MS: 6000, // temps pour passer 0 -> 1 avec 1 unité
    DECAY_PER_SEC: 0.12, // décroissance de capture si zone vide
  },
  ZONE_BONUSES: {
    gold: { goldMultiplier: 1.5 },
    damage: { damageMultiplier: 1.25 },
    speed: { speedMultiplier: 1.25 },
  },
} as const;

export type GameConfigType = typeof GameConfig;
