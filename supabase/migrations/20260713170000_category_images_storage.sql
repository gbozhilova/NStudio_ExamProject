insert into storage.buckets (id, name, public, file_size_limit)
values ('category-images', 'category-images', true, 10485760)
on conflict (id) do nothing;

drop policy if exists "Public read category images" on storage.objects;
drop policy if exists "Admins and staff manage category images" on storage.objects;

create policy "Public read category images"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'category-images');

create policy "Admins and staff manage category images"
on storage.objects
for all
to authenticated
using (bucket_id = 'category-images' and public.has_any_role(array['admin', 'staff']))
with check (bucket_id = 'category-images' and public.has_any_role(array['admin', 'staff']));