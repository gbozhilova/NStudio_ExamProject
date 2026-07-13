import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const candidate = (error as { message?: unknown; error_description?: unknown; details?: unknown }).message
      ?? (error as { message?: unknown; error_description?: unknown; details?: unknown }).error_description
      ?? (error as { message?: unknown; error_description?: unknown; details?: unknown }).details;
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
    try {
      const serialized = JSON.stringify(error);
      if (serialized && serialized !== '{}') return serialized;
    } catch {
      // Ignore JSON serialization failures and use a generic fallback.
    }
    return 'Unknown error';
  }
  return 'Unknown error';
}

function ok(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const callerClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user: caller }, error: authError } = await callerClient.auth.getUser();
    if (authError || !caller) return ok({ error: 'Unauthorized' });

    const { data: roles } = await callerClient
      .from('user_roles').select('role').eq('user_id', caller.id);
    if (!roles?.some((r: { role: string }) => r.role === 'admin')) {
      return ok({ error: 'Forbidden: admin role required' });
    }

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { fullName, email, password, role } = await req.json();

    if (!email || !password || !role) {
      return ok({ error: 'email, password and role are required' });
    }

    const { data, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName ?? '' },
    });

    if (createError) {
      console.error('create-user auth.admin.createUser failed', createError);
      return ok({ error: errorMessage(createError), stage: 'createUser' });
    }

    const newUserId = data.user.id;
    const rolesToInsert = role === 'staff' ? ['customer', 'staff'] : [role];
    const { error: roleError } = await adminClient
      .from('user_roles')
      .insert(rolesToInsert.map((currentRole) => ({ user_id: newUserId, role: currentRole })));
    if (roleError) {
      console.error('create-user role insert failed', roleError);
      return ok({ error: errorMessage(roleError), stage: 'roleInsert' });
    }

    return ok({ user: data.user });

  } catch (err) {
    console.error('create-user unexpected failure', err);
    return ok({ error: errorMessage(err), stage: 'unexpected' });
  }
});
