import { supabase } from '../config/supabase.js';
export async function getStockSummary() {
  const { data, error } = await supabase.from('stock_balances').select('quantity, inventory_locations!inner(name,location_type), books!inner(title,code,is_active)').eq('books.is_active', true);
  if (error) throw error;
  return data || [];
}
