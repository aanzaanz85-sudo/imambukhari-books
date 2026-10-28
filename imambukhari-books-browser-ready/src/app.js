import { supabase, isSupabaseConfigured } from './config/supabase.js';
import { renderLogin } from './modules/auth/index.js';
import { renderDashboard } from './modules/dashboard/index.js';
import { renderStudents } from './modules/students/index.js';
import { renderPlaceholder } from './modules/placeholder.js';
import { renderSidebar } from './components/sidebar.js';
import { renderHeader } from './components/header.js';
import { notify } from './components/notifications.js';

const pageNames = { dashboard: 'Dashboard', students: 'Data Siswa', 'academic-years': 'Tahun Ajaran', books: 'Katalog Buku', inventory: 'Persediaan', bundles: 'Paket Buku', sales: 'Penjualan', payments: 'Pembayaran', reports: 'Laporan', users: 'Pengguna' };
let currentProfile = null;
let currentPage = 'dashboard';

export async function startApp() {
  if (!isSupabaseConfigured) {
    document.querySelector('#app').innerHTML = `<main class="config-screen"><section class="config-card"><div class="brand-mark large">IB</div><p class="eyebrow">PENGATURAN PERTAMA</p><h1>Hubungkan Supabase</h1><p>Aplikasi belum menerima konfigurasi Supabase. Setelah proyek diunggah ke Netlify, isi environment variables berikut di pengaturan situs:</p><code>VITE_SUPABASE_URL</code><code>VITE_SUPABASE_ANON_KEY</code><p class="muted">Gunakan Project URL dan publishable/anon key dari Supabase. Jangan gunakan service_role/secret key.</p></section></main>`;
    return;
  }
  const { data: { session } } = await supabase.auth.getSession();
  if (session) await enterApp(session.user);
  else renderLogin();
  supabase.auth.onAuthStateChange((event, session) => {
    // Defer application work outside the auth callback to avoid blocking Supabase's auth lock.
    if (event === 'SIGNED_IN' && session?.user) queueMicrotask(() => enterApp(session.user));
    if (event === 'SIGNED_OUT') queueMicrotask(() => { currentProfile = null; renderLogin(); });
  });
}

async function enterApp(user) {
  try {
    const { data: profile, error } = await supabase.from('profiles').select('id,display_name,role,is_active').eq('id', user.id).single();
    if (error) throw error;
    if (!profile?.is_active || !['kepsek', 'tu'].includes(profile.role)) throw new Error('Akun tidak aktif atau belum memiliki peran TU/Kepsek.');
    currentProfile = profile;
    await renderShell('dashboard');
  } catch (error) {
    await supabase.auth.signOut();
    renderLogin();
    notify(error.message || 'Profil pengguna tidak dapat dibaca.', 'error');
  }
}

async function renderShell(page) {
  currentPage = page;
  document.querySelector('#app').innerHTML = `<div class="app-shell">${renderSidebar(page)}<div class="main-column">${renderHeader(currentProfile)}<main id="page-content" class="content-area"></main></div></div><div id="notifications" class="notifications" aria-live="polite"></div>`;
  document.querySelector('#page-title').textContent = pageNames[page] || 'Dashboard';
  document.querySelectorAll('.sidebar [data-page]').forEach(button => button.addEventListener('click', () => navigate(button.dataset.page)));
  document.querySelector('#page-content').addEventListener('click', event => {
    const button = event.target.closest('[data-page]');
    if (button) navigate(button.dataset.page);
  });
  document.querySelector('#sign-out').addEventListener('click', async () => {
    const { error } = await supabase.auth.signOut();
    if (error) notify(error.message, 'error');
  });
  await renderPage(page);
}

async function navigate(page) {
  if (!pageNames[page]) return;
  await renderShell(page);
}

async function renderPage(page) {
  document.querySelector('#page-title').textContent = pageNames[page] || 'Dashboard';
  if (page === 'dashboard') return renderDashboard();
  if (page === 'students') return renderStudents();
  return renderPlaceholder(page);
}
