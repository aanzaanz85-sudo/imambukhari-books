import { supabase } from '../config/supabase.js';

export async function getStudents({ search = '', className = '', year = '2026/2027' } = {}) {
  let query = supabase
    .from('student_enrollments')
    .select('id, student_id, class_id, academic_year_id, students!inner(id,full_name,gender,is_active), classes!inner(id,name,grade,section), academic_years!inner(id,name)')
    .eq('academic_years.name', year)
    .eq('enrollment_status', 'active');
  if (className) query = query.eq('classes.name', className);
  const { data, error } = await query;
  if (error) throw error;
  let rows = (data || []).map(row => ({
    enrollment_id: row.id,
    id: row.students.id,
    full_name: row.students.full_name,
    gender: row.students.gender,
    is_active: row.students.is_active,
    class_name: row.classes.name,
    academic_year: row.academic_years.name
  }));
  if (search.trim()) {
    const q = search.trim().toLocaleLowerCase('id-ID');
    rows = rows.filter(row => row.full_name.toLocaleLowerCase('id-ID').includes(q));
  }
  rows.sort((a, b) => a.full_name.localeCompare(b.full_name, 'id-ID'));
  return rows;
}

export async function getStudentCounts(year = '2026/2027') {
  const { data, error } = await supabase
    .from('student_enrollments')
    .select('id, students!inner(is_active), classes!inner(name), academic_years!inner(name)')
    .eq('academic_years.name', year)
    .eq('enrollment_status', 'active')
    .eq('students.is_active', true);
  if (error) throw error;
  const counts = { total: data?.length || 0, classes: new Set((data || []).map(r => r.classes.name)).size };
  return counts;
}

export async function getBookCount() {
  const { count, error } = await supabase.from('books').select('id', { count: 'exact', head: true }).eq('is_active', true);
  if (error) throw error;
  return count || 0;
}
