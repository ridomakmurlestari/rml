RML v2.0.5 - Promo Rules UI Fix + Keterangan

Changes:
- Fixed Sales/Supervisor promo badge overlap caused by broad span CSS selectors.
- Item-level mix rule is now a two-button segmented control: Boleh mix / Tidak mix.
- Added item-level Keterangan field, stored as keterangan inside existing promo JSON.
- Keterangan is shown under the badges in Sales/Supervisor catalog.
- Existing quantity, bonus, item-level rules and editable promo period are preserved.
- No new Supabase table/column is required.
