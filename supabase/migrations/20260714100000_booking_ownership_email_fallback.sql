-- Backfill legacy bookings so ownership aligns with the authenticated user account by email.
update public.bookings b
set user_id = u.id
from auth.users u
where b.customer_email is not null
  and u.email is not null
  and lower(b.customer_email) = lower(u.email)
  and b.user_id is distinct from u.id;

-- Replace booking customer policies with ownership checks that also support
-- legacy rows linked by matching authenticated email.
drop policy if exists "Customers view own bookings" on public.bookings;
drop policy if exists "Customers create own bookings" on public.bookings;
drop policy if exists "Customers update own bookings" on public.bookings;
drop policy if exists "Customers delete own bookings" on public.bookings;

create policy "Customers view own bookings"
on public.bookings
for select
to authenticated
using (
  auth.uid() = user_id
  or lower(coalesce(customer_email, '')) = lower(coalesce(auth.jwt()->>'email', ''))
);

-- Keep insert strict to avoid creating bookings under someone else's user_id.
create policy "Customers create own bookings"
on public.bookings
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Customers update own bookings"
on public.bookings
for update
to authenticated
using (
  auth.uid() = user_id
  or lower(coalesce(customer_email, '')) = lower(coalesce(auth.jwt()->>'email', ''))
)
with check (
  auth.uid() = user_id
  or lower(coalesce(customer_email, '')) = lower(coalesce(auth.jwt()->>'email', ''))
);

create policy "Customers delete own bookings"
on public.bookings
for delete
to authenticated
using (
  auth.uid() = user_id
  or lower(coalesce(customer_email, '')) = lower(coalesce(auth.jwt()->>'email', ''))
);
