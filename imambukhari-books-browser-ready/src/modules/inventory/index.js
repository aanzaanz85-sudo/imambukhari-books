import { renderTable } from '../../components/table.js';
import { showModal, closeModal } from '../../components/modal.js';
import { notify } from '../../components/notifications.js';
import { escapeHtml } from '../../utils/validation.js';
import { formatDate } from '../../utils/date.js';
import { exportRowsToXlsx } from '../../utils/export.js';
import { getInventoryData, getStockMovements, recordStockMovement } from '../../services/inventory-service.js';

const BOOK_TYPE_LABELS = {
  student_textbook: 'Buku pelajaran siswa',
  teacher_book: 'Buku guru',
  library_book: 'Buku perpustakaan',
  school_owned: 'Aset sekolah',
  other: 'Lainnya'
};

const MOVEMENT_LABELS = {
  opening: 'Stok awal',
  purchase_in: 'Pembelian / stok masuk',
  return_in: 'Retur masuk',
  return_out: 'Retur keluar',
  adjustment_in: 'Penyesuaian tambah',
  adjustment_out: 'Penyesuaian kurang',
  sale_out: 'Keluar karena penjualan'
};

const INBOUND_TYPES = new Set(['opening', 'purchase_in', 'return_in', 'adjustment_in']);
const OUTBOUND_TYPES = new Set(['return_out', 'adjustment_out']);
const TYPES_REQUIRING_NOTES = new Set(['opening', 'return_in', 'return_out', 'adjustment_in', 'adjustment_out']);

