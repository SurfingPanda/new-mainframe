-- Required once per existing database before deploying the SLA "at risk"
-- warnings (SlaMonitor + SlaAlerts). Adds two once-only markers, mirroring
-- sla_response_breached_at / sla_resolution_breached_at: set atomically when
-- the 75% warning for that clock is sent, so it's never sent twice.
-- Additive only. Running it a second time fails with "Duplicate column" —
-- harmless, it means the columns are already there.
ALTER TABLE tickets
  ADD COLUMN sla_response_warned_at TIMESTAMP NULL DEFAULT NULL AFTER sla_resolution_breached_at,
  ADD COLUMN sla_resolution_warned_at TIMESTAMP NULL DEFAULT NULL AFTER sla_response_warned_at;
