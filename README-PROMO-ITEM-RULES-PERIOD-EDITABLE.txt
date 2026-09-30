RML v2.0.5 - Promo Item Rules + Editable Period

Changes:
1) Quantity, bonus, and mix-variant rule now belong to each Promo Item, not the category.
2) Existing old category-level rules are migrated to items for backward compatibility.
3) Promo period label is editable (stored as promo_period_name) while month_key remains the system storage key.
4) Sales/Supervisor catalog displays item-level rules and the editable period name.
5) No new Supabase table/column is required by this code; the metadata is stored inside the existing p_items JSON.
6) Existing promo assignments remain supported.

JavaScript syntax check: PASS
