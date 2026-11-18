const config = window.FARMACIA_CONFIG || {};
const form = document.querySelector('#preferences-form');
const errorBox = form.querySelector('.form-error');
const success = document.querySelector('.success-message');

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  errorBox.hidden = true;
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  if (data.get('website')) return;
  const flags = {
    withdrawFollowupEmail: Boolean(data.get('withdraw_followup_email')),
    withdrawFollowupSms: Boolean(data.get('withdraw_followup_sms')),
    withdrawMarketingEmail: Boolean(data.get('withdraw_marketing_email')),
    withdrawMarketingSms: Boolean(data.get('withdraw_marketing_sms'))
  };
  if (!Object.values(flags).some(Boolean) && !data.get('newEmail') && !data.get('newPhone')) {
    return showError('Tria una autorització per retirar o indica el nou mòbil/correu.');
  }
  if (!config.supabaseUrl || !config.supabasePublishableKey) {
    return showError('Aquest servei encara no està activat. Pots demanar el canvi a info@farmaciamarti.com o trucar al 973 237 232.');
  }
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  button.textContent = 'Enviant…';
  try {
    const response = await fetch(`${config.supabaseUrl}/functions/v1/customer-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: config.supabasePublishableKey },
      body: JSON.stringify({
        kind: 'preference_update',
        email: String(data.get('email')).trim().toLowerCase(),
        phone: String(data.get('phone')).trim(),
        newEmail: String(data.get('newEmail') || '').trim().toLowerCase(),
        newPhone: String(data.get('newPhone') || '').trim(),
        website: String(data.get('website') || ''),
        ...flags
      })
    });
    if (!response.ok) throw new Error('No s’ha pogut enviar la sol·licitud. Torna-ho a provar més tard.');
    form.hidden = true;
    success.hidden = false;
  } catch (error) {
    showError(error.message || 'S’ha produït un error. Torna-ho a provar més tard.');
  } finally {
    button.disabled = false;
    button.textContent = 'Envia la sol·licitud';
  }
});
