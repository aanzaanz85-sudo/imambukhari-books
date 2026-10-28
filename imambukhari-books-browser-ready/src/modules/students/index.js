import { getStudents, getClassOptions, getActiveAcademicYear, createStudent, updateStudent, transferStudentClass, markStudentDeparture, reactivateStudent } from '../../services/student-service.js';
import { renderTable } from '../../components/table.js';
import { notify } from '../../components/notifications.js';
import { showModal, closeModal } from '../../components/modal.js';
import { exportRowsToXlsx } from '../../utils/export.js';
import { escapeHtml } from '../../utils/validation.js';

const classes = Array.from({ length: 6 }, (_, i) => i + 1).flatMap(grade => ['A', 'B', 'C'].map(section => `${grade}${section}`));
const genderForClass = className => className?.endsWith('B') ? 'Perempuan' : 'Laki-laki';

export async function renderStudents() {
  const host = document.querySelector('#page-content');
  host.innerHTML = `<section class="page-intro"><div><p class="eyebrow">DATA INDUK</p><h2>Data Siswa</h2><p>Tambah dan perbaiki data siswa. Riwayat siswa yang pindah tetap disimpan.</p></div><div class="intro-actions"><button class="button button-secondary" id="export-students">⇩ Ekspor Excel</button><button class="button button-primary" id="add-student">＋ Tambah siswa</button></div></section><section class="notice student-notice"><strong>Mengapa tidak ada tombol hapus?</strong><span>Data siswa dapat terhubung dengan transaksi buku dan pembayaran. Menghapus permanen berisiko merusak riwayat dan jejak audit. Untuk siswa pindah sekolah, gunakan tindakan “Pindah/keluar” agar statusnya berubah dan riwayat tetap tersimpan.</span></section><section class="panel"><div class="filter-row"><label class="search-field">⌕ <input id="student-search" placeholder="Cari nama siswa…" aria-label="Cari nama siswa" /></label><label class="select-field">Kelas<select id="class-filter"><option value="">Semua kelas</option>${classes.map(name => `<option value="${name}">${name}</option>`).join('')}</select></label><label class="select-field">Status<select id="student-status-filter"><option value="active">Siswa aktif</option><option value="inactive">Pindah/keluar/lulus</option></select></label><span class="result-count" id="student-count">Memuat…</span></div><div id="students-table"><div class="loading-row">Memuat data siswa…</div></div></section><p class="help-text" id="student-year-note">Memuat tahun ajaran aktif…</p>`;
  let currentRows = [];
  let classOptions = [];
  let activeYear;
  try {
    [classOptions, activeYear] = await Promise.all([getClassOptions(), getActiveAcademicYear()]);
    host.querySelector('#student-year-note').textContent = `Tahun ajaran aktif: ${activeYear.name}. Gender mengikuti pembagian kelas sekolah: A/C laki-laki, B perempuan.`;
  } catch (error) {
    notify(`Pengaturan awal siswa gagal dimuat: ${error.message}`, 'error');
  }

  const load = async () => {
    const tableHost = host.querySelector('#students-table');
    tableHost.innerHTML = '<div class="loading-row">Memuat data siswa…</div>';
    try {
      const status = host.querySelector('#student-status-filter').value;
      currentRows = await getStudents({ search: host.querySelector('#student-search').value, className: host.querySelector('#class-filter').value, year: activeYear?.name, status });
      host.querySelector('#student-count').textContent = `${currentRows.length} siswa`;
      tableHost.innerHTML = renderTable({
        columns: [
          { label: 'No.', render: (_, i) => i + 1 },
          { label: 'Nama Siswa', render: row => `<strong>${escapeHtml(row.full_name)}</strong>`, key: 'full_name' },
          { label: 'Kelas', render: row => escapeHtml(row.class_name) },
          { label: 'Gender', render: row => escapeHtml(row.gender) },
          { label: 'Status', render: row => `<span class="status-tag ${row.is_active ? 'status-active' : 'status-inactive'}">${row.is_active ? 'Aktif' : 'Nonaktif'}</span>` },
          { label: 'Tindakan', render: row => row.is_active ? `<div class="table-actions"><button class="button button-secondary button-small" data-student-action="edit" data-student-id="${row.id}">Edit</button><button class="button button-secondary button-small" data-student-action="move" data-student-id="${row.id}">Mutasi kelas</button><button class="button button-warning button-small" data-student-action="leave" data-student-id="${row.id}">Pindah/keluar</button></div>` : `<div class="table-actions"><button class="button button-secondary button-small" data-student-action="reactivate" data-student-id="${row.id}">Aktifkan kembali</button></div>` }
        ], rows: currentRows, emptyMessage: 'Tidak ada siswa yang cocok dengan pencarian.'
      });
    } catch (error) {
      tableHost.innerHTML = `<div class="error-state">${escapeHtml(error.message)}<br><small>Periksa koneksi dan izin akses Supabase.</small></div>`;
      notify('Data siswa gagal dimuat.', 'error');
    }
  };

  host.querySelector('#student-search').addEventListener('input', debounce(load, 250));
  host.querySelector('#class-filter').addEventListener('change', load);
  host.querySelector('#student-status-filter').addEventListener('change', load);
  host.querySelector('#export-students').addEventListener('click', () => {
    if (!currentRows.length) return notify('Tidak ada data untuk diekspor.', 'error');
    exportRowsToXlsx(currentRows.map((r, i) => ({ No: i + 1, 'Nama Siswa': r.full_name, Kelas: r.class_name, Gender: r.gender, 'Tahun Ajaran': r.academic_year, Status: r.is_active ? 'Aktif' : 'Nonaktif' })), `daftar-siswa-${(activeYear?.name || 'aktif').replace('/', '-')}.xlsx`, 'Data Siswa');
  });
  host.querySelector('#add-student').addEventListener('click', () => openAddModal({ classOptions, onSaved: load }));
  host.querySelector('#students-table').addEventListener('click', async event => {
    const button = event.target.closest('[data-student-action]');
    if (!button) return;
    const row = currentRows.find(item => item.id === button.dataset.studentId);
    if (!row) return;
    if (button.dataset.studentAction === 'edit') openEditModal({ row, onSaved: load });
    if (button.dataset.studentAction === 'move') openTransferModal({ row, classOptions, onSaved: load });
    if (button.dataset.studentAction === 'leave') openDepartureModal({ row, onSaved: load });
    if (button.dataset.studentAction === 'reactivate') openReactivationModal({ row, classOptions, onSaved: load });
  });
  await load();
}

