-- 1. Add image_url to products
alter table public.products add column if not exists image_url text;

-- 2. Make profile-images public (everyone can view profile photos)
update storage.buckets set public = true where id = 'profile-images';

-- 3. Add booking-files bucket (private - owner + admin/staff)
insert into storage.buckets (id, name, public, file_size_limit)
values ('booking-files', 'booking-files', false, 52428800)
on conflict (id) do nothing;

-- 4. Drop old restrictive profile-images read policy and replace with public read
drop policy if exists "Users read own profile images" on storage.objects;

create policy "Public read profile images"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'profile-images');

-- 5. Booking-files: owner (first folder segment = user_id) or admin/staff can read
drop policy if exists "Users read own booking files" on storage.objects;
drop policy if exists "Admins and staff read all booking files" on storage.objects;
drop policy if exists "Users upload own booking files" on storage.objects;
drop policy if exists "Users delete own booking files" on storage.objects;
drop policy if exists "Admins and staff manage booking files" on storage.objects;

create policy "Users read own booking files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'booking-files'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.has_any_role(array['admin', 'staff'])
  )
);

create policy "Users upload own booking files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'booking-files'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.has_any_role(array['admin', 'staff'])
  )
);

create policy "Users delete own booking files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'booking-files'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.has_any_role(array['admin', 'staff'])
  )
);

create policy "Admins and staff manage booking files"
on storage.objects
for all
to authenticated
using (bucket_id = 'booking-files' and public.has_any_role(array['admin', 'staff']))
with check (bucket_id = 'booking-files' and public.has_any_role(array['admin', 'staff']));
