import { supabase } from './supabase.js';

const PAGE_SIZE = 20;

export async function listCustomers({ search = '', page = 1, pageSize = PAGE_SIZE } = {}) {
  // Fetch customer user_ids first (no direct FK between profiles and user_roles)
  const { data: roleRows, error: roleError } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role', 'customer');
  if (roleError) throw roleError;

  const customerIds = (roleRows ?? []).map((r) => r.user_id);
  if (!customerIds.length) return { data: [], count: 0 };

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from('profiles')
    .select('id, full_name, phone, notes, avatar_url, created_at, updated_at', { count: 'exact' })
    .in('id', customerIds)
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