function openAddModal({ classOptions, onSaved }) {
  const options = classOptions.map(c => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)} — ${genderForClass(c.name)}</option>`).join('');
  showModal({
    title: 'Tambah siswa',
    body: `<form id="student-form" class="form-stack"><label>Nama lengkap siswa<input id="student-full-name" name="full_name" maxlength="160" required autocomplete="off" placeholder="Masukkan nama lengkap" /></label><label>Kelas<select id="student-class-name" name="class_name" required>${options}</select></label><p class="form-note left-note">Gender otomatis mengikuti kelas: A/C laki-laki, B perempuan.</p><div class="form-error" id="student-form-error" hidden></div></form>`,
    actions: `<button class="button button-primary" id="save-student" type="submit" form="student-form">Simpan siswa</button>`
  });
  const form = document.querySelector('#student-form');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = document.querySelector('#save-student');
    const fullName = form.elements.full_name.value.trim();
    const className = form.elements.class_name.value;
    if (!fullName) return showFormError('Nama siswa wajib diisi.');
    button.disabled = true;
    button.textContent = 'Menyimpan…';
    try {
      await createStudent({ fullName, className });
      closeModal();
      notify('Siswa berhasil ditambahkan.', 'success');
      await onSaved();
    } catch (error) {
      showFormError(error.message || 'Siswa gagal ditambahkan.');
    } finally {
      if (document.querySelector('#save-student')) {
        button.disabled = false;
        button.textContent = 'Simpan siswa';
      }
    }
  });
}

function openEditModal({ row, onSaved }) {
  showModal({
    title: 'Edit data siswa',
    body: `<form id="student-form" class="form-stack"><label>Nama lengkap siswa<input id="student-full-name" name="full_name" maxlength="160" required value="${escapeHtml(row.full_name)}" /></label><label>Kelas saat ini<input value="${escapeHtml(row.class_name)}" disabled /></label><label>Gender<input value="${escapeHtml(row.gender)}" disabled /></label><p class="form-note left-note">Untuk mengubah kelas, gunakan tindakan “Mutasi kelas”. Gender mengikuti pembagian kelas sekolah.</p><div class="form-error" id="student-form-error" hidden></div></form>`,
    actions: `<button class="button button-primary" id="save-student" type="submit" form="student-form">Simpan perubahan</button>`
  });
  const form = document.querySelector('#student-form');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = document.querySelector('#save-student');
    const fullName = form.elements.full_name.value.trim();
    if (!fullName) return showFormError('Nama siswa wajib diisi.');
    button.disabled = true;
    button.textContent = 'Menyimpan…';
    try {
      await updateStudent({ studentId: row.id, fullName });
      closeModal();
      notify('Perubahan data siswa berhasil disimpan.', 'success');
      await onSaved();
    } catch (error) {
      showFormError(error.message || 'Perubahan gagal disimpan.');
    } finally {
      if (document.querySelector('#save-student')) {
        button.disabled = false;
        button.textContent = 'Simpan perubahan';
      }
    }
  });
}

function openTransferModal({ row, classOptions, onSaved }) {
  const targets = classOptions.filter(c => c.grade === row.grade && c.name !== row.class_name && genderForClass(c.name) === row.gender);
  if (!targets.length) {
    notify('Tidak ada kelas tujuan yang sesuai gender dan tingkat kelas siswa ini.', 'error');
    return;
  }
  showModal({
    title: 'Mutasi kelas',
    body: `<form id="student-form" class="form-stack"><p class="muted">Siswa: <strong>${escapeHtml(row.full_name)}</strong><br>Kelas saat ini: <strong>${escapeHtml(row.class_name)}</strong></p><label>Kelas tujuan<select name="class_name" required>${targets.map(c => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join('')}</select></label><label>Alasan mutasi<textarea name="reason" rows="3" required maxlength="500" placeholder="Contoh: penyesuaian penempatan kelas"></textarea></label><p class="form-note left-note">Riwayat kelas lama tetap disimpan. Fitur ini hanya untuk perpindahan pada tingkat kelas yang sama.</p><div class="form-error" id="student-form-error" hidden></div></form>`,
    actions: `<button class="button button-primary" id="save-student" type="submit" form="student-form">Simpan mutasi</button>`
  });
  const form = document.querySelector('#student-form');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = document.querySelector('#save-student');
    const newClassName = form.elements.class_name.value;
    const reason = form.elements.reason.value.trim();
    if (!reason) return showFormError('Alasan mutasi wajib diisi.');
    button.disabled = true;
    button.textContent = 'Menyimpan…';
    try {
      await transferStudentClass({ studentId: row.id, newClassName, reason });
      closeModal();
      notify(`Siswa berhasil dimutasi ke kelas ${newClassName}.`, 'success');
      await onSaved();
    } catch (error) {
      showFormError(error.message || 'Mutasi kelas gagal.');
    } finally {
      if (document.querySelector('#save-student')) {
        button.disabled = false;
        button.textContent = 'Simpan mutasi';
      }
    }
  });
}

function openDepartureModal({ row, onSaved }) {
  showModal({
    title: 'Pindah sekolah / nonaktifkan siswa',
    body: `<form id="student-form" class="form-stack"><p class="muted">Siswa: <strong>${escapeHtml(row.full_name)}</strong> (${escapeHtml(row.class_name)})</p><label>Status akhir<select name="departure_status" required><option value="transferred">Pindah ke sekolah lain</option><option value="left">Keluar/mengundurkan diri</option><option value="graduated">Lulus</option></select></label><label>Alasan / keterangan<textarea name="reason" rows="3" required maxlength="500" placeholder="Isi tanggal atau keterangan seperlunya"></textarea></label><p class="form-note left-note">Siswa akan hilang dari daftar aktif, tetapi data dan riwayat transaksi tetap tersimpan. Pastikan keputusan ini benar sebelum disimpan.</p><div class="form-error" id="student-form-error" hidden></div></form>`,
    actions: `<button class="button button-warning" id="save-student" type="submit" form="student-form">Konfirmasi status</button>`
  });
  const form = document.querySelector('#student-form');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = document.querySelector('#save-student');
    const status = form.elements.departure_status.value;
    const reason = form.elements.reason.value.trim();
    if (!reason) return showFormError('Alasan / keterangan wajib diisi.');
    if (!confirm(`Ubah status ${row.full_name} menjadi nonaktif? Data tidak dihapus.`)) return;
    button.disabled = true;
    button.textContent = 'Memproses…';
    try {
      await markStudentDeparture({ studentId: row.id, status, reason });
      closeModal();
      notify('Status siswa diperbarui. Riwayat tetap tersimpan.', 'success');
      await onSaved();
    } catch (error) {
      showFormError(error.message || 'Status siswa gagal diperbarui.');
    } finally {
      if (document.querySelector('#save-student')) {
        button.disabled = false;
        button.textContent = 'Konfirmasi status';
      }
    }
  });
}

function openReactivationModal({ row, classOptions, onSaved }) {
  const targets = classOptions.filter(c => genderForClass(c.name) === row.gender);
  showModal({
    title: 'Aktifkan kembali siswa',
    body: `<form id="student-form" class="form-stack"><p class="muted">Siswa: <strong>${escapeHtml(row.full_name)}</strong><br>Status sebelumnya: Nonaktif</p><label>Kelas saat aktif kembali<select name="class_name" required>${targets.map(c => `<option value="${escapeHtml(c.name)}" ${c.name === row.class_name ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}</select></label><label>Alasan pengaktifan kembali<textarea name="reason" rows="3" required maxlength="500" placeholder="Contoh: status sebelumnya salah atau siswa kembali bersekolah"></textarea></label><div class="form-error" id="student-form-error" hidden></div></form>`,
    actions: `<button class="button button-primary" id="save-student" type="submit" form="student-form">Aktifkan kembali</button>`
  });
  const form = document.querySelector('#student-form');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const button = document.querySelector('#save-student');
    const className = form.elements.class_name.value;
    const reason = form.elements.reason.value.trim();
    if (!reason) return showFormError('Alasan pengaktifan kembali wajib diisi.');
    button.disabled = true;
    button.textContent = 'Memproses…';
    try {
      await reactivateStudent({ studentId: row.id, className, reason });
      closeModal();
      notify('Siswa berhasil diaktifkan kembali.', 'success');
      await onSaved();
    } catch (error) {
      showFormError(error.message || 'Siswa gagal diaktifkan kembali.');
    } finally {
      if (document.querySelector('#save-student')) {
        button.disabled = false;
        button.textContent = 'Aktifkan kembali';
      }
    }
  });
}

function showFormError(message) {
  const element = document.querySelector('#student-form-error');
  if (!element) return;
  element.textContent = message;
  element.hidden = false;
}

function debounce(fn, delay) { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); }; }
