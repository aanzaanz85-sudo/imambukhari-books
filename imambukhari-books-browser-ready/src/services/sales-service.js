import { supabase } from '../config/supabase.js';
export async function getSalesSummary(year = '2026/2027') {
  const { data, error } = await supabase.from('sales').select('id,total_amount,status,academic_years!inner(name)').eq('academic_years.name', year);
  if (error) throw error;
  const rows = data || [];
  return { count: rows.filter(x => x.status === 'confirmed').length, total: rows.filter(x => x.status === 'confirmed').reduce((sum, row) => sum + Number(row.total_amount || 0), 0) };
}