export async function renderInventory() {
  const host = document.querySelector('#page-content');
  host.innerHTML = `
    <section class="page-intro">
      <div>
        <p class="eyebrow">OPERASIONAL BUKU</p>
        <h2>Persediaan Buku</h2>
        <p>Kelola saldo stok dan riwayat mutasi. Katalog Buku menyimpan identitas; modul ini mencatat jumlah per lokasi.</p>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="button button-secondary" id="export-inventory">⇩ Ekspor Excel</button>
        <button class="button button-primary" id="add-stock-movement">＋ Catat Mutasi Stok</button>
      </div>
    </section>
    <section class="stats-grid" aria-label="Ringkasan persediaan">
      <article class="stat-card"><div class="stat-icon green">▤</div><p>Pasangan buku-lokasi bersaldo</p><div class="stat-value" id="inventory-stat-items">—</div><small class="stat-foot">Saldo lebih dari nol</small></article>
      <article class="stat-card"><div class="stat-icon blue">↗</div><p>Unit stok penjualan</p><div class="stat-value" id="inventory-stat-sale">—</div><small class="stat-foot">Dipakai saat penjualan dikonfirmasi</small></article>
      <article class="stat-card"><div class="stat-icon amber">▦</div><p>Unit inventaris sekolah</p><div class="stat-value" id="inventory-stat-assets">—</div><small class="stat-foot">Terpisah dari stok penjualan</small></article>
    </section>
    <section class="panel">
      <div class="panel-heading"><h3>Saldo persediaan</h3><span class="result-count" id="inventory-result-count">Memuat…</span></div>
      <div class="filter-row">
        <label class="search-field">⌕ <input id="inventory-search" placeholder="Cari kode atau judul buku…" aria-label="Cari kode atau judul buku" /></label>
        <label class="select-field">Lokasi <select id="inventory-location-filter" aria-label="Filter lokasi"><option value="">Semua lokasi</option></select></label>
        <label class="select-field">Saldo <select id="inventory-stock-filter" aria-label="Filter saldo"><option value="all">Semua</option><option value="positive">Ada stok</option><option value="zero">Stok nol</option></select></label>
      </div>
      <div id="inventory-table"><div class="loading-row">Memuat persediaan…</div></div>
    </section>
    <section class="panel">
      <div class="panel-heading"><div><h3>Riwayat mutasi stok</h3><p class="muted">Menampilkan paling banyak 100 mutasi terakhir. Mutasi adalah catatan riwayat dan tidak dihapus dari layar ini.</p></div></div>
      <div id="stock-movements-table"><div class="loading-row">Memuat riwayat mutasi…</div></div>
    </section>
    <div class="notice"><strong>Aturan penting persediaan</strong><span>Jangan mencatat pengeluaran penjualan dari sini. Stok penjualan akan berkurang otomatis ketika transaksi pada modul Penjualan dikonfirmasi. Jika ada kesalahan stok, buat penyesuaian dengan alasan yang jelas; jangan menghapus riwayat mutasi.</span></div>
  `;

  let inventoryData = { books: [], locations: [], balances: [], rows: [] };
  let movements = [];
  let visibleRows = [];
  const inventoryTable = host.querySelector('#inventory-table');
  const movementTable = host.querySelector('#stock-movements-table');

  const updateStats = () => {
    const stockedRows = inventoryData.rows.filter(row => Number(row.quantity) > 0);
    const saleUnits = inventoryData.rows
      .filter(row => row.location.location_type === 'sale')
      .reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    const assetUnits = inventoryData.rows
      .filter(row => row.location.location_type === 'school_asset')
      .reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    host.querySelector('#inventory-stat-items').textContent = stockedRows.length.toLocaleString('id-ID');
    host.querySelector('#inventory-stat-sale').textContent = saleUnits.toLocaleString('id-ID');
    host.querySelector('#inventory-stat-assets').textContent = assetUnits.toLocaleString('id-ID');
  };

  const renderInventoryRows = () => {
    const search = host.querySelector('#inventory-search').value.trim().toLocaleLowerCase('id-ID');
    const locationId = host.querySelector('#inventory-location-filter').value;
    const stockFilter = host.querySelector('#inventory-stock-filter').value;
    visibleRows = inventoryData.rows.filter(row => {
      const matchesSearch = !search || [row.book.code, row.book.title]
        .some(value => String(value || '').toLocaleLowerCase('id-ID').includes(search));
      const matchesLocation = !locationId || row.location_id === locationId;
      const matchesStock = stockFilter === 'all' || (stockFilter === 'positive' ? Number(row.quantity) > 0 : Number(row.quantity) === 0);
      return matchesSearch && matchesLocation && matchesStock;
    });

    host.querySelector('#inventory-result-count').textContent = `${visibleRows.length} baris`;
    inventoryTable.innerHTML = renderTable({
      columns: [
        { label: 'No.', render: (_, index) => index + 1 },
        { label: 'Kode / Buku', render: row => `<strong>${escapeHtml(row.book.title)}</strong><br><small>${escapeHtml(row.book.code)}</small>${row.book.is_active ? '' : '<br><span class="status-tag status-inactive">Katalog nonaktif</span>'}` },
        { label: 'Jenis', render: row => escapeHtml(BOOK_TYPE_LABELS[row.book.book_type] || 'Lainnya') },
        { label: 'Lokasi', render: row => `${escapeHtml(row.location.name)}${row.location.is_active ? '' : '<br><span class="status-tag status-inactive">Lokasi nonaktif</span>'}` },
        { label: 'Saldo', render: row => `<strong>${Number(row.quantity || 0).toLocaleString('id-ID')}</strong> unit` },
        { label: 'Dapat dijual', render: row => `<span class="status-tag ${row.book.is_for_sale ? 'status-active' : 'status-inactive'}">${row.book.is_for_sale ? 'Ya' : 'Tidak'}</span>` },
        { label: 'Pembaruan saldo', render: row => row.updated_at ? formatDate(row.updated_at) : 'Belum ada mutasi' },
        { label: 'Tindakan', render: row => `<button type="button" class="button button-secondary" data-stock-action="move" data-book-id="${escapeHtml(row.book_id)}" data-location-id="${escapeHtml(row.location_id)}">Catat mutasi</button>` }
      ],
      rows: visibleRows,
      emptyMessage: 'Tidak ada baris persediaan yang cocok dengan filter.'
    });
  };

  const renderMovementRows = () => {
    movementTable.innerHTML = renderTable({
      columns: [
        { label: 'Waktu', render: row => escapeHtml(formatDateTime(row.created_at)) },
        { label: 'Buku', render: row => `<strong>${escapeHtml(row.books?.title || 'Buku tidak ditemukan')}</strong><br><small>${escapeHtml(row.books?.code || '—')}</small>` },
        { label: 'Lokasi', render: row => escapeHtml(row.inventory_locations?.name || '—') },
        { label: 'Jenis mutasi', render: row => escapeHtml(MOVEMENT_LABELS[row.movement_type] || row.movement_type) },
        { label: 'Jumlah', render: row => `${OUTBOUND_TYPES.has(row.movement_type) || row.movement_type === 'sale_out' ? '−' : '+'}${Number(row.quantity).toLocaleString('id-ID')} unit` },
        { label: 'Catatan', render: row => escapeHtml(row.notes || '—') },
        { label: 'Sumber', render: row => escapeHtml(row.reference_table ? `${row.reference_table}${row.reference_id ? ` (${row.reference_id})` : ''}` : 'Manual') }
      ],
      rows: movements,
      emptyMessage: 'Belum ada mutasi stok. Catatan pertama akan muncul setelah Anda mencatat stok awal atau stok masuk.'
    });
  };

  const load = async ({ quiet = false } = {}) => {
    if (!quiet) {
      inventoryTable.innerHTML = '<div class="loading-row">Memuat persediaan…</div>';
      movementTable.innerHTML = '<div class="loading-row">Memuat riwayat mutasi…</div>';
    }
    try {
      const [data, movementRows] = await Promise.all([getInventoryData(), getStockMovements(100)]);
      inventoryData = data;
      movements = movementRows;
      const locationFilter = host.querySelector('#inventory-location-filter');
      const previousLocation = locationFilter.value;
      locationFilter.innerHTML = `<option value="">Semua lokasi</option>${inventoryData.locations.map(location => `<option value="${escapeHtml(location.id)}">${escapeHtml(location.name)}${location.is_active ? '' : ' (nonaktif)'}</option>`).join('')}`;
      if (inventoryData.locations.some(location => location.id === previousLocation)) locationFilter.value = previousLocation;
      updateStats();
      renderInventoryRows();
      renderMovementRows();
    } catch (error) {
      inventoryTable.innerHTML = `<div class="error-state">Persediaan gagal dimuat: ${escapeHtml(error.message || 'Kesalahan tidak diketahui.')}<br><small>Periksa tabel books, inventory_locations, stock_balances, stock_movements, dan izin baca Supabase.</small></div>`;
      movementTable.innerHTML = '<div class="error-state">Riwayat mutasi belum dapat dimuat.</div>';
      host.querySelector('#inventory-result-count').textContent = 'Gagal memuat';
      if (!quiet) notify('Persediaan gagal dimuat.', 'error');
    }
  };

  host.querySelector('#inventory-search').addEventListener('input', renderInventoryRows);
  host.querySelector('#inventory-location-filter').addEventListener('change', renderInventoryRows);
  host.querySelector('#inventory-stock-filter').addEventListener('change', renderInventoryRows);
  host.querySelector('#add-stock-movement').addEventListener('click', () => openMovementModal({ inventoryData, onSaved: () => load({ quiet: true }) }));
  host.querySelector('#export-inventory').addEventListener('click', () => {
    if (!visibleRows.length) return notify('Tidak ada baris persediaan untuk diekspor.', 'error');
    exportRowsToXlsx(visibleRows.map((row, index) => ({
      No: index + 1,
      Kode: row.book.code,
      Buku: row.book.title,
      Jenis: BOOK_TYPE_LABELS[row.book.book_type] || 'Lainnya',
      Lokasi: row.location.name,
      'Jenis Lokasi': row.location.location_type === 'sale' ? 'Stok penjualan' : 'Inventaris sekolah',
      Saldo: Number(row.quantity || 0),
      'Dapat Dijual': row.book.is_for_sale ? 'Ya' : 'Tidak',
      'Status Katalog': row.book.is_active ? 'Aktif' : 'Nonaktif',
      'Pembaruan Saldo': row.updated_at ? formatDate(row.updated_at) : 'Belum ada mutasi'
    })), 'persediaan-buku.xlsx', 'Persediaan Buku');
  });

  inventoryTable.addEventListener('click', event => {
    const button = event.target.closest('[data-stock-action="move"]');
    if (!button) return;
    openMovementModal({
      inventoryData,
      preselectedBookId: button.dataset.bookId,
      preselectedLocationId: button.dataset.locationId,
      onSaved: () => load({ quiet: true })
    });
  });

  await load();
}

