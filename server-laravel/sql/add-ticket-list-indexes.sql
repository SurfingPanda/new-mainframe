-- Indexes for the work-order list (sort, filters, visibility scope). Without them
-- the list's ORDER BY created_at and its requester / department / category /
-- priority filters are full table scans once the table grows. Additive and
-- non-destructive. Running it a second time fails with "Duplicate key name" —
-- harmless, it means the indexes are already there.
ALTER TABLE tickets
  ADD INDEX idx_tickets_created (created_at),
  ADD INDEX idx_tickets_updated (updated_at),
  ADD INDEX idx_tickets_requester (requester),
  ADD INDEX idx_tickets_department (department),
  ADD INDEX idx_tickets_category (category),
  ADD INDEX idx_tickets_priority (priority);
