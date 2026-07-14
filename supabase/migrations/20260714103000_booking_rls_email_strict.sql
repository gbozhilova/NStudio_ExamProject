-- Tighten booking ownership policies to avoid permissive matches when JWT email is missing.
drop policy if exists "Customers view own bookings" on public.bookings;
drop policy if exists "Customers update own bookings" on public.bookings;
drop policy if exists "Customers delete own bookings" on public.bookings;

create policy "Customers view own bookings"
on public.bookings
for select
to authenticated
using (
  auth.uid() = user_id
  or (
    customer_email is not null
    and auth.jwt()->>'email' is not null
    and lower(customer_email) = lower(auth.jwt()->>'email')
  )
);

create policy "Customers update own bookings"
on public.bookings
for update
to authenticated
using (
  auth.uid() = user_id
  or (
    customer_email is not null
    and auth.jwt()->>'email' is not null
    and lower(customer_email) = lower(auth.jwt()->>'email')
  )
)
with check (
  auth.uid() = user_id
  or (
    customer_email is not null
    and auth.jwt()->>'email' is not null
    and lower(customer_email) = lower(auth.jwt()->>'email')
  )
);

create policy "Customers delete own bookings"
on public.bookings
for delete
to authenticated
using (
  auth.uid() = user_id
  or (
    customer_email is not null
    and auth.jwt()->>'email' is not null
    and lower(customer_email) = lower(auth.jwt()->>'email')
  )
);
