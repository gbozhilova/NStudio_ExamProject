-- Add staff_user_id to bookings (which staff member will handle the appointment)
alter table public.bookings
  add column if not exists staff_user_id uuid references auth.users (id) on delete set null;

create index if not exists bookings_staff_user_id_idx on public.bookings (staff_user_id);

-- Allow guests (anon) to create bookings via the book-guest edge function
-- The edge function uses service role key, but we also expose a security-definer RPC
-- so authenticated users can create bookings directly.

-- RPC: get staff list (users with staff or admin role + their profile)
create or replace function public.get_staff_list()
returns table (
  user_id uuid,
  full_name text,
  avatar_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.avatar_url
  from public.profiles p
  join public.user_roles ur on ur.user_id = p.id
  where ur.role in ('staff', 'admin')
  order by p.full_name;
$$;

-- RPC: get available time slots for a given date + service + optional staff
create or replace function public.get_available_slots(
  p_date date,
  p_service_id uuid,
  p_staff_user_id uuid default null
)
returns table (
  slot_time time,
  staff_id uuid,
  staff_name text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_duration integer;
  v_slot_minutes integer;
  v_start_minutes integer := 9 * 60;
  v_end_minutes integer   := 19 * 60;
  v_interval integer      := 30;
  v_slot_time time;
  v_now timestamptz := now();
begin
  select service_duration_minutes into v_duration
  from public.services where id = p_service_id;

  if v_duration is null then return; end if;

  -- Iterate every 30-minute slot in business hours
  v_slot_minutes := v_start_minutes;
  while v_slot_minutes + v_duration <= v_end_minutes loop
    v_slot_time := (v_slot_minutes / 60 || ':' || lpad((v_slot_minutes % 60)::text, 2, '0') || ':00')::time;

    -- Skip slots in the past
    if (p_date + v_slot_time)::timestamptz <= v_now then
      v_slot_minutes := v_slot_minutes + v_interval;
      continue;
    end if;

    -- Skip if a salon-wide block overlaps this slot
    if exists (
      select 1 from public.booking_blocks bb
      where (p_date + v_slot_time)::timestamptz < bb.ends_at
        and (p_date + v_slot_time + (v_duration || ' minutes')::interval) > bb.starts_at
    ) then
      v_slot_minutes := v_slot_minutes + v_interval;
      continue;
    end if;

    if p_staff_user_id is not null then
      -- Check specific staff availability
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
      -- Return first available staff member
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
        order by p.full_name
        limit 1;
    end if;

    v_slot_minutes := v_slot_minutes + v_interval;
  end loop;
  return;
end;
$$;

-- Allow anon to call get_available_slots and get_staff_list
grant execute on function public.get_available_slots(date, uuid, uuid) to anon, authenticated;
grant execute on function public.get_staff_list() to anon, authenticated;
