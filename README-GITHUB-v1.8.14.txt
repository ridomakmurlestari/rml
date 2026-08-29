RML Sales Visit v1.8.14

FIX:
- Restore Septino as Supervisor, not Sales.
- Protect Septino role from old localStorage/session data that still says Sales.
- Login resolves Septino as Supervisor, restoring all-area access, supervisor dashboard, and Order Luar Area.
- Admin/Supervisor area assignment sync remains available for Sales accounts.
- Removed duplicate area-assignment pull on the online event to reduce unnecessary egress.

Deployment:
- Upload all files to the GitHub Pages root.
- Hard refresh / reinstall the PWA if needed.
- If v1.8.12 area-sync SQL was already installed, no new SQL is required.
