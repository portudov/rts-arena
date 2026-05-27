# Équilibrage — RTS (terrain + unités + IA)

Toutes les constantes vivent dans **`packages/shared`** (source unique, lue par le serveur autoritatif ET le client). Modifie-les là, puis `pnpm build:shared`.

| Domaine | Fichier source |
|---|---|
| Coeur (carte, Roi, bâtiments, zones, troupes legacy) | `packages/shared/src/config.ts` (`GameConfig`) |
| **Terrain** (tuiles + coûts + bonus) | `packages/shared/src/terrain.ts` (`TERRAIN`) |
| **Unités** (stats + triangle de contres) | `packages/shared/src/units.ts` (`UNITS`, `COUNTERS`) |
| **IA** (niveaux de difficulté) | `apps/server/src/systems/botAI.ts` (`AI`) |

## Terrain (`TERRAIN`, grille 60×60, tuile 40 px)
| Type | Praticable | Coût A* | Vitesse | Vision | Défense | +Portée | +Dégâts |
|---|---|---|---|---|---|---|---|
| Plaine | oui | 1 | ×1 | dégagée | – | – | – |
| Montagne | **non** | – | – | bloque | – | – | – |
| Eau | **non** (ponts) | – | – | – | – | – | – |
| Forêt | oui | 2 | ×0.6 | réduite | **+20%** | – | – |
| Colline | oui | 1.6 | ×0.8 | **×1.4** | +10% | **×1.25** | **×1.15** |
| Route | oui | 0.6 | **×1.4** | – | – | – | – |
| Pont | oui | 0.8 | ×1.2 | – | – | – | – |

→ Tenir une **colline** = avantage offensif ; la **forêt** = embuscade défensive ; les **chokes** (montagnes/eau) se tiennent à peu d'unités ; **routes/ponts** = mobilité.

## Unités (`UNITS`) — triangle de contres
| Unité | PV | Dégâts | Portée | Vitesse | Coût | Form. |
|---|---|---|---|---|---|---|
| ⚔️ Infanterie | 170 | 14 | 40 | 105 | 25 | 2.4 s |
| 🏹 Archer | 80 | 18 | 135 | 115 | 30 | 2.8 s |
| 🐎 Cavalerie | 130 | 17 | 42 | 205 | 35 | 3.2 s |

**Contres** (`COUNTERS`, multiplicateur attaquant→défenseur) : Infanterie **>** Cavalerie (×1.5) · Archer **>** Infanterie (×1.5) · Cavalerie **>** Archer (×1.6). Faiblesses symétriques (×0.6–0.8). → la **composition** envoyée fait la différence.

## IA — niveaux (`AI` dans `botAI.ts`)
| Niveau | Réaction | Attaque à | Mines | Fuite Roi (PV) | Triche |
|---|---|---|---|---|---|
| Facile | lente (1 action/3) | 7 troupes | 2 | <20% | aucune |
| Normal | normale | 4 troupes | 3 | <35% | aucune (jeu équitable) |
| Difficile | normale | 3 troupes | 4 | <45% | léger bonus éco + **bots alliés** + focus humain |

Le bot **contre** la composition ennemie dominante, **fuit** son Roi si bas, et **cible** le plus proche/faible (l'humain en Difficile).

## Pistes d'ajustement
- Contres trop forts/faibles → ajuste la matrice `COUNTERS`.
- Collines trop fortes → baisse `rangeBonus`/`damageBonus` du terrain Hill.
- IA trop dure/facile → `attackAt`, `actEvery`, `ecoTrickle`, `retreatHp`.
- Carte trop fermée → densité montagnes/eau dans `mapgen.ts`.
