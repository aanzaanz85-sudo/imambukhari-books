PATCH: FITUR TAHUN AJARAN / KENAIKAN KELAS

Penting: Migrasi SQL 003 harus sudah dijalankan di Supabase. Jangan jalankan ulang untuk patch ini.

Unggah/ganti file berikut pada repository GitHub, mempertahankan path yang sama:
- src/app.js
- src/components/sidebar.js
- src/modules/academic-years/index.js

Setelah commit, tunggu Netlify menyelesaikan deploy lalu lakukan hard refresh (Ctrl+F5).

Fitur proses kenaikan kelas/kelulusan hanya ditampilkan untuk profil dengan role 'kepsek'.
Jika tombol tetap tidak muncul, cek role akun lewat SQL:
SELECT u.email, p.role, p.is_active
FROM auth.users u JOIN public.profiles p ON p.id = u.id
WHERE u.email = 'EMAIL_LOGIN_ANDA';

Pastikan hasil role adalah 'kepsek' dan is_active = true.
JANGAN jalankan proses kenaikan kelas di database produksi untuk sekadar tes.
