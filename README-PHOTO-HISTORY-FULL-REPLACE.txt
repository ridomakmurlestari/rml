RML v2.0.5 — FULL REPLACEMENT WITH PHOTO HISTORY (ON-DEMAND)

What is included:
- Full website source based on the RML v2.0.5 Progress Clickable FIX 8 project.
- Check-in photo upload to a separate, locked-down database table after visit sync.
- Photo existence is delivered as a small boolean flag in normal history sync.
- Admin, Sales, Supervisor can see the "Lihat Foto Check-in" button for photos that exist.
- Photo bytes are fetched only after clicking the button.
- Admin can delete a photo; the visit row itself stays in history.
- Editable promo name, editable promo period name, item-level quantity/bonus/mix rules and keterangan are included.
- Progress clickable feature from the base project is preserved.

Install:
1. BACK UP the current GitHub repository before replacing files.
2. Extract this ZIP and replace the website source files with the contents of folder RML-Sales-Visit-v2.00.
3. In Supabase SQL Editor, run SUPABASE-PHOTO-HISTORY-LAZY-LOAD-v1.sql ONCE.
4. Commit/push the project files to GitHub Pages.
5. Wait for deploy, then hard-refresh (Ctrl+F5).
6. Test with a NEW visit: Check-in photo > Check-out > let sync finish > open history from another authorized account/device > click "Lihat Foto Check-in".

Egress:
- History pulls contain no image bytes, only a hasCheckInPhoto boolean.
- A photo is sent back only by app_pull_visit_photo for the one ID a user explicitly opens.
- Uploading a new photo consumes inbound traffic/storage, not egress; viewing that photo consumes egress.
- Photo cache is in page memory only. Reopening/refreshing the page may download the photo again if it is opened again.

Important limitation:
- This is based on the last complete RML source ZIP available in the current workspace (Progress Clickable FIX 8), not a fresh download from your live GitHub repository. If your deployed GitHub has other edits made after that ZIP, compare/merge those before replacement.
- Photos from older versions may not be recoverable if the older version stripped the photo before sync and the only local copy was discarded. New visits created after this version is deployed will upload a photo separately during sync.
- The SQL migration is required; JavaScript alone cannot make existing remote photos visible.

ADDITIONAL FIXES RETAINED IN THIS PACKAGE
- Progress rows now resolve visits through the outlet/customer number to the current area label.
- Supervisor progress uses all active outlets in the area.
- Closing the progress modal removes inline display overrides so the X/close behavior can work.
