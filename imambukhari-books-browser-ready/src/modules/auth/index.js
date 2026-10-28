import { supabase } from '../../config/supabase.js';
import { notify } from '../../components/notifications.js';

export function renderLogin() {
  document.querySelector('#app').innerHTML = `<main class="login-screen"><section class="login-card"><div class="login-brand"><div class="brand-mark large">IB</div><p class="eyebrow">SD ISLAM IMAM BUKHARI</p><h1>Inventaris & Penjualan Buku</h1><p class="muted">Masuk untuk mengelola data buku sekolah.</p></div><form id="login-form" class="form-stack"><label>Email<input name="email" type="email" autocomplete="username" required placeholder="nama@sekolah.id" /></label><label>Password<input name="password" type="password" autocomplete="current-password" required placeholder="Masukkan password" /></label><button class="button button-primary full-width" type="submit">Masuk</button><p class="form-note">Gunakan akun yang dibuat melalui Supabase Authentication.</p></form></section></main>`;
  document.querySelector('#login-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true; button.textContent = 'Memeriksa…';
    try {
      const fd = new FormData(form);
      const { error } = await supabase.auth.signInWithPassword({ email: fd.get('email').trim(), password: fd.get('password') });
      if (error) throw error;
    } catch (error) {
      notify(error.message || 'Login gagal.', 'error');
      button.disabled = false; button.textContent = 'Masuk';
    }
  });
}
