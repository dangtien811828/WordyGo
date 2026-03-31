const pool = require('../config/db');
const { paginate } = require('../helpers/pagination');

const User = {
  async getAll({ search = '', status = '', level = '', page = 1, limit = 20 } = {}) {
    const conditions = [];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      params.push(`%${search}%`);
      conditions.push(`(full_name ILIKE $${params.length - 1} OR email ILIKE $${params.length})`);
    }
    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }
    if (level) {
      params.push(level);
      conditions.push(`level = $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const n = params.length;

    const query = `
      SELECT id, email, full_name, phone, avatar_url, level, status,
             streak_current, streak_longest, last_active_at, last_login_at, created_at
      FROM users
      ${where}
      ORDER BY created_at DESC
      LIMIT $${n + 1} OFFSET $${n + 2}
    `;
    const countQuery = `SELECT COUNT(*)::int AS count FROM users ${where}`;

    return paginate(query, countQuery, params, params, page, limit);
  },

  async findById(id) {
    const { rows } = await pool.query(
      `SELECT id, email, full_name, phone, avatar_url, level, status,
              streak_current, streak_longest, last_active_at, last_login_at, created_at, updated_at
       FROM users WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  async findByEmail(email) {
    const { rows } = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );
    return rows[0] || null;
  },

  async create({ email, passwordHash, fullName, phone = null, level = 'beginner' }) {
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, phone, level)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, full_name, level, created_at`,
      [email, passwordHash, fullName, phone, level]
    );
    return rows[0];
  },

  async update(id, { fullName, phone, level, status }) {
    await pool.query(
      'UPDATE users SET full_name = $1, phone = $2, level = $3, status = $4 WHERE id = $5',
      [fullName, phone || null, level, status, id]
    );
  },

  async setStatus(id, status) {
    await pool.query(
      'UPDATE users SET status = $1 WHERE id = $2',
      [status, id]
    );
  },

  async delete(id) {
    await pool.query('DELETE FROM users WHERE id = $1', [id]);
  },

  async countByStatus() {
    const { rows } = await pool.query(
      'SELECT status, COUNT(*)::int AS count FROM users GROUP BY status'
    );
    const result = { active: 0, inactive: 0, banned: 0 };
    rows.forEach(r => { result[r.status] = r.count; });
    return result;
  },

  async count() {
    const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM users');
    return rows[0].count;
  },
};

module.exports = User;
