RML v2.0.5 - Progress Supervisor Fix

Fixes the Admin Progress Sales per Hari calculation for supervisor accounts.
Cause: progress calculation was filtering supervisor outlets with canSalesAccessCustomer(),
which is a Sales-only assignment check, producing 0 total outlets for supervisors.
Supervisor progress now uses canSupervisorAccessCustomer(), matching the customer visibility rules.
Visit email and area comparisons are normalized for case/whitespace.
getSalesName() now recognizes supervisor accounts as well.
The progress calculation is local-cache only; no new Supabase request is introduced by this fix.
