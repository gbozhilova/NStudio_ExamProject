-- Allow per-staff booking blocks (NULL = salon-wide)
alter table public.booking_blocks
  add column if not exists staff_user_id uuid references auth.users (id) on delete cascade;

create index if not exists booking_blocks_staff_user_id_idx on public.booking_blocks (staff_user_id);
