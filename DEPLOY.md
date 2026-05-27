# Déploiement — Coolify (self-hosted, WSS via Traefik)

3 ressources Coolify sur le même VPS / réseau Docker. **Aucun service cloud externe.**

## 1) Supabase self-hosted
Déploie Supabase comme sa propre ressource (template/Docker officiel). Récupère ensuite :
- `SUPABASE_URL` (ex. `https://supabase.mondomaine.fr`)
- `anon key` → `NEXT_PUBLIC_SUPABASE_ANON_KEY` (client)
- `service_role key` → `SUPABASE_SERVICE_ROLE_KEY` (serveur uniquement)
- `JWT secret` (GoTrue) → `SUPABASE_JWT_SECRET` (serveur, pour vérifier les JWT)

Applique les migrations `supabase/migrations/0001 → 0003` (psql / SQL editor).

## 2) Serveur de jeu (Colyseus) — `apps/server`
- Type : **Dockerfile**. *Build Context* = `/` (racine du repo). *Dockerfile* = `apps/server/Dockerfile`.
- **Ports Exposes** : `2567`.
- Domaine : `game.mondomaine.fr` → Traefik termine le TLS sur 443 et fait l'**upgrade WebSocket** automatiquement ⇒ le client se connecte en **`wss://game.mondomaine.fr`**.
- Health check : `GET /health` (le serveur répond `ok`).
- Variables (runtime) :
  ```
  PORT=2567
  NODE_ENV=production
  SUPABASE_URL=https://supabase.mondomaine.fr
  SUPABASE_JWT_SECRET=...        # vérifie les JWT (onAuth)
  SUPABASE_SERVICE_ROLE_KEY=...  # écrit le résultat (jamais exposé au client)
  ```
- MVP : **une seule instance** (état en mémoire). Pour scaler : driver Redis Colyseus (Redis self-hosted) + sticky sessions Traefik.

## 3) Client (Next.js) — `apps/client`
- Type : **Dockerfile**. *Build Context* = `/`. *Dockerfile* = `apps/client/Dockerfile`.
- **Ports Exposes** : `3000`. Domaine : `play.mondomaine.fr`.
- ⚠ Les `NEXT_PUBLIC_*` sont lues au **BUILD** → renseigne-les en **Build Variables** Coolify (pas seulement runtime) :
  ```
  NEXT_PUBLIC_COLYSEUS_URL=wss://game.mondomaine.fr
  NEXT_PUBLIC_SUPABASE_URL=https://supabase.mondomaine.fr
  NEXT_PUBLIC_SUPABASE_ANON_KEY=...
  ```

## Vérifs post-déploiement
1. `https://game.mondomaine.fr/health` → `ok`.
2. Console navigateur sur `play.mondomaine.fr` : la connexion WebSocket passe en `wss://…` sans erreur de mixed-content.
3. Deux clients → la partie démarre, le déplacement des Rois est synchronisé.

## Sécurité (rappel)
- Le `service_role` reste **côté serveur** uniquement.
- N'expose jamais d'identifiants en clair. **Change toute clé/mot de passe partagé en clair** et privilégie clés SSH + utilisateur non-root sur le VPS.
