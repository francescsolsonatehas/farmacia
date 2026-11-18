const menuButton = document.querySelector('.menu-toggle');
const nav = document.querySelector('.main-nav');
menuButton.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? 'Tanca menú' : 'Obrir menú');
});
nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
  nav.classList.remove('open');
  menuButton.setAttribute('aria-expanded', 'false');
}));

const config = window.FARMACIA_CONFIG || {};
const configured = Boolean(config.supabaseUrl && config.supabasePublishableKey);
const serviceOptions = ['pell', 'familia', 'nutricio', 'mascotes'];
const serviceDetailSpaces = { dermo: 'pell', nutrition: 'nutricio', pharmacy: 'familia', family: 'familia', blood_pressure: 'familia', health_tests: 'familia', lice_check: 'familia', spd: 'familia', mobility: 'familia', wheelchair: 'familia', aesthetics: 'pell', pets: 'mascotes' };
const dialogs = [...document.querySelectorAll('dialog')];
const registerDialog = document.querySelector('#request-dialog');
const registrationForm = document.querySelector('#request-form');
const eventsById = new Map();
function localDateString(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function showFormError(form, message) {
  const box = form.querySelector('.form-error');
  box.textContent = message;
  box.hidden = false;
}
function resetDialog(dialog) {
  const form = dialog.querySelector('form:not(.dialog-close)');
  if (!form) return;
  form.reset();
  form.hidden = false;
  dialog.querySelector('.dialog-copy').hidden = false;
  dialog.querySelector('.success-message').hidden = true;
  const error = form.querySelector('.form-error');
  if (error) error.hidden = true;
}
dialogs.forEach(dialog => {
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => resetDialog(dialog));
});

document.querySelectorAll('[data-open-form]').forEach(button => button.addEventListener('click', () => {
  const requested = button.dataset.openForm.toLowerCase().replace('espai ', '');
  document.querySelector('#service').value = serviceOptions.includes(requested) ? requested : 'pell';
  registerDialog.showModal();
}));
function openServiceRequest(serviceDetail = 'dermo') {
  const dialog = document.querySelector('#appointment-dialog');
  const detail = document.querySelector('#appointment-detail');
  detail.value = serviceDetail;
  document.querySelector('#appointment-service').value = serviceDetailSpaces[serviceDetail] || 'familia';
  dialog.showModal();
}
document.querySelector('[data-open-appointment]').addEventListener('click', () => openServiceRequest());
document.querySelectorAll('[data-service-request]').forEach(button => button.addEventListener('click', () => openServiceRequest(button.dataset.serviceRequest)));
document.querySelector('#appointment-detail').addEventListener('change', event => {
  document.querySelector('#appointment-service').value = serviceDetailSpaces[event.target.value] || 'familia';
});
document.querySelector('[data-open-product]').addEventListener('click', () => document.querySelector('#product-dialog').showModal());

registrationForm.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const errorBox = form.querySelector('.form-error');
  errorBox.hidden = true;
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  if (data.get('website')) return;
  if (!data.get('followup_email') && !data.get('followup_sms')) {
    showFormError(form, 'Tria com vols rebre el seguiment: per correu electrònic o per SMS.');
    return;
  }
  if (!configured) {
    showFormError(form, 'El registre encara no està activat. La farmàcia està acabant de configurar el sistema.');
    return;
  }
  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = 'Enviant…';
  try {
    const response = await fetch(`${config.supabaseUrl}/functions/v1/register-client`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: config.supabasePublishableKey },
      body: JSON.stringify({
        fullName: String(data.get('name')).trim(), phone: String(data.get('phone')).trim(),
        email: String(data.get('email')).trim().toLowerCase(), serviceInterest: data.get('service'),
        followupEmail: Boolean(data.get('followup_email')), followupSms: Boolean(data.get('followup_sms')),
        marketingEmail: Boolean(data.get('marketing_email')), marketingSms: Boolean(data.get('marketing_sms')),
        privacyNoticeRead: Boolean(data.get('privacy_notice_read')), followupConsent: Boolean(data.get('followup_consent')),
        privacyNoticeVersion: config.privacyNoticeVersion, website: String(data.get('website') || '')
      })
    });
    if (!response.ok) {
      if (response.status === 409) throw new Error('Aquest correu ja consta al registre. Demana un canvi a la pàgina de preferències.');
      if (response.status === 503) throw new Error('El registre encara no està obert. Contacta amb la farmàcia.');
      throw new Error('No s’ha pogut completar l’alta. Torna-ho a provar més tard.');
    }
    form.hidden = true;
    form.closest('dialog').querySelector('.dialog-copy').hidden = true;
    form.closest('dialog').querySelector('.success-message').hidden = false;
  } catch (error) {
    showFormError(form, error.message || 'S’ha produït un error. Torna-ho a provar més tard.');
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = 'Demanar l’alta <span>↗</span>';
  }
});

