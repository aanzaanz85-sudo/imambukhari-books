import { getStudents } from '../../services/student-service.js';
import { renderTable } from '../../components/table.js';
import { notify } from '../../components/notifications.js';
import { exportRowsToXlsx } from '../../utils/export.js';
import { escapeHtml } from '../../utils/validation.js';

export async function renderStudents() {
  const host = document.querySelector('#page-content');
  host.innerHTML = `<section class="page-intro"><div><p class="eyebrow">DATA INDUK</p><h2>Data Siswa</h2><p>Daftar siswa tersusun menurut kelas dan tahun ajaran.</p></div><button class="button button-primary" id="export-students">⇩ Ekspor Excel</button></section><section class="panel"><div class="filter-row"><label class="search-field">⌕ <input id="student-search" placeholder="Cari nama siswa…" aria-label="Cari nama siswa" /></label><label class="select-field">Kelas<select id="class-filter"><option value="">Semua kelas</option>${Array.from({length:6},(_,i)=>i+1).flatMap(n=>['A','B','C'].map(s=>`<option value="${n}${s}">${n}${s}</option>`)).map(opt=>opt).join('')}</select></label><span class="result-count" id="student-count">Memuat…</span></div><div id="students-table"><div class="loading-row">Memuat data siswa…</div></div></section><p class="help-text">Data awal diimpor dari rekap MBG TA 2026/2027. Pastikan wali kelas memverifikasi nama dan penempatan kelas.</p>`;
  let currentRows = [];
  const load = async () => {
    const tableHost = host.querySelector('#students-table');
    tableHost.innerHTML = '<div class="loading-row">Memuat data siswa…</div>';
    try {
      currentRows = await getStudents({ search: host.querySelector('#student-search').value, className: host.querySelector('#class-filter').value });
      host.querySelector('#student-count').textContent = `${currentRows.length} siswa`;
      tableHost.innerHTML = renderTable({
        columns: [
          { label: 'No.', render: (_, i) => i + 1 },
          { label: 'Nama Siswa', render: row => `<strong>${escapeHtml(row.full_name)}</strong>` , key: 'full_name' },
          { label: 'Kelas', key: 'class_name' },
          { label: 'Gender', render: row => escapeHtml(row.gender) },
          { label: 'Status', render: row => `<span class="status-tag ${row.is_active ? 'status-active' : 'status-inactive'}">${row.is_active ? 'Aktif' : 'Nonaktif'}</span>` }
        ], rows: currentRows, emptyMessage: 'Tidak ada siswa yang cocok dengan pencarian.'
      });
    } catch (error) {
      tableHost.innerHTML = `<div class="error-state">${escapeHtml(error.message)}<br><small>Periksa koneksi dan izin baca tabel di Supabase.</small></div>`;
      notify('Data siswa gagal dimuat.', 'error');
    }
  };
  host.querySelector('#student-search').addEventListener('input', debounce(load, 250));
  host.querySelector('#class-filter').addEventListener('change', load);
  host.querySelector('#export-students').addEventListener('click', () => {
    if (!currentRows.length) return notify('Tidak ada data untuk diekspor.', 'error');
    exportRowsToXlsx(currentRows.map((r, i) => ({ No: i + 1, 'Nama Siswa': r.full_name, Kelas: r.class_name, Gender: r.gender, 'Tahun Ajaran': r.academic_year, Status: r.is_active ? 'Aktif' : 'Nonaktif' })), 'daftar-siswa-2026-2027.xlsx', 'Data Siswa');
  });
  await load();
}
function debounce(fn, delay) { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); }; }
