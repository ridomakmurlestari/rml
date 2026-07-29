RML Sales Visit v1.0.1 Stable

RML Sales Visit v0.11.0 - Selesai Tugas Area & Logout Terpisah

Perubahan:
- Tombol Selesai untuk Sales/Supervisor menjadi "Selesai Tugas Area Hari Ini".
- Menyelesaikan tugas area tidak lagi melakukan logout.
- Setelah selesai, area aktif dibersihkan dan pengguna kembali ke Dashboard.
- Sales biasa tetap wajib mengisi alasan untuk outlet yang belum dikunjungi.
- Supervisor dengan izin bebas ganti area tidak wajib mengisi alasan.
- Tombol Logout terpisah tersedia di kanan atas untuk semua akun.
- Logout tidak meminta alasan outlet yang belum dikunjungi.
- Check Out tetap wajib diselesaikan sebelum menutup tugas area atau logout.

Tidak memerlukan SQL baru.


Versi 0.11.4: filter sales, pencarian lengkap, multi-delete, import/export Excel, dan menu Pembagian Area Sales.

Tambahan v1.0.0:
- Backup data dalam format JSON dari menu Pengaturan Admin.
- Restore data dengan validasi file dan konfirmasi.
- Backup mencakup pelanggan, penugasan, pengaturan akun tanpa password, area, dan riwayat kunjungan.
- Password dan sesi login tidak dimasukkan ke file backup.


Perubahan v1.0.1:
- Export data pelanggan disederhanakan menjadi 6 kolom: Kode Outlet, Nama Outlet, Area, Sales, Aktif, dan Status.
- Email sales, pemilik, dan kolom lain tidak lagi ikut diekspor.