async function submitCustomerRequest(form, kind, payloadFields) {
  const errorBox = form.querySelector('.form-error');
  errorBox.hidden = true;
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  if (data.get('website')) return;
  if (!configured) return showFormError(form, 'Aquest servei encara no està activat. Contacta amb la farmàcia.');
  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  submitButton.textContent = 'Enviant…';
  const payload = {
    kind, privacyNoticeVersion: config.privacyNoticeVersion,
    privacyNoticeRead: Boolean(data.get('privacyNoticeRead')),
    website: String(data.get('website') || '')
  };
  for (const [key, formKey] of Object.entries(payloadFields)) payload[key] = String(data.get(formKey) || '').trim();
  try {
    const response = await fetch(`${config.supabaseUrl}/functions/v1/customer-request`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: config.supabasePublishableKey },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      if (response.status === 409 && kind === 'event_signup') throw new Error('Aquest correu ja té una plaça demanada per a aquesta activitat.');
      if (response.status === 503) throw new Error('El servei encara no està activat. Contacta amb la farmàcia.');
      throw new Error('No s’ha pogut enviar la sol·licitud. Torna-ho a provar més tard.');
    }
    form.hidden = true;
    const dialog = form.closest('dialog');
    dialog.querySelector('.dialog-copy').hidden = true;
    dialog.querySelector('.success-message').hidden = false;
  } catch (error) {
    showFormError(form, error.message || 'S’ha produït un error. Torna-ho a provar més tard.');
  } finally {
    submitButton.disabled = false;
  }
}

document.querySelector('#appointment-date').min = localDateString();
document.querySelector('#appointment-form').addEventListener('submit', event => {
  event.preventDefault();
  submitCustomerRequest(event.currentTarget, 'appointment', {
    fullName: 'fullName', phone: 'phone', email: 'email', service: 'service', serviceDetail: 'serviceDetail', mode: 'mode',
    preferredDate: 'preferredDate', preferredTime: 'preferredTime', contactChannel: 'contactChannel'
  });
});
document.querySelector('#product-form').addEventListener('submit', event => {
  event.preventDefault();
  submitCustomerRequest(event.currentTarget, 'product_request', {
    fullName: 'fullName', phone: 'phone', email: 'email', productName: 'productName',
    productCategory: 'productCategory', contactChannel: 'contactChannel'
  });
});
document.querySelector('#event-form').addEventListener('submit', event => {
  event.preventDefault();
  submitCustomerRequest(event.currentTarget, 'event_signup', {
    fullName: 'fullName', email: 'email', phone: 'phone', eventId: 'eventId'
  });
});

const eventsList = document.querySelector('#events-list');
function formatEventDate(value) {
  return new Intl.DateTimeFormat('ca-ES', { dateStyle: 'full', timeStyle: 'short' }).format(new Date(value));
}
function renderEvents(events) {
  eventsById.clear();
  eventsList.replaceChildren();
  const upcoming = events.filter(item => new Date(item.starts_at) > new Date());
  if (!upcoming.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-events';
    empty.textContent = 'Properament anunciarem noves activitats. També ens pots preguntar a la farmàcia.';
    eventsList.append(empty);
    return;
  }
  upcoming.forEach(item => {
    eventsById.set(item.id, item);
    const card = document.createElement('article');
    card.className = 'event-card';
    const date = document.createElement('p');
    date.className = 'eyebrow';
    date.textContent = formatEventDate(item.starts_at);
    const title = document.createElement('h3');
    title.textContent = item.title;
    const description = document.createElement('p');
    description.textContent = item.description;
    const location = document.createElement('p');
    location.className = 'event-location';
    location.textContent = item.location;
    const button = document.createElement('button');
    button.className = 'text-link';
    button.type = 'button';
    button.dataset.eventSignup = item.id;
    button.textContent = 'Demana plaça ↗';
    card.append(date, title, description, location, button);
    eventsList.append(card);
  });
}
if (configured) {
  fetch(`${config.supabaseUrl}/rest/v1/events?select=id,title,description,starts_at,location&is_published=eq.true&registration_open=eq.true&order=starts_at.asc`, {
    headers: { apikey: config.supabasePublishableKey }
  }).then(response => response.ok ? response.json() : []).then(renderEvents).catch(() => renderEvents([]));
} else renderEvents([]);
eventsList.addEventListener('click', event => {
  const button = event.target.closest('[data-event-signup]');
  if (!button) return;
  const item = eventsById.get(button.dataset.eventSignup);
  if (!item) return;
  document.querySelector('#event-dialog-title').textContent = `Inscripció · ${item.title}`;
  document.querySelector('#event-dialog-description').textContent = `${formatEventDate(item.starts_at)} · ${item.location}`;
  document.querySelector('#event-form [name="eventId"]').value = item.id;
  document.querySelector('#event-dialog').showModal();
});
