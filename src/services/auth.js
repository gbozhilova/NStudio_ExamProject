import { supabase } from './supabase.js';

function isDuplicateEmailError(error) {
  const message = String(error?.message ?? error?.error_description ?? error?.details ?? error ?? '');
  return /already registered|already exists|duplicate/i.test(message);
}

export async function signUp({ email, password, fullName }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } }
  });

  if (error) {
    if (isDuplicateEmailError(error)) {
      throw new Error('This email is already registered. Please sign in instead.');
    }
    throw error;
  }

  const user = data.user;
  if (user) {
    const { error: roleError } = await supabase
      .from('user_roles')
      .insert({ user_id: user.id, role: 'customer' });
    if (roleError) throw roleError;
  }

  return { user, role: 'customer' };
}

export async function signIn({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;

  const user = data.user;
  const roles = await getUserRoles(user.id);
  return { user, roles };
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return { session: data.session, user: data.session?.user ?? null };
}

export async function getUserRoles(userId) {
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId);
  if (error) throw error;
  return (data ?? []).map((r) => r.role);
}

export function onAuthStateChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
  return data.subscription.unsubscribe;
}

export async function currentUser() {
  const { data } = await supabase.auth.getUser();
  return data?.user ?? null;
}
