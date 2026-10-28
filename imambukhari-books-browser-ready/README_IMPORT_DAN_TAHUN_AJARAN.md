# Impor massal siswa dan pergantian tahun ajaran

## Fitur
- Data Siswa: tombol **Template Impor** untuk mengunduh file Excel dengan header `full_name`, `class_name`.
- Data Siswa: tombol **Impor CSV/Excel** untuk meninjau, memvalidasi, lalu mengimpor banyak siswa sekaligus ke tahun ajaran aktif.
- Gender otomatis: kelas A/C = `Laki-laki`, kelas B = `Perempuan`.
- Menu **Tahun Ajaran**: Kepala Sekolah dapat memproses kenaikan kelas tahunan dan kelulusan kelas 6.
- Tahun ajaran baru: siswa kelas 1–5 naik satu tingkat dengan rombel yang sama; kelas 6 ditandai lulus/nonaktif; tahun ajaran baru menjadi aktif; siswa baru dapat diimpor setelahnya.

## Urutan pemasangan
1. Jalankan `supabase/migrations/003_bulk_import_and_year_rollover.sql` satu kali di Supabase SQL Editor. Pastikan migrasi 001 dan 002 sudah dijalankan.
2. Unggah perubahan kode dari folder proyek ke GitHub dengan mempertahankan struktur direktori, lalu commit.
3. Tunggu Netlify selesai build/deploy.
4. Uji **Template Impor** terlebih dahulu; isi data uji lalu coba impor beberapa siswa, bukan langsung satu file besar.
5. Uji menu **Tahun Ajaran** hanya menggunakan tahun tujuan berikutnya yang benar. Operasi ini mengubah tahun aktif, menaikkan siswa kelas 1–5, serta meluluskan kelas 6. Hanya akun Kepsek yang diizinkan oleh database.

## Format file impor
Wajib: `full_name`, `class_name`.
Opsional: `gender` dan `academic_year`. Jika gender dicantumkan, harus sesuai aturan rombel. Jika tahun ajaran dicantumkan, harus sama dengan tahun ajaran aktif. File lama untuk tahun ajaran berbeda harus disesuaikan sebelum impor.

## Pencegahan duplikasi
- Nama ganda dalam file yang sama akan ditolak.
- Jika nama yang sama sudah ada di database dari tahun ajaran lain, impor ditolak untuk pemeriksaan manual. Ini disengaja karena nama bukan identitas unik yang kuat; jangan otomatis menggabungkan dua siswa hanya berdasarkan nama.
- Impor ulang baris yang sudah tercatat pada tahun ajaran aktif dan kelas yang sama akan dilewati.

## Catatan
Jangan hapus tabel atau menjalankan ulang migrasi 001/002. Buat backup sebelum menguji proses pergantian tahun ajaran pada data produksi.
