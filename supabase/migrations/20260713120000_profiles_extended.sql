-- ── Extend profiles with customer + staff fields ─────────────────────────
alter table public.profiles
  add column if not exists hair_type      text,
  add column if not exists skin_type      text,
  add column if not exists allergy_notes  text,
  add column if not exists preferences    jsonb not null default '{}',
  add column if not exists bio            text,
  add column if not exists specialties    text[],
  add column if not exists working_hours  jsonb not null default '{}';

-- ── Favorites table ────────────────────────────────────────────────────────
create table if not exists public.favorites (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  service_id uuid references public.services  (id) on delete cascade,
  product_id uuid references public.products  (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (num_nonnulls(service_id, product_id) = 1)
);

create unique index if not exists favorites_user_service_idx on public.favorites (user_id, service_id)
  where service_id is not null;
create unique index if not exists favorites_user_product_idx on public.favorites (user_id, product_id)
  where product_id is not null;
create index if not exists favorites_user_id_idx on public.favorites (user_id);

alter table public.favorites enable row level security;

create policy "Users manage own favorites"
on public.favorites for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Admins and staff read all favorites"
on public.favorites for select to authenticated
using (public.has_any_role(array['admin', 'staff']));

-- ── Update get_available_slots to prefer specialties match ─────────────────
create or replace function public.get_available_slots(
  p_date date,
  p_service_id uuid,
  p_staff_user_id uuid default null
)
returns table (
  slot_time  time,
  staff_id   uuid,
  staff_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_duration  integer;
  v_category  text;
  v_slot_min  integer;
  v_start     integer := 9 * 60;
  v_end       integer := 19 * 60;
  v_interval  integer := 30;
  v_slot_time time;
  v_now       timestamptz := now();
begin
  select service_duration_minutes, category
    into v_duration, v_category
  from public.services where id = p_service_id;

  if v_duration is null then return; end if;

  v_slot_min := v_start;
  while v_slot_min + v_duration <= v_end loop
    v_slot_time := (v_slot_min / 60 || ':' || lpad((v_slot_min % 60)::text, 2, '0') || ':00')::time;

    if (p_date + v_slot_time)::timestamptz <= v_now then
      v_slot_min := v_slot_min + v_interval; continue;
    end if;

    if exists (
      select 1 from public.booking_blocks bb
      where (p_date + v_slot_time)::timestamptz < bb.ends_at
        and (p_date + v_slot_time + (v_duration || ' minutes')::interval) > bb.starts_at
    ) then
      v_slot_min := v_slot_min + v_interval; continue;
    end if;

    if p_staff_user_id is not null then
      if not exists (
        select 1 from public.bookings b
        where b.booking_date = p_date
          and b.staff_user_id = p_staff_user_id
          and b.status not in ('cancelled')
          and b.booking_time = v_slot_time
      ) then
        return query
          select v_slot_time, p_staff_user_id,
            (select full_name from public.profiles where id = p_staff_user_id);
      end if;
    else
      -- Prefer staff whose specialties include the service category
      return query
        select v_slot_time, ur.user_id, p.full_name
        from public.user_roles ur
        join public.profiles p on p.id = ur.user_id
        where ur.role in ('staff', 'admin')
          and not exists (
            select 1 from public.bookings b
            where b.booking_date = p_date
              and b.staff_user_id = ur.user_id
              and b.status not in ('cancelled')
              and b.booking_time = v_slot_time
          )
        order by
          case when v_category = any(coalesce(p.specialties, '{}')) then 0 else 1 end,
          p.full_name
        limit 1;
    end if;

    v_slot_min := v_slot_min + v_interval;
  end loop;
  return;
end;
$$;
