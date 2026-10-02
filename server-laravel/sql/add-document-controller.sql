-- Required once per existing database before deploying the "Document Controller"
-- designation. Marks the single user who is auto-assigned (and emailed) every
-- new 'ERP Access' work order. At most one user holds it (enforced in
-- UserController, not the schema).
-- Additive only. Running it a second time fails with "Duplicate column" —
-- harmless, it means the column is already there.
ALTER TABLE users
  ADD COLUMN is_document_controller TINYINT(1) NOT NULL DEFAULT 0 AFTER is_active;
