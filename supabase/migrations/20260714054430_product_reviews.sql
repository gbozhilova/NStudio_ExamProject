-- Mirrors the remote migration applied on 2026-07-14 via MCP.
-- Kept in-repo so local migration history matches remote Supabase history.

create table if not exists public.product_reviews (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  reviewer_name text not null,
  rating integer not null check (rating >= 1 and rating <= 5),
  review_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_review_images (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.product_reviews (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  image_path text not null,
  original_name text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists product_reviews_product_id_idx on public.product_reviews (product_id);
create index if not exists product_reviews_user_id_idx on public.product_reviews (user_id);
create index if not exists product_review_images_review_id_idx on public.product_review_images (review_id);

alter table public.product_reviews enable row level security;
alter table public.product_review_images enable row level security;

drop policy if exists "Public read product reviews" on public.product_reviews;
drop policy if exists "Authenticated users insert own product reviews" on public.product_reviews;
drop policy if exists "Authenticated users update own product reviews" on public.product_reviews;
drop policy if exists "Authenticated users delete own product reviews" on public.product_reviews;
drop policy if exists "Public read product review images" on public.product_review_images;
drop policy if exists "Authenticated users insert own product review images" on public.product_review_images;
drop policy if exists "Authenticated users update own product review images" on public.product_review_images;
drop policy if exists "Authenticated users delete own product review images" on public.product_review_images;

create policy "Public read product reviews"
on public.product_reviews
for select
to anon, authenticated
using (true);

create policy "Authenticated users insert own product reviews"
on public.product_reviews
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Authenticated users update own product reviews"
on public.product_reviews
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Authenticated users delete own product reviews"
on public.product_reviews
for delete
to authenticated
using (auth.uid() = user_id);

create policy "Public read product review images"
on public.product_review_images
for select
to anon, authenticated
using (true);

create policy "Authenticated users insert own product review images"
on public.product_review_images
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Authenticated users update own product review images"
on public.product_review_images
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Authenticated users delete own product review images"
on public.product_review_images
for delete
to authenticated
using (auth.uid() = user_id);

insert into storage.buckets (id, name, public, file_size_limit)
values ('product-review-images', 'product-review-images', true, 10485760)
on conflict (id) do nothing;

drop policy if exists "Public read product review images storage" on storage.objects;
drop policy if exists "Users upload own product review images" on storage.objects;
drop policy if exists "Users update own product review images" on storage.objects;
drop policy if exists "Users delete own product review images" on storage.objects;

create policy "Public read product review images storage"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'product-review-images');

create policy "Users upload own product review images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'product-review-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users update own product review images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'product-review-images'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'product-review-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users delete own product review images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'product-review-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);