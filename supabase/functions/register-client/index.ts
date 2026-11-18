import { createClient } from 'npm:@supabase/supabase-js@2';

const allowedServices = new Set(['pell', 'familia', 'nutricio', 'mascotes']);
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getAllowedOrigins(): string[] {
  return (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',').map((origin) => origin.trim()).filter(Boolean);
}
function getApiKey(envName: string, legacyName: string): string | null {
  const value = Deno.env.get(envName);
  if (value) {
    try { return (JSON.parse(value) as Record<string, string>).default ?? null; } catch { return null; }
  }
  return Deno.env.get(legacyName) ?? null;
}

function response(body: Record<string, unknown>, status: number, origin: string | null, allowed: string[]) {
  const headers = new Headers({ 'Content-Type': 'application/json', 'Vary': 'Origin' });
  if (origin && allowed.includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'authorization, apikey, content-type, x-client-info');
    headers.set('Access-Control-Max-Age', '86400');
  }
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');
  const allowed = getAllowedOrigins();
  if (request.method === 'OPTIONS') return response({}, 204, origin, allowed);
  if (request.method !== 'POST') return response({ error: 'Method not allowed' }, 405, origin, allowed);
  if (!origin || !allowed.includes(origin)) return response({ error: 'Origin not allowed' }, 403, null, allowed);
  const publishableKey = getApiKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY');
  if (!publishableKey || request.headers.get('apikey') !== publishableKey) return response({ error: 'Invalid API key' }, 401, origin, allowed);
  if (Deno.env.get('REGISTRATION_ENABLED') !== 'true') {
    return response({ error: 'Registration is not enabled' }, 503, origin, allowed);
  }

  const noticeVersion = Deno.env.get('PRIVACY_NOTICE_VERSION');
  if (!noticeVersion || noticeVersion.toLowerCase().includes('draft')) {
    return response({ error: 'Privacy notice is not approved' }, 503, origin, allowed);
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 12000) return response({ error: 'Request too large' }, 413, origin, allowed);

  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch {
    return response({ error: 'Invalid request' }, 400, origin, allowed);
  }

  // Quietly accept automated honeypot submissions without storing anything.
  if (typeof input.website === 'string' && input.website.trim()) return response({ ok: true }, 201, origin, allowed);

  const fullName = typeof input.fullName === 'string' ? input.fullName.trim().replace(/\s+/g, ' ') : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const phone = typeof input.phone === 'string' ? input.phone.trim() : '';
  const serviceInterest = typeof input.serviceInterest === 'string' ? input.serviceInterest : '';
  const followupEmail = input.followupEmail === true;
  const followupSms = input.followupSms === true;
  const marketingEmail = input.marketingEmail === true;
  const marketingSms = input.marketingSms === true;
  const privacyNoticeRead = input.privacyNoticeRead === true;
  const followupConsent = input.followupConsent === true;
  const phoneDigits = phone.replace(/\D/g, '');

  if (fullName.length < 2 || fullName.length > 120 || !emailPattern.test(email) || email.length > 254
    || phone.length < 7 || phone.length > 24 || phoneDigits.length < 7 || phoneDigits.length > 15
    || !allowedServices.has(serviceInterest) || (!followupEmail && !followupSms) || !privacyNoticeRead || !followupConsent
    || input.privacyNoticeVersion !== noticeVersion) {
    return response({ error: 'Invalid registration details or consent' }, 400, origin, allowed);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = getApiKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return response({ error: 'Service unavailable' }, 503, origin, allowed);

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  const now = new Date().toISOString();
  const { error } = await supabase.from('clients').insert({
    full_name: fullName,
    phone: phone.replace(/[\s().-]/g, ''),
    email,
    service_interest: serviceInterest,
    followup_email: followupEmail,
    followup_sms: followupSms,
    marketing_email: marketingEmail,
    marketing_sms: marketingSms,
    privacy_notice_version: noticeVersion,
    privacy_notice_read_at: now,
    privacy_consent_at: now,
    followup_consent_at: now,
    marketing_email_consent_at: marketingEmail ? now : null,
    marketing_sms_consent_at: marketingSms ? now : null
  });

  if (error?.code === '23505') return response({ error: 'Registration already exists' }, 409, origin, allowed);
  if (error) {
    // Do not log request payloads or database error details containing personal data.
    console.error('Client registration insert failed');
    return response({ error: 'Registration failed' }, 500, origin, allowed);
  }
  return response({ ok: true }, 201, origin, allowed);
});
