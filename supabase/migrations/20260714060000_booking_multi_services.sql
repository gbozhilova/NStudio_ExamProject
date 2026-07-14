-- Allow bookings to store multiple services while keeping the primary service_id for compatibility.
create table if not exists public.booking_services (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete restrict,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (booking_id, service_id)
);

create index if not exists booking_services_booking_id_idx on public.booking_services (booking_id);
create index if not exists booking_services_service_id_idx on public.booking_services (service_id);

alter table public.booking_services enable row level security;

create policy "Users read own booking services"
on public.booking_services
for select
to authenticated
using (
  exists (
    select 1
    from public.bookings b
    where b.id = booking_id
      and b.user_id = auth.uid()
  )
);

-- Extend slot lookup to support a combined duration for multi-service bookings.
create or replace function public.get_available_slots(
  p_date date,
  p_service_id uuid,
  p_staff_user_id uuid default null,
  p_duration_minutes integer default null
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
  select coalesce(p_duration_minutes, service_duration_minutes) into v_duration
  from public.services where id = p_service_id;

  if v_duration is null then return; end if;

  v_slot_minutes := v_start_minutes;
  while v_slot_minutes + v_duration <= v_end_minutes loop
    v_slot_time := (v_slot_minutes / 60 || ':' || lpad((v_slot_minutes % 60)::text, 2, '0') || ':00')::time;

    if (p_date + v_slot_time)::timestamptz <= v_now then
      v_slot_minutes := v_slot_minutes + v_interval;
      continue;
    end if;

    if exists (
      select 1 from public.booking_blocks bb
      where (p_date + v_slot_time)::timestamptz < bb.ends_at
        and (p_date + v_slot_time + (v_duration || ' minutes')::interval) > bb.starts_at
    ) then
      v_slot_minutes := v_slot_minutes + v_interval;
      continue;
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

grant execute on function public.get_available_slots(date, uuid, uuid, integer) to anon, authenticated;
