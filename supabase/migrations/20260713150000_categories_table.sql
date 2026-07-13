create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  image_url text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.categories enable row level security;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create policy "Public read categories"
on public.categories
for select
to anon, authenticated
using (true);

create policy "Admins and staff manage categories"
on public.categories
for all
to authenticated
using (public.has_any_role(array['admin', 'staff']))
with check (public.has_any_role(array['admin', 'staff']));

alter table public.services
  add column if not exists category_id uuid references public.categories (id) on delete set null;

alter table public.products
  add column if not exists category_id uuid references public.categories (id) on delete set null;

create index if not exists services_category_id_idx on public.services (category_id);
create index if not exists products_category_id_idx on public.products (category_id);

with distinct_categories as (
  select distinct initcap(trim(category)) as name
  from (
    select category from public.services where category is not null and trim(category) <> ''
    union
    select category from public.products where category is not null and trim(category) <> ''
  ) source_categories
)
insert into public.categories (name, slug, image_url, sort_order)
select
  dc.name,
  regexp_replace(lower(dc.name), '[^a-z0-9]+', '-', 'g') as slug,
  case
    when lower(dc.name) like '%hair%' then '/assets/HairCut.jpg'
    when lower(dc.name) like '%color%' then '/assets/Home%202.jpg'
    when lower(dc.name) like '%makeup%' then '/assets/Hair%20Service%20More.jpg'
    when lower(dc.name) like '%nail%' then '/assets/Festive.jpg'
    when lower(dc.name) like '%skin%' then '/assets/Home3.avif'
    when lower(dc.name) like '%massage%' then '/assets/Home.jpg'
    else '/assets/Home3.avif'
  end as image_url,
  row_number() over (order by dc.name) as sort_order
from distinct_categories dc
on conflict (name) do nothing;

update public.services s
set category_id = c.id,
    category = c.name
from public.categories c
where s.category_id is null
  and s.category is not null
  and lower(trim(s.category)) = lower(c.name);

update public.products p
set category_id = c.id,
    category = c.name
from public.categories c
where p.category_id is null
  and p.category is not null
  and lower(trim(p.category)) = lower(c.name);

create or replace function public.sync_service_category_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.category_id is not null then
    select name into new.category from public.categories where id = new.category_id;
  elsif new.category is not null and trim(new.category) <> '' then
    select id into new.category_id from public.categories where lower(name) = lower(trim(new.category)) limit 1;
    if new.category_id is not null then
      select name into new.category from public.categories where id = new.category_id;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.sync_product_category_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.category_id is not null then
    select name into new.category from public.categories where id = new.category_id;
  elsif new.category is not null and trim(new.category) <> '' then
    select id into new.category_id from public.categories where lower(name) = lower(trim(new.category)) limit 1;
    if new.category_id is not null then
      select name into new.category from public.categories where id = new.category_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists set_services_updated_at on public.services;
drop trigger if exists set_products_updated_at on public.products;
drop trigger if exists sync_service_category_fields on public.services;
drop trigger if exists sync_product_category_fields on public.products;

create trigger set_services_updated_at
before update on public.services
for each row
execute function public.set_updated_at();

create trigger set_products_updated_at
before update on public.products
for each row
execute function public.set_updated_at();

create trigger sync_service_category_fields
before insert or update on public.services
for each row
execute function public.sync_service_category_fields();

create trigger sync_product_category_fields
before insert or update on public.products
for each row
execute function public.sync_product_category_fields();

create or replace function public.sync_category_name_to_items()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.services
    set category = new.name
    where category_id = new.id;
  update public.products
    set category = new.name
    where category_id = new.id;
  return new;
end;
$$;

drop trigger if exists sync_category_name_to_items on public.categories;
create trigger sync_category_name_to_items
after update of name on public.categories
for each row
execute function public.sync_category_name_to_items();
