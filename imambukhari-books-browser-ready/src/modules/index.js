import { supabase } from '../../config/supabase.js';
import { renderTable } from '../../components/table.js';
import { notify } from '../../components/notifications.js';
import { showModal, closeModal } from '../../components/modal.js';
import { escapeHtml } from '../../utils/validation.js';
import { formatRupiah } from '../../utils/currency.js';
import { exportRowsToXlsx } from '../../utils/export.js';

const BOOK_TYPES = [
  { value: 'student_textbook', label: 'Buku pelajaran siswa' },
  { value: 'teacher_book', label: 'Buku guru' },
  { value: 'library_book', label: 'Buku perpustakaan' },
  { value: 'school_owned', label: 'Aset sekolah' },
  { value: 'other', label: 'Lainnya' }
];

const BOOK_SELECT = 'id,code,title,book_type,is_for_sale,default_unit_price,publisher,publication_year,is_active,notes,created_at,updated_at';

export async function renderBooks() {
  const host = document.querySelector('#page-content');
  host.innerHTML = `
    <section class="page-intro">
      <div>
        <p class="eyebrow">DATA BUKU</p>
        <h2>Katalog Buku</h2>
        <p>Kelola identitas buku, jenis, harga jual default, dan status katalog. Stok dikelola terpisah di menu Persediaan.</p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="button button-secondary" id="export-books">⇩ Ekspor Excel</button>
        <button class="button button-primary" id="add-book">＋ Tambah Buku</button>
      </div>
    </section>
    <section class="stats-grid" aria-label="Ringkasan katalog">
      <article class="stat-card"><div class="stat-icon green">▤</div><p>Total buku</p><div class="stat-value" id="book-stat-total">—</div><small class="stat-foot">Semua status katalog</small></article>
      <article class="stat-card"><div class="stat-icon blue">✓</div><p>Buku aktif</p><div class="stat-value" id="book-stat-active">—</div><small class="stat-foot">Dapat dipakai pada modul terkait</small></article>
      <article class="stat-card"><div class="stat-icon amber">Rp</div><p>Buku dapat dijual</p><div class="stat-value" id="book-stat-sale">—</div><small class="stat-foot">Ditandai untuk penjualan</small></article>
    </section>
    <section class="panel">
      <div class="filter-row">
        <label class="search-field">⌕ <input id="book-search" placeholder="Cari kode, judul, atau penerbit…" aria-label="Cari kode, judul, atau penerbit buku" /></label>
        <label class="select-field">Jenis
          <select id="book-type-filter" aria-label="Filter jenis buku">
            <option value="">Semua jenis</option>
            ${BOOK_TYPES.map(t => `<option value="${t.value}">${t.label}</option>`).join('')}
          </select>
        </label>
        <label class="select-field">Status
          <select id="book-status-filter" aria-label="Filter status buku">
            <option value="active">Aktif</option>
            <option value="all">Semua status</option>
            <option value="inactive">Nonaktif</option>
          </select>
        </label>
        <span class="result-count" id="book-result-count">Memuat…</span>
      </div>
      <div id="books-table"><div class="loading-row">Memuat katalog buku…</div></div>
    </section>
    <p class="help-text">Buku yang pernah dipakai pada transaksi atau paket jangan dihapus permanen. Gunakan status Nonaktif agar riwayat tetap terjaga. Harga di sini adalah harga default; harga pada transaksi nantinya disimpan sebagai snapshot.</p>`;

  let currentRows = [];
  let visibleRows = [];
  const tableHost = host.querySelector('#books-table');

  const updateStats = () => {
    host.querySelector('#book-stat-total').textContent = currentRows.length;
    host.querySelector('#book-stat-active').textContent = currentRows.filter(row => row.is_active).length;
    host.querySelector('#book-stat-sale').textContent = currentRows.filter(row => row.is_for_sale && row.is_active).length;
  };

  const renderList = () => {
    const search = host.querySelector('#book-search').value.trim().toLocaleLowerCase('id-ID');
    const type = host.querySelector('#book-type-filter').value;
    const status = host.querySelector('#book-status-filter').value;
    visibleRows = currentRows.filter(row => {
      const matchesSearch = !search || [row.code, row.title, row.publisher]
        .some(value => String(value || '').toLocaleLowerCase('id-ID').includes(search));
      const matchesType = !type || row.book_type === type;
      const matchesStatus = status === 'all' || (status === 'active' ? row.is_active : !row.is_active);
      return matchesSearch && matchesType && matchesStatus;
    });

    host.querySelector('#book-result-count').textContent = `${visibleRows.length} buku`;
    tableHost.innerHTML = renderTable({
      columns: [
        { label: 'No.', render: (_, index) => index + 1 },
        { label: 'Kode / Judul', render: row => `<strong>${escapeHtml(row.title)}</strong><br><small>${escapeHtml(row.code)}</small>` },
        { label: 'Jenis', render: row => escapeHtml(bookTypeLabel(row.book_type)) },
        { label: 'Penerbit / Tahun', render: row => `${escapeHtml(row.publisher || '—')}<br><small>${row.publication_year ? escapeHtml(row.publication_year) : '—'}</small>` },
        { label: 'Harga Default', render: row => formatRupiah(row.default_unit_price) },
        { label: 'Penjualan', render: row => `<span class="status-tag ${row.is_for_sale ? 'status-active' : 'status-inactive'}">${row.is_for_sale ? 'Dapat dijual' : 'Tidak dijual'}</span>` },
        { label: 'Status', render: row => `<span class="status-tag ${row.is_active ? 'status-active' : 'status-inactive'}">${row.is_active ? 'Aktif' : 'Nonaktif'}</span>` },
        { label: 'Tindakan', render: row => `<div style="display:flex;gap:6px"><button type="button" class="button button-secondary" data-book-action="edit" data-book-id="${escapeHtml(row.id)}">Edit</button><button type="button" class="button button-quiet" data-book-action="toggle" data-book-id="${escapeHtml(row.id)}">${row.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button></div>` }
      ],
      rows: visibleRows,
      emptyMessage: 'Tidak ada buku yang cocok dengan filter.'
    });
  };

  const load = async () => {
    tableHost.innerHTML = '<div class="loading-row">Memuat katalog buku…</div>';
    try {
      const { data, error } = await supabase.from('books').select(BOOK_SELECT).order('title', { ascending: true });
      if (error) throw error;
      currentRows = data || [];
      updateStats();
      renderList();
    } catch (error) {
      tableHost.innerHTML = `<div class="error-state">Katalog buku gagal dimuat: ${escapeHtml(error.message || 'Kesalahan tidak diketahui.')}<br><small>Periksa koneksi Supabase, tabel books, dan izin akun.</small></div>`;
      host.querySelector('#book-result-count').textContent = 'Gagal memuat';
      notify('Katalog buku gagal dimuat.', 'error');
    }
  };

  host.querySelector('#book-search').addEventListener('input', renderList);
  host.querySelector('#book-type-filter').addEventListener('change', renderList);
  host.querySelector('#book-status-filter').addEventListener('change', renderList);
  host.querySelector('#add-book').addEventListener('click', () => openBookModal({ onSaved: load }));
  host.querySelector('#export-books').addEventListener('click', () => {
    if (!visibleRows.length) return notify('Tidak ada buku pada tampilan untuk diekspor.', 'error');
    exportRowsToXlsx(visibleRows.map((row, index) => ({
      No: index + 1,
      Kode: row.code,
      Judul: row.title,
      Jenis: bookTypeLabel(row.book_type),
      Penerbit: row.publisher || '',
      Tahun: row.publication_year || '',
      'Harga Default (Rp)': Number(row.default_unit_price) || 0,
      'Dapat Dijual': row.is_for_sale ? 'Ya' : 'Tidak',
      Status: row.is_active ? 'Aktif' : 'Nonaktif',
      Catatan: row.notes || ''
    })), 'katalog-buku.xlsx', 'Katalog Buku');
  });

  tableHost.addEventListener('click', async event => {
    const button = event.target.closest('[data-book-action]');
    if (!button) return;
    const row = currentRows.find(item => item.id === button.dataset.bookId);
    if (!row) return notify('Data buku tidak ditemukan. Muat ulang halaman.', 'error');
    if (button.dataset.bookAction === 'edit') {
      openBookModal({ book: row, onSaved: load });
      return;
    }
    if (button.dataset.bookAction === 'toggle') {
      const nextActive = !row.is_active;
      const question = nextActive
        ? `Aktifkan kembali buku "${row.title}"?`
        : `Nonaktifkan buku "${row.title}"? Buku tidak akan dihapus dan riwayat terkait tetap tersimpan.`;
      if (!window.confirm(question)) return;
      button.disabled = true;
      try {
        const { error } = await supabase.from('books').update({ is_active: nextActive, updated_at: new Date().toISOString() }).eq('id', row.id);
        if (error) throw error;
        notify(nextActive ? 'Buku diaktifkan kembali.' : 'Buku dinonaktifkan. Riwayat tetap tersimpan.', 'success');
        await load();
      } catch (error) {
        notify(`Status buku gagal diubah: ${error.message || 'Kesalahan tidak diketahui.'}`, 'error');
        button.disabled = false;
      }
    }
  });

  await load();
}

