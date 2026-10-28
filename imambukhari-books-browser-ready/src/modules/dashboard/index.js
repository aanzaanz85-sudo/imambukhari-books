import { getActiveAcademicYear, getStudentCounts, getBookCount } from '../../services/student-service.js';
import { getStockSummary } from '../../services/inventory-service.js';
import { escapeHtml } from '../../utils/validation.js';

export async function renderDashboard() {
  const host = document.querySelector('#page-content');
  host.innerHTML = `<section class="page-intro"><div><p class="eyebrow">RINGKASAN</p><h2>Assalamu'alaikum</h2><p>Pantau data siswa, katalog, dan persediaan buku sekolah dari satu tempat.</p></div><span class="year-pill" id="active-academic-year">Memuat tahun ajaran…</span></section><section class="stats-grid"><article class="stat-card"><span class="stat-icon green">♙</span><p>Total siswa aktif</p><strong class="stat-value">…</strong><span class="stat-foot">Tahun ajaran berjalan</span></article><article class="stat-card"><span class="stat-icon amber">▤</span><p>Judul buku aktif</p><strong class="stat-value">…</strong><span class="stat-foot">Katalog sekolah</span></article><article class="stat-card"><span class="stat-icon blue">▦</span><p>Jenis stok tercatat</p><strong class="stat-value">…</strong><span class="stat-foot">Lokasi stok terpisah</span></article></section><section class="panel"><div class="panel-heading"><div><p class="eyebrow">PINTASAN</p><h3>Menu operasional</h3></div></div><div class="quick-links"><button data-page="students"><span>♙</span><strong>Data Siswa</strong><small>Cari dan ekspor daftar siswa</small></button><button data-page="books"><span>▤</span><strong>Katalog Buku</strong><small>Kelola daftar buku</small></button><button data-page="inventory"><span>▦</span><strong>Persediaan</strong><small>Pantau stok buku</small></button></div></section><div class="notice"><strong>Catatan tahap awal</strong><span>Modul penjualan dan pembayaran belum diaktifkan untuk transaksi nyata. Periksa data dan akses terlebih dahulu.</span></div>`;

  try {
    // Read the active year once, then use that same value for the dashboard's student count.
    const activeYear = await getActiveAcademicYear();
    const yearPill = host.querySelector('#active-academic-year');
    if (yearPill) yearPill.textContent = `Tahun Ajaran ${activeYear.name}`;

    const [students, books, stock] = await Promise.all([
      getStudentCounts(activeYear.name),
      getBookCount(),
      getStockSummary()
    ]);
    const nums = host.querySelectorAll('.stat-value');
    nums[0].textContent = students.total.toLocaleString('id-ID');
    nums[1].textContent = books.toLocaleString('id-ID');
    nums[2].textContent = stock.length.toLocaleString('id-ID');
  } catch (error) {
    const yearPill = host.querySelector('#active-academic-year');
    if (yearPill && yearPill.textContent === 'Memuat tahun ajaran…') {
      yearPill.textContent = 'Tahun ajaran belum tersedia';
    }
    const notice = host.querySelector('.notice');
    if (notice) notice.innerHTML = `<strong>Belum dapat memuat ringkasan</strong><span>${escapeHtml(error.message)}. Periksa koneksi Supabase dan aturan akses.</span>`;
  }
}
