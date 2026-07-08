create extension if not exists pgcrypto;

create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  service_name text not null,
  service_description text,
  service_duration_minutes integer not null check (service_duration_minutes > 0),
  price numeric(10,2) not null check (price >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  product_name text not null,
  brand text not null,
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  customer_display_name text not null,
  customer_email text,
  service_id uuid not null references public.services (id) on delete restrict,
  booking_date date not null,
  booking_time time not null,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bookings_user_id_idx on public.bookings (user_id);
create index if not exists bookings_service_id_idx on public.bookings (service_id);
create index if not exists bookings_booking_date_idx on public.bookings (booking_date);
create index if not exists products_category_idx on public.products (category);
create index if not exists services_category_idx on public.services (category);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_services_updated_at
before update on public.services
for each row
execute function public.set_updated_at();

create trigger set_products_updated_at
before update on public.products
for each row
execute function public.set_updated_at();

create trigger set_bookings_updated_at
before update on public.bookings
for each row
execute function public.set_updated_at();

alter table public.services enable row level security;
alter table public.products enable row level security;
alter table public.bookings enable row level security;

create policy "Public read services"
on public.services
for select
to anon, authenticated
using (true);

create policy "Public read products"
on public.products
for select
to anon, authenticated
using (true);

create policy "Authenticated users manage own bookings"
on public.bookings
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
