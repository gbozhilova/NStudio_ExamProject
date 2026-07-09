create extension if not exists pgcrypto;

-- Seed sample auth users and ensure they have customer role.
do $$
declare
  v_instance_id uuid;
  v_user_id uuid;
  rec record;
begin
  select id into v_instance_id from auth.instances limit 1;

  for rec in
    select *
    from (
      values
        ('geri@gmail.com', 'Geri Ivanova'),
        ('nadya@gmail.com', 'Nadya Petrova'),
        ('titi@gmail.com', 'Titi Georgieva')
    ) as u(email, full_name)
  loop
    select id into v_user_id from auth.users where email = rec.email;

    if v_user_id is null then
      v_user_id := gen_random_uuid();

      insert into auth.users (
        instance_id,
        id,
        aud,
        role,
        email,
        encrypted_password,
        email_confirmed_at,
        raw_app_meta_data,
        raw_user_meta_data,
        created_at,
        updated_at,
        is_sso_user,
        is_anonymous
      )
      values (
        v_instance_id,
        v_user_id,
        'authenticated',
        'authenticated',
        rec.email,
        extensions.crypt('pass123', extensions.gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', rec.full_name),
        now(),
        now(),
        false,
        false
      );

      insert into auth.identities (
        id,
        user_id,
        identity_data,
        provider,
        provider_id,
        last_sign_in_at,
        created_at,
        updated_at
      )
      values (
        gen_random_uuid(),
        v_user_id,
        jsonb_build_object('sub', v_user_id::text, 'email', rec.email),
        'email',
        rec.email,
        now(),
        now(),
        now()
      );
    end if;

    insert into public.user_roles (user_id, role)
    values (v_user_id, 'customer')
    on conflict (user_id, role) do nothing;
  end loop;
end $$;

-- Seed services catalogue.
insert into public.services (category, service_name, service_description, service_duration_minutes, price)
select s.category, s.service_name, s.service_description, s.service_duration_minutes, s.price
from (
  values
    ('Hair', 'Woman Haircut', 'Precision haircut and styling for women.', 60, 45.00::numeric),
    ('Hair', 'Man Haircut', 'Classic and modern haircut styles for men.', 40, 28.00::numeric),
    ('Hair', 'Child Haircut', 'Gentle haircut service for children.', 30, 22.00::numeric),
    ('Coloring', 'Hair Colouring', 'Full hair coloring service.', 120, 95.00::numeric),
    ('Coloring', 'Hair Roots Colouring', 'Root touch-up and color refresh.', 90, 65.00::numeric),
    ('Styling', 'Dryer', 'Professional blow-dry and volume styling.', 35, 25.00::numeric),
    ('Styling', 'Festive Hair', 'Event and occasion hair styling.', 75, 70.00::numeric)
) as s(category, service_name, service_description, service_duration_minutes, price)
where not exists (
  select 1 from public.services existing where lower(existing.service_name) = lower(s.service_name)
);

-- Seed product catalogue.
insert into public.products (category, product_name, brand, stock_quantity)
select p.category, p.product_name, p.brand, p.stock_quantity
from (
  values
    ('Hair Care', 'Hydrating Shampoo', 'L''Oreal Professionnel', 35),
    ('Hair Care', 'Repair Conditioner', 'Kerastase', 28),
    ('Hair Care', 'Color Protect Mask', 'Wella Professionals', 20),
    ('Styling', 'Heat Protection Spray', 'Moroccanoil', 30),
    ('Styling', 'Volume Mousse', 'Schwarzkopf Professional', 22),
    ('Styling', 'Shine Serum', 'Redken', 18),
    ('Color Care', 'Purple Toning Shampoo', 'Fanola', 25),
    ('Scalp Care', 'Soothing Scalp Lotion', 'Vichy Dercos', 16),
    ('Tools', 'Ceramic Round Brush', 'Olivia Garden', 14),
    ('Finishing', 'Strong Hold Hairspray', 'TIGI', 27)
) as p(category, product_name, brand, stock_quantity)
where not exists (
  select 1 from public.products existing where lower(existing.product_name) = lower(p.product_name)
);

-- Seed 3 bookings per user on different dates/services.
with booking_seed as (
  select *
  from (
    values
      ('geri@gmail.com',  'Woman Haircut',        date '2026-07-15', time '10:00', 'Customer booking sample #1'),
      ('geri@gmail.com',  'Hair Colouring',       date '2026-07-18', time '14:30', 'Customer booking sample #2'),
      ('geri@gmail.com',  'Festive Hair',         date '2026-07-25', time '12:00', 'Customer booking sample #3'),
      ('nadya@gmail.com', 'Man Haircut',          date '2026-07-16', time '11:15', 'Customer booking sample #1'),
      ('nadya@gmail.com', 'Hair Roots Colouring', date '2026-07-20', time '15:00', 'Customer booking sample #2'),
      ('nadya@gmail.com', 'Dryer',                date '2026-07-27', time '09:45', 'Customer booking sample #3'),
      ('titi@gmail.com',  'Child Haircut',        date '2026-07-17', time '10:30', 'Customer booking sample #1'),
      ('titi@gmail.com',  'Woman Haircut',        date '2026-07-22', time '13:15', 'Customer booking sample #2'),
      ('titi@gmail.com',  'Dryer',                date '2026-07-29', time '16:00', 'Customer booking sample #3')
  ) as b(email, service_name, booking_date, booking_time, notes)
),
resolved as (
  select
    u.id as user_id,
    b.email,
    split_part(b.email, '@', 1) as customer_display_name,
    b.email as customer_email,
    s.id as service_id,
    b.booking_date,
    b.booking_time,
    b.notes
  from booking_seed b
  join auth.users u on lower(u.email) = lower(b.email)
  join public.services s on lower(s.service_name) = lower(b.service_name)
)
insert into public.bookings (
  user_id,
  customer_display_name,
  customer_email,
  service_id,
  booking_date,
  booking_time,
  notes,
  status
)
select
  r.user_id,
  r.customer_display_name,
  r.customer_email,
  r.service_id,
  r.booking_date,
  r.booking_time,
  r.notes,
  'confirmed'
from resolved r
where not exists (
  select 1
  from public.bookings existing
  where existing.user_id = r.user_id
    and existing.service_id = r.service_id
    and existing.booking_date = r.booking_date
    and existing.booking_time = r.booking_time
);
