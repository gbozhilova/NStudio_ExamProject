create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  notes text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Users can read and update their own profile
create policy "Users read own profile"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

create policy "Users update own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- Staff and admin can read all profiles
create policy "Staff and admin read all profiles"
on public.profiles
for select
to authenticated
using (public.has_any_role(array['staff', 'admin']));

-- Admin can insert, update, and delete any profile
create policy "Admin manage all profiles"
on public.profiles
for all
to authenticated
using (public.has_role('admin'))
with check (public.has_role('admin'));

-- Auto-create profile row when a new user registers
create or replace function public.handle_new_user ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute procedure public.handle_new_user ();
