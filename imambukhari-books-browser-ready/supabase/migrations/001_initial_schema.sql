-- SD Islam Imam Bukhari: inventaris dan penjualan buku
-- Jalankan di Supabase SQL Editor sebagai pemilik proyek. Uji dahulu pada proyek staging.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role text not null default 'tu' check (role in ('kepsek', 'tu')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.academic_years (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  starts_on date,
  ends_on date,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  grade smallint not null check (grade between 1 and 6),
  section char(1) not null check (section in ('A','B','C')),
  created_at timestamptz not null default now(),
  unique (grade, section)
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(trim(full_name)) > 0),
  gender text not null check (gender in ('Laki-laki', 'Perempuan')),
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists students_full_name_idx on public.students (lower(full_name));

create table if not exists public.student_enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  class_id uuid not null references public.classes(id) on delete restrict,
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  enrollment_status text not null default 'active'
    check (enrollment_status in ('active','transferred','graduated','left')),
  created_at timestamptz not null default now(),
  unique (student_id, academic_year_id)
);
create index if not exists student_enrollments_class_year_idx
  on public.student_enrollments (class_id, academic_year_id);

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null check (length(trim(title)) > 0),
  book_type text not null check (book_type in ('student_textbook','teacher_book','library_book','school_owned','other')),
  is_for_sale boolean not null default false,
  default_unit_price numeric(14,2) not null default 0 check (default_unit_price >= 0),
  publisher text,
  publication_year integer,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists books_title_idx on public.books (lower(title));

create table if not exists public.inventory_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  location_type text not null check (location_type in ('sale','school_asset')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.stock_balances (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete restrict,
  location_id uuid not null references public.inventory_locations(id) on delete restrict,
  quantity integer not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  unique (book_id, location_id)
);

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete restrict,
  location_id uuid not null references public.inventory_locations(id) on delete restrict,
  movement_type text not null check (movement_type in
    ('opening','purchase_in','sale_out','return_in','return_out','adjustment_in','adjustment_out')),
  quantity integer not null check (quantity > 0),
  notes text,
  reference_table text,
  reference_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists stock_movements_book_date_idx
  on public.stock_movements (book_id, created_at desc);

create table if not exists public.bundles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  class_id uuid not null references public.classes(id) on delete restrict,
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  bundle_price numeric(14,2) not null check (bundle_price >= 0),
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, class_id, academic_year_id)
);

create table if not exists public.bundle_items (
  id uuid primary key default gen_random_uuid(),
  bundle_id uuid not null references public.bundles(id) on delete cascade,
  book_id uuid not null references public.books(id) on delete restrict,
  quantity integer not null default 1 check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  created_at timestamptz not null default now(),
  unique (bundle_id, book_id)
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  invoice_no text not null unique default ('INV-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  student_id uuid not null references public.students(id) on delete restrict,
  enrollment_id uuid references public.student_enrollments(id) on delete restrict,
  academic_year_id uuid not null references public.academic_years(id) on delete restrict,
  bundle_id uuid references public.bundles(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft','confirmed','cancelled')),
  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  notes text,
  sold_at timestamptz not null default now(),
  confirmed_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (total_amount <= subtotal)
);
create index if not exists sales_student_year_idx on public.sales (student_id, academic_year_id);
create index if not exists sales_status_date_idx on public.sales (status, sold_at desc);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete restrict,
  book_id uuid not null references public.books(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  line_total numeric(14,2) generated always as (quantity * unit_price) stored,
  bundle_item_id uuid references public.bundle_items(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (sale_id, book_id)
);
create index if not exists sale_items_sale_idx on public.sale_items (sale_id);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  payment_method text not null check (payment_method in ('cash','transfer')),
  amount numeric(14,2) not null check (amount > 0),
  paid_at timestamptz not null default now(),
  reference_number text,
  notes text,
  status text not null default 'posted' check (status in ('posted','voided')),
  recorded_by uuid references public.profiles(id) on delete set null,
  voided_by uuid references public.profiles(id) on delete set null,
  voided_at timestamptz,
  void_reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete restrict,
  sale_id uuid not null references public.sales(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);
create index if not exists payment_allocations_sale_idx on public.payment_allocations (sale_id);

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  reason text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Common helpers. These functions are SECURITY DEFINER so RLS can safely check profile records.
create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active = true
  );
$$;

create or replace function public.user_has_role(required_roles text[])
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active = true and p.role = any(required_roles)
  );
$$;

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
             nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
             'Pengguna'),
    'tu'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute procedure public.handle_new_auth_user();

