import { supabase } from '../../config/supabase.js';
import { getActiveAcademicYear } from '../../services/student-service.js';
import { notify } from '../../components/notifications.js';
import { showModal, closeModal } from '../../components/modal.js';
import { escapeHtml } from '../../utils/validation.js';

export async function renderAcademicYears(profile) {
  const host = document.querySelector('#page-content');
  host.innerHTML = `<section class="page-intro"><div><p class="eyebrow">PENGELOLAAN AKADEMIK</p><h2>Tahun Ajaran</h2><p>Kelola pergantian tahun ajaran, kenaikan kelas, dan kelulusan siswa kelas 6.</p></div></section><section class="notice student-notice"><strong>Perhatian: proses ini berdampak ke seluruh siswa aktif.</strong><span>Ketika diproses, siswa kelas 1–5 naik satu tingkat dengan ID dan riwayat transaksi tetap sama. Siswa kelas 6 ditandai lulus/nonaktif. Data tahun ajaran sebelumnya tetap tersimpan.</span></section><section class="panel" id="academic-year-panel"><div class="loading-row">Memuat tahun ajaran…</div></section>`;
  const panel = host.querySelector('#academic-year-panel');
  try {
    const [activeYear, { data: years, error }] = await Promise.all([
      getActiveAcademicYear(),
      supabase.from('academic_years').select('id,name,is_active,created_at').order('created_at', { ascending: false })
    ]);
    if (error) throw error;
    const match = String(activeYear.name).match(/^(\d{4})\/(\d{4})$/);
    const suggestedYear = match ? `${Number(match[1]) + 1}/${Number(match[2]) + 1}` : '';
    const canManage = profile?.role === 'kepsek';
    panel.innerHTML = `<div class="panel-heading"><h3>Tahun ajaran aktif</h3><span class="status-tag status-active">Aktif</span></div><div class="year-current"><strong>${escapeHtml(activeYear.name)}</strong><p class="muted">Data siswa yang ditampilkan di modul Data Siswa mengikuti tahun ajaran aktif ini.</p></div>${canManage ? `<div class="year-rollover-box"><h3>Siapkan tahun ajaran baru</h3><p class="muted">Proses akan membuat tahun ajaran tujuan, menaikkan kelas 1–5, dan menandai kelas 6 sebagai lulus. Siswa baru kelas 1 diimpor sesudahnya melalui menu Data Siswa.</p><button class="button button-primary" id="start-year-rollover">Proses kenaikan kelas & kelulusan</button></div>` : `<p class="muted">Hanya akun Kepala Sekolah yang dapat menjalankan proses kenaikan kelas dan kelulusan.</p>`}<div class="panel-heading year-history-heading"><h3>Riwayat tahun ajaran</h3></div><div class="table-wrap"><table><thead><tr><th>Tahun Ajaran</th><th>Status</th></tr></thead><tbody>${(years || []).map(y => `<tr><td>${escapeHtml(y.name)}</td><td><span class="status-tag ${y.is_active ? 'status-active' : 'status-inactive'}">${y.is_active ? 'Aktif' : 'Arsip'}</span></td></tr>`).join('')}</tbody></table></div>`;
    if (canManage) panel.querySelector('#start-year-rollover').addEventListener('click', () => openRolloverModal({ currentYear: activeYear.name, suggestedYear, onSuccess: () => renderAcademicYears(profile) }));
  } catch (error) {
    panel.innerHTML = `<div class="error-state">Gagal memuat tahun ajaran: ${escapeHtml(error.message)}</div>`;
  }
}

function openRolloverModal({ currentYear, suggestedYear, onSuccess }) {
  showModal({
    title: 'Proses tahun ajaran baru',
    body: `<form id="year-rollover-form" class="form-stack"><p class="muted">Tahun ajaran saat ini: <strong>${escapeHtml(currentYear)}</strong>.</p><label>Tahun ajaran tujuan<input name="new_year_name" value="${escapeHtml(suggestedYear)}" placeholder="2027/2028" required pattern="[0-9]{4}/[0-9]{4}" /></label><div class="notice"><strong>Yang akan dilakukan</strong><span>• Siswa aktif kelas 1–5 naik satu tingkat dengan rombel yang sama (contoh 5C → 6C).<br>• Siswa aktif kelas 6 ditandai lulus dan nonaktif.<br>• Tahun ajaran baru menjadi aktif.<br>• Siswa baru kelas 1 diimpor setelah proses ini.</span></div><label>Ketik konfirmasi persis: <code>PROSES TAHUN/TAHUN</code><input name="confirmation" placeholder="PROSES 2027/2028" required autocomplete="off" /></label><div class="form-error" id="year-rollover-error" hidden></div></form>`,
    actions: `<button class="button button-warning" id="confirm-year-rollover" type="submit" form="year-rollover-form">Proses sekarang</button>`
  });
  const form = document.querySelector('#year-rollover-form');
  const button = document.querySelector('#confirm-year-rollover');
  const errorBox = document.querySelector('#year-rollover-error');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const newYearName = form.elements.new_year_name.value.trim();
    const confirmation = form.elements.confirmation.value.trim();
    if (confirmation !== `PROSES ${newYearName}`) {
      errorBox.textContent = `Ketik persis: PROSES ${newYearName}`;
      errorBox.hidden = false;
      return;
    }
    if (!confirm(`Tindakan ini akan memproses semua siswa aktif dari ${form.elements.new_year_name.value.split('/')[0]-1}/${form.elements.new_year_name.value.split('/')[1]-1} ke ${newYearName} dan meluluskan kelas 6. Lanjutkan hanya jika data kelas sudah benar.`)) return;
    button.disabled = true;
    button.textContent = 'Memproses…';
    errorBox.hidden = true;
    try {
      const { data, error } = await supabase.rpc('rollover_academic_year', {
        p_new_year_name: newYearName,
        p_confirmation: confirmation
      });
      if (error) throw error;
      closeModal();
      notify(`Tahun ajaran berubah ke ${data.to_year}. Naik kelas: ${data.promoted}; lulus: ${data.graduated}.`, 'success');
      await onSuccess();
    } catch (error) {
      errorBox.textContent = error.message || 'Proses tahun ajaran gagal.';
      errorBox.hidden = false;
      button.disabled = false;
      button.textContent = 'Proses sekarang';
    }
  });
}
