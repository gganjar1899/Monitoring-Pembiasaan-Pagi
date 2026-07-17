-- ==========================================================
-- Monitoring Tilawah Al-Qur'an — SMP Negeri 36 Bandung
-- Jalankan seluruh file ini di Supabase Studio > SQL Editor
-- ==========================================================

-- 1. TABEL KELAS ---------------------------------------------------
create table if not exists classes (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,        -- contoh: "7A", "8C", "9H"
  grade text not null,              -- "7", "8", atau "9"
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- 2. TABEL GURU ------------------------------------------------------
create table if not exists teachers (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  teacher_code text,                -- kode guru sesuai jadwal KBM (opsional, untuk referensi)
  created_at timestamptz not null default now()
);

-- 3. TABEL LAPORAN TILAWAH HARIAN --------------------------------------
create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  report_date date not null,
  class_name text not null references classes(name) on update cascade on delete cascade,
  surah text not null,
  ayat_range text,                  -- keterangan bebas, contoh: "ayat 1-15"
  jumlah_ayat integer not null default 0,   -- dipakai untuk grafik & rekap
  present_count integer,
  total_students integer,
  teacher_name text not null,       -- dipilih dari dropdown oleh ketua kelas
  notes text,
  updated_at timestamptz not null default now(),
  unique (report_date, class_name)
);

create index if not exists idx_reports_date on reports (report_date);
create index if not exists idx_reports_class on reports (class_name);

-- 4. TABEL PRESENSI GURU (kehadiran guru per hari, dicatat perwakilan kelas) --
create table if not exists teacher_attendance (
  id uuid primary key default gen_random_uuid(),
  report_date date not null,
  class_name text not null references classes(name) on update cascade on delete cascade,
  period_label text,                -- contoh: "Jam ke-3" atau nama mapel, opsional
  teacher_name text not null,
  status text not null check (status in ('hadir', 'tidak_hadir')),
  reason text,                      -- diisi jika tidak_hadir: sakit/izin/dinas_luar/tanpa_keterangan/lainnya
  task_notes text,                  -- keterangan tugas yang diberikan jika tidak hadir
  created_at timestamptz not null default now()
);

create index if not exists idx_teacher_att_date on teacher_attendance (report_date);
create index if not exists idx_teacher_att_class on teacher_attendance (class_name);

-- 5. TABEL KEGIATAN SISWA NON-MUSLIM (per tingkat + agama) --------------
create table if not exists non_muslim_reports (
  id uuid primary key default gen_random_uuid(),
  report_date date not null,
  grade text not null,               -- "7", "8", atau "9"
  agama text not null check (agama in ('protestan', 'katolik')),
  materi text not null,               -- materi/topik/ayat Alkitab yang dipelajari
  guru_pembimbing text not null,
  present_count integer,
  total_students integer,
  notes text,
  updated_at timestamptz not null default now(),
  unique (report_date, grade, agama)
);

create index if not exists idx_nonmuslim_date on non_muslim_reports (report_date);

-- 6. SEED DATA KELAS: 7A-7I, 8A-8I, 9A-9H -----------------------------
insert into classes (name, grade, sort_order)
select name, grade, sort_order from (
  values
    ('7A','7',1), ('7B','7',2), ('7C','7',3), ('7D','7',4), ('7E','7',5),
    ('7F','7',6), ('7G','7',7), ('7H','7',8), ('7I','7',9),
    ('8A','8',10), ('8B','8',11), ('8C','8',12), ('8D','8',13), ('8E','8',14),
    ('8F','8',15), ('8G','8',16), ('8H','8',17), ('8I','8',18),
    ('9A','9',19), ('9B','9',20), ('9C','9',21), ('9D','9',22), ('9E','9',23),
    ('9F','9',24), ('9G','9',25), ('9H','9',26)
) as seed(name, grade, sort_order)
on conflict (name) do nothing;

