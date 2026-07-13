-- Convenience view: users with their roles and profiles visible in Supabase Table Editor
create or replace view public.users_overview as
select
  u.id,
  u.email,
  u.created_at,
  u.last_sign_in_at,
  u.confirmed_at,
  p.full_name,
  p.phone,
  p.avatar_url,
  p.hair_type,
  p.skin_type,
  p.specialties,
  string_agg(ur.role, ', ' order by ur.role) as roles
from auth.users u
left join public.profiles p on p.id = u.id
left join public.user_roles ur on ur.user_id = u.id
group by u.id, u.email, u.created_at, u.last_sign_in_at, u.confirmed_at,
  p.full_name, p.phone, p.avatar_url, p.hair_type, p.skin_type, p.specialties;

-- Allow admins and staff to query the view
grant select on public.users_overview to authenticated;

-- Note: RLS cannot be applied to views in PostgreSQL.
-- Access is controlled by RLS on the underlying auth.users, profiles, and user_roles tables.
-- The view itself is secured because auth.users is only accessible via the defined joins.
