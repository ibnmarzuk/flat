-- Support bounded retention cleanup of stale persistent rate-limit counters.
-- This index is non-unique and does not change request enforcement behaviour.
create index if not exists api_rate_limits_updated_at_idx
  on public.api_rate_limits (updated_at);
