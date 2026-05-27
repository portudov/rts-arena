-- Row Level Security.
-- Le client (clé anon) ne fait que LIRE; le serveur de jeu écrit via service_role (bypass RLS).

alter table public.profiles enable row level security;
alter table public.matches enable row level security;
alter table public.match_players enable row level security;

-- profiles: lecture publique (pseudos + classement), écriture par le propriétaire seulement.
drop policy if exists profiles_select_all on public.profiles;
create policy profiles_select_all on public.profiles
  for select using (true);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert with check (auth.uid() = user_id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- matches / match_players: lecture publique (historique/classement),
-- aucune policy d'écriture -> seul service_role peut insérer/mettre à jour.
drop policy if exists matches_select_all on public.matches;
create policy matches_select_all on public.matches
  for select using (true);

drop policy if exists match_players_select_all on public.match_players;
create policy match_players_select_all on public.match_players
  for select using (true);
