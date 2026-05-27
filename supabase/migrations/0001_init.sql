-- RTS arena — persistance uniquement (auth + stats + historique).
-- L'état de jeu temps réel vit dans les rooms Colyseus, jamais ici.

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  pseudo text not null unique,
  parties_jouees int not null default 0,
  victoires int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  winner_profile_id uuid references public.profiles(id),
  settings jsonb not null default '{}'::jsonb
);

create table if not exists public.match_players (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  resultat text not null check (resultat in ('win', 'loss', 'draw', 'abandon')),
  stats jsonb not null default '{}'::jsonb,
  unique (match_id, profile_id)
);

create index if not exists idx_match_players_match on public.match_players (match_id);
create index if not exists idx_match_players_profile on public.match_players (profile_id);

-- Incrément atomique des stats (appelé par le serveur via service_role en fin de partie).
create or replace function public.increment_match_stats(p_profile_id uuid, p_win int)
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
     set parties_jouees = parties_jouees + 1,
         victoires = victoires + greatest(p_win, 0)
   where id = p_profile_id;
$$;
