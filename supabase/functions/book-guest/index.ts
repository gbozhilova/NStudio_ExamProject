import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { email, fullName, serviceId, staffUserId, bookingDate, bookingTime, notes, modifyBookingId } =
      await req.json();

    if (!email || !serviceId || !bookingDate || !bookingTime) {
      return json({ error: 'email, serviceId, bookingDate and bookingTime are required' }, 400);
    }

    // Find or create user
    let userId: string;
    const { data: existingUsers } = await adminClient.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find((u) => u.email === email);

    if (existingUser) {
      userId = existingUser.id;
    } else {
      const tempPassword = crypto.randomUUID().slice(0, 16) + 'A1!';
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: fullName ?? email.split('@')[0] }
      });
      if (createError) return json({ error: createError.message }, 400);
      userId = newUser.user.id;

      // Assign customer role
      await adminClient.from('user_roles').insert({ user_id: userId, role: 'customer' });

      // Send password reset so they can set their own password
      await adminClient.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo: `${req.headers.get('origin') ?? ''}/login` }
      });
    }

    // Fetch service name for email
    const { data: service } = await adminClient
      .from('services')
      .select('service_name, service_duration_minutes')
      .eq('id', serviceId)
      .single();

    // Fetch staff name
    const { data: staffProfile } = staffUserId
      ? await adminClient.from('profiles').select('full_name').eq('id', staffUserId).single()
      : { data: { full_name: 'Any available' } };

    let bookingId: string;

    if (modifyBookingId) {
      // Update existing booking
      const { data, error } = await adminClient
        .from('bookings')
        .update({
          service_id: serviceId,
          staff_user_id: staffUserId ?? null,
          booking_date: bookingDate,
          booking_time: bookingTime,
          notes: notes ?? null,
          status: 'pending',
          updated_at: new Date().toISOString()
        })
        .eq('id', modifyBookingId)
        .select('id')
        .single();
      if (error) return json({ error: error.message }, 400);
      bookingId = data.id;
    } else {
      // Create new booking
      const { data, error } = await adminClient.from('bookings').insert({
        user_id: userId,
        customer_display_name: fullName ?? email.split('@')[0],
        customer_email: email,
        service_id: serviceId,
        staff_user_id: staffUserId ?? null,
        booking_date: bookingDate,
        booking_time: bookingTime,
        notes: notes ?? null,
        status: 'pending'
      }).select('id').single();
      if (error) return json({ error: error.message }, 400);
      bookingId = data.id;
    }

    // Get staff email for notification
    let staffEmail: string | null = null;
    if (staffUserId) {
      const { data: staffUser } = await adminClient.auth.admin.getUserById(staffUserId);
      staffEmail = staffUser?.user?.email ?? null;
    }

    // Send notification emails
    const resendKey = Deno.env.get('RESEND_API_KEY');
    const isModification = !!modifyBookingId;
    const appUrl = req.headers.get('origin') ?? 'https://your-app.netlify.app';
    const modifyUrl = `${appUrl}/booking?modify=${bookingId}`;

    if (resendKey) {
      const emailBody = `
        <h2>${isModification ? 'Booking Updated' : 'Booking Confirmed'}</h2>
        <p>Dear ${fullName ?? email},</p>
        <p>${isModification ? 'Your booking has been updated.' : 'Your appointment has been confirmed.'}</p>
        <table>
          <tr><td><b>Service:</b></td><td>${service?.service_name ?? serviceId}</td></tr>
          <tr><td><b>Staff:</b></td><td>${staffProfile?.full_name ?? 'Any available'}</td></tr>
          <tr><td><b>Date:</b></td><td>${bookingDate}</td></tr>
          <tr><td><b>Time:</b></td><td>${bookingTime.slice(0, 5)}</td></tr>
          ${notes ? `<tr><td><b>Notes:</b></td><td>${notes}</td></tr>` : ''}
        </table>
        <p><a href="${modifyUrl}">Need to reschedule? Click here</a></p>
      `;

      const recipients = [{ to: email, subject: `NStudio Salon — ${isModification ? 'Booking Updated' : 'Booking Confirmed'}` }];
      if (staffEmail) {
        recipients.push({
          to: staffEmail,
          subject: `NStudio Salon — New appointment from ${fullName ?? email}`
        });
      }

      for (const r of recipients) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'NStudio Salon <bookings@nstudio.salon>',
            to: r.to,
            subject: r.subject,
            html: emailBody
          })
        });
      }
    } else {
      console.log('RESEND_API_KEY not set — email skipped. Booking details:', {
        type: isModification ? 'modification' : 'creation',
        bookingId, email, staffEmail,
        service: service?.service_name, bookingDate, bookingTime
      });
    }

    return json({ bookingId, userId, modifyUrl });

  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
