RML v2.0.5 - Progress Area Rename Fix

Progress now resolves each visit's area from the CURRENT customer record using customerNo.
Therefore if an admin renamed an area (example: PULAU BULUH -> PULAU BURU), historical
visits remain attributable to the same outlet and are shown under PULAU BURU.
The same canonical area is used when calculating Supervisor progress, so renamed areas
do not produce 0/0.
Fallback to the stored visit area is used only when the customer cannot be found.
No extra Supabase request is introduced; this uses existing local caches.
