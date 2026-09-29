RML v2.0.5 - Progress Supervisor Fix 3

The previous supervisor fix still used the supervisor customer-assignment list.
Fix 3 changes the area progress rule: a Supervisor's progress counts ALL active
outlets in that area. Completed coverage is the number of unique outlet numbers
visited by that Supervisor today. Raw visit count remains shown separately.

Example: Pulau Buluh has 12 active outlets and Septino has 8 visit records today.
If those visits cover 8 unique outlets, progress becomes 8/12 = 67%.

No Supabase schema/data changes. This calculation uses the existing local visitCache.
