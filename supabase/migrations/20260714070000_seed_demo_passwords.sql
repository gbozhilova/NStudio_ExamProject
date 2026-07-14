-- Seed deterministic demo passwords for the built-in demo accounts.
-- Safe to re-run: the password hash is reset to the same known demo value.
do $$
begin
  update auth.users
  set encrypted_password = extensions.crypt('pass123', extensions.gen_salt('bf')),
      email_confirmed_at = coalesce(email_confirmed_at, now())
  where lower(email) in (
    'maria@gmail.com',
    'steve@gmail.com',
    'geri@gmail.com',
    'nadya@gmail.com',
    'titi@gmail.com',
    'geriatanassowa@gmail.com'
  );
end;
$$;