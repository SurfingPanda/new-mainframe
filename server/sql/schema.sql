-- Mainframe schema (MySQL 8 / MariaDB)
CREATE DATABASE IF NOT EXISTS mainframe_app
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE mainframe_app;

CREATE TABLE IF NOT EXISTS users (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email           VARCHAR(160) NOT NULL UNIQUE,
  password_hash   VARCHAR(255) NOT NULL,
  name            VARCHAR(120) NOT NULL,
  role            ENUM('admin','agent','user') NOT NULL DEFAULT 'user',
  department      VARCHAR(80),
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  permissions     JSON NULL,
  last_login_at   TIMESTAMP NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_role (role)
);

CREATE TABLE IF NOT EXISTS tickets (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title         VARCHAR(200) NOT NULL,
  description   TEXT,
  status        ENUM('open','in_progress','on_hold','resolved','closed') NOT NULL DEFAULT 'open',
  priority      ENUM('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
  request_type  ENUM('incident','service_request','question','change') NOT NULL DEFAULT 'service_request',
  category      VARCHAR(80) NULL,
  requester     VARCHAR(120) NOT NULL,
  assignee      VARCHAR(120),
  asset_id      INT UNSIGNED NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tickets_status (status),
  INDEX idx_tickets_assignee (assignee)
);

CREATE TABLE IF NOT EXISTS ticket_activity (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id     INT UNSIGNED NOT NULL,
  type          ENUM('change','note') NOT NULL DEFAULT 'change',
  actor         VARCHAR(120),
  field         VARCHAR(40),
  old_value     VARCHAR(500),
  new_value     VARCHAR(500),
  body          TEXT,
  attachment_id INT UNSIGNED NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ta_ticket_act (ticket_id, created_at)
);

CREATE TABLE IF NOT EXISTS ticket_kb_links (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id   INT UNSIGNED NOT NULL,
  article_id  INT UNSIGNED NOT NULL,
  linked_by   VARCHAR(120),
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_ticket_article (ticket_id, article_id),
  INDEX idx_tkl_ticket (ticket_id)
);

CREATE TABLE IF NOT EXISTS ticket_attachments (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id         INT UNSIGNED NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  stored_filename   VARCHAR(255) NOT NULL,
  mime_type         VARCHAR(120) NOT NULL,
  size_bytes        INT UNSIGNED NOT NULL,
  uploaded_by       VARCHAR(120),
  uploaded_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ta_ticket (ticket_id)
);

CREATE TABLE IF NOT EXISTS assets (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  asset_tag     VARCHAR(60) NOT NULL UNIQUE,
  type          VARCHAR(60) NOT NULL,
  model         VARCHAR(120),
  serial_no     VARCHAR(120),
  assignee      VARCHAR(120),
  location      VARCHAR(120),
  status        ENUM('in_use','in_storage','repair','retired') NOT NULL DEFAULT 'in_use',
  purchased_at  DATE,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_assets_type (type),
  INDEX idx_assets_status (status)
);

CREATE TABLE IF NOT EXISTS kb_articles (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title         VARCHAR(200) NOT NULL,
  slug          VARCHAR(200) NOT NULL UNIQUE,
  category      VARCHAR(80),
  body          MEDIUMTEXT NOT NULL,
  author        VARCHAR(120),
  published     TINYINT(1) NOT NULL DEFAULT 1,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_kb_category (category),
  INDEX idx_kb_published (published)
);

CREATE TABLE IF NOT EXISTS asset_requests (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  requester_id    INT UNSIGNED NOT NULL,
  requester_name  VARCHAR(120) NOT NULL,
  asset_type      VARCHAR(60) NOT NULL,
  quantity        SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  urgency         ENUM('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
  justification   TEXT NOT NULL,
  department      VARCHAR(80),
  status          ENUM('pending','approved','denied','fulfilled') NOT NULL DEFAULT 'pending',
  reviewed_by     VARCHAR(120),
  reviewed_at     TIMESTAMP NULL,
  admin_notes     TEXT,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ar_requester (requester_id),
  INDEX idx_ar_status (status)
);

-- Seed admin user (password: admin123)
INSERT INTO users (email, password_hash, name, role, department, is_active) VALUES
  ('admin@mainframe.local',
   '$2b$10$CoyXTfr1.ACqBOfZzg6QRO/C11uS9aB4LldVc7O79tdoQfhlHFdVS',
   'Admin', 'admin', 'IT', 1)
ON DUPLICATE KEY UPDATE email = email;

-- Sample data so the dashboard counters aren't empty.
INSERT INTO assets (asset_tag, type, model, assignee, location, status) VALUES
  ('LT-0001', 'Laptop', 'ThinkPad T14', 'jdoe', 'HQ — Floor 3', 'in_use'),
  ('MN-0014', 'Monitor', 'Dell U2723QE', 'jdoe', 'HQ — Floor 3', 'in_use'),
  ('LT-0002', 'Laptop', 'MacBook Pro 14', 'asmith', 'Remote', 'in_use')
ON DUPLICATE KEY UPDATE asset_tag = asset_tag;

INSERT INTO kb_articles (title, slug, category, body, author) VALUES
  ('Resetting your company password', 'reset-password', 'Accounts',
   '# Reset your password\n\nVisit sso.company.local and follow the prompts...', 'IT Team'),
  ('Connecting to the office VPN', 'vpn-setup', 'Networking',
   '# VPN setup\n\nDownload the client from the IT portal...', 'IT Team')
ON DUPLICATE KEY UPDATE slug = slug;

INSERT INTO tickets (title, description, priority, requester, status) VALUES
  ('Outlook keeps asking for credentials', 'Started this morning after the update', 'normal', 'jdoe', 'open'),
  ('Replace dock for monitor flicker', 'Second monitor flickers on dock', 'low', 'asmith', 'in_progress');
