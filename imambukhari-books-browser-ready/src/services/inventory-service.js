import { supabase } from '../config/supabase.js';

// Keep this existing helper stable: the dashboard already imports it.
export async function getStockSummary() {
  const { data, error } = await supabase
    .from('stock_balances')
    .select('quantity, inventory_locations!inner(name,location_type), books!inner(title,code,is_active)')
    .eq('books.is_active', true);
  if (error) throw error;
  return data || [];
}

// Returns the canonical inventory entities without renaming database columns.
export async function getInventoryData() {
  const [booksResult, locationsResult, balancesResult] = await Promise.all([
    supabase
      .from('books')
      .select('id,code,title,book_type,is_for_sale,is_active,default_unit_price')
      .order('title', { ascending: true }),
    supabase
      .from('inventory_locations')
      .select('id,name,location_type,is_active')
      .order('name', { ascending: true }),
    supabase
      .from('stock_balances')
      .select('id,book_id,location_id,quantity,updated_at')
      .order('updated_at', { ascending: false })
  ]);

  if (booksResult.error) throw booksResult.error;
  if (locationsResult.error) throw locationsResult.error;
  if (balancesResult.error) throw balancesResult.error;

  const books = booksResult.data || [];
  const locations = locationsResult.data || [];
  const balances = balancesResult.data || [];
  const balanceMap = new Map(balances.map(row => [`${row.book_id}:${row.location_id}`, row]));
  const rows = [];

  for (const book of books) {
    for (const location of locations) {
      const balance = balanceMap.get(`${book.id}:${location.id}`) || null;
      // Show all active book/location pairs (including zero stock), plus historical
      // pairs for inactive books/locations so existing stock is never hidden.
      if ((book.is_active && location.is_active) || balance) {
        rows.push({
          id: balance?.id || `${book.id}:${location.id}`,
          book_id: book.id,
          location_id: location.id,
          book,
          location,
          quantity: balance?.quantity ?? 0,
          updated_at: balance?.updated_at ?? null,
          has_balance_row: Boolean(balance)
        });
      }
    }
  }
  rows.sort((a, b) => {
    const locationCompare = a.location.name.localeCompare(b.location.name, 'id-ID');
    return locationCompare || a.book.title.localeCompare(b.book.title, 'id-ID');
  });
  return { books, locations, balances, rows };
}

export async function getStockMovements(limit = 100) {
  const safeLimit = Number.isInteger(limit) ? Math.max(1, Math.min(limit, 500)) : 100;
  const { data, error } = await supabase
    .from('stock_movements')
    .select('id,book_id,location_id,movement_type,quantity,notes,reference_table,reference_id,created_at,books!inner(code,title,is_active),inventory_locations!inner(name,location_type,is_active)')
    .order('created_at', { ascending: false })
    .limit(safeLimit);
  if (error) throw error;
  return data || [];
}

// Use the database RPC, never insert directly into stock_movements from the UI.
// The database trigger updates stock_balances atomically and rejects negative stock.
export async function recordStockMovement({ bookId, locationId, movementType, quantity, notes = '' }) {
  const { data, error } = await supabase.rpc('record_stock_movement', {
    p_book_id: bookId,
    p_location_id: locationId,
    p_movement_type: movementType,
    p_quantity: quantity,
    p_notes: notes.trim() || null
  });
  if (error) throw error;
  return data;
}
