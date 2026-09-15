-- Required once per existing database before deploying code that uses the
-- cancelled work-order status. This only expands the existing ENUM.
ALTER TABLE tickets
  MODIFY COLUMN status ENUM(
    'open',
    'in_progress',
    'on_hold',
    'pending',
    'resolved',
    'closed',
    'cancelled'
  ) NOT NULL DEFAULT 'open';