-- Stock balances are maintained only through immutable movement rows.
create or replace function public.apply_stock_movement()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_delta integer;
begin
  v_delta := case
    when new.movement_type in ('opening','purchase_in','return_in','adjustment_in') then new.quantity
    when new.movement_type in ('sale_out','return_out','adjustment_out') then -new.quantity
    else 0
  end;

  insert into public.stock_balances (book_id, location_id, quantity, updated_at)
  values (new.book_id, new.location_id, v_delta, now())
  on conflict (book_id, location_id)
  do update set
    quantity = stock_balances.quantity + excluded.quantity,
    updated_at = now()
  where stock_balances.quantity + excluded.quantity >= 0;

  if not found then
    raise exception 'Stok tidak cukup atau mutasi menghasilkan stok negatif.';
  end if;
  return new;
end;
$$;

drop trigger if exists stock_movement_updates_balance on public.stock_movements;
create trigger stock_movement_updates_balance
after insert on public.stock_movements
for each row execute procedure public.apply_stock_movement();

create or replace function public.import_students_batch(p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_row jsonb;
  v_name text;
  v_class_name text;
  v_gender text;
  v_year_name text;
  v_expected_gender text;
  v_grade integer;
  v_section text;
  v_year_id uuid;
  v_class_id uuid;
  v_student_id uuid;
  v_matches integer;
  v_inserted integer := 0;
  v_skipped integer := 0;
begin
  if not public.user_has_role(array['kepsek','tu']) then
    raise exception 'Akses ditolak: hanya TU/Kepsek yang boleh mengimpor siswa.';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Data impor harus berupa array yang tidak kosong.';
  end if;

  -- Validate all records before changing data.
  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_name := btrim(coalesce(v_row->>'full_name',''));
    v_class_name := upper(btrim(coalesce(v_row->>'class_name','')));
    v_gender := btrim(coalesce(v_row->>'gender',''));
    v_year_name := btrim(coalesce(v_row->>'academic_year',''));
    if v_name = '' or v_year_name = '' or v_class_name !~ '^[1-6][ABC]$' then
      raise exception 'Ada baris tidak valid: nama, tahun ajaran, dan kelas 1A-6C wajib diisi.';
    end if;
    v_section := right(v_class_name,1);
    v_expected_gender := case when v_section = 'B' then 'Perempuan' else 'Laki-laki' end;
    if v_gender <> v_expected_gender then
      raise exception 'Gender tidak sesuai aturan kelas pada data % (%): seharusnya %.',
        v_name, v_class_name, v_expected_gender;
    end if;
  end loop;

  for v_row in select value from jsonb_array_elements(p_rows)
  loop
    v_name := btrim(v_row->>'full_name');
    v_class_name := upper(btrim(v_row->>'class_name'));
    v_gender := btrim(v_row->>'gender');
    v_year_name := btrim(v_row->>'academic_year');
    v_grade := substring(v_class_name from 1 for 1)::integer;
    v_section := right(v_class_name,1);

    insert into public.academic_years (name, is_active)
    values (v_year_name, v_year_name = '2026/2027')
    on conflict (name) do nothing;
    select id into v_year_id from public.academic_years where name = v_year_name;

    insert into public.classes (name, grade, section)
    values (v_class_name, v_grade, v_section)
    on conflict (name) do nothing;
    select id into v_class_id from public.classes where name = v_class_name;

    -- Idempotent for re-importing the same exact student/class/year row.
    select count(*), min(s.id::text)::uuid
      into v_matches, v_student_id
      from public.students s
      join public.student_enrollments e on e.student_id = s.id
      where lower(btrim(s.full_name)) = lower(v_name)
        and s.gender = v_gender
        and e.class_id = v_class_id
        and e.academic_year_id = v_year_id;

    if v_matches = 1 then
      v_skipped := v_skipped + 1;
    elsif v_matches > 1 then
      raise exception 'Data ambigu: lebih dari satu siswa cocok dengan nama % di kelas %.', v_name, v_class_name;
    else
      insert into public.students (full_name, gender)
      values (v_name, v_gender)
      returning id into v_student_id;

      insert into public.student_enrollments (student_id, class_id, academic_year_id)
      values (v_student_id, v_class_id, v_year_id);
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  insert into public.activity_logs (actor_id, action, entity_type, details)
  values (auth.uid(), 'import', 'students', jsonb_build_object(
    'rows', jsonb_array_length(p_rows), 'inserted', v_inserted, 'skipped', v_skipped
  ));

  return jsonb_build_object('inserted', v_inserted, 'skipped', v_skipped, 'total', jsonb_array_length(p_rows));
end;
$$;

create or replace function public.record_stock_movement(
  p_book_id uuid,
  p_location_id uuid,
  p_movement_type text,
  p_quantity integer,
  p_notes text default null
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_location_type text;
begin
  if not public.user_has_role(array['kepsek','tu']) then
    raise exception 'Akses ditolak.';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Jumlah mutasi harus lebih dari nol.';
  end if;
  if p_movement_type not in ('opening','purchase_in','return_in','return_out','adjustment_in','adjustment_out') then
    raise exception 'Jenis mutasi tidak diperbolehkan melalui formulir stok.';
  end if;
  select location_type into v_location_type
    from public.inventory_locations where id = p_location_id and is_active = true;
  if v_location_type is null then raise exception 'Lokasi stok tidak ditemukan atau tidak aktif.'; end if;

  insert into public.stock_movements(book_id, location_id, movement_type, quantity, notes, created_by)
  values (p_book_id, p_location_id, p_movement_type, p_quantity, nullif(trim(p_notes), ''), auth.uid())
  returning id into v_id;

  insert into public.activity_logs (actor_id, action, entity_type, entity_id, reason, details)
  values (auth.uid(), 'stock_movement', 'stock_movements', v_id, p_notes,
          jsonb_build_object('book_id', p_book_id, 'location_id', p_location_id,
                             'movement_type', p_movement_type, 'quantity', p_quantity,
                             'location_type', v_location_type));
  return v_id;
end;
$$;

create or replace function public.confirm_sale(p_sale_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_sale public.sales%rowtype;
  v_location_id uuid;
  v_item record;
  v_subtotal numeric(14,2);
begin
  if not public.user_has_role(array['kepsek','tu']) then raise exception 'Akses ditolak.'; end if;
  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then raise exception 'Transaksi tidak ditemukan.'; end if;
  if v_sale.status <> 'draft' then raise exception 'Hanya transaksi draft yang dapat dikonfirmasi.'; end if;

  select id into v_location_id from public.inventory_locations
    where location_type = 'sale' and is_active = true
    order by created_at limit 1;
  if v_location_id is null then raise exception 'Lokasi Stok Penjualan belum dibuat.'; end if;

  select coalesce(sum(quantity * unit_price), 0) into v_subtotal
  from public.sale_items where sale_id = p_sale_id;
  if v_subtotal <= 0 then raise exception 'Transaksi belum memiliki rincian buku.'; end if;
  if v_sale.discount_amount > v_subtotal then raise exception 'Diskon tidak boleh melebihi subtotal.'; end if;

  for v_item in
    select si.book_id, si.quantity, b.title, b.is_for_sale
    from public.sale_items si join public.books b on b.id = si.book_id
    where si.sale_id = p_sale_id
  loop
    if not v_item.is_for_sale then
      raise exception 'Buku "%" tidak ditandai untuk dijual.', v_item.title;
    end if;
    insert into public.stock_movements(book_id, location_id, movement_type, quantity,
                                       notes, reference_table, reference_id, created_by)
    values (v_item.book_id, v_location_id, 'sale_out', v_item.quantity,
            'Penjualan ' || v_sale.invoice_no, 'sales', p_sale_id, auth.uid());
  end loop;

  update public.sales
  set subtotal = v_subtotal,
      total_amount = v_subtotal - v_sale.discount_amount,
      status = 'confirmed',
      confirmed_at = now(),
      updated_at = now()
  where id = p_sale_id;

  insert into public.activity_logs (actor_id, action, entity_type, entity_id, details)
  values (auth.uid(), 'confirm', 'sales', p_sale_id,
          jsonb_build_object('invoice_no', v_sale.invoice_no, 'subtotal', v_subtotal,
                             'discount', v_sale.discount_amount, 'total', v_subtotal - v_sale.discount_amount));

  return jsonb_build_object('sale_id', p_sale_id, 'invoice_no', v_sale.invoice_no,
                            'subtotal', v_subtotal, 'total_amount', v_subtotal - v_sale.discount_amount);
end;
$$;

create or replace function public.record_payment(
  p_sale_id uuid,
  p_amount numeric,
  p_method text,
  p_reference_number text default null,
  p_notes text default null,
  p_paid_at timestamptz default now()
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_sale public.sales%rowtype;
  v_paid numeric(14,2);
  v_payment_id uuid;
begin
  if not public.user_has_role(array['kepsek','tu']) then raise exception 'Akses ditolak.'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Nominal pembayaran harus lebih dari nol.'; end if;
  if p_method not in ('cash','transfer') then raise exception 'Metode pembayaran harus cash atau transfer.'; end if;

  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found or v_sale.status <> 'confirmed' then
    raise exception 'Pembayaran hanya dapat dicatat untuk penjualan yang sudah dikonfirmasi.';
  end if;

  select coalesce(sum(pa.amount),0) into v_paid
  from public.payment_allocations pa
  join public.payments p on p.id = pa.payment_id
  where pa.sale_id = p_sale_id and p.status = 'posted';

  if v_paid + p_amount > v_sale.total_amount then
    raise exception 'Pembayaran melebihi sisa tagihan. Sisa saat ini: %.', v_sale.total_amount - v_paid;
  end if;

  insert into public.payments(payment_method, amount, paid_at, reference_number, notes, recorded_by)
  values (p_method, p_amount, coalesce(p_paid_at, now()), nullif(trim(p_reference_number), ''),
          nullif(trim(p_notes), ''), auth.uid())
  returning id into v_payment_id;

  insert into public.payment_allocations(payment_id, sale_id, amount)
  values (v_payment_id, p_sale_id, p_amount);

  insert into public.activity_logs (actor_id, action, entity_type, entity_id, details)
  values (auth.uid(), 'payment_recorded', 'payments', v_payment_id,
          jsonb_build_object('sale_id', p_sale_id, 'amount', p_amount, 'method', p_method));

  return v_payment_id;
end;
$$;

create or replace function public.void_payment(p_payment_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not public.user_has_role(array['kepsek']) then raise exception 'Hanya Kepsek yang boleh membatalkan pembayaran.'; end if;
  if nullif(trim(p_reason), '') is null then raise exception 'Alasan pembatalan wajib diisi.'; end if;

  update public.payments
    set status='voided', void_reason=trim(p_reason), voided_by=auth.uid(), voided_at=now()
    where id=p_payment_id and status='posted';
  if not found then raise exception 'Pembayaran tidak ditemukan atau sudah dibatalkan.'; end if;

  insert into public.activity_logs (actor_id, action, entity_type, entity_id, reason)
  values (auth.uid(), 'void', 'payments', p_payment_id, trim(p_reason));
end;
$$;

-- RLS: semua akses operasional mengharuskan pengguna login dan profil aktif.
alter table public.profiles enable row level security;
alter table public.academic_years enable row level security;
alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.student_enrollments enable row level security;
alter table public.books enable row level security;
alter table public.inventory_locations enable row level security;
alter table public.stock_balances enable row level security;
alter table public.stock_movements enable row level security;
alter table public.bundles enable row level security;
alter table public.bundle_items enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.payments enable row level security;
alter table public.payment_allocations enable row level security;
alter table public.activity_logs enable row level security;

drop policy if exists "profiles read own or kepsek" on public.profiles;
create policy "profiles read own or kepsek" on public.profiles
for select to authenticated using (id = auth.uid() or public.user_has_role(array['kepsek']));

drop policy if exists "active users read academic years" on public.academic_years;
create policy "active users read academic years" on public.academic_years
for select to authenticated using (public.is_active_user());
drop policy if exists "kepsek manages academic years" on public.academic_years;
create policy "kepsek manages academic years" on public.academic_years
for all to authenticated using (public.user_has_role(array['kepsek']))
with check (public.user_has_role(array['kepsek']));

drop policy if exists "active users read classes" on public.classes;
create policy "active users read classes" on public.classes
for select to authenticated using (public.is_active_user());
drop policy if exists "kepsek manages classes" on public.classes;
create policy "kepsek manages classes" on public.classes
for all to authenticated using (public.user_has_role(array['kepsek']))
with check (public.user_has_role(array['kepsek']));

drop policy if exists "active users read students" on public.students;
create policy "active users read students" on public.students
for select to authenticated using (public.is_active_user());
drop policy if exists "TU and Kepsek manage students" on public.students;
create policy "TU and Kepsek manage students" on public.students
for all to authenticated using (public.user_has_role(array['kepsek','tu']))
with check (public.user_has_role(array['kepsek','tu']));

drop policy if exists "active users read enrollments" on public.student_enrollments;
create policy "active users read enrollments" on public.student_enrollments
for select to authenticated using (public.is_active_user());
drop policy if exists "TU and Kepsek manage enrollments" on public.student_enrollments;
create policy "TU and Kepsek manage enrollments" on public.student_enrollments
for all to authenticated using (public.user_has_role(array['kepsek','tu']))
with check (public.user_has_role(array['kepsek','tu']));

drop policy if exists "active users read books" on public.books;
create policy "active users read books" on public.books
for select to authenticated using (public.is_active_user());
drop policy if exists "TU and Kepsek manage books" on public.books;
create policy "TU and Kepsek manage books" on public.books
for all to authenticated using (public.user_has_role(array['kepsek','tu']))
with check (public.user_has_role(array['kepsek','tu']));

drop policy if exists "active users read locations" on public.inventory_locations;
create policy "active users read locations" on public.inventory_locations
for select to authenticated using (public.is_active_user());
drop policy if exists "Kepsek manages locations" on public.inventory_locations;
create policy "Kepsek manages locations" on public.inventory_locations
for all to authenticated using (public.user_has_role(array['kepsek']))
with check (public.user_has_role(array['kepsek']));

drop policy if exists "active users read stock balances" on public.stock_balances;
create policy "active users read stock balances" on public.stock_balances
for select to authenticated using (public.is_active_user());
drop policy if exists "active users read stock movements" on public.stock_movements;
create policy "active users read stock movements" on public.stock_movements
for select to authenticated using (public.is_active_user());

drop policy if exists "active users read bundles" on public.bundles;
create policy "active users read bundles" on public.bundles
for select to authenticated using (public.is_active_user());
drop policy if exists "TU and Kepsek manage bundles" on public.bundles;
create policy "TU and Kepsek manage bundles" on public.bundles
for all to authenticated using (public.user_has_role(array['kepsek','tu']))
with check (public.user_has_role(array['kepsek','tu']));

drop policy if exists "active users read bundle items" on public.bundle_items;
create policy "active users read bundle items" on public.bundle_items
for select to authenticated using (public.is_active_user());
drop policy if exists "TU and Kepsek manage bundle items" on public.bundle_items;
create policy "TU and Kepsek manage bundle items" on public.bundle_items
for all to authenticated using (public.user_has_role(array['kepsek','tu']))
with check (public.user_has_role(array['kepsek','tu']));

drop policy if exists "active users read sales" on public.sales;
create policy "active users read sales" on public.sales
for select to authenticated using (public.is_active_user());
drop policy if exists "TU and Kepsek insert draft sales" on public.sales;
create policy "TU and Kepsek insert draft sales" on public.sales
for insert to authenticated with check (
  public.user_has_role(array['kepsek','tu']) and status = 'draft'
);
drop policy if exists "TU and Kepsek update draft sales" on public.sales;
create policy "TU and Kepsek update draft sales" on public.sales
for update to authenticated using (
  public.user_has_role(array['kepsek','tu']) and status = 'draft'
) with check (
  public.user_has_role(array['kepsek','tu']) and status = 'draft'
);

drop policy if exists "active users read sale items" on public.sale_items;
create policy "active users read sale items" on public.sale_items
for select to authenticated using (public.is_active_user());
drop policy if exists "TU and Kepsek edit sale items for draft" on public.sale_items;
create policy "TU and Kepsek edit sale items for draft" on public.sale_items
for all to authenticated using (
  public.user_has_role(array['kepsek','tu']) and exists (
    select 1 from public.sales s where s.id = sale_id and s.status = 'draft'
  )
) with check (
  public.user_has_role(array['kepsek','tu']) and exists (
    select 1 from public.sales s where s.id = sale_id and s.status = 'draft'
  )
);

drop policy if exists "active users read payments" on public.payments;
create policy "active users read payments" on public.payments
for select to authenticated using (public.is_active_user());
drop policy if exists "active users read payment allocations" on public.payment_allocations;
create policy "active users read payment allocations" on public.payment_allocations
for select to authenticated using (public.is_active_user());

drop policy if exists "Kepsek reads activity logs" on public.activity_logs;
create policy "Kepsek reads activity logs" on public.activity_logs
for select to authenticated using (public.user_has_role(array['kepsek']));


-- Explicit API grants. RLS policies remain the authorization boundary.
grant usage on schema public to authenticated;
grant select on public.profiles, public.academic_years, public.classes, public.students,
  public.student_enrollments, public.books, public.inventory_locations,
  public.stock_balances, public.stock_movements, public.bundles, public.bundle_items,
  public.sales, public.sale_items, public.payments, public.payment_allocations,
  public.activity_logs to authenticated;
grant insert, update on public.students, public.student_enrollments, public.books,
  public.bundles, public.bundle_items, public.sales, public.sale_items to authenticated;
grant delete on public.bundle_items, public.sale_items to authenticated;

-- Functions exposed through the Supabase client should not be executable by anonymous users.
revoke all on function public.import_students_batch(jsonb) from public, anon;
revoke all on function public.record_stock_movement(uuid,uuid,text,integer,text) from public, anon;
revoke all on function public.confirm_sale(uuid) from public, anon;
revoke all on function public.record_payment(uuid,numeric,text,text,text,timestamptz) from public, anon;
revoke all on function public.void_payment(uuid,text) from public, anon;

grant execute on function public.import_students_batch(jsonb) to authenticated;
grant execute on function public.record_stock_movement(uuid,uuid,text,integer,text) to authenticated;
grant execute on function public.confirm_sale(uuid) to authenticated;
grant execute on function public.record_payment(uuid,numeric,text,text,text,timestamptz) to authenticated;
grant execute on function public.void_payment(uuid,text) to authenticated;

-- Initial reference records
insert into public.academic_years (name, is_active)
values ('2026/2027', true)
on conflict (name) do update set is_active = excluded.is_active;

insert into public.inventory_locations (name, location_type)
values ('Stok Penjualan', 'sale'), ('Inventaris Sekolah', 'school_asset')
on conflict (name) do nothing;
