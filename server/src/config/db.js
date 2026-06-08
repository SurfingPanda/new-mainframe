import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'mainframe_app',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

export async function pingDb() {
  const conn = await pool.getConnection();
  try {
    await conn.query('SELECT 1');
    return true;
  } finally {
    conn.release();
  }
}

export async function ensureSchema() {
  // users.permissions for per-module access overrides
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN permissions JSON NULL AFTER is_active`);
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }

  // users.notifications_seen_at marks when the user last cleared their bell.
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN notifications_seen_at TIMESTAMP NULL AFTER last_login_at`);
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }

  // users.token_version — bumped on every password change/reset and embedded in
  // the JWT (`tv`); requireAuth rejects tokens whose tv no longer matches, so a
  // password change invalidates all other outstanding sessions.
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN token_version INT UNSIGNED NOT NULL DEFAULT 0 AFTER permissions`);
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }

  // users.last_seen_at is bumped on each authenticated request to power the
  // chat presence indicator. Anyone seen within ~90s shows as online.
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN last_seen_at TIMESTAMP NULL AFTER last_login_at`);
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }

  // users.job_title (admin-managed) and users.avatar_url (profile picture path
  // under /uploads/avatars). Added idempotently for pre-existing databases.
  for (const stmt of [
    `ALTER TABLE users ADD COLUMN job_title VARCHAR(120) NULL AFTER department`,
    `ALTER TABLE users ADD COLUMN avatar_url VARCHAR(255) NULL AFTER job_title`
  ]) {
    try {
      await pool.query(stmt);
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') throw err;
    }
  }

  // tickets.status gained a 'pending' value (Pending - Waiting for Customer).
  // MODIFY with the full enum is idempotent — re-running it is a harmless no-op.
  await pool.query(`
    ALTER TABLE tickets
      MODIFY COLUMN status
        ENUM('open','in_progress','on_hold','pending','resolved','closed')
        NOT NULL DEFAULT 'open'
  `);

  // tickets.department routes a ticket to a department's queue.
  try {
    await pool.query(`ALTER TABLE tickets ADD COLUMN department VARCHAR(80) NULL AFTER category`);
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }

  await pool.query(`
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
    )
  `);
  // Add attachment_id for tables that pre-existed without it.
  try {
    await pool.query(`ALTER TABLE ticket_activity ADD COLUMN attachment_id INT UNSIGNED NULL`);
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS ticket_kb_links (
      id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      ticket_id   INT UNSIGNED NOT NULL,
      article_id  INT UNSIGNED NOT NULL,
      linked_by   VARCHAR(120),
      created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_ticket_article (ticket_id, article_id),
      INDEX idx_tkl_ticket (ticket_id),
      INDEX idx_tkl_article (article_id)
    )
  `);
  // Index for counting how many tickets link a given article (KB list).
  try {
    await pool.query(`ALTER TABLE ticket_kb_links ADD INDEX idx_tkl_article (article_id)`);
  } catch (err) {
    if (err.code !== 'ER_DUP_KEYNAME') throw err;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_rooms (
      id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      kind          VARCHAR(20) NOT NULL DEFAULT 'group',
      name          VARCHAR(120),
      created_by    INT UNSIGNED NOT NULL,
      created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_cr_kind (kind)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_room_members (
      room_id       INT UNSIGNED NOT NULL,
      user_id       INT UNSIGNED NOT NULL,
      joined_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (room_id, user_id),
      INDEX idx_crm_user (user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      room_key      VARCHAR(80) NOT NULL DEFAULT 'general',
      user_id       INT UNSIGNED NOT NULL,
      user_name     VARCHAR(120) NOT NULL,
      user_role     VARCHAR(20),
      user_department VARCHAR(80),
      body          TEXT NOT NULL,
      created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_cm_room_created (room_key, created_at),
      INDEX idx_cm_user (user_id)
    )
  `);

  // chat_messages.room_key was added in a later iteration — add it idempotently
  // for databases that pre-date it. Existing rows default to 'general'.
  try {
    await pool.query(
      `ALTER TABLE chat_messages ADD COLUMN room_key VARCHAR(80) NOT NULL DEFAULT 'general' AFTER id`
    );
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }
  try {
    await pool.query(`ALTER TABLE chat_messages ADD INDEX idx_cm_room_created (room_key, created_at)`);
  } catch (err) {
    if (err.code !== 'ER_DUP_KEYNAME') throw err;
  }

  // chat_messages attachment columns — also added later.
  for (const stmt of [
    `ALTER TABLE chat_messages ADD COLUMN attachment_url      VARCHAR(255) NULL`,
    `ALTER TABLE chat_messages ADD COLUMN attachment_filename VARCHAR(255) NULL`,
    `ALTER TABLE chat_messages ADD COLUMN attachment_mime     VARCHAR(120) NULL`,
    `ALTER TABLE chat_messages ADD COLUMN attachment_size     INT UNSIGNED NULL`
  ]) {
    try {
      await pool.query(stmt);
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') throw err;
    }
  }

  // chat_messages.is_unsent / unsent_at — message deletion is now a soft
  // "unsend" so the placeholder ("You unsent a message") can propagate to
  // the other end via the existing 5s poll.
  for (const stmt of [
    `ALTER TABLE chat_messages ADD COLUMN is_unsent TINYINT(1) NOT NULL DEFAULT 0`,
    `ALTER TABLE chat_messages ADD COLUMN unsent_at TIMESTAMP NULL`
  ]) {
    try {
      await pool.query(stmt);
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') throw err;
    }
  }

  // Per-user, per-room chat read cursor (drives the chat unread badge).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_reads (
      user_id       INT UNSIGNED NOT NULL,
      room_key      VARCHAR(80) NOT NULL,
      last_read_id  INT UNSIGNED NOT NULL DEFAULT 0,
      updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, room_key)
    )
  `);

  // Internal user-to-user messages (the in-app Mailbox: Inbox / Sent). Author and
  // recipient fields are denormalized so renamed accounts don't blank out old
  // mail; each side soft-deletes independently (row removed once both delete).
  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      sender_id         INT UNSIGNED NOT NULL,
      sender_name       VARCHAR(120) NOT NULL,
      recipient_id      INT UNSIGNED NOT NULL,
      recipient_name    VARCHAR(120) NOT NULL,
      subject           VARCHAR(200) NOT NULL DEFAULT '',
      body              TEXT NOT NULL,
      is_read           TINYINT(1) NOT NULL DEFAULT 0,
      read_at           TIMESTAMP NULL,
      sender_deleted    TINYINT(1) NOT NULL DEFAULT 0,
      recipient_deleted TINYINT(1) NOT NULL DEFAULT 0,
      created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_msg_recipient (recipient_id, created_at),
      INDEX idx_msg_sender (sender_id, created_at)
    )
  `);

  // messages.link_url / link_label — optional in-app CTA on a message (used by
  // the system resolution-survey message). Added idempotently for older DBs.
  for (const stmt of [
    `ALTER TABLE messages ADD COLUMN link_url   VARCHAR(255) NULL AFTER body`,
    `ALTER TABLE messages ADD COLUMN link_label VARCHAR(80)  NULL AFTER link_url`
  ]) {
    try {
      await pool.query(stmt);
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') throw err;
    }
  }

  // messages attachment columns — a Mailbox message can carry one uploaded file.
  for (const stmt of [
    `ALTER TABLE messages ADD COLUMN attachment_url      VARCHAR(255) NULL`,
    `ALTER TABLE messages ADD COLUMN attachment_filename VARCHAR(255) NULL`,
    `ALTER TABLE messages ADD COLUMN attachment_mime     VARCHAR(120) NULL`,
    `ALTER TABLE messages ADD COLUMN attachment_size     INT UNSIGNED NULL`
  ]) {
    try {
      await pool.query(stmt);
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') throw err;
    }
  }

  // Post-resolution technician survey (one row per work order).
  await pool.query(`
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
    )
  `);

  await pool.query(`
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
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id     INT UNSIGNED NOT NULL,
      token_hash  CHAR(64) NOT NULL UNIQUE,
      expires_at  TIMESTAMP NOT NULL,
      used_at     TIMESTAMP NULL,
      created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_prt_user (user_id)
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS departments (
      id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      name          VARCHAR(80) NOT NULL UNIQUE,
      description   VARCHAR(255),
      is_active     TINYINT(1) NOT NULL DEFAULT 1,
      created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_departments_active (is_active)
    )
  `);

  await pool.query(`
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
    )
  `);

  // Recurring work orders (preventive maintenance). The scheduler in
  // lib/maintenance-scheduler.js reads is_active + next_run_at to generate WOs.
  await pool.query(`
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
    )
  `);

  // tickets.schedule_id links an auto-generated work order back to its schedule.
  try {
    await pool.query(`ALTER TABLE tickets ADD COLUMN schedule_id INT UNSIGNED NULL AFTER asset_id`);
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }
  try {
    await pool.query(`ALTER TABLE tickets ADD INDEX idx_tickets_schedule (schedule_id)`);
  } catch (err) {
    if (err.code !== 'ER_DUP_KEYNAME') throw err;
  }

  // Jira-style project spaces (separate from IT work orders / tickets).
  await pool.query(`
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
    )
  `);

  // spaces.icon_url — optional per-space profile icon (square WebP under /uploads/avatars).
  try {
    await pool.query(`ALTER TABLE spaces ADD COLUMN icon_url VARCHAR(255) NULL AFTER description`);
  } catch (err) {
    if (err.code !== 'ER_DUP_FIELDNAME') throw err;
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS space_members (
      space_id   INT UNSIGNED NOT NULL,
      user_id    INT UNSIGNED NOT NULL,
      role       ENUM('owner','member') NOT NULL DEFAULT 'member',
      added_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (space_id, user_id),
      INDEX idx_sm_user (user_id),
      FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
    )
  `);

  await pool.query(`
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
      FOREIGN KEY (space_id) REFERENCES spaces(id) ON DELETE CASCADE
    )
  `);

  // SLA target (days to complete) + derived due date and Jira-style detail fields.
  for (const stmt of [
    `ALTER TABLE space_items ADD COLUMN sla_days SMALLINT UNSIGNED NULL AFTER position`,
    `ALTER TABLE space_items ADD COLUMN due_at DATE NULL AFTER sla_days`,
    `ALTER TABLE space_items ADD COLUMN start_date DATE NULL AFTER due_at`,
    `ALTER TABLE space_items ADD COLUMN labels VARCHAR(255) NULL AFTER start_date`,
    `ALTER TABLE space_items ADD COLUMN team VARCHAR(120) NULL AFTER labels`
  ]) {
    try {
      await pool.query(stmt);
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') throw err;
    }
  }
  try {
    await pool.query(`ALTER TABLE space_items ADD INDEX idx_si_parent (parent_id)`);
  } catch (err) {
    if (err.code !== 'ER_DUP_KEYNAME') throw err;
  }

  await pool.query(`
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
    )
  `);

  await pool.query(`
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
    )
  `);

  await pool.query(`
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
    )
  `);

  await pool.query(`
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
    )
  `);

  // space_docs file-upload columns — Documents now stores uploaded files
  // (PDF/Office/images) instead of only Markdown notes.
  for (const stmt of [
    `ALTER TABLE space_docs ADD COLUMN file_path VARCHAR(255) NULL AFTER body`,
    `ALTER TABLE space_docs ADD COLUMN file_name VARCHAR(255) NULL AFTER file_path`,
    `ALTER TABLE space_docs ADD COLUMN mime      VARCHAR(120) NULL AFTER file_name`,
    `ALTER TABLE space_docs ADD COLUMN size      INT UNSIGNED NULL AFTER mime`
  ]) {
    try {
      await pool.query(stmt);
    } catch (err) {
      if (err.code !== 'ER_DUP_FIELDNAME') throw err;
    }
  }

  await pool.query(`
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
    )
  `);

  await pool.query(`
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
    )
  `);

  await pool.query(`
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
    )
  `);
}
