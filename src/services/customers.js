import { supabase } from './supabase.js';

const PAGE_SIZE = 20;

export async function listCustomers({ search = '', page = 1, pageSize = PAGE_SIZE } = {}) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('profiles')
    .select(
      `id, full_name, phone, notes, avatar_url, created_at, updated_at,
       user_roles!inner ( role )`,
      { count: 'exact' }
    )
    .eq('user_roles.role', 'customer')
    .order('full_name', { ascending: true })
    .range(from, to);

  if (search.trim()) {
    query = query.ilike('full_name', `%${search.trim()}%`);
  }

  const { data, count, error } = await query;
  if (error) throw error;
  return { data: data ?? [], count: count ?? 0 };
}

export async function getCustomer(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data;
}

export async function updateCustomer(userId, { fullName, phone, notes }) {
  const { data, error } = await supabase
    .from('profiles')
    .update({
      full_name: fullName,
      phone: phone ?? null,
      notes: notes ?? null,
      updated_at: new Date().toISOString()
    })
    .eq('id', userId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteCustomer(userId) {
  const { error: roleError } = await supabase
    .from('user_roles')
    .delete()
    .eq('user_id', userId);
  if (roleError) throw roleError;

  const { error: profileError } = await supabase
    .from('profiles')
    .delete()
    .eq('id', userId);
  if (profileError) throw profileError;
}
