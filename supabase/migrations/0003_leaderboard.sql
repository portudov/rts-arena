-- Classement = agrégat sur profiles. security_invoker pour respecter la RLS des tables sous-jacentes.
create or replace view public.leaderboard
with (security_invoker = true)
as
select
  p.id as profile_id,
  p.pseudo,
  p.parties_jouees,
  p.victoires,
  case
    when p.parties_jouees > 0 then round(100.0 * p.victoires / p.parties_jouees, 1)
    else 0
  end as winrate
from public.profiles p
order by p.victoires desc, winrate desc, p.parties_jouees desc;
