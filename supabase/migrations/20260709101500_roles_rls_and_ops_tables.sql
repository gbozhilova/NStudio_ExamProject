create table if not exists public.user_roles (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('customer', 'staff', 'admin')),
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

alter table public.user_roles enable row level security;

create or replace function public.has_any_role(required_roles text[])
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return exists (
    select 1
    from public.user_roles ur
    where ur.user_id = auth.uid()
      and ur.role = any (required_roles)
  );
end;
$$;

create or replace function public.has_role(required_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_any_role(array[required_role]);
$$;

drop policy if exists "Users view own roles" on public.user_roles;
drop policy if exists "Admins and staff view all roles" on public.user_roles;
drop policy if exists "Admins manage roles" on public.user_roles;

create policy "Users view own roles"
on public.user_roles
for select
to authenticated
using (auth.uid() = user_id);

create policy "Admins and staff view all roles"
on public.user_roles
for select
to authenticated
using (public.has_any_role(array['admin', 'staff']));

create policy "Admins manage roles"
on public.user_roles
for all
to authenticated
using (public.has_role('admin'))
with check (public.has_role('admin'));

drop policy if exists "Authenticated users manage own bookings" on public.bookings;
drop policy if exists "Customers view own bookings" on public.bookings;
drop policy if exists "Customers create own bookings" on public.bookings;
drop policy if exists "Customers update own bookings" on public.bookings;
drop policy if exists "Customers delete own bookings" on public.bookings;
drop policy if exists "Admins and staff manage all bookings" on public.bookings;

create policy "Customers view own bookings"
on public.bookings
for select
to authenticated
using (auth.uid() = user_id);

create policy "Customers create own bookings"
on public.bookings
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Customers update own bookings"
on public.bookings
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Customers delete own bookings"
on public.bookings
for delete
to authenticated
using (auth.uid() = user_id);

create policy "Admins and staff manage all bookings"
on public.bookings
for all
to authenticated
using (public.has_any_role(array['admin', 'staff']))
with check (public.has_any_role(array['admin', 'staff']));

drop policy if exists "Admins and staff write services" on public.services;
create policy "Admins and staff write services"
on public.services
for insert
to authenticated
with check (public.has_any_role(array['admin', 'staff']));

create policy "Admins and staff update services"
on public.services
for update
to authenticated
using (public.has_any_role(array['admin', 'staff']))
with check (public.has_any_role(array['admin', 'staff']));

create policy "Admins and staff delete services"
on public.services
for delete
to authenticated
using (public.has_any_role(array['admin', 'staff']));

drop policy if exists "Admins and staff write products" on public.products;
create policy "Admins and staff write products"
on public.products
for insert
to authenticated
with check (public.has_any_role(array['admin', 'staff']));

create policy "Admins and staff update products"
on public.products
for update
to authenticated
using (public.has_any_role(array['admin', 'staff']))
with check (public.has_any_role(array['admin', 'staff']));

create policy "Admins and staff delete products"
on public.products
for delete
to authenticated
using (public.has_any_role(array['admin', 'staff']));

create table if not exists public.booking_blocks (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  question_text text not null,
  question_type text not null default 'single_choice' check (question_type in ('single_choice', 'multi_choice', 'text')),
  options jsonb,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quiz_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  question_id uuid not null references public.quiz_questions (id) on delete cascade,
  answer_text text,
  selected_option text,
  score numeric(6,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, question_id)
);

create table if not exists public.product_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete cascade,
  quiz_answer_id uuid references public.quiz_answers (id) on delete set null,
  source text not null default 'quiz',
  rank integer not null default 0,
  explanation text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, product_id, source)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_user_id uuid not null references auth.users (id) on delete cascade,
  recipient_user_id uuid references auth.users (id) on delete set null,
  recipient_role text not null default 'admin' check (recipient_role in ('admin', 'staff')),
  subject text,
  body text not null,
  attachment_path text,
  status text not null default 'new' check (status in ('new', 'read', 'resolved', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists booking_blocks_starts_at_idx on public.booking_blocks (starts_at);
create index if not exists booking_blocks_ends_at_idx on public.booking_blocks (ends_at);
create index if not exists quiz_questions_sort_order_idx on public.quiz_questions (sort_order);
create index if not exists quiz_answers_user_id_idx on public.quiz_answers (user_id);
create index if not exists quiz_answers_question_id_idx on public.quiz_answers (question_id);
create index if not exists product_recommendations_user_id_idx on public.product_recommendations (user_id);
create index if not exists product_recommendations_product_id_idx on public.product_recommendations (product_id);
create index if not exists messages_sender_user_id_idx on public.messages (sender_user_id);
create index if not exists messages_recipient_user_id_idx on public.messages (recipient_user_id);
create index if not exists messages_status_idx on public.messages (status);

create trigger set_booking_blocks_updated_at
before update on public.booking_blocks
for each row
execute function public.set_updated_at();

create trigger set_quiz_questions_updated_at
before update on public.quiz_questions
for each row
execute function public.set_updated_at();

create trigger set_messages_updated_at
before update on public.messages
for each row
execute function public.set_updated_at();

alter table public.booking_blocks enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_answers enable row level security;
alter table public.product_recommendations enable row level security;
alter table public.messages enable row level security;

create policy "Users read booking blocks"
on public.booking_blocks
for select
to anon, authenticated
using (true);

create policy "Admins and staff manage booking blocks"
on public.booking_blocks
for all
to authenticated
using (public.has_any_role(array['admin', 'staff']))
with check (public.has_any_role(array['admin', 'staff']));

create policy "Users read active quiz questions"
on public.quiz_questions
for select
to anon, authenticated
using (is_active or public.has_any_role(array['admin', 'staff']));

create policy "Admins and staff manage quiz questions"
on public.quiz_questions
for all
to authenticated
using (public.has_any_role(array['admin', 'staff']))
with check (public.has_any_role(array['admin', 'staff']));

create policy "Users read own quiz answers"
on public.quiz_answers
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users insert own quiz answers"
on public.quiz_answers
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users update own quiz answers"
on public.quiz_answers
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Admins and staff read all quiz answers"
on public.quiz_answers
for select
to authenticated
using (public.has_any_role(array['admin', 'staff']));

create policy "Users read own product recommendations"
on public.product_recommendations
for select
to authenticated
using (auth.uid() = user_id);

create policy "Admins and staff manage product recommendations"
on public.product_recommendations
for all
to authenticated
using (public.has_any_role(array['admin', 'staff']))
with check (public.has_any_role(array['admin', 'staff']));

create policy "Users read own messages"
on public.messages
for select
to authenticated
using (auth.uid() = sender_user_id or auth.uid() = recipient_user_id);

create policy "Users send own messages"
on public.messages
for insert
to authenticated
with check (auth.uid() = sender_user_id);

create policy "Admins and staff read all messages"
on public.messages
for select
to authenticated
using (public.has_any_role(array['admin', 'staff']));

create policy "Admins and staff update messages"
on public.messages
for update
to authenticated
using (public.has_any_role(array['admin', 'staff']))
with check (public.has_any_role(array['admin', 'staff']));

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('profile-images', 'profile-images', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('message-images', 'message-images', false)
on conflict (id) do nothing;

drop policy if exists "Public read product images" on storage.objects;
drop policy if exists "Admin and staff manage product images" on storage.objects;
drop policy if exists "Users read own profile images" on storage.objects;
drop policy if exists "Users upload own profile images" on storage.objects;
drop policy if exists "Users update own profile images" on storage.objects;
drop policy if exists "Users delete own profile images" on storage.objects;
drop policy if exists "Users read own message images" on storage.objects;
drop policy if exists "Users upload own message images" on storage.objects;
drop policy if exists "Users update own message images" on storage.objects;
drop policy if exists "Users delete own message images" on storage.objects;

create policy "Public read product images"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'product-images');

create policy "Admin and staff manage product images"
on storage.objects
for all
to authenticated
using (bucket_id = 'product-images' and public.has_any_role(array['admin', 'staff']))
with check (bucket_id = 'product-images' and public.has_any_role(array['admin', 'staff']));

create policy "Users read own profile images"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'profile-images'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.has_any_role(array['admin', 'staff'])
  )
);

create policy "Users upload own profile images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'profile-images'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.has_any_role(array['admin', 'staff'])
  )
);

create policy "Users update own profile images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'profile-images'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.has_any_role(array['admin', 'staff'])
  )
)
with check (
  bucket_id = 'profile-images'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.has_any_role(array['admin', 'staff'])
  )
);

create policy "Users delete own profile images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'profile-images'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.has_any_role(array['admin', 'staff'])
  )
);

create policy "Users read own message images"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'message-images'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.has_any_role(array['admin', 'staff'])
  )
);

create policy "Users upload own message images"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'message-images'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.has_any_role(array['admin', 'staff'])
  )
);

create policy "Users update own message images"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'message-images'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.has_any_role(array['admin', 'staff'])
  )
)
with check (
  bucket_id = 'message-images'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.has_any_role(array['admin', 'staff'])
  )
);

create policy "Users delete own message images"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'message-images'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.has_any_role(array['admin', 'staff'])
  )
);
