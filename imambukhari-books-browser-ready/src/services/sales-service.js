import { supabase } from '../config/supabase.js';
import { getActiveAcademicYear } from './student-service.js';

export async function getSalesSummary(year) {
  // Default to the active academic year in Supabase; callers can pass a year for historical reports.
  const targetYear = year || (await getActiveAcademicYear()).name;
  const { data, error } = await supabase
    .from('sales')
    .select('id,total_amount,status,academic_years!inner(name)')
    .eq('academic_years.name', targetYear);
  if (error) throw error;
  const rows = data || [];
  const confirmed = rows.filter(row => row.status === 'confirmed');
  return {
    count: confirmed.length,
    total: confirmed.reduce((sum, row) => sum + Number(row.total_amount || 0), 0)
  };
}
