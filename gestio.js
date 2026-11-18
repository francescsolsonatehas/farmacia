const config = window.FARMACIA_CONFIG || {};
const loginPanel = document.querySelector('#login-panel');
const dashboard = document.querySelector('#dashboard');
const loginForm = document.querySelector('#login-form');
const loginError = loginForm.querySelector('.form-error');
const sessionKey = 'fm_staff_session';
const serviceNames = { pell: 'Espai Pell', familia: 'Espai Família', nutricio: 'Espai Nutrició', mascotes: 'Espai Mascotes' };
const serviceDetailNames = { dermo: 'Assessorament dermocosmètic', nutrition: 'Nutrició i dietètica', pharmacy: 'Atenció farmacèutica', family: 'Lactància, maternitat i salut infantil', blood_pressure: 'Pressió arterial', health_tests: 'Proves de salut', lice_check: 'Detecció de polls i llémenes', spd: 'SPD', mobility: 'Ortopèdia i ajudes tècniques', wheelchair: 'Lloguer de cadira de rodes', aesthetics: 'Serveis d’estètica', pets: 'Espai Mascotes' };
const actionNames = { service_followup: 'Seguiment de servei', routine_review: 'Revisió de rutina', appointment_reminder: 'Recordatori de cita', reorder_reminder: 'Recordatori de reposició' };
const productNames = { facial: 'Cura facial', corporal: 'Cura corporal', capillar: 'Cura capil·lar', solar: 'Protecció solar', bebe: 'Cura del nadó', mascotes: 'Mascotes' };
let session = null;
let clients = [];
let followups = [];
let appointmentRequests = [];
let productRequests = [];
let preferenceRequests = [];
let events = [];

