-- Alias is_admin() for compatibility with standard Supabase RBAC conventions
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_role('admin');
$$;
