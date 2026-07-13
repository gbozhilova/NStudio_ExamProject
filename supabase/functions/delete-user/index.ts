import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const { userId } = await req.json();
    if (!userId) return ok({ error: 'userId is required' });

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId);
    if (deleteError) return ok({ error: deleteError.message });

    return ok({ success: true });

  } catch (err) {
    return ok({ error: String(err) });
  }
});