function readSession() { try { return JSON.parse(sessionStorage.getItem(sessionKey) || 'null'); } catch { return null; } }
function saveSession(value) {
  session = value;
  if (value) sessionStorage.setItem(sessionKey, JSON.stringify(value));
  else sessionStorage.removeItem(sessionKey);
}
function projectReady() { return Boolean(config.supabaseUrl && config.supabasePublishableKey); }
function showLoginError(message) { loginError.textContent = message; loginError.hidden = false; }
function authHeaders(token = session?.access_token) { return { apikey: config.supabasePublishableKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }; }
async function refreshSession() {
  if (!session?.refresh_token) throw new Error('La sessió ha caducat. Torna a iniciar sessió.');
  const response = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST', headers: { apikey: config.supabasePublishableKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: session.refresh_token })
  });
  if (!response.ok) throw new Error('La sessió ha caducat. Torna a iniciar sessió.');
  const value = await response.json();
  saveSession({ ...value, expires_at: Date.now() + (value.expires_in || 3600) * 1000 });
}
async function api(path, options = {}, mayRefresh = true) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, { ...options, headers: { ...authHeaders(), ...(options.headers || {}) } });
  if (response.status === 401 && mayRefresh) { await refreshSession(); return api(path, options, false); }
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'No s’ha pogut completar l’acció.');
  }
  return response.status === 204 ? null : response.json();
}
async function verifyStaff(userId) {
  const result = await api(`staff_members?select=user_id&user_id=eq.${encodeURIComponent(userId)}`);
  return result.length === 1;
}
function enterDashboard() {
  loginPanel.hidden = true;
  dashboard.hidden = false;
  loadDashboard().catch(error => notify(error.message, true));
}
function signOut() {
  const token = session?.access_token;
  saveSession(null);
  if (token && projectReady()) fetch(`${config.supabaseUrl}/auth/v1/logout`, { method: 'POST', headers: { apikey: config.supabasePublishableKey, Authorization: `Bearer ${token}` } }).catch(() => {});
  clients = []; followups = []; appointmentRequests = []; productRequests = []; preferenceRequests = []; events = [];
  dashboard.hidden = true;
  loginPanel.hidden = false;
}
function notify(message, isError = false) {
  const box = document.querySelector('#dashboard-message');
  box.textContent = message;
  box.classList.toggle('error', isError);
  box.hidden = false;
  window.setTimeout(() => { box.hidden = true; }, 5000);
}
function escapeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}
function formatDate(date) { return new Intl.DateTimeFormat('ca-ES', { dateStyle: 'medium' }).format(new Date(`${date}T00:00:00`)); }
function formatDateTime(value) { return new Intl.DateTimeFormat('ca-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)); }
async function loadDashboard() {
  const [clientRows, followupRows, appointmentRows, productRows, preferenceRows, eventRows] = await Promise.all([
    api('clients?select=id,full_name,phone,email,service_interest,followup_email,followup_sms,marketing_email,marketing_sms,created_at&order=created_at.desc'),
    api('followups?select=id,client_id,service,action_type,due_on,channel,status,clients(full_name,phone,email)&order=due_on.asc'),
    api('appointment_requests?select=id,full_name,phone,email,service,service_detail,mode,preferred_date,preferred_time,contact_channel,status,created_at&order=created_at.desc'),
    api('product_requests?select=id,full_name,phone,email,product_category,product_name,contact_channel,status,created_at&order=created_at.desc'),
    api('preference_requests?select=id,client_id,requested_email,requested_phone,withdraw_followup_email,withdraw_followup_sms,withdraw_marketing_email,withdraw_marketing_sms,status,created_at,clients(full_name,email,phone)&status=eq.pending&order=created_at.asc'),
    api('events?select=id,title,description,starts_at,location,is_published,registration_open&order=starts_at.asc')
  ]);
  clients = clientRows; followups = followupRows; appointmentRequests = appointmentRows;
  productRequests = productRows; preferenceRequests = preferenceRows; events = eventRows;
  renderClients(); renderFollowups(); populateSelectors(); renderAppointments(); renderProductRequests(); renderPreferenceRequests(); renderEvents();
}
function renderClients() {
  const query = document.querySelector('#client-search').value.trim().toLowerCase();
  const rows = clients.filter(client => `${client.full_name} ${client.email}`.toLowerCase().includes(query));
  const tbody = document.querySelector('#clients-table');
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="muted">${clients.length ? 'No hi ha coincidències.' : 'Encara no hi ha clients registrats.'}</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(client => {
    const follow = [client.followup_email && 'Correu', client.followup_sms && 'SMS'].filter(Boolean);
    const marketing = [client.marketing_email && 'Correu', client.marketing_sms && 'SMS'].filter(Boolean);
    return `<tr><td><strong>${escapeText(client.full_name)}</strong><br><span class="muted">Alta ${formatDate(client.created_at.slice(0, 10))}</span></td>
      <td class="contact-cell"><a href="mailto:${encodeURIComponent(client.email)}">${escapeText(client.email)}</a><br><a href="tel:${encodeURIComponent(client.phone)}">${escapeText(client.phone)}</a></td>
      <td>${escapeText(serviceNames[client.service_interest] || client.service_interest)}</td>
      <td class="pref-cell">${follow.length ? follow.join(' · ') : 'Cap'}${client.followup_email ? `<button class="remove-preference" data-client="${client.id}" data-pref="followup_email">Retira correu</button>` : ''}${client.followup_sms ? `<button class="remove-preference" data-client="${client.id}" data-pref="followup_sms">Retira SMS</button>` : ''}</td>
      <td class="pref-cell">${marketing.length ? marketing.join(' · ') : 'Cap'}${client.marketing_email ? `<button class="remove-preference" data-client="${client.id}" data-pref="marketing_email">Retira correu</button>` : ''}${client.marketing_sms ? `<button class="remove-preference" data-client="${client.id}" data-pref="marketing_sms">Retira SMS</button>` : ''}</td>
      <td><button class="delete-client" data-client="${client.id}">Suprimeix</button></td></tr>`;
  }).join('');
}
function renderFollowups() {
  const pending = followups.filter(item => item.status === 'pending');
  document.querySelector('#pending-count').textContent = pending.length;
  const list = document.querySelector('#followups-list');
  if (!pending.length) { list.innerHTML = '<p class="muted">No hi ha recordatoris pendents.</p>'; return; }
  list.innerHTML = pending.map(item => {
    const client = item.clients || {};
    const message = `Hola ${client.full_name || ''}, et contactem des de Farmàcia Martí per fer el seguiment que vas demanar. Quan et vagi bé, respon-nos o truca al 973 237 232.`;
    const draft = item.channel === 'email'
      ? `<a class="small-action" href="mailto:${encodeURIComponent(client.email || '')}?subject=${encodeURIComponent('Seguiment Farmàcia Martí')}&body=${encodeURIComponent(message)}">Prepara correu</a>`
      : `<a class="small-action" href="sms:${encodeURIComponent(client.phone || '')}?body=${encodeURIComponent(message)}">Prepara SMS</a>`;
    const dueClass = item.due_on < new Date().toISOString().slice(0, 10) ? 'due' : '';
    return `<article class="followup-item"><div><h3>${escapeText(client.full_name || 'Client')}</h3><p class="${dueClass}">${formatDate(item.due_on)} · ${escapeText(serviceNames[item.service] || item.service)} · ${escapeText(actionNames[item.action_type] || item.action_type)}</p></div><div class="followup-actions">${draft}<button class="small-action complete" data-complete="${item.id}">Marcar fet</button></div></article>`;
  }).join('');
}
function populateSelectors() {
  const clientSelect = document.querySelector('#client-select');
  clientSelect.innerHTML = '<option value="">Tria un client</option>' + clients.map(client => `<option value="${client.id}">${escapeText(client.full_name)} · ${escapeText(client.email)}</option>`).join('');
  const selected = clients[0];
  if (selected) { clientSelect.value = selected.id; document.querySelector('#service-select').value = selected.service_interest; }
  updateChannels();
}
function updateChannels() {
  const client = clients.find(item => item.id === document.querySelector('#client-select').value);
  const channel = document.querySelector('#channel-select');
  const allowed = [];
  if (client?.followup_email) allowed.push(['email', 'Correu electrònic']);
  if (client?.followup_sms) allowed.push(['sms', 'SMS']);
  channel.innerHTML = allowed.length ? allowed.map(([value, label]) => `<option value="${value}">${label}</option>`).join('') : '<option value="">Aquest client no té cap canal habilitat</option>';
}
function dateToday() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}
function localDateTime(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
function emptyMessage(element, text) { element.innerHTML = `<p class="muted">${text}</p>`; }
function contactLinks(email, phone) {
  return `<a href="mailto:${encodeURIComponent(email || '')}">${escapeText(email || '—')}</a> · <a href="tel:${encodeURIComponent(phone || '')}">${escapeText(phone || '—')}</a>`;
}
function requestActions(statuses, id, current) {
  return statuses.map(([value, label]) => current !== value ? `<button class="small-action" data-status="${value}" data-request="${id}">${label}</button>` : '').join('');
}
function renderAppointments() {
  const list = document.querySelector('#appointments-list');
  const pending = appointmentRequests.filter(item => item.status === 'pending');
  if (!pending.length) return emptyMessage(list, 'No hi ha cites pendents.');
  list.innerHTML = pending.map(item => `<article class="request-card"><h3>${escapeText(item.full_name)}</h3><p>${escapeText(serviceDetailNames[item.service_detail] || serviceNames[item.service] || item.service)} · ${item.mode === 'online' ? 'En línia' : 'Presencial'} · ${item.preferred_date ? `Prefereix ${formatDate(item.preferred_date)}` : 'Sense data preferida'} · ${item.preferred_time === 'any' ? 'Qualsevol franja' : item.preferred_time === 'morning' ? 'Matí' : 'Tarda'}</p><p>${contactLinks(item.email, item.phone)} · Contacte per ${item.contact_channel === 'email' ? 'correu' : 'telèfon'}</p><label class="confirm-time-label">Hora acordada<input type="datetime-local" data-confirm-time="${item.id}" min="${localDateTime(new Date(Date.now() + 60000))}"></label><div class="request-controls"><button class="small-action complete" data-confirm-appointment="${item.id}">Marca confirmada</button><button class="small-action" data-status="cancelled" data-request="${item.id}">Cancel·la</button></div></article>`).join('');
}
function renderProductRequests() {
  const list = document.querySelector('#products-list');
  const pending = productRequests.filter(item => item.status === 'pending');
  if (!pending.length) return emptyMessage(list, 'No hi ha consultes pendents.');
  list.innerHTML = pending.map(item => `<article class="request-card"><h3>${escapeText(item.product_name)}</h3><p>${escapeText(item.full_name)} · ${escapeText(productNames[item.product_category] || item.product_category)}</p><p>${contactLinks(item.email, item.phone)} · Contacte per ${item.contact_channel === 'email' ? 'correu' : 'telèfon'}</p><div class="request-controls">${requestActions([['available', 'Disponible'], ['unavailable', 'No disponible'], ['cancelled', 'Tanca']], item.id, item.status)}</div></article>`).join('');
}
function renderPreferenceRequests() {
  const list = document.querySelector('#preferences-list');
  if (!preferenceRequests.length) return emptyMessage(list, 'No hi ha canvis de contacte pendents.');
  list.innerHTML = preferenceRequests.map(item => {
    const client = item.clients || {};
    const withdrawals = [item.withdraw_followup_email && 'seguiment per correu', item.withdraw_followup_sms && 'seguiment per SMS', item.withdraw_marketing_email && 'novetats per correu', item.withdraw_marketing_sms && 'novetats per SMS'].filter(Boolean);
    const contactChange = [item.requested_email && `correu ${escapeText(item.requested_email)}`, item.requested_phone && `mòbil ${escapeText(item.requested_phone)}`].filter(Boolean).join(' · ');
    return `<article class="request-card"><h3>${escapeText(client.full_name || 'Client')}</h3><p>Actual: ${contactLinks(client.email, client.phone)}</p>${contactChange ? `<p>Canvi demanat: ${contactChange}</p>` : ''}${withdrawals.length ? `<p>Retirar autorització: ${escapeText(withdrawals.join(', '))}</p>` : ''}${contactChange ? '<p>Verifica la petició amb el canal actual abans d’aplicar el canvi.</p>' : ''}<div class="request-controls"><button class="small-action complete" data-preference-apply="${item.id}">Aplica (ja verificat)</button><button class="small-action" data-preference-reject="${item.id}">Rebutja</button></div></article>`;
  }).join('');
}
function renderEvents() {
  const list = document.querySelector('#events-admin-list');
  if (!events.length) return emptyMessage(list, 'Encara no hi ha activitats.');
  list.innerHTML = events.map(item => `<article class="admin-event"><div><h3>${escapeText(item.title)}</h3><p>${formatDateTime(item.starts_at)} · ${escapeText(item.location)} · ${item.is_published ? 'Publicada' : 'Oculta'} · ${item.registration_open ? 'Inscripcions obertes' : 'Inscripcions tancades'}</p><p>${escapeText(item.description)}</p></div><div class="admin-event-controls"><button class="small-action" data-event-publish="${item.id}" data-value="${!item.is_published}">${item.is_published ? 'Oculta' : 'Publica'}</button><button class="small-action" data-event-open="${item.id}" data-value="${!item.registration_open}">${item.registration_open ? 'Tanca inscripcions' : 'Obre inscripcions'}</button><button class="small-action" data-event-attendees="${item.id}">Inscrits</button><button class="small-action" data-event-delete="${item.id}">Suprimeix</button></div><div class="event-attendees" data-attendees-for="${item.id}" hidden></div></article>`).join('');
}

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  loginError.hidden = true;
  if (!projectReady()) return showLoginError('El projecte Supabase encara no està configurat. Consulta el README de configuració.');
  const button = loginForm.querySelector('button');
  button.disabled = true;
  try {
    const response = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: config.supabasePublishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: document.querySelector('#staff-email').value.trim(), password: document.querySelector('#staff-password').value })
    });
    const value = await response.json();
    if (!response.ok || !value.access_token || !value.user) throw new Error('No s’ha pogut iniciar sessió. Revisa les dades del compte intern.');
    saveSession({ ...value, expires_at: Date.now() + (value.expires_in || 3600) * 1000 });
    if (!await verifyStaff(value.user.id)) { signOut(); throw new Error('Aquest compte no té permisos de personal autoritzat.'); }
    enterDashboard();
  } catch (error) { showLoginError(error.message || 'No s’ha pogut iniciar sessió.'); }
  finally { button.disabled = false; }
});

