RML v1.8.35 Reward Persistence Fix

Reward data is stored in the existing dashboard target description using a hidden [[RML_REWARD:type:value]] marker, so it survives existing Supabase RPCs even when reward columns are not present yet. The UI removes the marker when reading the target. If reward columns are later added, the explicit reward_type/reward_value fields are also sent.
