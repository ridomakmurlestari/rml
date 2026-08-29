RML Sales Visit v1.8.17

FIX:
- Supervisor area assignment now saves per-user directly to Supabase.
- Septino remains Supervisor.
- Supervisor area checkboxes remain clickable and persistent.
- If a Supervisor has no local assignment yet, the current all-area list is used as the base before changing one checkbox.
- Sales assignment behavior remains unchanged.

IMPORTANT:
1. Run SUPABASE-AREA-SYNC-v1.8.17.sql once in Supabase SQL Editor.
2. Upload all files to GitHub.
3. Hard refresh / close and reopen PWA.
