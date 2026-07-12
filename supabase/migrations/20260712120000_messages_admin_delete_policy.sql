-- Add missing delete policy for admins and staff on messages
create policy "Admins and staff delete messages"
on public.messages
for delete
to authenticated
using (public.has_any_role(array['admin', 'staff']));
