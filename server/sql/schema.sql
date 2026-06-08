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
  job_title       VARCHAR(120) NULL,
  avatar_url      VARCHAR(255) NULL,
  is_active             TINYINT(1) NOT NULL DEFAULT 1,
  permissions           JSON NULL,
  -- Bumped on every password change/reset; embedded in the JWT (`tv`) and checked
  -- on each request, so changing a password invalidates all other live sessions.
  token_version         INT UNSIGNED NOT NULL DEFAULT 0,
  last_login_at         TIMESTAMP NULL,
  last_seen_at          TIMESTAMP NULL,
  notifications_seen_at TIMESTAMP NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_role (role)
);

CREATE TABLE IF NOT EXISTS tickets (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title         VARCHAR(200) NOT NULL,
  description   TEXT,
  status        ENUM('open','in_progress','on_hold','pending','resolved','closed') NOT NULL DEFAULT 'open',
  priority      ENUM('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
  request_type  ENUM('incident','service_request','question','change') NOT NULL DEFAULT 'service_request',
  category      VARCHAR(80) NULL,
  department    VARCHAR(80) NULL,
  requester     VARCHAR(120) NOT NULL,
  assignee      VARCHAR(120),
  asset_id      INT UNSIGNED NULL,
  schedule_id   INT UNSIGNED NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_tickets_status (status),
  INDEX idx_tickets_assignee (assignee),
  INDEX idx_tickets_schedule (schedule_id)
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
  INDEX idx_tkl_ticket (ticket_id),
  INDEX idx_tkl_article (article_id)
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

-- Recurring work orders (preventive maintenance). Each row is a template + a
-- cadence; the scheduler auto-generates a ticket into `tickets` when due.
CREATE TABLE IF NOT EXISTS maintenance_schedules (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title          VARCHAR(200) NOT NULL,
  description    TEXT,
  priority       ENUM('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
  request_type   ENUM('incident','service_request','question','change') NOT NULL DEFAULT 'service_request',
  category       VARCHAR(80) NULL,
  department     VARCHAR(80) NULL,
  assignee       VARCHAR(120) NULL,
  asset_id       INT UNSIGNED NULL,
  cadence        ENUM('daily','weekly','monthly','quarterly','yearly') NOT NULL,
  interval_count SMALLINT UNSIGNED NOT NULL DEFAULT 1,
  start_date     DATE NOT NULL,
  next_run_at    DATE NOT NULL,
  last_run_at    DATE NULL,
  is_active      TINYINT(1) NOT NULL DEFAULT 1,
  created_by     VARCHAR(120),
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ms_active_next (is_active, next_run_at),
  INDEX idx_ms_asset (asset_id)
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

CREATE TABLE IF NOT EXISTS chat_rooms (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  kind          VARCHAR(20) NOT NULL DEFAULT 'group',
  name          VARCHAR(120),
  created_by    INT UNSIGNED NOT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_cr_kind (kind)
);

CREATE TABLE IF NOT EXISTS chat_room_members (
  room_id       INT UNSIGNED NOT NULL,
  user_id       INT UNSIGNED NOT NULL,
  joined_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (room_id, user_id),
  INDEX idx_crm_user (user_id)
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  room_key      VARCHAR(80) NOT NULL DEFAULT 'general',
  user_id       INT UNSIGNED NOT NULL,
  user_name     VARCHAR(120) NOT NULL,
  user_role     VARCHAR(20),
  user_department VARCHAR(80),
  body          TEXT NOT NULL,
  attachment_url      VARCHAR(255) NULL,
  attachment_filename VARCHAR(255) NULL,
  attachment_mime     VARCHAR(120) NULL,
  attachment_size     INT UNSIGNED NULL,
  is_unsent     TINYINT(1) NOT NULL DEFAULT 0,
  unsent_at     TIMESTAMP NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_cm_room_created (room_key, created_at),
  INDEX idx_cm_user (user_id)
);

-- Per-user, per-room read cursor. `last_read_id` is the highest chat_messages.id
-- the user has seen in that room; unread = messages newer than it (from others).
CREATE TABLE IF NOT EXISTS chat_reads (
  user_id       INT UNSIGNED NOT NULL,
  room_key      VARCHAR(80) NOT NULL,
  last_read_id  INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, room_key)
);

-- Internal user-to-user messages (the in-app Mailbox: Inbox / Sent).
-- Author/recipient fields are denormalized (like chat_messages) so a message
-- keeps showing the names even if an account is later renamed. Each side has its
-- own soft-delete flag; the row is hard-deleted only once both sides remove it.
CREATE TABLE IF NOT EXISTS messages (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sender_id         INT UNSIGNED NOT NULL,
  sender_name       VARCHAR(120) NOT NULL,
  recipient_id      INT UNSIGNED NOT NULL,
  recipient_name    VARCHAR(120) NOT NULL,
  subject           VARCHAR(200) NOT NULL DEFAULT '',
  body              TEXT NOT NULL,
  -- Optional in-app CTA (e.g. a system message linking to a resolution survey).
  link_url          VARCHAR(255) NULL,
  link_label        VARCHAR(80) NULL,
  -- Optional single file attachment (stored on disk, served via /uploads/messages).
  attachment_url      VARCHAR(255) NULL,
  attachment_filename VARCHAR(255) NULL,
  attachment_mime     VARCHAR(120) NULL,
  attachment_size     INT UNSIGNED NULL,
  is_read           TINYINT(1) NOT NULL DEFAULT 0,
  read_at           TIMESTAMP NULL,
  sender_deleted    TINYINT(1) NOT NULL DEFAULT 0,
  recipient_deleted TINYINT(1) NOT NULL DEFAULT 0,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_msg_recipient (recipient_id, created_at),
  INDEX idx_msg_sender (sender_id, created_at)
);

-- Post-resolution survey: rates the technician who resolved a work order. One
-- row per ticket, created (status 'pending') when the WO is marked resolved and
-- a system Mailbox message is sent to the requester linking to /survey/:id.
CREATE TABLE IF NOT EXISTS ticket_surveys (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ticket_id       INT UNSIGNED NOT NULL UNIQUE,
  technician      VARCHAR(120) NOT NULL,
  technician_id   INT UNSIGNED NULL,
  respondent_id   INT UNSIGNED NOT NULL,
  respondent_name VARCHAR(120) NOT NULL,
  satisfaction    TINYINT UNSIGNED NULL,
  timeliness      TINYINT UNSIGNED NULL,
  professionalism TINYINT UNSIGNED NULL,
  comment         TEXT NULL,
  status          ENUM('pending','completed') NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at    TIMESTAMP NULL,
  INDEX idx_ts_respondent (respondent_id),
  INDEX idx_ts_technician (technician_id)
);

CREATE TABLE IF NOT EXISTS password_reset_requests (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id       INT UNSIGNED NOT NULL,
  email         VARCHAR(160) NOT NULL,
  status        ENUM('pending','resolved','denied') NOT NULL DEFAULT 'pending',
  resolved_by   VARCHAR(120),
  resolved_at   TIMESTAMP NULL,
  admin_notes   TEXT,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_prr_status (status),
  INDEX idx_prr_user (user_id)
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id     INT UNSIGNED NOT NULL,
  token_hash  CHAR(64) NOT NULL UNIQUE,
  expires_at  TIMESTAMP NOT NULL,
  used_at     TIMESTAMP NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_prt_user (user_id)
);

CREATE TABLE IF NOT EXISTS departments (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(80) NOT NULL UNIQUE,
  description   VARCHAR(255),
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_departments_active (is_active)
);

-- System announcements / maintenance notices shown on the dashboard.
CREATE TABLE IF NOT EXISTS announcements (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title           VARCHAR(160) NOT NULL,
  body            TEXT,
  type            ENUM('info','maintenance','warning') NOT NULL DEFAULT 'info',
  starts_at       DATETIME NULL,
  ends_at         DATETIME NULL,
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  created_by      INT UNSIGNED NULL,
  created_by_name VARCHAR(120) NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ann_active (is_active)
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

-- Jira-style project spaces (separate from IT work orders / tickets).
CREATE TABLE IF NOT EXISTS spaces (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  space_key    VARCHAR(10) NOT NULL UNIQUE,
  name         VARCHAR(120) NOT NULL,
  description  TEXT,
  icon_url     VARCHAR(255) NULL,
  owner_id     INT UNSIGNED NOT NULL,
  owner_name   VARCHAR(120) NOT NULL,
  item_seq     INT UNSIGNED NOT NULL DEFAULT 0,
  is_archived  TINYINT(1) NOT NULL DEFAULT 0,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_spaces_owner (owner_id)
);

CREATE TABLE IF NOT EXISTS space_members (
  space_id   INT UNSIGNED NOT NULL,
  user_id    INT UNSIGNED NOT NULL,
  role       ENUM('owner','member') NOT NULL DEFAULT 'member',
  added_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (space_id, user_id),
  INDEX idx_sm_user (user_id),
  FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
);

-- Requests from non-members to join a (member-private) space. One row per
-- (space, user); a re-request flips an old denied/approved row back to pending.
CREATE TABLE IF NOT EXISTS space_join_requests (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  space_id    INT UNSIGNED NOT NULL,
  user_id     INT UNSIGNED NOT NULL,
  user_name   VARCHAR(120) NOT NULL,
  status      ENUM('pending','approved','denied') NOT NULL DEFAULT 'pending',
  message     VARCHAR(500) NULL,
  reviewed_by INT UNSIGNED NULL,
  reviewed_at TIMESTAMP NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_sjr_space_user (space_id, user_id),
  INDEX idx_sjr_space_status (space_id, status),
  FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS space_items (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  space_id       INT UNSIGNED NOT NULL,
  item_key       VARCHAR(20) NOT NULL,
  title          VARCHAR(255) NOT NULL,
  description    MEDIUMTEXT,
  type           ENUM('epic','task','subtask') NOT NULL DEFAULT 'task',
  status         ENUM('todo','in_progress','done') NOT NULL DEFAULT 'todo',
  priority       ENUM('low','normal','high','urgent') NOT NULL DEFAULT 'normal',
  assignee_id    INT UNSIGNED NULL,
  assignee_name  VARCHAR(120) NULL,
  reporter_id    INT UNSIGNED NOT NULL,
  reporter_name  VARCHAR(120) NOT NULL,
  parent_id      INT UNSIGNED NULL,
  position       INT NOT NULL DEFAULT 0,
  sla_days       SMALLINT UNSIGNED NULL,
  due_at         DATE NULL,
  start_date     DATE NULL,
  labels         VARCHAR(255) NULL,
  team           VARCHAR(120) NULL,
  completed_at   TIMESTAMP NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_space_item_key (space_id, item_key),
  INDEX idx_si_space_status (space_id, status),
  INDEX idx_si_space_assignee (space_id, assignee_id),
  INDEX idx_si_parent (parent_id),
  FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS space_item_comments (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  item_id      INT UNSIGNED NOT NULL,
  space_id     INT UNSIGNED NOT NULL,
  author_id    INT UNSIGNED NOT NULL,
  author_name  VARCHAR(120) NOT NULL,
  body         TEXT NOT NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sic_item (item_id),
  FOREIGN KEY (item_id) REFERENCES space_items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS space_item_links (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  space_id       INT UNSIGNED NOT NULL,
  item_id        INT UNSIGNED NOT NULL,
  linked_item_id INT UNSIGNED NOT NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_link (item_id, linked_item_id),
  INDEX idx_sil_linked (linked_item_id),
  FOREIGN KEY (item_id) REFERENCES space_items(id) ON DELETE CASCADE,
  FOREIGN KEY (linked_item_id) REFERENCES space_items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS space_item_history (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  item_id     INT UNSIGNED NOT NULL,
  space_id    INT UNSIGNED NOT NULL,
  actor_id    INT UNSIGNED NULL,
  actor_name  VARCHAR(120) NOT NULL,
  field       VARCHAR(40) NOT NULL,
  old_value   VARCHAR(255) NULL,
  new_value   VARCHAR(255) NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sih_item (item_id),
  FOREIGN KEY (item_id) REFERENCES space_items(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS space_docs (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  space_id     INT UNSIGNED NOT NULL,
  title        VARCHAR(200) NOT NULL,
  body         MEDIUMTEXT,
  file_path    VARCHAR(255) NULL,
  file_name    VARCHAR(255) NULL,
  mime         VARCHAR(120) NULL,
  size         INT UNSIGNED NULL,
  author_id    INT UNSIGNED NOT NULL,
  author_name  VARCHAR(120) NOT NULL,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sd_space (space_id),
  FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS space_goals (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  space_id     INT UNSIGNED NOT NULL,
  title        VARCHAR(200) NOT NULL,
  description  TEXT,
  status       ENUM('on_track','at_risk','off_track','done') NOT NULL DEFAULT 'on_track',
  progress     TINYINT UNSIGNED NOT NULL DEFAULT 0,
  target_date  DATE NULL,
  created_by   VARCHAR(120),
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_sg_space (space_id),
  FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
);

-- Seed admin user (password: admin123)
INSERT INTO users (email, password_hash, name, role, department, is_active) VALUES
  ('admin@mainframe.local',
   '$2b$10$CoyXTfr1.ACqBOfZzg6QRO/C11uS9aB4LldVc7O79tdoQfhlHFdVS',
   'Admin', 'admin', 'IT', 1)
ON DUPLICATE KEY UPDATE email = email;

-- Seed admin user (password: admin101)
INSERT INTO users (email, password_hash, name, role, department, is_active) VALUES
  ('admin@bwsuperbakeshop.ph',
   '$2b$10$mWxM7fBfkkuhUf.QQ.ixXeeN4PYk3yGj5/IyMmQRAfN.uQqKnEi16',
   'Admin', 'admin', 'IT', 1)
ON DUPLICATE KEY UPDATE email = email;

-- Sample data so the dashboard counters aren't empty.
INSERT INTO assets (asset_tag, type, model, assignee, location, status) VALUES
  ('LT-0001', 'Laptop', 'ThinkPad T14', 'jdoe', 'HQ — Floor 3', 'in_use'),
  ('MN-0014', 'Monitor', 'Dell U2723QE', 'jdoe', 'HQ — Floor 3', 'in_use'),
  ('LT-0002', 'Laptop', 'MacBook Pro 14', 'asmith', 'Remote', 'in_use')
ON DUPLICATE KEY UPDATE asset_tag = asset_tag;

INSERT INTO departments (name, description) VALUES
  ('IT', 'Information Technology'),
  ('HR', 'Human Resources'),
  ('Finance', 'Finance and Accounting'),
  ('Operations', 'Business Operations')
ON DUPLICATE KEY UPDATE name = name;

INSERT INTO kb_articles (title, slug, category, body, author) VALUES
  ('Resetting your company password', 'reset-password', 'Accounts',
   '# Reset your password\n\nVisit sso.company.local and follow the prompts...', 'IT Team'),
  ('Connecting to the office VPN', 'vpn-setup', 'Networking',
   '# VPN setup\n\nDownload the client from the IT portal...', 'IT Team')
ON DUPLICATE KEY UPDATE slug = slug;

