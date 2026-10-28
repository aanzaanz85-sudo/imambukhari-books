export function showModal({ title, body, actions = '' }) {
  closeModal();
  document.body.insertAdjacentHTML('beforeend', `<div class="modal-backdrop" id="app-modal"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-head"><h2 id="modal-title">${title}</h2><button class="icon-button" data-close-modal aria-label="Tutup">×</button></div><div class="modal-body">${body}</div><div class="modal-actions">${actions}<button class="button button-secondary" data-close-modal>Tutup</button></div></section></div>`);
  document.querySelectorAll('[data-close-modal]').forEach(btn => btn.addEventListener('click', closeModal));
  document.querySelector('#app-modal')?.addEventListener('click', event => { if (event.target.id === 'app-modal') closeModal(); });
}
export function closeModal() { document.querySelector('#app-modal')?.remove(); }
