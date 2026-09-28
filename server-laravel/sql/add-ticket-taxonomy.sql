-- Required once per existing database before deploying the admin-editable
-- work-order taxonomy (Users -> Manage -> Categories & Request Types,
-- TaxonomyController + TicketTaxonomy). Safe to re-run: tables use
-- IF NOT EXISTS, seeds use INSERT IGNORE against unique keys, and the
-- ALTERs just re-apply the same column type.
--
-- 1. Two tables replace the lists that were hard-coded in the client
--    (client/src/lib/categories.js, REQUEST_TYPES in the pages) and in
--    TicketController::ALLOWED_* / Automation / SlaPolicies.
-- 2. Seeds them with exactly today's values, so nothing changes on deploy.
-- 3. Widens request_type from ENUM to VARCHAR so admins can add new types.
--    Existing values are preserved as-is (ENUM -> VARCHAR keeps the text).
--
-- tickets keep storing the NAMES (category / subcategory / subcategory2 /
-- request_type key) exactly as before; these tables are the allowlist and
-- the source for the form dropdowns. Top-level categories use parent_id = 0
-- (not NULL) so the (parent_id, name) unique key also covers them.
-- is_system = 1 marks entries the code depends on by name (HR Concerns
-- routing, the ERP / leave special forms, the incident + default request
-- types): they can't be renamed or deleted from the admin page.

