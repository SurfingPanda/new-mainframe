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
      INDEX idx_tkl_ticket (ticket_id)
    )
  `);
}
