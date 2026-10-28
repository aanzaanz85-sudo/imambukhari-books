import { supabase } from '../config/supabase.js';
export async function getPaymentsSummary() {
  const { data, error } = await supabase.from('payments').select('amount,status').eq('status', 'posted');
  if (error) throw error;
  return (data || []).reduce((sum, row) => sum + Number(row.amount || 0), 0);
}
