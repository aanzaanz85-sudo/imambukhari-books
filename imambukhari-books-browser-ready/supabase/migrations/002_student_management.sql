-- Migration 002: tambah/edit siswa, mutasi kelas, dan pencatatan siswa keluar.
-- Jalankan SEKALI di Supabase SQL Editor setelah 001_initial_schema.sql diterapkan.
-- Tidak menghapus data. Mengganti pembatasan satu pendaftaran per tahun menjadi satu pendaftaran AKTIF per siswa/tahun,
-- sehingga riwayat kelas sebelumnya dapat dipertahankan ketika siswa dimutasi.

alter table public.student_enrollments
  drop constraint if exists student_enrollments_student_id_academic_year_id_key;

alter table public.student_enrollments
  drop constraint if exists student_enrollments_enrollment_status_check;
alter table public.student_enrollments
  add constraint student_enrollments_enrollment_status_check
  check (enrollment_status in ('active','class_changed','transferred','graduated','left'));

create unique index if not exists student_enrollments_one_active_per_year_idx
  on public.student_enrollments (student_id, academic_year_id)
  where enrollment_status = 'active';

create or replace function public.create_student_record(
  p_full_name text,
  p_class_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id uuid;
  v_class_id uuid;
  v_section char(1);
  v_gender text;
  v_year_id uuid;
  v_year_name text;
  v_name text := trim(coalesce(p_full_name, ''));
  v_class_name text := upper(trim(coalesce(p_class_name, '')));
begin
  if not public.user_has_role(array['kepsek','tu']) then
    raise exception 'Akses ditolak. Hanya TU dan Kepsek dapat menambah siswa.';
  end if;
  if v_name = '' then raise exception 'Nama siswa wajib diisi.'; end if;
  if length(v_name) > 160 then raise exception 'Nama siswa maksimal 160 karakter.'; end if;

  select c.id, c.section into v_class_id, v_section
  from public.classes c where upper(c.name) = v_class_name;
  if not found then raise exception 'Kelas % tidak ditemukan.', v_class_name; end if;
  v_gender := case when v_section = 'B' then 'Perempuan' else 'Laki-laki' end;

  select y.id, y.name into v_year_id, v_year_name
  from public.academic_years y where y.is_active = true
  order by y.created_at desc limit 1;
  if not found then raise exception 'Belum ada tahun ajaran aktif.'; end if;

  if exists (
    select 1 from public.students s
    join public.student_enrollments e on e.student_id = s.id
    where e.academic_year_id = v_year_id
      and e.enrollment_status = 'active'
      and lower(trim(s.full_name)) = lower(v_name)
      and s.is_active = true
  ) then
    raise exception 'Nama siswa ini sudah ada pada daftar aktif. Periksa data terlebih dahulu sebelum menambah.';
  end if;

  insert into public.students (full_name, gender, is_active)
  values (v_name, v_gender, true)
  returning id into v_student_id;

  insert into public.student_enrollments (student_id, class_id, academic_year_id, enrollment_status)
  values (v_student_id, v_class_id, v_year_id, 'active');

  insert into public.activity_logs (actor_id, action, entity_type, entity_id, reason, details)
  values (auth.uid(), 'student_created', 'student', v_student_id, 'Tambah siswa',
    jsonb_build_object('full_name', v_name, 'class_name', v_class_name, 'gender', v_gender, 'academic_year', v_year_name));

  return v_student_id;
end;
$$;

create or replace function public.update_student_record(
  p_student_id uuid,
  p_full_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := trim(coalesce(p_full_name, ''));
  v_old_name text;
begin
  if not public.user_has_role(array['kepsek','tu']) then
    raise exception 'Akses ditolak. Hanya TU dan Kepsek dapat mengedit siswa.';
  end if;
  if p_student_id is null then raise exception 'ID siswa tidak valid.'; end if;
  if v_name = '' then raise exception 'Nama siswa wajib diisi.'; end if;
  if length(v_name) > 160 then raise exception 'Nama siswa maksimal 160 karakter.'; end if;

  select s.full_name into v_old_name from public.students s where s.id = p_student_id for update;
  if not found then raise exception 'Siswa tidak ditemukan.'; end if;

  if exists (
    select 1 from public.students s
    where s.id <> p_student_id and s.is_active = true
      and lower(trim(s.full_name)) = lower(v_name)
  ) then
    raise exception 'Nama yang sama sudah digunakan siswa aktif lain. Periksa sebelum menyimpan.';
  end if;

  update public.students set full_name = v_name, updated_at = now() where id = p_student_id;
  insert into public.activity_logs (actor_id, action, entity_type, entity_id, reason, details)
  values (auth.uid(), 'student_updated', 'student', p_student_id, 'Edit nama siswa',
    jsonb_build_object('old_full_name', v_old_name, 'new_full_name', v_name));
end;
$$;

create or replace function public.transfer_student_class(
  p_student_id uuid,
  p_new_class_name text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enrollment_id uuid;
  v_old_class_id uuid;
  v_old_class_name text;
  v_old_grade smallint;
  v_new_class_id uuid;
  v_new_class_name text := upper(trim(coalesce(p_new_class_name, '')));
  v_new_grade smallint;
  v_new_section char(1);
  v_year_id uuid;
  v_student_gender text;
  v_expected_gender text;
  v_reason text := trim(coalesce(p_reason, ''));
begin
  if not public.user_has_role(array['kepsek','tu']) then
    raise exception 'Akses ditolak. Hanya TU dan Kepsek dapat memutasi siswa.';
  end if;
  if v_reason = '' then raise exception 'Alasan mutasi wajib diisi.'; end if;

  select y.id into v_year_id from public.academic_years y
  where y.is_active = true order by y.created_at desc limit 1;
  if v_year_id is null then raise exception 'Belum ada tahun ajaran aktif.'; end if;

  select e.id, c.id, c.name, c.grade, s.gender
  into v_enrollment_id, v_old_class_id, v_old_class_name, v_old_grade, v_student_gender
  from public.student_enrollments e
  join public.classes c on c.id = e.class_id
  join public.students s on s.id = e.student_id
  where e.student_id = p_student_id and e.academic_year_id = v_year_id
    and e.enrollment_status = 'active' and s.is_active = true
  for update of e;
  if not found then raise exception 'Pendaftaran siswa aktif pada tahun ajaran ini tidak ditemukan.'; end if;

  select c.id, c.grade, c.section into v_new_class_id, v_new_grade, v_new_section
  from public.classes c where upper(c.name) = v_new_class_name;
  if not found then raise exception 'Kelas tujuan tidak ditemukan.'; end if;
  if v_new_class_id = v_old_class_id then raise exception 'Kelas tujuan sama dengan kelas saat ini.'; end if;
  if v_new_grade <> v_old_grade then
    raise exception 'Mutasi kelas hanya untuk tingkat yang sama. Kenaikan kelas dilakukan pada pengaturan tahun ajaran.';
  end if;
  v_expected_gender := case when v_new_section = 'B' then 'Perempuan' else 'Laki-laki' end;
  if v_student_gender <> v_expected_gender then
    raise exception 'Kelas tujuan tidak sesuai dengan pembagian gender sekolah.';
  end if;

  update public.student_enrollments set enrollment_status = 'class_changed'
  where id = v_enrollment_id;
  insert into public.student_enrollments (student_id, class_id, academic_year_id, enrollment_status)
  values (p_student_id, v_new_class_id, v_year_id, 'active');

  insert into public.activity_logs (actor_id, action, entity_type, entity_id, reason, details)
  values (auth.uid(), 'student_class_transferred', 'student', p_student_id, v_reason,
    jsonb_build_object('from_class', v_old_class_name, 'to_class', v_new_class_name, 'academic_year_id', v_year_id));
end;
$$;

create or replace function public.mark_student_departure(
  p_student_id uuid,
  p_departure_status text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enrollment_id uuid;
  v_year_id uuid;
  v_name text;
  v_reason text := trim(coalesce(p_reason, ''));
begin
  if not public.user_has_role(array['kepsek','tu']) then
    raise exception 'Akses ditolak. Hanya TU dan Kepsek dapat memperbarui status siswa.';
  end if;
  if p_departure_status not in ('transferred','left','graduated') then
    raise exception 'Status akhir tidak valid.';
  end if;
  if v_reason = '' then raise exception 'Alasan/keterangan wajib diisi.'; end if;

  select y.id into v_year_id from public.academic_years y
  where y.is_active = true order by y.created_at desc limit 1;
  if v_year_id is null then raise exception 'Belum ada tahun ajaran aktif.'; end if;

  select e.id, s.full_name into v_enrollment_id, v_name
  from public.student_enrollments e
  join public.students s on s.id = e.student_id
  where e.student_id = p_student_id and e.academic_year_id = v_year_id
    and e.enrollment_status = 'active' and s.is_active = true
  for update of e;
  if not found then raise exception 'Pendaftaran aktif siswa tidak ditemukan.'; end if;

  update public.student_enrollments set enrollment_status = p_departure_status where id = v_enrollment_id;
  update public.students set is_active = false, updated_at = now() where id = p_student_id;

  insert into public.activity_logs (actor_id, action, entity_type, entity_id, reason, details)
  values (auth.uid(), 'student_departure_marked', 'student', p_student_id, v_reason,
    jsonb_build_object('full_name', v_name, 'departure_status', p_departure_status, 'academic_year_id', v_year_id));
end;
$$;

revoke all on function public.create_student_record(text,text) from public, anon;
revoke all on function public.update_student_record(uuid,text) from public, anon;
revoke all on function public.transfer_student_class(uuid,text,text) from public, anon;
revoke all on function public.mark_student_departure(uuid,text,text) from public, anon;
grant execute on function public.create_student_record(text,text) to authenticated;
grant execute on function public.update_student_record(uuid,text) to authenticated;
grant execute on function public.transfer_student_class(uuid,text,text) to authenticated;
grant execute on function public.mark_student_departure(uuid,text,text) to authenticated;


create or replace function public.reactivate_student_record(
  p_student_id uuid,
  p_class_name text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_class_id uuid;
  v_section char(1);
  v_gender text;
  v_year_id uuid;
  v_name text := upper(trim(coalesce(p_class_name, '')));
  v_reason text := trim(coalesce(p_reason, ''));
  v_student_name text;
  v_is_active boolean;
  v_expected_gender text;
begin
  if not public.user_has_role(array['kepsek','tu']) then
    raise exception 'Akses ditolak. Hanya TU dan Kepsek dapat mengaktifkan kembali siswa.';
  end if;
  if v_reason = '' then raise exception 'Alasan pengaktifan kembali wajib diisi.'; end if;

  select s.full_name, s.gender, s.is_active
  into v_student_name, v_gender, v_is_active
  from public.students s where s.id = p_student_id for update;
  if not found then raise exception 'Siswa tidak ditemukan.'; end if;
  if v_is_active then raise exception 'Siswa ini masih berstatus aktif.'; end if;

  select c.id, c.section into v_class_id, v_section
  from public.classes c where upper(c.name) = v_name;
  if not found then raise exception 'Kelas tujuan tidak ditemukan.'; end if;
  v_expected_gender := case when v_section = 'B' then 'Perempuan' else 'Laki-laki' end;
  if v_gender <> v_expected_gender then
    raise exception 'Kelas tujuan tidak sesuai dengan gender siswa.';
  end if;

  select y.id into v_year_id from public.academic_years y
  where y.is_active = true order by y.created_at desc limit 1;
  if v_year_id is null then raise exception 'Belum ada tahun ajaran aktif.'; end if;
  if exists (
    select 1 from public.student_enrollments e
    where e.student_id = p_student_id and e.academic_year_id = v_year_id
      and e.enrollment_status = 'active'
  ) then raise exception 'Siswa sudah memiliki pendaftaran aktif pada tahun ajaran ini.'; end if;

  update public.students set is_active = true, updated_at = now() where id = p_student_id;
  insert into public.student_enrollments (student_id, class_id, academic_year_id, enrollment_status)
  values (p_student_id, v_class_id, v_year_id, 'active');

  insert into public.activity_logs (actor_id, action, entity_type, entity_id, reason, details)
  values (auth.uid(), 'student_reactivated', 'student', p_student_id, v_reason,
    jsonb_build_object('full_name', v_student_name, 'class_name', v_name, 'academic_year_id', v_year_id));
end;
$$;

revoke all on function public.reactivate_student_record(uuid,text,text) from public, anon;
grant execute on function public.reactivate_student_record(uuid,text,text) to authenticated;