-- 7. SEED DATA GURU (dari Daftar Kode Guru 2026/2027) -------------------
insert into teachers (teacher_code, name)
select code, name from (
  values
    ('2','Hj. Lani Kusumawati, S.Pd., M.M'),
    ('5','Reny Heryani, S.Pd.'),
    ('6','Iis Nurhayati, S.Pd.'),
    ('7','Agus Gustiawan, S.Pd., M.M.'),
    ('8','Dra. Hj. Kokom Komariah, M.M.'),
    ('9','Komarudin, S.Pd.'),
    ('10','Asep Lukmanulhakim, S.Pd.'),
    ('11','Nurhayati, S.Pd.'),
    ('12','Nanan Basar, S.Pd.'),
    ('13','Suwarni, S.Pd.'),
    ('14','Budi Indrawan, S.Pd.'),
    ('15','Eni Rohaeni, S.Pd.'),
    ('16','Depi Saepudin, S.HI., Gr'),
    ('17','Intan Nur Insani, S.Pd.'),
    ('18','Gitta Afifah, S.Pd.'),
    ('19','Rizkyani Awaliah, S.Pd.'),
    ('20','Iwan Setiawan, S.Pd.I, M.M.Pd.'),
    ('21','Djuangsih Dewi K., S.Pd.'),
    ('22','Nita Suciati, S.Pd.'),
    ('24','Dra. Ida Ermawatiningsih'),
    ('25','Ariesma Andriyanti, S.Pd.'),
    ('26','Heti Kusnilawati, S.Pd.'),
    ('27','Yogi Suwardi, S.Pd.'),
    ('28','Puji Siti Fauziah, S.Pd.'),
    ('29','Nur Faida Regar, S.Pd.'),
    ('30','Anggia Komarawati, S.Pd.'),
    ('31','Fatmawati Kania Dewi, S.ST'),
    ('32','Endang Mujiyatiningsih, S.Pd.'),
    ('33','Adlan Naqiban, S.Pd.'),
    ('34','Sari Wahyuni, S.Pd.'),
    ('35','Tini Kartini, S.Pd.I.'),
    ('36','Purnama Hudaya, S.Pd., M.Pd.'),
    ('37','Ati Gustiawati, S.Si.'),
    ('38','Gina Ganjar Maulana, S.Pd.'),
    ('39','Lulu''diah Sri Purwati, M.Pd.'),
    ('40','Elenne Rhizkita Akbar, S.Pd.'),
    ('41','Anisa Rizki Awalia, S.Pd.'),
    ('42','Anke Kusumadewi, S.Pd.'),
    ('43','Findani Felasari, S.Pd.'),
    ('44','Leli Nurlaeli, S.Pd.I., Gr.'),
    ('45','Ahmad Seno Kurniansyah, S.Pd.')
) as seed(code, name)
on conflict (name) do nothing;

-- 8. ROW LEVEL SECURITY ------------------------------------------------
alter table classes enable row level security;
alter table teachers enable row level security;
alter table reports enable row level security;
alter table teacher_attendance enable row level security;
alter table non_muslim_reports enable row level security;

-- Kelas & Guru: semua boleh membaca (dropdown), hanya kepala sekolah (login) yang mengubah.
create policy "classes_select_all" on classes for select using (true);
create policy "classes_insert_auth" on classes for insert to authenticated with check (true);
create policy "classes_update_auth" on classes for update to authenticated using (true);
create policy "classes_delete_auth" on classes for delete to authenticated using (true);

create policy "teachers_select_all" on teachers for select using (true);
create policy "teachers_insert_auth" on teachers for insert to authenticated with check (true);
create policy "teachers_update_auth" on teachers for update to authenticated using (true);
create policy "teachers_delete_auth" on teachers for delete to authenticated using (true);

-- Laporan Tilawah: ketua kelas (tanpa login) hanya boleh tulis/baca data HARI INI.
-- Kepala sekolah (login) boleh membaca semua riwayat untuk dasbor & rekap.
create policy "reports_insert_today_anyone" on reports
  for insert with check (report_date = current_date);
create policy "reports_update_today_anyone" on reports
  for update using (report_date = current_date) with check (report_date = current_date);
create policy "reports_select_today_anyone" on reports
  for select using (report_date = current_date);
create policy "reports_select_all_auth" on reports
  for select to authenticated using (true);
create policy "reports_delete_auth" on reports
  for delete to authenticated using (true);

-- Presensi Guru: sama pola aksesnya dengan laporan tilawah.
create policy "teacher_att_insert_today_anyone" on teacher_attendance
  for insert with check (report_date = current_date);
create policy "teacher_att_update_today_anyone" on teacher_attendance
  for update using (report_date = current_date) with check (report_date = current_date);
create policy "teacher_att_select_today_anyone" on teacher_attendance
  for select using (report_date = current_date);
create policy "teacher_att_select_all_auth" on teacher_attendance
  for select to authenticated using (true);
create policy "teacher_att_delete_anyone_today" on teacher_attendance
  for delete using (report_date = current_date);
create policy "teacher_att_delete_auth" on teacher_attendance
  for delete to authenticated using (true);

-- Kegiatan Non-Muslim: sama pola aksesnya.
create policy "nonmuslim_insert_today_anyone" on non_muslim_reports
  for insert with check (report_date = current_date);
create policy "nonmuslim_update_today_anyone" on non_muslim_reports
  for update using (report_date = current_date) with check (report_date = current_date);
create policy "nonmuslim_select_today_anyone" on non_muslim_reports
  for select using (report_date = current_date);
create policy "nonmuslim_select_all_auth" on non_muslim_reports
  for select to authenticated using (true);
create policy "nonmuslim_delete_auth" on non_muslim_reports
  for delete to authenticated using (true);

-- ==========================================================
-- SELESAI. Langkah berikutnya ada di README.md:
--   1) Authentication > Users > Add user (akun kepala sekolah)
--   2) Salin Project URL & anon public key ke variabel lingkungan
-- ==========================================================