document.querySelector('#logout-button').addEventListener('click', signOut);
document.querySelector('#client-search').addEventListener('input', renderClients);
document.querySelector('#client-select').addEventListener('change', updateChannels);
document.querySelector('#clients-table').addEventListener('click', async event => {
  const preferenceButton = event.target.closest('[data-pref]');
  const deleteButton = event.target.closest('[data-client]:not([data-pref])');
  try {
    if (preferenceButton) {
      const { client, pref } = preferenceButton.dataset;
      if (!confirm('Confirmes que vols retirar aquesta autorització?')) return;
      await api(`clients?id=eq.${encodeURIComponent(client)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ [pref]: false }) });
      notify('Autorització retirada.'); await loadDashboard();
    } else if (deleteButton) {
      if (!confirm('Suprimir permanentment la fitxa d’aquest client i els seus recordatoris?')) return;
      await api(`clients?id=eq.${encodeURIComponent(deleteButton.dataset.client)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
      notify('Fitxa suprimida.'); await loadDashboard();
    }
  } catch (error) { notify(error.message, true); }
});
document.querySelector('#followups-list').addEventListener('click', async event => {
  const button = event.target.closest('[data-complete]');
  if (!button) return;
  try {
    await api(`followups?id=eq.${encodeURIComponent(button.dataset.complete)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'completed', completed_at: new Date().toISOString() }) });
    notify('Recordatori marcat com a fet.'); await loadDashboard();
  } catch (error) { notify(error.message, true); }
});
document.querySelector('#followup-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const errorBox = form.querySelector('.form-error'); errorBox.hidden = true;
  const client = clients.find(item => item.id === document.querySelector('#client-select').value);
  const channel = document.querySelector('#channel-select').value;
  const dueOn = document.querySelector('#due-date').value;
  if (!client || !channel) { errorBox.textContent = 'Aquest client no té cap canal autoritzat.'; errorBox.hidden = false; return; }
  if (dueOn < dateToday()) { errorBox.textContent = 'Tria avui o una data futura.'; errorBox.hidden = false; return; }
  try {
    await api('followups', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ client_id: client.id, service: document.querySelector('#service-select').value, action_type: document.querySelector('#action-select').value, due_on: dueOn, channel }) });
    form.reset(); document.querySelector('#due-date').min = dateToday(); populateSelectors(); notify('Recordatori desat.'); await loadDashboard();
  } catch (error) { errorBox.textContent = error.message; errorBox.hidden = false; }
});
document.querySelector('#due-date').min = dateToday();

for (const [containerId, table, rows, statusField, message] of [
  ['appointments-list', 'appointment_requests', appointmentRequests, 'status', 'Estat de la cita actualitzat.'],
  ['products-list', 'product_requests', productRequests, 'status', 'Estat de la consulta actualitzat.']
]) {
  document.querySelector(`#${containerId}`).addEventListener('click', async event => {
    const button = event.target.closest('[data-status]'); if (!button) return;
    try {
      await api(`${table}?id=eq.${encodeURIComponent(button.dataset.request)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ [statusField]: button.dataset.status }) });
      notify(message); await loadDashboard();
    } catch (error) { notify(error.message, true); }
  });
}
document.querySelector('#appointments-list').addEventListener('click', async event => {
  const button = event.target.closest('[data-confirm-appointment]');
  if (!button) return;
  const input = document.querySelector(`[data-confirm-time="${button.dataset.confirmAppointment}"]`);
  const confirmedAt = input?.value ? new Date(input.value) : null;
  if (!confirmedAt || Number.isNaN(confirmedAt.valueOf()) || confirmedAt <= new Date()) {
    notify('Indica l’hora que has acordat amb el client abans de confirmar.', true);
    return;
  }
  try {
    await api(`appointment_requests?id=eq.${encodeURIComponent(button.dataset.confirmAppointment)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'confirmed', confirmed_at: confirmedAt.toISOString() }) });
    notify('Cita confirmada al panell. Contacta manualment amb el client per avisar-lo.');
    await loadDashboard();
  } catch (error) { notify(error.message, true); }
});

document.querySelector('#preferences-list').addEventListener('click', async event => {
  const apply = event.target.closest('[data-preference-apply]');
  const reject = event.target.closest('[data-preference-reject]');
  try {
    if (apply) {
      if (!confirm('Confirma que has verificat la identitat mitjançant el canal de contacte actual?')) return;
      const item = preferenceRequests.find(row => row.id === apply.dataset.preferenceApply);
      const changes = {};
      if (item.requested_email) changes.email = item.requested_email;
      if (item.requested_phone) changes.phone = item.requested_phone;
      if (item.withdraw_followup_email) changes.followup_email = false;
      if (item.withdraw_followup_sms) changes.followup_sms = false;
      if (item.withdraw_marketing_email) changes.marketing_email = false;
      if (item.withdraw_marketing_sms) changes.marketing_sms = false;
      await api(`clients?id=eq.${encodeURIComponent(item.client_id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(changes) });
      await api(`preference_requests?id=eq.${encodeURIComponent(item.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'completed', completed_at: new Date().toISOString() }) });
      notify('Canvi de contacte aplicat.'); await loadDashboard();
    } else if (reject) {
      await api(`preference_requests?id=eq.${encodeURIComponent(reject.dataset.preferenceReject)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'rejected', completed_at: new Date().toISOString() }) });
      notify('Sol·licitud rebutjada.'); await loadDashboard();
    }
  } catch (error) { notify(error.message, true); }
});

const eventForm = document.querySelector('#event-admin-form');
eventForm.addEventListener('submit', async event => {
  event.preventDefault();
  const errorBox = eventForm.querySelector('.form-error'); errorBox.hidden = true;
  const data = new FormData(eventForm);
  const startsAt = new Date(String(data.get('startsAt')));
  if (startsAt <= new Date()) { errorBox.textContent = 'Tria una data futura.'; errorBox.hidden = false; return; }
  try {
    await api('events', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ title: String(data.get('title')).trim(), description: String(data.get('description')).trim(), starts_at: startsAt.toISOString(), location: String(data.get('location')).trim(), is_published: false, registration_open: false }) });
    eventForm.reset(); notify('Activitat desada com a oculta.'); await loadDashboard();
  } catch (error) { errorBox.textContent = error.message; errorBox.hidden = false; }
});
document.querySelector('#admin-event-date').min = localDateTime(new Date(Date.now() + 60000));
document.querySelector('#events-admin-list').addEventListener('click', async event => {
  const publish = event.target.closest('[data-event-publish]');
  const open = event.target.closest('[data-event-open]');
  const remove = event.target.closest('[data-event-delete]');
  const attendees = event.target.closest('[data-event-attendees]');
  try {
    if (publish) {
      const item = events.find(row => row.id === publish.dataset.eventPublish);
      await api(`events?id=eq.${encodeURIComponent(item.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ is_published: publish.dataset.value === 'true' }) });
      notify(publish.dataset.value === 'true' ? 'Activitat publicada.' : 'Activitat oculta.'); await loadDashboard();
    } else if (open) {
      const item = events.find(row => row.id === open.dataset.eventOpen);
      await api(`events?id=eq.${encodeURIComponent(item.id)}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ registration_open: open.dataset.value === 'true' }) });
      notify(open.dataset.value === 'true' ? 'Inscripcions obertes.' : 'Inscripcions tancades.'); await loadDashboard();
    } else if (remove) {
      if (!confirm('Suprimir l’activitat i totes les seves inscripcions?')) return;
      await api(`events?id=eq.${encodeURIComponent(remove.dataset.eventDelete)}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } });
      notify('Activitat suprimida.'); await loadDashboard();
    } else if (attendees) {
      const box = document.querySelector(`[data-attendees-for="${attendees.dataset.eventAttendees}"]`);
      if (!box.hidden) { box.hidden = true; return; }
      const signups = await api(`event_signups?select=id,full_name,email,phone,created_at&event_id=eq.${encodeURIComponent(attendees.dataset.eventAttendees)}&order=created_at.asc`);
      const eventInfo = events.find(row => row.id === attendees.dataset.eventAttendees);
      box.innerHTML = signups.length ? signups.map(person => {
        const body = `Hola ${person.full_name}, et recordem l’activitat ${eventInfo?.title || ''} de Farmàcia Martí, el ${eventInfo ? formatDateTime(eventInfo.starts_at) : ''}, a ${eventInfo?.location || ''}. Si ja ens has confirmat que no vindràs, pots ignorar aquest missatge.`;
        const draft = `<a class="small-action" href="mailto:${encodeURIComponent(person.email)}?subject=${encodeURIComponent('Recordatori d’activitat · Farmàcia Martí')}&body=${encodeURIComponent(body)}">Prepara recordatori per correu</a>`;
        return `<p><b>${escapeText(person.full_name)}</b> · ${contactLinks(person.email, person.phone || '')}</p><p>${draft}</p>`;
      }).join('') : '<p class="muted">Encara no hi ha inscripcions.</p>';
      box.hidden = false;
    }
  } catch (error) { notify(error.message, true); }
});

session = readSession();
if (session?.user?.id && projectReady()) verifyStaff(session.user.id).then(allowed => allowed ? enterDashboard() : signOut()).catch(() => signOut());
