const descriptions = {
  'academic-years': ['Tahun Ajaran', 'Atur tahun ajaran dan pastikan riwayat kelas siswa tetap terjaga.'],
  books: ['Katalog Buku', 'Kelola buku siswa yang dapat dijual serta buku guru, perpustakaan, dan inventaris sekolah.'],
  inventory: ['Persediaan Buku', 'Stok penjualan dan stok inventaris sekolah harus dicatat terpisah.'],
  bundles: ['Paket Buku', 'Siapkan paket per kelas dan tahun ajaran, termasuk harga paket serta pilihan buku sebagian.'],
  sales: ['Penjualan Buku', 'Catat pembelian per siswa, baik paket lengkap maupun sebagian.'],
  payments: ['Pembayaran', 'Catat pembayaran tunai atau transfer, cicilan, bukti transaksi, dan sisa tagihan.'],
  reports: ['Laporan', 'Laporan stok, penjualan, penerimaan pembayaran, dan tunggakan akan tersedia setelah modul operasional dibuat.'],
  users: ['Pengguna', 'Pengelolaan akun TU dan Kepsek. Pembuatan serta perubahan peran dilakukan melalui Supabase Auth dan profil.']
};
export function renderPlaceholder(page) {
  const [title, description] = descriptions[page] || ['Modul', 'Modul ini belum dibuat.'];
  document.querySelector('#page-title').textContent = title;
  document.querySelector('#page-content').innerHTML = `<section class="page-intro"><div><p class="eyebrow">TAHAP PENGEMBANGAN</p><h2>${title}</h2><p>${description}</p></div></section><section class="panel placeholder-panel"><div class="placeholder-art">✦</div><h3>Modul ini belum aktif</h3><p>Fondasi database sudah disiapkan. Modul akan dibuat dan diuji satu per satu agar data stok serta pembayaran tetap konsisten.</p><button class="button button-secondary" data-page="dashboard">Kembali ke Dashboard</button></section>`;
}
