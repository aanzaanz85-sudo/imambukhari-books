export function renderTable({ columns, rows, emptyMessage = 'Belum ada data.' }) {
  if (!rows.length) return `<div class="empty-state"><div class="empty-icon">▤</div><strong>${emptyMessage}</strong></div>`;
  return `<div class="table-wrap"><table><thead><tr>${columns.map(col => `<th>${col.label}</th>`).join('')}</tr></thead><tbody>${rows.map((row, index) => `<tr>${columns.map(col => `<td>${col.render ? col.render(row, index) : (row[col.key] ?? '—')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
