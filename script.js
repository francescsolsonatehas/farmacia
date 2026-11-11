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

const dialog = document.querySelector('#request-dialog');
document.querySelectorAll('[data-open-form]').forEach(button => button.addEventListener('click', () => {
  document.querySelector('#service').value = button.dataset.openForm === 'Pell' ? 'Espai Pell' : button.dataset.openForm;
  dialog.showModal();
}));
dialog.addEventListener('click', event => {
  if (event.target === dialog) dialog.close();
});
document.querySelector('#request-form').addEventListener('submit', event => {
  event.preventDefault();
  document.querySelector('#request-form').hidden = true;
  document.querySelector('.dialog-copy').hidden = true;
  document.querySelector('.success-message').hidden = false;
});
