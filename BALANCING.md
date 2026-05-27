# Équilibrage

**Source unique de vérité : [`packages/shared/src/config.ts`](packages/shared/src/config.ts) (`GameConfig`).**
Le serveur (autorité) et le client lisent ces mêmes constantes. Modifie-les là, puis `pnpm build:shared`.

| Domaine | Constante | Valeur initiale | Effet |
|---|---|---|---|
| Boucle | `TICK_RATE` | 20 | ticks/seconde du serveur |
| Partie | `MIN_PLAYERS` / `MAX_PLAYERS` | 2 / 8 | démarrage / capacité |
| Partie | `MATCH_TIME_LIMIT_MS` | 15 min | limite de secours (sinon plus de PV gagne) |
| Partie | `LOBBY_AUTOSTART_MS` | 3000 | délai avant départ quand MIN atteint |
| Carte | `MAP_WIDTH/HEIGHT` | 2400 | taille du monde (px) |
| Économie | `STARTING_GOLD` | 200 | or de départ |
| Roi | `KING.MAX_HP / DAMAGE / RANGE / SPEED` | 1000 / 45 / 70 / 190 | survie & combat du Roi |
| Roi | `KING.ATTACK_COOLDOWN_MS` | 800 | cadence d'attaque |
| Bâtiments | `BUILDINGS.goldmine` | cost 100, +6 or/s | génère l'or |
| Bâtiments | `BUILDINGS.barracks` | cost 150 | produit les troupes |
| Bâtiments | `BUILDINGS.tower` | cost 120, dmg 28, range 200 | défense auto |
| Construction | `BUILD_RANGE_FROM_KING` | 450 | rayon de construction autour du Roi |
| Construction | `BUILD_MIN_DISTANCE` | 70 | espacement min des bâtiments |
| Troupes | `TROOP.cost / trainTimeMs` | 25 / 2500 | coût & délai de production |
| Troupes | `TROOP.maxHp / damage / range / speed` | 120 / 12 / 42 / 130 | stats de combat |
| Troupes | `TROOP.aggroRange` | 220 | distance d'engagement auto en chemin |
| Troupes | `MAX_TROOPS_PER_PLAYER` | 40 | plafond |
| Zones | `ZONE.RADIUS / CAPTURE_TIME_MS` | 170 / 6000 | taille & vitesse de capture |
| Zones | `ZONE.DECAY_PER_SEC` | 0.12 | perte d'emprise si zone vide |
| Bonus | `ZONE_BONUSES.gold/damage/speed` | ×1.5 / ×1.25 / ×1.25 | bonus au contrôleur d'une zone pleine |

## Pistes d'ajustement
- **Parties trop longues** → ↑ dégâts (Roi/troupes) ou ↓ `KING.MAX_HP`.
- **Économie trop lente** → ↑ `goldmine.goldPerSec` ou ↓ coûts.
- **Attaques peu lisibles** → ↑ `TROOP.speed`, ajuster `aggroRange`.
- **Zones ignorées** → ↑ multiplicateurs de bonus ou ↓ `CAPTURE_TIME_MS`.
