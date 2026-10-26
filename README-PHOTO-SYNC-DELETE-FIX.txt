RML v2.0.5 — PHOTO SYNC / STALE DELETE FIX

1) Replace website files with the contents of this folder.
2) Run SUPABASE-PHOTO-HISTORY-LAZY-LOAD-v1.sql in Supabase SQL Editor (safe to re-run).
3) Hard refresh the website on Sales/Supervisor devices while online.

Changes:
- Legacy photo_data column no longer blocks writes to photo_bytes.
- Photo data is still uploaded separately; normal visit pulls do not fetch image bytes.
- Sales/Supervisor reconcile deleted visits on app focus/online using IDs only.
- Photo viewing remains Admin-only.

This has not been live-tested against your Supabase project. Test one new check-in first.
