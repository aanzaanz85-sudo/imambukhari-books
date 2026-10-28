const items = [
  ['dashboard', '⌂', 'Dashboard'],
  ['students', '♙', 'Data Siswa'],
  ['books', '▤', 'Katalog Buku'],
  ['inventory', '▦', 'Persediaan'],
  ['bundles', '▧', 'Paket Buku'],
  ['sales', '↗', 'Penjualan'],
  ['payments', 'Rp', 'Pembayaran'],
  ['reports', '▥', 'Laporan'],
  ['users', '⚙', 'Pengguna']
];
export function renderSidebar(active = 'dashboard') {
  return `<aside class="sidebar"><div class="brand"><div class="brand-mark">IB</div><div><strong>Imam Bukhari</strong><span>Manajemen Buku</span></div></div><nav class="nav-list" aria-label="Menu utama">${items.map(([id, icon, label]) => `<button class="nav-item ${id === active ? 'active' : ''}" data-page="${id}"><span class="nav-icon">${icon}</span><span>${label}</span></button>`).join('')}</nav><div class="sidebar-foot"><span class="status-dot"></span> Database Supabase</div></aside>`;
}
