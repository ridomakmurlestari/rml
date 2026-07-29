RML SALES VISIT v0.10.2 — INTERNAL LOGIN + SUPABASE

Perubahan utama:
- Tidak memakai Supabase Authentication Users.
- Login langsung dengan Nama + Password melalui RPC aman.
- Password disimpan sebagai hash bcrypt di database.
- Admin mengelola akun dan penugasan area dari aplikasi.
- Kunjungan tetap tersimpan offline di IndexedDB.
- Saat online dan aplikasi dibuka, data otomatis disinkronkan ke Supabase.

Instalasi wajib: jalankan supabase/setup.sql terlebih dahulu.
Lihat SUPABASE-SETUP.txt.


V0.10.3 FORCE REFRESH
- Aset JavaScript diberi nama baru untuk memastikan Vercel/browser tidak memakai file lama.
- Service worker lama otomatis dihapus sementara untuk pengujian login.
- Login harus memanggil RPC app_login, bukan lookup_login_email.
