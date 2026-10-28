import { supabase } from '../config/supabase.js';

export async function getActiveAcademicYear() {
  const { data, error } = await supabase
    .from('academic_years')
    .select('id,name')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Belum ada tahun ajaran aktif di database.');
  return data;
}

export async function getClassOptions() {
  const { data, error } = await supabase
    .from('classes')
    .select('id,name,grade,section')
    .order('grade', { ascending: true })
    .order('section', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getStudents({ search = '', className = '', year = '', status = 'active' } = {}) {
  const activeYear = year || (await getActiveAcademicYear()).name;
  let query = supabase
    .from('student_enrollments')
    .select('id, student_id, class_id, academic_year_id, enrollment_status, created_at, students!inner(id,full_name,gender,is_active), classes!inner(id,name,grade,section), academic_years!inner(id,name)');
  if (status === 'inactive') {
    // Graduates and transferred students may belong to a prior year, so do not restrict to the active year.
    query = query.eq('students.is_active', false).in('enrollment_status', ['transferred', 'graduated', 'left']);
  } else {
    query = query.eq('academic_years.name', activeYear).eq('enrollment_status', 'active').eq('students.is_active', true);
  }
  if (className) query = query.eq('classes.name', className);
  const { data, error } = await query;
  if (error) throw error;
  let rows = (data || []).map(row => ({
    enrollment_id: row.id,
    enrollment_status: row.enrollment_status,
    enrollment_created_at: row.created_at,
    id: row.students.id,
    full_name: row.students.full_name,
    gender: row.students.gender,
    is_active: row.students.is_active,
    class_name: row.classes.name,
    class_id: row.classes.id,
    grade: row.classes.grade,
    section: row.classes.section,
    academic_year: row.academic_years.name
  }));
  if (status === 'inactive') {
    const latestByStudent = new Map();
    for (const row of rows.sort((a, b) => new Date(b.enrollment_created_at || 0) - new Date(a.enrollment_created_at || 0))) {
      if (!latestByStudent.has(row.id)) latestByStudent.set(row.id, row);
    }
    rows = [...latestByStudent.values()];
  }
  if (search.trim()) {
    const q = search.trim().toLocaleLowerCase('id-ID');
    rows = rows.filter(row => row.full_name.toLocaleLowerCase('id-ID').includes(q));
  }
  rows.sort((a, b) => a.class_name.localeCompare(b.class_name, 'id-ID') || a.full_name.localeCompare(b.full_name, 'id-ID'));
  return rows;
}

export async function createStudent({ fullName, className }) {
  const { data, error } = await supabase.rpc('create_student_record', {
    p_full_name: fullName.trim(),
    p_class_name: className
  });
  if (error) throw error;
  return data;
}

export async function updateStudent({ studentId, fullName }) {
  const { error } = await supabase.rpc('update_student_record', {
    p_student_id: studentId,
    p_full_name: fullName.trim()
  });
  if (error) throw error;
}

export async function transferStudentClass({ studentId, newClassName, reason }) {
  const { error } = await supabase.rpc('transfer_student_class', {
    p_student_id: studentId,
    p_new_class_name: newClassName,
    p_reason: reason.trim()
  });
  if (error) throw error;
}

export async function markStudentDeparture({ studentId, status, reason }) {
  const { error } = await supabase.rpc('mark_student_departure', {
    p_student_id: studentId,
    p_departure_status: status,
    p_reason: reason.trim()
  });
  if (error) throw error;
}

export async function reactivateStudent({ studentId, className, reason }) {
  const { error } = await supabase.rpc('reactivate_student_record', {
    p_student_id: studentId,
    p_class_name: className,
    p_reason: reason.trim()
  });
  if (error) throw error;
}


export async function importStudentsBatch(rows) {
  const { data, error } = await supabase.rpc('import_students_batch', { p_rows: rows });
  if (error) throw error;
  return data;
}

export async function getStudentCounts(year = '') {
  const activeYear = year || (await getActiveAcademicYear()).name;
  const { data, error } = await supabase
    .from('student_enrollments')
    .select('id, students!inner(is_active), classes!inner(name), academic_years!inner(name)')
    .eq('academic_years.name', activeYear)
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
