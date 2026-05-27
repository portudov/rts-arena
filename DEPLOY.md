# Déploiement — Coolify (self-hosted, WSS via Traefik)

3 ressources Coolify sur le même VPS / réseau Docker. **Aucun service cloud externe.**

## Prérequis : pousser le repo sur Git
Coolify déploie depuis un dépôt Git. Le repo est déjà initialisé et commité localement (`git log` → commit initial). Pousse-le sur ton GitHub/Gitea :

```bash
git remote add origin <URL_DE_TON_REPO>.git
git push -u origin main
```
Puis, dans Coolify, connecte ce dépôt (source GitHub App, ou clé de déploiement).

> Build local sous Windows : `next build` échoue sur la dernière étape (symlinks « standalone » interdits hors admin). **Ce n'est pas un bug du projet** — l'étape réussit sous Linux (donc dans Docker/Coolify). Pour builder en local, active le « Mode développeur » Windows ou passe par WSL/Docker.

---

## 1) Supabase self-hosted
Déploie Supabase comme sa propre ressource (template/Docker officiel). Récupère :
- `SUPABASE_URL` (ex. `https://supabase.mondomaine.fr`)
- **anon key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY` (client)
- **service_role key** → `SUPABASE_SERVICE_ROLE_KEY` (serveur uniquement)
- **JWT secret** (GoTrue) → `SUPABASE_JWT_SECRET` (serveur, vérifie les JWT)

Applique les migrations `supabase/migrations/0001 → 0003` (psql ou SQL editor), dans l'ordre.

> Optionnel pour démarrer : sans Supabase, le jeu tourne en **mode invité** (aucune écriture en base). Tu peux déployer serveur+client d'abord et brancher Supabase ensuite.

## 2) Serveur de jeu (Colyseus) — `apps/server`
| Réglage Coolify | Valeur |
|---|---|
| Type | Dockerfile |
| Build Context | `/` (racine du repo) |
| Dockerfile | `apps/server/Dockerfile` |
| Ports Exposes | `2567` |
| Domaine | `game.mondomaine.fr` (Traefik → WSS auto, TLS sur 443) |
| Health check | `GET /health` (répond `ok`) |

**Variables (runtime)** :
```
PORT=2567
NODE_ENV=production
SUPABASE_URL=https://supabase.mondomaine.fr
SUPABASE_JWT_SECRET=...          # vérifie les JWT (onAuth)
SUPABASE_SERVICE_ROLE_KEY=...    # écrit le résultat — JAMAIS exposé au client
```
Client → se connecte en **`wss://game.mondomaine.fr`**. MVP = 1 instance (état en mémoire). Scaling : driver Redis Colyseus + sticky sessions Traefik.

## 3) Client (Next.js) — `apps/client`
| Réglage Coolify | Valeur |
|---|---|
| Type | Dockerfile |
| Build Context | `/` |
| Dockerfile | `apps/client/Dockerfile` |
| Ports Exposes | `3000` |
| Domaine | `play.mondomaine.fr` |

⚠ Les `NEXT_PUBLIC_*` sont lues au **BUILD** → renseigne-les en **Build Variables / Build Args** Coolify (pas seulement runtime). Le Dockerfile les passe à `next build` via `ARG`→`ENV` :
```
NEXT_PUBLIC_COLYSEUS_URL=wss://game.mondomaine.fr
NEXT_PUBLIC_SUPABASE_URL=https://supabase.mondomaine.fr
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

---

## Vérifications post-déploiement
1. `https://game.mondomaine.fr/health` → `ok`.
2. Console navigateur sur `play.mondomaine.fr` : la WebSocket passe en `wss://…` (pas d'erreur mixed-content).
3. Deux clients → la partie démarre, déplacements des Rois synchronisés.
4. (Supabase) fin de partie → une ligne dans `matches` / `match_players`, classement (`leaderboard`) mis à jour.

## Sécurité (rappel)
- `service_role` **côté serveur uniquement**.
- **Change le mot de passe root du VPS** (il a transité en clair dans une conversation). Privilégie clés SSH + utilisateur non-root.
