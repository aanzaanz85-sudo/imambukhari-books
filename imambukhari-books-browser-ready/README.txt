PEMBARUAN: TAHUN AJARAN AKTIF DINAMIS

Perubahan:
1. Dashboard membaca tahun ajaran aktif dari Supabase, bukan teks tetap 2026/2027.
2. Jumlah siswa di dashboard menggunakan tahun yang sama dengan label aktif.
3. Ringkasan penjualan menggunakan tahun aktif dari Supabase bila pemanggil tidak menentukan tahun; laporan historis tetap dapat mengirim nama tahun secara eksplisit.

File yang harus menggantikan file lama di repository:
- src/modules/dashboard/index.js
- src/services/sales-service.js

Tidak ada migrasi SQL baru. Tidak perlu mengubah data atau menjalankan SQL.
Setelah file diganti dan di-commit ke GitHub, tunggu Netlify melakukan deploy ulang.