function openBookModal({ book = null, onSaved }) {
  const editing = Boolean(book);
  const title = editing ? 'Edit Data Buku' : 'Tambah Buku';
  const typeOptions = BOOK_TYPES.map(type => `<option value="${type.value}" ${book?.book_type === type.value ? 'selected' : ''}>${type.label}</option>`).join('');
  const body = `
    <form id="book-form" class="form-stack">
      <label>Kode buku *
        <input name="code" required maxlength="50" placeholder="Contoh: BUK-001" value="${escapeHtml(book?.code || '')}" autocomplete="off" />
      </label>
      <label>Judul buku *
        <input name="title" required maxlength="250" placeholder="Nama/judul buku" value="${escapeHtml(book?.title || '')}" />
      </label>
      <label>Jenis buku *
        <select name="book_type" required style="width:100%;padding:12px 13px;border:1px solid #dce5df;border-radius:9px;background:white;font:inherit;font-size:13px">
          ${typeOptions}
        </select>
      </label>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">
        <label>Penerbit
          <input name="publisher" maxlength="150" placeholder="Nama penerbit (opsional)" value="${escapeHtml(book?.publisher || '')}" />
        </label>
        <label>Tahun terbit
          <input name="publication_year" type="number" min="1000" max="9999" step="1" placeholder="Contoh: 2025" value="${book?.publication_year ? escapeHtml(book.publication_year) : ''}" />
        </label>
      </div>
      <label>Harga jual default (Rp)
        <input name="default_unit_price" type="number" min="0" step="0.01" required value="${escapeHtml(book?.default_unit_price ?? '0')}" />
      </label>
      <label style="display:flex;grid-template-columns:20px 1fr;align-items:center;gap:9px;font-weight:600">
        <input name="is_for_sale" type="checkbox" ${book?.is_for_sale ? 'checked' : ''} style="width:16px;height:16px;margin:0" />
        Buku ini boleh dijual
      </label>
      <label>Catatan
        <textarea name="notes" rows="3" maxlength="2000" placeholder="Catatan tambahan (opsional)" style="width:100%;padding:12px 13px;border:1px solid #dce5df;border-radius:9px;font:inherit;font-size:13px;resize:vertical">${escapeHtml(book?.notes || '')}</textarea>
      </label>
      <p class="form-note" style="text-align:left">Status aktif/nonaktif dikelola melalui tombol tindakan pada daftar. Data buku tidak dihapus permanen agar riwayat tetap terjaga.</p>
      <div id="book-form-error" class="error-state" hidden></div>
    </form>`;
  showModal({
    title,
    body,
    actions: `<button class="button button-primary" id="save-book" type="submit" form="book-form">${editing ? 'Simpan Perubahan' : 'Simpan Buku'}</button>`
  });

  const form = document.querySelector('#book-form');
  const saveButton = document.querySelector('#save-book');
  const errorBox = document.querySelector('#book-form-error');
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const code = form.elements.code.value.trim().toUpperCase();
    const bookTitle = form.elements.title.value.trim();
    const price = Number(form.elements.default_unit_price.value);
    const yearText = form.elements.publication_year.value.trim();
    const publicationYear = yearText ? Number(yearText) : null;
    if (!code || !bookTitle) {
      errorBox.textContent = 'Kode dan judul buku wajib diisi.';
      errorBox.hidden = false;
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      errorBox.textContent = 'Harga default harus berupa angka nol atau lebih.';
      errorBox.hidden = false;
      return;
    }
    if (publicationYear !== null && (!Number.isInteger(publicationYear) || publicationYear < 1000 || publicationYear > 9999)) {
      errorBox.textContent = 'Tahun terbit harus berupa tahun 4 digit yang valid.';
      errorBox.hidden = false;
      return;
    }
    const payload = {
      code,
      title: bookTitle,
      book_type: form.elements.book_type.value,
      publisher: form.elements.publisher.value.trim() || null,
      publication_year: publicationYear,
      default_unit_price: price,
      is_for_sale: form.elements.is_for_sale.checked,
      notes: form.elements.notes.value.trim() || null,
      updated_at: new Date().toISOString()
    };
    if (!editing) payload.is_active = true;
    saveButton.disabled = true;
    saveButton.textContent = 'Menyimpan…';
    errorBox.hidden = true;
    try {
      const result = editing
        ? await supabase.from('books').update(payload).eq('id', book.id).select('id').single()
        : await supabase.from('books').insert(payload).select('id').single();
      if (result.error) throw result.error;
      closeModal();
      notify(editing ? 'Perubahan data buku berhasil disimpan.' : 'Buku berhasil ditambahkan.', 'success');
      await onSaved();
    } catch (error) {
      const message = error.code === '23505'
        ? 'Kode buku sudah digunakan. Gunakan kode yang berbeda.'
        : (error.message || 'Data buku gagal disimpan.');
      errorBox.textContent = message;
      errorBox.hidden = false;
      saveButton.disabled = false;
      saveButton.textContent = editing ? 'Simpan Perubahan' : 'Simpan Buku';
    }
  });
}

function bookTypeLabel(value) {
  return BOOK_TYPES.find(type => type.value === value)?.label || 'Lainnya';
}
