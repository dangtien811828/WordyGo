const pool = require('../config/db');
const { paginate } = require('../helpers/pagination');

const AIContent = {
  // ── Retrieval Sessions ────────────────────────────────────────────────────

  async getRetrievalSessions({ page = 1, limit = 20, userId = '', allPassed = '' } = {}) {
    const conditions = [];
    const params = [];

    if (userId) {
      params.push(`%${userId}%`);
      conditions.push(`(u.full_name ILIKE $${params.length} OR u.email ILIKE $${params.length})`);
    }
    if (allPassed === 'true') {
      conditions.push('rs.all_passed = TRUE');
    } else if (allPassed === 'false') {
      conditions.push('rs.all_passed = FALSE');
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const n = params.length;

    const query = `
      SELECT rs.id, rs.target_words, rs.all_passed, rs.model_used,
             rs.latency_ms, rs.tokens_in, rs.tokens_out, rs.cost_usd,
             rs.created_at,
             u.full_name, u.email
        FROM retrieval_sessions rs
        JOIN users u ON u.id = rs.user_id
        ${where}
        ORDER BY rs.created_at DESC
        LIMIT $${n + 1} OFFSET $${n + 2}`;
    const countQuery = `
      SELECT COUNT(*)::int AS count
        FROM retrieval_sessions rs
        JOIN users u ON u.id = rs.user_id
        ${where}`;

    return paginate(query, countQuery, params, params, page, limit);
  },

  async getRetrievalSessionById(id) {
    const { rows } = await pool.query(
      `SELECT rs.*, u.full_name, u.email
         FROM retrieval_sessions rs
         JOIN users u ON u.id = rs.user_id
        WHERE rs.id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  // ── Moderation Logs ───────────────────────────────────────────────────────

  async getModerationLogs({ page = 1, limit = 20, status = '', flagType = '' } = {}) {
    const conditions = [];
    const params = [];

    if (status) {
      params.push(status);
      conditions.push(`ml.status = $${params.length}`);
    }
    if (flagType) {
      params.push(flagType);
      conditions.push(`ml.flag_type = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const n = params.length;

    const query = `
      SELECT ml.id, ml.source, ml.flag_type, ml.severity, ml.status,
             ml.action_taken, ml.reviewed_at, ml.created_at,
             u.full_name AS user_name, u.email AS user_email,
             SUBSTRING(ml.input_text, 1, 120) AS input_preview
        FROM moderation_logs ml
        LEFT JOIN users u ON u.id = ml.user_id
        ${where}
        ORDER BY ml.created_at DESC
        LIMIT $${n + 1} OFFSET $${n + 2}`;
    const countQuery = `
      SELECT COUNT(*)::int AS count FROM moderation_logs ml ${where}`;

    return paginate(query, countQuery, params, params, page, limit);
  },

  async getModerationLogById(id) {
    const { rows } = await pool.query(
      `SELECT ml.*,
              u.full_name AS user_name, u.email AS user_email,
              rv.full_name AS reviewer_name
         FROM moderation_logs ml
         LEFT JOIN users u  ON u.id  = ml.user_id
         LEFT JOIN admin_accounts rv ON rv.id = ml.reviewer_id
        WHERE ml.id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  // ── Prompt Templates ──────────────────────────────────────────────────────

  async getPromptTemplates() {
    const { rows } = await pool.query(
      `SELECT * FROM prompt_templates ORDER BY status ASC, name ASC`
    );
    return rows;
  },

  // ── Stats (for index page) ────────────────────────────────────────────────

  async getStats() {
    const { rows } = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int  FROM retrieval_sessions)                         AS total_sessions,
        (SELECT ROUND(AVG(latency_ms))::int FROM retrieval_sessions)            AS avg_latency_ms,
        (SELECT COALESCE(SUM(cost_usd), 0)::numeric(10,4)
           FROM retrieval_sessions
          WHERE created_at >= CURRENT_DATE)                                     AS cost_today,
        (SELECT COUNT(*)::int  FROM moderation_logs WHERE status = 'pending')   AS pending_flags
    `);
    return rows[0];
  },

  // ── Recent rows (for index page) ──────────────────────────────────────────

  async getRecentSessions(limit = 5) {
    const { rows } = await pool.query(
      `SELECT rs.id, rs.target_words, rs.all_passed, rs.model_used,
              rs.latency_ms, rs.cost_usd, rs.created_at,
              u.full_name, u.email
         FROM retrieval_sessions rs
         JOIN users u ON u.id = rs.user_id
        ORDER BY rs.created_at DESC
        LIMIT $1`,
      [limit]
    );
    return rows;
  },

  async getRecentModerationLogs(limit = 5) {
    const { rows } = await pool.query(
      `SELECT ml.id, ml.source, ml.flag_type, ml.severity, ml.status,
              ml.created_at,
              u.full_name AS user_name,
              SUBSTRING(ml.input_text, 1, 80) AS input_preview
         FROM moderation_logs ml
         LEFT JOIN users u ON u.id = ml.user_id
        ORDER BY ml.created_at DESC
        LIMIT $1`,
      [limit]
    );
    return rows;
  },
};

module.exports = AIContent;

export {};
