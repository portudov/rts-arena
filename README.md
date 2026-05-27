# ⚔️ RTS Arena — multijoueur temps réel

Arène RTS web (match-based). Chaque joueur contrôle un **Roi** (déplaçable au clic) ; bâtit une économie d'or ; produit des troupes ; **désigne une cible** et ses troupes s'y rendent et engagent **automatiquement**. Contrôle de zones (bonus), alliances en partie. Dernier Roi (ou alliance) debout = victoire.

> **Architecture :** serveur **Colyseus autoritatif** (toute la simulation, boucle fixe 20 ticks/s) ; le client n'envoie que des **intentions** et fait du rendu **PixiJS** interpolé. Supabase (self-hosted) = **auth + persistance uniquement**. Tout est self-hosted sur Coolify.

## Structure

```
apps/server     Serveur Colyseus (autorité)   -> :2567
apps/client     Client Next.js + PixiJS        -> :3000
packages/shared Types + constantes partagés (GameConfig = source de vérité)
supabase/migrations  SQL (profiles, matches, match_players) + RLS + classement
```

## Prérequis
- Node ≥ 22, **pnpm** (`corepack enable`)

## Démarrage local

```bash
pnpm install
pnpm build:shared          # compile @rts/shared (requis avant server/client)
pnpm dev                   # lance serveur (2567) + client (3000) en parallèle
```

Ouvre **http://localhost:3000** → « Jouer ». Comme `MIN_PLAYERS = 2`, ouvre **2 onglets** (ou 2 navigateurs) et entre un pseudo dans chacun : la partie démarre après un court compte à rebours.

- **Sans Supabase configuré** → mode **invité** (le pseudo saisi sert d'identité). Aucun résultat n'est écrit en base.
- **Avec Supabase** → renseigne les `NEXT_PUBLIC_SUPABASE_*` (client) et `SUPABASE_*` (serveur) dans `.env` (voir `.env.example`).

### Contrôles
- **Clic** sur le sol → déplacer ton Roi.
- **Clic sur un ennemi** (Roi/bâtiment) → tes troupes prennent cette cible et foncent + engagent.
- Barre du bas → choisir un bâtiment (Mine / Caserne / Tour) puis cliquer au sol pour le poser ; bouton **Troupe** pour produire depuis une caserne.
- Panneau de droite → demander/accepter une **alliance**.

## Base de données (Supabase self-hosted)
Applique les migrations dans l'ordre (`supabase/migrations/0001 → 0003`) via `psql` ou le SQL editor. Le **serveur** écrit les résultats avec la clé `service_role` (bypass RLS) ; le **client** ne fait que lire (classement, profils).

## Déploiement
Voir **[DEPLOY.md](DEPLOY.md)** (Coolify + WSS via Traefik). Équilibrage : **[BALANCING.md](BALANCING.md)**.

## État
MVP fonctionnel couvrant les phases 0→7 (cœur). À tester en conditions réelles et à équilibrer. Pathing = seek simple (pas d'A*), Colyseus en process unique (scalable plus tard via driver Redis).
