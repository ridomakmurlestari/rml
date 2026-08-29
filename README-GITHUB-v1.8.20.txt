RML Sales Visit v1.8.20

FIX Supervisor Area Assignment:
- Supervisor area checkbox can be saved per user.
- Uses app_get_profile() directly for role/email validation.
- Does not assume or access public.rml_users.
- Saving one user's areas does not overwrite other users.
- app_get_my_area_assignments() returns assignments for Sales and Supervisor.

Supabase:
1. Run SUPABASE-AREA-SYNC-v1.8.20.sql once in SQL Editor.
2. Then upload the application files to GitHub.
3. Refresh/reopen the app and test Supervisor area assignment.
