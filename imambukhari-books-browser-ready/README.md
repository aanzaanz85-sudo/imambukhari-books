# Inventaris & Penjualan Buku — SD Islam Imam Bukhari

Frontend modular Vite + JavaScript, database Supabase. Proyek ini disiapkan untuk dibangun oleh hosting (misalnya Netlify), sehingga Node.js tidak perlu dipasang di komputer pribadi.

## Status awal

- Login email/password melalui Supabase Auth.
- Dashboard ringkas.
- Daftar siswa dengan pencarian dan filter kelas/tahun ajaran.
- Ekspor daftar siswa ke XLSX.
- Impor siswa CSV/XLSX melalui RPC `import_students_batch` (opsional; gunakan setelah ditinjau).
- Menu buku, inventaris, paket, penjualan, pembayaran, laporan, dan pengguna disiapkan modular sebagai tahap berikutnya.

## Deployment online tanpa Node.js lokal

1. Unggah isi folder ini ke repository GitHub (jangan unggah file `.env`). Karena Supabase sekolah Anda sudah dibuat, jangan jalankan ulang berkas migrasi SQL ini pada proyek yang sama; migrasi disimpan sebagai dokumentasi/versi skema.
2. Hubungkan repository ke Netlify.
3. Netlify build command: `npm run build`; publish directory: `dist`.
4. Di Netlify Site configuration → Environment variables, tambahkan:
   - `VITE_SUPABASE_URL` = Project URL dari Supabase → Settings → API.
   - `VITE_SUPABASE_ANON_KEY` = publishable key/anon key dari Supabase → Settings → API Keys.
5. Deploy/redeploy.

Gunakan hanya publishable/anon key pada frontend. Jangan pernah memakai `service_role`/secret key pada aplikasi browser.

## Penting

Database harus sudah memakai skema Supabase yang disepakati. Frontend tidak menyimpan password sendiri. Login harus menggunakan email dan password. Hak akses harus ditegakkan oleh Supabase RLS, bukan hanya dengan menyembunyikan tombol.

Sebelum transaksi buku sungguhan, modul penjualan dan pembayaran masih perlu dibangun dan diuji. Jangan menganggap placeholder menu sebagai fitur yang telah selesai.

## Pengelolaan siswa (pembaruan)

Modul siswa mendukung tambah siswa, edit nama, mutasi antarkelas pada tingkat yang sama, menandai siswa pindah/keluar/lulus, melihat daftar nonaktif, dan mengaktifkan kembali siswa. Gender ditentukan oleh pembagian sekolah: kelas A/C = laki-laki, kelas B = perempuan. Tidak ada penghapusan permanen.

Sebelum mengunggah pembaruan frontend ini, jalankan `supabase/migrations/002_student_management.sql` satu kali di Supabase SQL Editor. Migrasi 002 menambah RPC untuk pengelolaan siswa dan mempertahankan riwayat mutasi kelas. Jangan jalankan ulang migrasi 001 pada database yang sudah digunakan.

### Kebijakan data siswa

- Edit untuk memperbaiki nama.
- Mutasi kelas mengakhiri pendaftaran lama dengan status `class_changed`, lalu membuat pendaftaran aktif baru. Berlaku untuk tingkat kelas yang sama.
- Pindah/keluar/lulus menandai pendaftaran tahun ajaran aktif dan mengubah `students.is_active` menjadi false. Data siswa dan transaksi tidak dihapus.
- Aktivasi kembali membuat pendaftaran aktif baru pada tahun ajaran aktif; alasan wajib dicatat.
- Transaksi inventaris/penjualan/pembayaran tidak dihapus oleh modul siswa.
