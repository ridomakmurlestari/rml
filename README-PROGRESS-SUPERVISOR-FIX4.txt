RML v2.0.5 - Progress Supervisor Fix 4

Fixes the remaining 0/0 issue when a device's local customer cache is missing
the full roster for one area (while visit records still exist). The progress
calculation now uses the local area roster; if that area roster is completely
missing, it falls back to the bundled DEFAULT_CUSTOMERS for that area.
Supervisor progress counts all active outlets in the area. Sales keeps assigned rules.
Area matching is normalized for case/spacing/punctuation. Completed coverage counts
unique customerNo values. Raw visit count remains separate.
No new Supabase request is introduced by this progress calculation.
