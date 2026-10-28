import * as XLSX from 'xlsx';

export function exportRowsToXlsx(rows, filename = 'laporan.xlsx', sheetName = 'Data') {
  const sheet = XLSX.utils.json_to_sheet(rows);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName.slice(0, 31));
  XLSX.writeFile(book, filename);
}
