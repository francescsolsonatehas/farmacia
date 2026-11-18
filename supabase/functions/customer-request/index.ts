import { createClient } from 'npm:@supabase/supabase-js@2';

const services = new Set(['pell', 'familia', 'nutricio', 'mascotes']);
const serviceDetails = new Set(['dermo', 'nutrition', 'pharmacy', 'family', 'blood_pressure', 'health_tests', 'lice_check', 'spd', 'mobility', 'wheelchair', 'aesthetics', 'pets']);
const productCategories = new Set(['facial', 'corporal', 'capillar', 'solar', 'bebe', 'mascotes']);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const allowedOrigins = () => (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map(value => value.trim()).filter(Boolean);
function getApiKey(envName: string, legacyName: string): string | null {
  const value = Deno.env.get(envName);
  if (value) {
    try { return (JSON.parse(value) as Record<string, string>).default ?? null; } catch { return null; }
  }
  return Deno.env.get(legacyName) ?? null;
}
function result(body: Record<string, unknown>, status: number, origin: string | null, allowed: string[]) {
  const headers = new Headers({ 'Content-Type': 'application/json', 'Vary': 'Origin' });
  if (origin && allowed.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'authorization, apikey, content-type, x-client-info');
    headers.set('Access-Control-Max-Age', '86400');
  }
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
}
const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const normalizePhone = (value: string) => value.replace(/[\s().-]/g, '');
const validPhone = (value: string) => /^\+?\d{7,15}$/.test(value);
function clientKeyValid(input: Record<string, unknown>, noticeVersion: string) {
  return input.privacyNoticeRead === true && input.privacyNoticeVersion === noticeVersion;
}

