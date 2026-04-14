const pool = require('../config/db');
const { paginate } = require('../helpers/pagination');

const Ebook = {
  async getAll({ search = '', level = '', status = '', page = 1, limit = 20 } = {}) {
    const conditions = [];
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      params.push(`%${search}%`);
      conditions.push(`(e.title ILIKE $${params.length - 1} OR e.author ILIKE $${params.length})`);
    }
    if (level) {
      params.push(level);
      conditions.push(`e.level = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`e.status = $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const n = params.length;

    const query = `
      SELECT e.id, e.title, e.author, e.level, e.status, e.required_plan,
             e.total_chapters, e.total_words, e.cover_url, e.created_at, e.created_by,
             a.full_name AS creator_name
      FROM ebooks e
      LEFT JOIN admin_accounts a ON a.id = e.created_by
      ${where}
      ORDER BY e.created_at DESC
      LIMIT $${n + 1} OFFSET $${n + 2}`;
    const countQuery = `SELECT COUNT(*)::int AS count FROM ebooks e ${where}`;

    return paginate(query, countQuery, params, params, page, limit);
  },

  async findById(id) {
    const { rows } = await pool.query(`
      SELECT e.*, a.full_name AS creator_name
      FROM ebooks e
      LEFT JOIN admin_accounts a ON a.id = e.created_by
      WHERE e.id = $1`,
      [id]
    );
    if (!rows[0]) return null;

    const { rows: chapters } = await pool.query(`
      SELECT id, chapter_index, title, word_count, has_tts
      FROM chapters
      WHERE ebook_id = $1
      ORDER BY chapter_index ASC`,
      [id]
    );

    return { ...rows[0], chapters };
  },

  async create(data, adminId) {
    const { rows } = await pool.query(`
      INSERT INTO ebooks
        (title, author, isbn, description, cover_url, epub_file_url,
         level, genre, total_chapters, total_words,
         required_plan, tts_voice, tts_speed, status, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING *`,
      [
        data.title.trim(),
        data.author ? data.author.trim() : null,
        data.isbn || null,
        data.description || null,
        data.cover_url || null,
        data.epub_file_url || null,
        data.level || 'beginner',
        Array.isArray(data.genre) ? data.genre : (data.genre ? [data.genre] : []),
        data.total_chapters ? parseInt(data.total_chapters) : 0,
        data.total_words ? parseInt(data.total_words) : 0,
        data.required_plan || 'free',
        data.tts_voice || null,
        data.tts_speed ? parseFloat(data.tts_speed) : 1.0,
        data.status || 'draft',
        adminId,
      ]
    );
    return rows[0];
  },

  async update(id, data) {
    await pool.query(`
      UPDATE ebooks SET
        title          = $1,
        author         = $2,
        isbn           = $3,
        description    = $4,
        cover_url      = $5,
        level          = $6,
        genre          = $7,
        required_plan  = $8,
        tts_voice      = $9,
        tts_speed      = $10,
        status         = $11,
        updated_at     = NOW()
      WHERE id = $12`,
      [
        data.title.trim(),
        data.author ? data.author.trim() : null,
        data.isbn || null,
        data.description || null,
        data.cover_url || null,
        data.level || 'beginner',
        Array.isArray(data.genre) ? data.genre : (data.genre ? [data.genre] : []),
        data.required_plan || 'free',
        data.tts_voice || null,
        data.tts_speed ? parseFloat(data.tts_speed) : 1.0,
        data.status || 'draft',
        id,
      ]
    );
  },

  async delete(id) {
    // CASCADE deletes chapters, tts_cache, ebook_glossary, user_reading_progress
    await pool.query('DELETE FROM ebooks WHERE id = $1', [id]);
  },

  async getByCreator(adminId, { page = 1, limit = 20 } = {}) {
    const query = `
      SELECT e.id, e.title, e.author, e.level, e.status, e.required_plan,
             e.total_chapters, e.created_at
      FROM ebooks e
      WHERE e.created_by = $1
      ORDER BY e.created_at DESC
      LIMIT $2 OFFSET $3`;
    const countQuery = `SELECT COUNT(*)::int AS count FROM ebooks WHERE created_by = $1`;
    return paginate(query, countQuery, [adminId], [adminId], page, limit);
  },
};

module.exports = Ebook;

export {};
