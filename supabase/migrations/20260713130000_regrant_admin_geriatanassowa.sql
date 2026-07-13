-- Re-grant admin role to geriatanassowa@gmail.com (role may have been lost)
do $$
declare
  v_user_id uuid;
begin
  select id into v_user_id from auth.users where email = 'geriatanassowa@gmail.com';

  if v_user_id is null then
    raise notice 'User not found — skipping.';
    return;
  end if;

  -- Remove all existing roles first
  delete from public.user_roles where user_id = v_user_id;

  -- Re-insert admin role
  insert into public.user_roles (user_id, role) values (v_user_id, 'admin');

  -- Ensure profile row exists
  insert into public.profiles (id, full_name)
  select v_user_id, raw_user_meta_data ->> 'full_name'
  from auth.users where id = v_user_id
  on conflict (id) do nothing;

  raise notice 'Admin role re-granted to geriatanassowa@gmail.com (%)', v_user_id;
end;
$$;
