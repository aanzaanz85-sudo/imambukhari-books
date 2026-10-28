-- Migration 003: impor siswa massal dan proses tahun ajaran baru.
-- Jalankan SEKALI di Supabase SQL Editor, setelah migration 001 dan 002.
-- Import menerima full_name, class_name, gender, academic_year per baris; aplikasi mengisi gender otomatis dari kelas.

create or replace function public.import_students_batch(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_name text;
  v_class_name text;
  v_gender text;
  v_row_year text;
  v_year_name text;
  v_year_id uuid;
  v_class_id uuid;
  v_student_id uuid;
  v_section text;
  v_grade integer;
  v_expected_gender text;
  v_match_count integer;
  v_existing_class uuid;
  v_existing_status text;
  v_inserted integer := 0;
  v_skipped integer := 0;
  v_total integer;
begin
  if not public.user_has_role(array['kepsek','tu']) then
    raise exception 'Akses ditolak: hanya TU/Kepsek yang boleh mengimpor siswa.';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Data impor harus berupa daftar/array.';
  end if;
  v_total := jsonb_array_length(p_rows);
  if v_total < 1 then raise exception 'File tidak berisi data siswa.'; end if;
  if v_total > 1000 then raise exception 'Maksimal 1000 siswa per proses impor.'; end if;

  select y.id, y.name into v_year_id, v_year_name
  from public.academic_years y
  where y.is_active = true
  order by y.created_at desc limit 1;
  if v_year_id is null then raise exception 'Belum ada tahun ajaran aktif.'; end if;

  -- Validasi seluruh file sebelum menambah data.
  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_name := btrim(coalesce(v_row->>'full_name',''));
    v_class_name := upper(btrim(coalesce(v_row->>'class_name','')));
    v_gender := btrim(coalesce(v_row->>'gender',''));
    v_row_year := btrim(coalesce(v_row->>'academic_year',''));
    if v_name = '' or length(v_name) > 160 or v_class_name !~ '^[1-6][ABC]$' then
      raise exception 'Ada baris tidak valid: nama wajib dan kelas harus 1A sampai 6C.';
    end if;
    if v_row_year <> '' and v_row_year <> v_year_name then
      raise exception 'Tahun ajaran di file (%) berbeda dari tahun ajaran aktif (%).', v_row_year, v_year_name;
    end if;
    v_section := right(v_class_name, 1);
    v_expected_gender := case when v_section = 'B' then 'Perempuan' else 'Laki-laki' end;
    if v_gender <> v_expected_gender then
      raise exception 'Gender tidak sesuai aturan kelas: % (%). Seharusnya %.', v_name, v_class_name, v_expected_gender;
    end if;
  end loop;

  if exists (
    select 1
    from jsonb_array_elements(p_rows) as x(value)
    group by lower(btrim(coalesce(x.value->>'full_name','')))
    having count(*) > 1
  ) then
    raise exception 'Ada nama duplikat di dalam file impor. Periksa file sebelum mencoba lagi.';
  end if;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_name := btrim(v_row->>'full_name');
    v_class_name := upper(btrim(v_row->>'class_name'));
    v_gender := btrim(v_row->>'gender');
    v_grade := substring(v_class_name from 1 for 1)::integer;
    v_section := right(v_class_name, 1);

    insert into public.classes (name, grade, section)
    values (v_class_name, v_grade, v_section)
    on conflict (name) do nothing;
    select c.id into v_class_id from public.classes c where c.name = v_class_name;

    select count(*), min(s.id::text)::uuid
    into v_match_count, v_student_id
    from public.students s
    where lower(btrim(s.full_name)) = lower(v_name) and s.gender = v_gender;

    if v_match_count > 1 then
      raise exception 'Nama % cocok dengan lebih dari satu siswa. Perlu pemeriksaan manual.', v_name;
    elsif v_match_count = 1 then
      select e.class_id, e.enrollment_status into v_existing_class, v_existing_status
      from public.student_enrollments e
      where e.student_id = v_student_id and e.academic_year_id = v_year_id
      order by e.created_at desc limit 1;

      if found then
        if v_existing_status = 'active' and v_existing_class = v_class_id then
          v_skipped := v_skipped + 1;
          continue;
        else
          raise exception 'Siswa % sudah mempunyai pendaftaran pada tahun ajaran aktif. Periksa data secara manual.', v_name;
        end if;
      end if;

      -- Jangan otomatis menyatukan nama yang sama dengan siswa dari tahun ajaran lama.
      raise exception 'Nama % sudah ada di database pada tahun ajaran lain. Gunakan data siswa yang ada atau periksa identitas sebelum mengimpor.', v_name;
    else
      insert into public.students (full_name, gender, is_active)
      values (v_name, v_gender, true)
      returning id into v_student_id;

      insert into public.student_enrollments (student_id, class_id, academic_year_id, enrollment_status)
      values (v_student_id, v_class_id, v_year_id, 'active');
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  insert into public.activity_logs (actor_id, action, entity_type, details)
  values (auth.uid(), 'bulk_import', 'students', jsonb_build_object(
    'academic_year', v_year_name, 'rows', v_total, 'inserted', v_inserted, 'skipped', v_skipped
  ));

  return jsonb_build_object('total', v_total, 'inserted', v_inserted, 'skipped', v_skipped, 'academic_year', v_year_name);
end;
$$;

revoke all on function public.import_students_batch(jsonb) from public, anon;
grant execute on function public.import_students_batch(jsonb) to authenticated;

create or replace function public.rollover_academic_year(
  p_new_year_name text,
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_year_id uuid;
  v_old_year_name text;
  v_new_year_id uuid;
  v_new_start integer;
  v_promoted integer := 0;
  v_graduated integer := 0;
  r record;
  v_new_class_name text;
  v_new_class_id uuid;
  v_new_grade integer;
  v_new_year_name text := btrim(coalesce(p_new_year_name,''));
begin
  if not public.user_has_role(array['kepsek']) then
    raise exception 'Hanya Kepala Sekolah yang boleh memproses tahun ajaran baru.';
  end if;
  if v_new_year_name !~ '^[0-9]{4}/[0-9]{4}$' then
    raise exception 'Format tahun ajaran harus YYYY/YYYY, contoh 2027/2028.';
  end if;
  v_new_start := split_part(v_new_year_name, '/', 1)::integer;
  if split_part(v_new_year_name, '/', 2)::integer <> v_new_start + 1 then
    raise exception 'Tahun ajaran harus berurutan, contoh 2027/2028.';
  end if;
  if coalesce(p_confirmation,'') <> ('PROSES ' || v_new_year_name) then
    raise exception 'Konfirmasi tidak cocok. Ketik persis: PROSES %', v_new_year_name;
  end if;

  select y.id, y.name into v_old_year_id, v_old_year_name
  from public.academic_years y
  where y.is_active = true order by y.created_at desc limit 1
  for update;
  if v_old_year_id is null then raise exception 'Tidak ada tahun ajaran aktif.'; end if;
  if v_new_year_name = v_old_year_name then raise exception 'Tahun tujuan sama dengan tahun ajaran aktif.'; end if;
  if split_part(v_old_year_name, '/', 1) !~ '^[0-9]{4}$'
     or split_part(v_old_year_name, '/', 2) !~ '^[0-9]{4}$' then
    raise exception 'Nama tahun ajaran aktif tidak memakai format YYYY/YYYY.';
  end if;
  if split_part(v_new_year_name, '/', 1)::integer <> split_part(v_old_year_name, '/', 1)::integer + 1 then
    raise exception 'Tahun tujuan harus satu tahun setelah tahun aktif (%).', v_old_year_name;
  end if;

  if not exists (
    select 1 from public.student_enrollments e
    join public.students s on s.id = e.student_id
    where e.academic_year_id = v_old_year_id and e.enrollment_status = 'active' and s.is_active = true
  ) then
    raise exception 'Tidak ada pendaftaran siswa aktif pada tahun ajaran saat ini.';
  end if;

  insert into public.academic_years (name, is_active)
  values (v_new_year_name, false)
  on conflict (name) do nothing;
  select y.id into v_new_year_id from public.academic_years y where y.name = v_new_year_name;

  for r in
    select e.id as enrollment_id, e.student_id, e.class_id, c.name as old_class_name,
           c.grade, c.section, s.full_name, s.gender
    from public.student_enrollments e
    join public.classes c on c.id = e.class_id
    join public.students s on s.id = e.student_id
    where e.academic_year_id = v_old_year_id
      and e.enrollment_status = 'active'
      and s.is_active = true
    order by c.grade, c.section, s.full_name
    for update of e, s
  loop
    if r.grade = 6 then
      update public.student_enrollments
      set enrollment_status = 'graduated'
      where id = r.enrollment_id;
      update public.students set is_active = false, updated_at = now() where id = r.student_id;
      v_graduated := v_graduated + 1;
    else
      v_new_grade := r.grade + 1;
      v_new_class_name := v_new_grade::text || r.section;
      insert into public.classes (name, grade, section)
      values (v_new_class_name, v_new_grade, r.section)
      on conflict (name) do nothing;
      select c.id into v_new_class_id from public.classes c where c.name = v_new_class_name;

      if exists (
        select 1 from public.student_enrollments e
        where e.student_id = r.student_id and e.academic_year_id = v_new_year_id
          and e.enrollment_status = 'active' and e.class_id <> v_new_class_id
      ) then
        raise exception 'Siswa % sudah terdaftar pada kelas lain di tahun tujuan.', r.full_name;
      end if;

      insert into public.student_enrollments (student_id, class_id, academic_year_id, enrollment_status)
      values (r.student_id, v_new_class_id, v_new_year_id, 'active')
      on conflict do nothing;
      v_promoted := v_promoted + case when found then 1 else 0 end;
    end if;
  end loop;

  update public.academic_years set is_active = false where id = v_old_year_id;
  update public.academic_years set is_active = true where id = v_new_year_id;

  insert into public.activity_logs (actor_id, action, entity_type, reason, details)
  values (auth.uid(), 'academic_year_rollover', 'academic_year',
    'Kenaikan kelas dan kelulusan tahunan',
    jsonb_build_object('from_year', v_old_year_name, 'to_year', v_new_year_name,
                       'promoted', v_promoted, 'graduated', v_graduated));

  return jsonb_build_object('from_year', v_old_year_name, 'to_year', v_new_year_name,
                            'promoted', v_promoted, 'graduated', v_graduated);
end;
$$;

revoke all on function public.rollover_academic_year(text,text) from public, anon;
grant execute on function public.rollover_academic_year(text,text) to authenticated;
