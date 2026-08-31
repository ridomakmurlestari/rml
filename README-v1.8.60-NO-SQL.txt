RML Sales Visit v1.8.60

Target & Reward Bertingkat tanpa SQL baru.

- Level target/reward disimpan di field description yang sudah ada menggunakan marker [[RML_TIERS:...]].
- Tidak memakai kolom reward_tiers baru.
- Tidak memerlukan migration SQL baru.
- Reward nominal = nominal reward level yang tercapai.
- Reward persentase = persentase x realisasi aktual setelah level tercapai.
- Check-In Sales tetap wajib foto; foto tidak dikirim/disimpan ke Supabase sesuai optimasi v1.8.53.