Deno.serve(async request => {
  const origin = request.headers.get('origin');
  const allowed = allowedOrigins();
  if (request.method === 'OPTIONS') return result({}, 204, origin, allowed);
  if (request.method !== 'POST') return result({ error: 'Method not allowed' }, 405, origin, allowed);
  if (!origin || !allowed.includes(origin)) return result({ error: 'Origin not allowed' }, 403, null, allowed);
  const publishableKey = getApiKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY');
  if (!publishableKey || request.headers.get('apikey') !== publishableKey) return result({ error: 'Invalid API key' }, 401, origin, allowed);
  if (Deno.env.get('PUBLIC_REQUESTS_ENABLED') !== 'true') return result({ error: 'Public requests are not enabled' }, 503, origin, allowed);
  const noticeVersion = Deno.env.get('PRIVACY_NOTICE_VERSION') ?? '';
  if (!noticeVersion || noticeVersion.toLowerCase().includes('draft')) return result({ error: 'Privacy notice is not approved' }, 503, origin, allowed);
  if (Number(request.headers.get('content-length') ?? 0) > 16000) return result({ error: 'Request too large' }, 413, origin, allowed);

  let input: Record<string, unknown>;
  try { input = await request.json(); } catch { return result({ error: 'Invalid request' }, 400, origin, allowed); }
  if (text(input.website, 200)) return result({ ok: true }, 202, origin, allowed);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = getApiKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return result({ error: 'Service unavailable' }, 503, origin, allowed);
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const kind = text(input.kind, 40);

  if (kind === 'appointment') {
    const fullName = text(input.fullName, 120).replace(/\s+/g, ' ');
    const email = text(input.email, 254).toLowerCase();
    const phone = normalizePhone(text(input.phone, 24));
    const service = text(input.service, 30);
    const serviceDetail = text(input.serviceDetail, 30);
    const mode = text(input.mode, 20);
    const preferredDate = text(input.preferredDate, 10);
    const preferredTime = text(input.preferredTime, 20);
    const contactChannel = text(input.contactChannel, 20);
    const dateValid = !preferredDate || (/^\d{4}-\d{2}-\d{2}$/.test(preferredDate) && preferredDate >= new Date().toISOString().slice(0, 10));
    if (!clientKeyValid(input, noticeVersion) || fullName.length < 2 || !emailPattern.test(email)
      || !validPhone(phone) || !services.has(service) || !serviceDetails.has(serviceDetail) || !['in_person', 'online'].includes(mode) || !dateValid
      || !['morning', 'afternoon', 'any'].includes(preferredTime) || !['email', 'phone'].includes(contactChannel)) {
      return result({ error: 'Invalid appointment request' }, 400, origin, allowed);
    }
    const { error } = await db.from('appointment_requests').insert({
      full_name: fullName, email, phone, service, service_detail: serviceDetail, mode, preferred_date: preferredDate || null,
      preferred_time: preferredTime, contact_channel: contactChannel,
      privacy_notice_version: noticeVersion
    });
    if (error) { console.error('Appointment request insert failed'); return result({ error: 'Request failed' }, 500, origin, allowed); }
    return result({ ok: true }, 201, origin, allowed);
  }

  if (kind === 'event_signup') {
    const eventId = text(input.eventId, 40);
    const fullName = text(input.fullName, 120).replace(/\s+/g, ' ');
    const email = text(input.email, 254).toLowerCase();
    const phone = normalizePhone(text(input.phone, 24));
    if (!clientKeyValid(input, noticeVersion) || !/^[0-9a-f-]{36}$/i.test(eventId)
      || fullName.length < 2 || !emailPattern.test(email) || (phone && !validPhone(phone))) {
      return result({ error: 'Invalid event signup' }, 400, origin, allowed);
    }
    const { data: event, error: eventError } = await db.from('events').select('id')
      .eq('id', eventId).eq('is_published', true).eq('registration_open', true)
      .gt('starts_at', new Date().toISOString()).maybeSingle();
    if (eventError || !event) return result({ error: 'Event unavailable' }, 404, origin, allowed);
    const { error } = await db.from('event_signups').insert({
      event_id: eventId, full_name: fullName, email, phone: phone || null,
      privacy_notice_version: noticeVersion
    });
    if (error?.code === '23505') return result({ error: 'Already registered' }, 409, origin, allowed);
    if (error) { console.error('Event signup insert failed'); return result({ error: 'Request failed' }, 500, origin, allowed); }
    return result({ ok: true }, 201, origin, allowed);
  }

  if (kind === 'product_request') {
    const fullName = text(input.fullName, 120).replace(/\s+/g, ' ');
    const email = text(input.email, 254).toLowerCase();
    const phone = normalizePhone(text(input.phone, 24));
    const category = text(input.productCategory, 20);
    const productName = text(input.productName, 120);
    const contactChannel = text(input.contactChannel, 20);
    if (!clientKeyValid(input, noticeVersion) || fullName.length < 2 || !emailPattern.test(email)
      || !validPhone(phone) || !productCategories.has(category) || productName.length < 2
      || !['email', 'phone'].includes(contactChannel)) return result({ error: 'Invalid product request' }, 400, origin, allowed);
    const { error } = await db.from('product_requests').insert({
      full_name: fullName, email, phone, product_category: category, product_name: productName,
      contact_channel: contactChannel, privacy_notice_version: noticeVersion
    });
    if (error) { console.error('Product availability request insert failed'); return result({ error: 'Request failed' }, 500, origin, allowed); }
    return result({ ok: true }, 201, origin, allowed);
  }

  if (kind === 'preference_update') {
    const email = text(input.email, 254).toLowerCase();
    const phone = normalizePhone(text(input.phone, 24));
    const requestedEmail = text(input.newEmail, 254).toLowerCase();
    const requestedPhone = normalizePhone(text(input.newPhone, 24));
    const withdrawals = {
      withdraw_followup_email: input.withdrawFollowupEmail === true,
      withdraw_followup_sms: input.withdrawFollowupSms === true,
      withdraw_marketing_email: input.withdrawMarketingEmail === true,
      withdraw_marketing_sms: input.withdrawMarketingSms === true
    };
    const hasWithdrawal = Object.values(withdrawals).some(Boolean);
    if (!emailPattern.test(email) || !validPhone(phone)
      || (requestedEmail && !emailPattern.test(requestedEmail))
      || (requestedPhone && !validPhone(requestedPhone))
      || (!requestedEmail && !requestedPhone && !hasWithdrawal)) {
      return result({ error: 'Invalid preference request' }, 400, origin, allowed);
    }
    const { data: client, error: lookupError } = await db.from('clients').select('id')
      .eq('email', email).eq('phone', phone).maybeSingle();
    if (!lookupError && client) {
      let requestId: string | null = null;
      if (requestedEmail || requestedPhone || hasWithdrawal) {
        const { data: requestRow, error } = await db.from('preference_requests').insert({
          client_id: client.id,
          requested_email: requestedEmail || null,
          requested_phone: requestedPhone || null,
          ...withdrawals
        }).select('id').single();
        if (error) { console.error('Preference request insert failed'); return result({ error: 'Request failed' }, 500, origin, allowed); }
        requestId = requestRow.id;
      }
      if (hasWithdrawal) {
        const updates: Record<string, boolean> = {};
        if (withdrawals.withdraw_followup_email) updates.followup_email = false;
        if (withdrawals.withdraw_followup_sms) updates.followup_sms = false;
        if (withdrawals.withdraw_marketing_email) updates.marketing_email = false;
        if (withdrawals.withdraw_marketing_sms) updates.marketing_sms = false;
        const { error } = await db.from('clients').update(updates).eq('id', client.id);
        if (error) { console.error('Preference withdrawal failed'); return result({ error: 'Request failed' }, 500, origin, allowed); }
      }
      if (requestId && !requestedEmail && !requestedPhone) {
        const { error } = await db.from('preference_requests').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', requestId);
        if (error) { console.error('Preference request completion failed'); return result({ error: 'Request failed' }, 500, origin, allowed); }
      }
    }
    // Keep the response identical whether the contact pair matched or not.
    return result({ ok: true }, 202, origin, allowed);
  }

  return result({ error: 'Unknown request' }, 400, origin, allowed);
});
