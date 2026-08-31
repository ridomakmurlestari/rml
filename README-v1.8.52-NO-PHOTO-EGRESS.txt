RML Sales Visit v1.8.52 - Check-in Photo Retention / Egress Fix

- Check-in tetap mewajibkan Sales mengambil foto langsung dari kamera.
- Foto dipakai selama proses check-in/check-out di perangkat.
- Foto TIDAK dikirim di payload kunjungan ke Supabase.
- Setelah kunjungan berhasil sinkron, foto tidak dipertahankan di cache kunjungan lokal.
- Riwayat kunjungan tetap tersimpan tanpa foto.
- Tidak ada SQL baru atau tabel baru.
- Tujuan: mengurangi ukuran payload dan egress database.

Catatan: foto kunjungan lama yang sudah tersimpan di Supabase tidak otomatis terhapus oleh perubahan ini.
