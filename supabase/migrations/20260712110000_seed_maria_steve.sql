-- Seed sample users: maria@gmail.com and steve@gmail.com
create extension if not exists pgcrypto;

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
        ('maria@gmail.com', 'Maria Ivanova'),
        ('steve@gmail.com', 'Steve Georgiev')
    ) as u(email, full_name)
  loop
    select id into v_user_id from auth.users where email = rec.email;

    if v_user_id is null then
      v_user_id := gen_random_uuid();

      insert into auth.users (
        instance_id, id, aud, role, email,
        encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data,
        created_at, updated_at, is_sso_user, is_anonymous
      ) values (
        v_instance_id, v_user_id, 'authenticated', 'authenticated', rec.email,
        extensions.crypt('pass123', extensions.gen_salt('bf')),
        now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', rec.full_name),
        now(), now(), false, false
      );

      insert into auth.identities (
        id, user_id, identity_data, provider, provider_id,
        last_sign_in_at, created_at, updated_at
      ) values (
        gen_random_uuid(), v_user_id,
        jsonb_build_object('sub', v_user_id::text, 'email', rec.email),
        'email', rec.email, now(), now(), now()
      );

      raise notice 'Created user: %', rec.email;
    else
      raise notice 'User already exists: %', rec.email;
    end if;

    -- Ensure profile row exists
    insert into public.profiles (id, full_name)
    values (v_user_id, rec.full_name)
    on conflict (id) do nothing;

    -- Assign customer role
    insert into public.user_roles (user_id, role)
    values (v_user_id, 'customer')
    on conflict (user_id, role) do nothing;

  end loop;
end;
$$;
