RML v2.0.5 - Promo Final UI Fix

Fixed the Sales/Supervisor promo catalog layout where badges and keterangan were overlapping.
The issue was caused by earlier broad span selectors. Final scoped overrides now isolate the item number,
offer badges, and keterangan text. Rules are compact pills and the note is a separate readable row.
No data model or Supabase table changes.
JavaScript syntax check: PASS