function openMovementModal({ inventoryData, preselectedBookId = '', preselectedLocationId = '', onSaved }) {
  const booksWithBalance = new Set(inventoryData.balances.map(row => row.book_id));
  const usableBooks = inventoryData.books.filter(book => book.is_active || booksWithBalance.has(book.id));
  const activeLocations = inventoryData.locations.filter(location => location.is_active);
  if (!usableBooks.length || !activeLocations.length) {
    notify('Belum ada buku yang dapat dikelola atau lokasi stok aktif.', 'error');
    return;
  }

  showModal({
    title: 'Catat Mutasi Stok',
    body: `
      <form id="stock-movement-form" class="form-stack">
        <label>Buku *
          <select name="book_id" required style="width:100%;padding:12px 13px;border:1px solid #dce5df;border-radius:9px;background:white;font:inherit;font-size:13px">
            <option value="">Pilih buku</option>
            ${usableBooks.map(book => `<option value="${escapeHtml(book.id)}" ${book.id === preselectedBookId ? 'selected' : ''}>${escapeHtml(book.code)} — ${escapeHtml(book.title)}${book.is_active ? '' : ' (katalog nonaktif)'}</option>`).join('')}
          </select>
        </label>
        <label>Lokasi stok *
          <select name="location_id" required style="width:100%;padding:12px 13px;border:1px solid #dce5df;border-radius:9px;background:white;font:inherit;font-size:13px">
            <option value="">Pilih lokasi</option>
            ${activeLocations.map(location => `<option value="${escapeHtml(location.id)}" ${location.id === preselectedLocationId ? 'selected' : ''}>${escapeHtml(location.name)} — ${location.location_type === 'sale' ? 'Stok penjualan' : 'Inventaris sekolah'}</option>`).join('')}
          </select>
        </label>
        <label>Jenis mutasi *
          <select name="movement_type" required style="width:100%;padding:12px 13px;border:1px solid #dce5df;border-radius:9px;background:white;font:inherit;font-size:13px">
            <option value="">Pilih buku dan lokasi terlebih dahulu</option>
          </select>
        </label>
        <p class="muted" id="stock-movement-context">Pilih buku dan lokasi untuk melihat jenis mutasi yang sesuai.</p>
        <label>Jumlah unit *
          <input name="quantity" type="number" min="1" step="1" required inputmode="numeric" placeholder="Misalnya 30" />
        </label>
        <label>Catatan / alasan
          <textarea name="notes" rows="3" maxlength="1000" placeholder="Contoh: stok awal tahun ajaran, faktur pembelian, atau alasan koreksi" style="width:100%;padding:12px 13px;border:1px solid #dce5df;border-radius:9px;font:inherit;font-size:13px;resize:vertical"></textarea>
        </label>
        <div class="notice"><strong>Riwayat stok tidak dihapus</strong><span>Mutasi tersimpan sebagai jejak audit. Untuk koreksi, catat mutasi penyesuaian dengan alasan yang jelas. Pengeluaran penjualan dicatat otomatis saat penjualan dikonfirmasi.</span></div>
        <div id="stock-movement-error" class="error-state" hidden></div>
      </form>`,
    actions: '<button class="button button-primary" id="save-stock-movement" type="submit" form="stock-movement-form">Simpan Mutasi</button>'
  });

  const form = document.querySelector('#stock-movement-form');
  const typeSelect = form.elements.movement_type;
  const context = document.querySelector('#stock-movement-context');
  const errorBox = document.querySelector('#stock-movement-error');
  const saveButton = document.querySelector('#save-stock-movement');

  const syncMovementTypes = () => {
    const book = inventoryData.books.find(item => item.id === form.elements.book_id.value);
    const location = activeLocations.find(item => item.id === form.elements.location_id.value);
    const balance = inventoryData.balances.find(item => item.book_id === book?.id && item.location_id === location?.id);
    const currentQty = Number(balance?.quantity || 0);
    let allowed = [];

    if (book && location) {
      if (book.is_active && (location.location_type !== 'sale' || book.is_for_sale)) {
        allowed = balance
          ? ['purchase_in', 'return_in', ...(currentQty > 0 ? ['return_out', 'adjustment_out'] : []), 'adjustment_in']
          : ['opening', 'purchase_in', 'adjustment_in'];
      } else if (balance && currentQty > 0) {
        // Permit clearing incorrect/legacy stock for inactive or non-sale books, but not adding more.
        allowed = ['return_out', 'adjustment_out'];
      }
    }

    typeSelect.innerHTML = allowed.length
      ? allowed.map(type => `<option value="${type}">${escapeHtml(MOVEMENT_LABELS[type])}</option>`).join('')
      : '<option value="">Tidak ada jenis mutasi yang diizinkan untuk kombinasi ini</option>';
    typeSelect.disabled = !allowed.length;
    const qtyText = balance ? `${currentQty.toLocaleString('id-ID')} unit` : 'belum ada saldo';
    context.textContent = book && location
      ? `Saldo saat ini: ${qtyText}. ${location.location_type === 'sale' ? 'Lokasi ini mengalir ke modul Penjualan.' : 'Lokasi ini terpisah dari stok penjualan.'}`
      : 'Pilih buku dan lokasi untuk melihat jenis mutasi yang sesuai.';
  };

  form.elements.book_id.addEventListener('change', syncMovementTypes);
  form.elements.location_id.addEventListener('change', syncMovementTypes);
  syncMovementTypes();

  form.addEventListener('submit', async event => {
    event.preventDefault();
    const book = inventoryData.books.find(item => item.id === form.elements.book_id.value);
    const location = activeLocations.find(item => item.id === form.elements.location_id.value);
    const movementType = typeSelect.value;
    const quantity = Number(form.elements.quantity.value);
    const notes = form.elements.notes.value.trim();
    const balance = inventoryData.balances.find(item => item.book_id === book?.id && item.location_id === location?.id);
    const currentQty = Number(balance?.quantity || 0);

    if (!book || !location || !movementType) {
      errorBox.textContent = 'Pilih buku, lokasi, dan jenis mutasi yang tersedia.';
      errorBox.hidden = false;
      return;
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      errorBox.textContent = 'Jumlah harus berupa bilangan bulat lebih dari nol.';
      errorBox.hidden = false;
      return;
    }
    if (TYPES_REQUIRING_NOTES.has(movementType) && !notes) {
      errorBox.textContent = 'Catatan/alasan wajib diisi untuk stok awal, retur, dan penyesuaian.';
      errorBox.hidden = false;
      return;
    }
    if (OUTBOUND_TYPES.has(movementType) && quantity > currentQty) {
      errorBox.textContent = `Jumlah keluar melebihi saldo saat ini (${currentQty} unit).`;
      errorBox.hidden = false;
      return;
    }
    if (!allowedMovementTypes(book, location, balance).includes(movementType)) {
      errorBox.textContent = 'Jenis mutasi tidak sesuai dengan kondisi buku dan lokasi. Muat ulang halaman lalu coba lagi.';
      errorBox.hidden = false;
      return;
    }

    const delta = INBOUND_TYPES.has(movementType) ? quantity : -quantity;
    const newQty = currentQty + delta;
    const actionLabel = MOVEMENT_LABELS[movementType] || movementType;
    const confirmation = `Konfirmasi mutasi stok\n\nBuku: ${book.code} — ${book.title}\nLokasi: ${location.name}\nMutasi: ${actionLabel}\nJumlah: ${quantity} unit\nSaldo: ${currentQty} → ${newQty} unit\nCatatan: ${notes || '—'}\n\nMutasi akan masuk ke riwayat dan tidak dihapus. Lanjutkan?`;
    if (!window.confirm(confirmation)) return;

    saveButton.disabled = true;
    saveButton.textContent = 'Menyimpan…';
    errorBox.hidden = true;
    try {
      await recordStockMovement({
        bookId: book.id,
        locationId: location.id,
        movementType,
        quantity,
        notes
      });
      closeModal();
      notify('Mutasi stok berhasil dicatat dan saldo diperbarui.', 'success');
      await onSaved();
    } catch (error) {
      errorBox.textContent = error.message || 'Mutasi stok gagal disimpan.';
      errorBox.hidden = false;
      saveButton.disabled = false;
      saveButton.textContent = 'Simpan Mutasi';
    }
  });
}

function allowedMovementTypes(book, location, balance) {
  const currentQty = Number(balance?.quantity || 0);
  if (!book || !location) return [];
  if (book.is_active && (location.location_type !== 'sale' || book.is_for_sale)) {
    return balance
      ? ['purchase_in', 'return_in', ...(currentQty > 0 ? ['return_out', 'adjustment_out'] : []), 'adjustment_in']
      : ['opening', 'purchase_in', 'adjustment_in'];
  }
  return balance && currentQty > 0 ? ['return_out', 'adjustment_out'] : [];
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