CREATE TABLE IF NOT EXISTS ticket_request_types (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  type_key VARCHAR(50) NOT NULL,
  label VARCHAR(80) NOT NULL,
  description VARCHAR(200) NULL DEFAULT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_system TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_request_type_key (type_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ticket_categories (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  parent_id INT UNSIGNED NOT NULL DEFAULT 0,
  depth TINYINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_system TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_category_sibling (parent_id, name),
  KEY idx_category_parent (parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO ticket_request_types (type_key, label, description, sort_order, is_system) VALUES
  ('incident', 'Incident', 'Something is broken or down. Filed from the Create Incident page.', 0, 1),
  ('service_request', 'Service Request', 'Need access, equipment, or a setup.', 1, 1),
  ('question', 'Question / How-to', 'You need information or guidance.', 2, 0),
  ('change', 'Change Request', 'Request a configuration or system change.', 3, 0);

INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system) VALUES (0, 1, 'Hardware', 0, 0);
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT id, 2, 'Desktops & Laptops', 0, 0 FROM ticket_categories WHERE parent_id = 0 AND name = 'Hardware';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Won’t power on', 0, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'Hardware' AND c.name = 'Desktops & Laptops';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Performance / slowness', 1, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'Hardware' AND c.name = 'Desktops & Laptops';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Screen / display', 2, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'Hardware' AND c.name = 'Desktops & Laptops';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT id, 2, 'Peripherals & Accessories', 1, 0 FROM ticket_categories WHERE parent_id = 0 AND name = 'Hardware';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Keyboard / mouse', 0, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'Hardware' AND c.name = 'Peripherals & Accessories';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Docking station', 1, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'Hardware' AND c.name = 'Peripherals & Accessories';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'External monitor', 2, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'Hardware' AND c.name = 'Peripherals & Accessories';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system) VALUES (0, 1, 'Software', 1, 0);
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT id, 2, 'Applications', 0, 0 FROM ticket_categories WHERE parent_id = 0 AND name = 'Software';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Installation / update', 0, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'Software' AND c.name = 'Applications';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Crashes / errors', 1, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'Software' AND c.name = 'Applications';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Licensing / activation', 2, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'Software' AND c.name = 'Applications';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT id, 2, 'Operating System', 1, 0 FROM ticket_categories WHERE parent_id = 0 AND name = 'Software';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Updates / patching', 0, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'Software' AND c.name = 'Operating System';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Boot / startup', 1, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'Software' AND c.name = 'Operating System';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Configuration', 2, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'Software' AND c.name = 'Operating System';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system) VALUES (0, 1, 'Network & Connectivity', 2, 0);
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT id, 2, 'Wired / LAN', 0, 0 FROM ticket_categories WHERE parent_id = 0 AND name = 'Network & Connectivity';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'No connection', 0, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'Network & Connectivity' AND c.name = 'Wired / LAN';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Slow speed', 1, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'Network & Connectivity' AND c.name = 'Wired / LAN';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Cabling / port', 2, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'Network & Connectivity' AND c.name = 'Wired / LAN';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT id, 2, 'Wireless / Wi-Fi', 1, 0 FROM ticket_categories WHERE parent_id = 0 AND name = 'Network & Connectivity';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Cannot connect', 0, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'Network & Connectivity' AND c.name = 'Wireless / Wi-Fi';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Weak signal', 1, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'Network & Connectivity' AND c.name = 'Wireless / Wi-Fi';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Authentication', 2, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'Network & Connectivity' AND c.name = 'Wireless / Wi-Fi';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system) VALUES (0, 1, 'Account & Access', 3, 0);
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT id, 2, 'Login & Authentication', 0, 0 FROM ticket_categories WHERE parent_id = 0 AND name = 'Account & Access';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Password reset', 0, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'Account & Access' AND c.name = 'Login & Authentication';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Account locked', 1, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'Account & Access' AND c.name = 'Login & Authentication';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'MFA / 2FA', 2, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'Account & Access' AND c.name = 'Login & Authentication';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT id, 2, 'Permissions & Roles', 1, 0 FROM ticket_categories WHERE parent_id = 0 AND name = 'Account & Access';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Access request', 0, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'Account & Access' AND c.name = 'Permissions & Roles';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Role change', 1, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'Account & Access' AND c.name = 'Permissions & Roles';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Shared drive / folder', 2, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'Account & Access' AND c.name = 'Permissions & Roles';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system) VALUES (0, 1, 'Email & Communication', 4, 0);
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT id, 2, 'Email', 0, 0 FROM ticket_categories WHERE parent_id = 0 AND name = 'Email & Communication';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Cannot send / receive', 0, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'Email & Communication' AND c.name = 'Email';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Spam / phishing', 1, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'Email & Communication' AND c.name = 'Email';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Mailbox full', 2, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'Email & Communication' AND c.name = 'Email';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT id, 2, 'Collaboration Tools', 1, 0 FROM ticket_categories WHERE parent_id = 0 AND name = 'Email & Communication';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Chat / Teams', 0, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'Email & Communication' AND c.name = 'Collaboration Tools';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Video conferencing', 1, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'Email & Communication' AND c.name = 'Collaboration Tools';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Calendar', 2, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'Email & Communication' AND c.name = 'Collaboration Tools';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system) VALUES (0, 1, 'Security', 5, 0);
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT id, 2, 'Threats & Incidents', 0, 0 FROM ticket_categories WHERE parent_id = 0 AND name = 'Security';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Malware / virus', 0, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'Security' AND c.name = 'Threats & Incidents';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Phishing report', 1, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'Security' AND c.name = 'Threats & Incidents';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Suspected breach', 2, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'Security' AND c.name = 'Threats & Incidents';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT id, 2, 'Policy & Compliance', 1, 0 FROM ticket_categories WHERE parent_id = 0 AND name = 'Security';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Access review', 0, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'Security' AND c.name = 'Policy & Compliance';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Encryption', 1, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'Security' AND c.name = 'Policy & Compliance';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Audit request', 2, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'Security' AND c.name = 'Policy & Compliance';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system) VALUES (0, 1, 'Printing & Peripherals', 6, 0);
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT id, 2, 'Printers', 0, 0 FROM ticket_categories WHERE parent_id = 0 AND name = 'Printing & Peripherals';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Not printing', 0, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'Printing & Peripherals' AND c.name = 'Printers';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Paper jam', 1, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'Printing & Peripherals' AND c.name = 'Printers';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Toner / ink', 2, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'Printing & Peripherals' AND c.name = 'Printers';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT id, 2, 'Scanners & Copiers', 1, 0 FROM ticket_categories WHERE parent_id = 0 AND name = 'Printing & Peripherals';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Scan to email', 0, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'Printing & Peripherals' AND c.name = 'Scanners & Copiers';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Hardware fault', 1, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'Printing & Peripherals' AND c.name = 'Scanners & Copiers';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Driver issue', 2, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'Printing & Peripherals' AND c.name = 'Scanners & Copiers';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system) VALUES (0, 1, 'ERP Access', 7, 1);
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT id, 2, 'Finance & Accounting', 0, 0 FROM ticket_categories WHERE parent_id = 0 AND name = 'ERP Access';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'New access request', 0, 1 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'ERP Access' AND c.name = 'Finance & Accounting';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Modify access / role', 1, 1 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'ERP Access' AND c.name = 'Finance & Accounting';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Revoke access', 2, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'ERP Access' AND c.name = 'Finance & Accounting';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT id, 2, 'Sales & POS', 1, 0 FROM ticket_categories WHERE parent_id = 0 AND name = 'ERP Access';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'New access request', 0, 1 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'ERP Access' AND c.name = 'Sales & POS';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Modify access / role', 1, 1 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'ERP Access' AND c.name = 'Sales & POS';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Revoke access', 2, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'ERP Access' AND c.name = 'Sales & POS';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT id, 2, 'Inventory & Warehouse', 2, 0 FROM ticket_categories WHERE parent_id = 0 AND name = 'ERP Access';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'New access request', 0, 1 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'ERP Access' AND c.name = 'Inventory & Warehouse';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Modify access / role', 1, 1 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'ERP Access' AND c.name = 'Inventory & Warehouse';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Revoke access', 2, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'ERP Access' AND c.name = 'Inventory & Warehouse';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT id, 2, 'Purchasing & Procurement', 3, 0 FROM ticket_categories WHERE parent_id = 0 AND name = 'ERP Access';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'New access request', 0, 1 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'ERP Access' AND c.name = 'Purchasing & Procurement';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Modify access / role', 1, 1 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'ERP Access' AND c.name = 'Purchasing & Procurement';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Revoke access', 2, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'ERP Access' AND c.name = 'Purchasing & Procurement';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT id, 2, 'Production / Manufacturing', 4, 0 FROM ticket_categories WHERE parent_id = 0 AND name = 'ERP Access';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'New access request', 0, 1 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'ERP Access' AND c.name = 'Production / Manufacturing';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Modify access / role', 1, 1 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'ERP Access' AND c.name = 'Production / Manufacturing';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Revoke access', 2, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'ERP Access' AND c.name = 'Production / Manufacturing';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT id, 2, 'HR & Payroll', 5, 0 FROM ticket_categories WHERE parent_id = 0 AND name = 'ERP Access';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'New access request', 0, 1 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'ERP Access' AND c.name = 'HR & Payroll';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Modify access / role', 1, 1 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'ERP Access' AND c.name = 'HR & Payroll';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Revoke access', 2, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'ERP Access' AND c.name = 'HR & Payroll';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system) VALUES (0, 1, 'HR Concerns', 8, 1);
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT id, 2, 'Leave & Attendance', 0, 0 FROM ticket_categories WHERE parent_id = 0 AND name = 'HR Concerns';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Overtime and Accomplishment Report Form', 0, 1 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'HR Concerns' AND c.name = 'Leave & Attendance';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Application for Vacation/Sick/Undertime Leave', 1, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'HR Concerns' AND c.name = 'Leave & Attendance';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Request for Manpower Personnel', 2, 1 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'HR Concerns' AND c.name = 'Leave & Attendance';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Change Time Schedule / Cancel Restday / Change Restday', 3, 1 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'HR Concerns' AND c.name = 'Leave & Attendance';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT id, 2, 'Employee Records', 1, 0 FROM ticket_categories WHERE parent_id = 0 AND name = 'HR Concerns';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Personal info update', 0, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'HR Concerns' AND c.name = 'Employee Records';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Document request', 1, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'HR Concerns' AND c.name = 'Employee Records';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Payroll query', 2, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'HR Concerns' AND c.name = 'Employee Records';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system) VALUES (0, 1, 'Other', 9, 0);
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT id, 2, 'General Request', 0, 0 FROM ticket_categories WHERE parent_id = 0 AND name = 'Other';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Information', 0, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'Other' AND c.name = 'General Request';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Feedback', 1, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'Other' AND c.name = 'General Request';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Other', 2, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'Other' AND c.name = 'General Request';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT id, 2, 'Needs Triage', 1, 0 FROM ticket_categories WHERE parent_id = 0 AND name = 'Other';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Uncategorized', 0, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'Other' AND c.name = 'Needs Triage';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Follow-up', 1, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'Other' AND c.name = 'Needs Triage';
INSERT IGNORE INTO ticket_categories (parent_id, depth, name, sort_order, is_system)
  SELECT c.id, 3, 'Other', 2, 0 FROM ticket_categories c JOIN ticket_categories p ON p.id = c.parent_id
   WHERE p.parent_id = 0 AND p.name = 'Other' AND c.name = 'Needs Triage';

ALTER TABLE tickets MODIFY COLUMN request_type VARCHAR(50) NOT NULL DEFAULT 'service_request';
ALTER TABLE sla_policies MODIFY COLUMN request_type VARCHAR(50) NULL DEFAULT NULL;
