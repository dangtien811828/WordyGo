const pool = require('../config/db');
const { paginate } = require('../helpers/pagination');

const Game = {
  // ── Word Lists ────────────────────────────────────────────────────────────

  async getWordLists({ gameType = '', search = '', page = 1, limit = 20 } = {}) {
    const conditions = [];
    const params = [];

    if (gameType) {
      params.push(gameType);
      conditions.push(`gwl.game_type = $${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      conditions.push(`gwl.name ILIKE $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const n = params.length;

    const query = `
      SELECT gwl.*,
             a.full_name AS creator_name,
             COUNT(gwli.entry_id)::int AS word_count
        FROM game_word_lists gwl
        LEFT JOIN admin_accounts a ON a.id = gwl.created_by
        LEFT JOIN game_word_list_items gwli ON gwli.list_id = gwl.id
        ${where}
        GROUP BY gwl.id, a.full_name
        ORDER BY gwl.created_at DESC
        LIMIT $${n + 1} OFFSET $${n + 2}`;
    const countQuery = `
      SELECT COUNT(*)::int AS count FROM game_word_lists gwl ${where}`;

    return paginate(query, countQuery, params, params, page, limit);
  },

  async getWordListById(id) {
    const { rows } = await pool.query(
      `SELECT gwl.*, a.full_name AS creator_name
         FROM game_word_lists gwl
         LEFT JOIN admin_accounts a ON a.id = gwl.created_by
        WHERE gwl.id = $1`,
      [id]
    );
    if (!rows[0]) return null;
    const list = rows[0];

    const { rows: items } = await pool.query(
      `SELECT gwli.entry_id, de.headword, de.meaning_vi
         FROM game_word_list_items gwli
         JOIN dictionary_entries de ON de.id = gwli.entry_id
        WHERE gwli.list_id = $1
        ORDER BY de.headword ASC`,
      [id]
    );
    list.items = items;
    return list;
  },

  async createWordList(data, entryIds = []) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO game_word_lists (game_type, name, topic, level, status, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [data.game_type, data.name, data.topic || null, data.level, data.status, data.created_by]
      );
      const list = rows[0];
      for (const eid of entryIds) {
        await client.query(
          `INSERT INTO game_word_list_items (list_id, entry_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [list.id, eid]
        );
      }
      await client.query('COMMIT');
      return list;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async updateWordList(id, data, entryIds = []) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `UPDATE game_word_lists SET game_type=$1, name=$2, topic=$3, level=$4, status=$5
          WHERE id=$6 RETURNING *`,
        [data.game_type, data.name, data.topic || null, data.level, data.status, id]
      );
      if (!rows[0]) { await client.query('ROLLBACK'); return null; }
      await client.query('DELETE FROM game_word_list_items WHERE list_id=$1', [id]);
      for (const eid of entryIds) {
        await client.query(
          `INSERT INTO game_word_list_items (list_id, entry_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
          [id, eid]
        );
      }
      await client.query('COMMIT');
      return rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async deleteWordList(id) {
    await pool.query('DELETE FROM game_word_lists WHERE id=$1', [id]);
  },

  // ── Levels ────────────────────────────────────────────────────────────────

  async getLevels(gameType) {
    const { rows } = await pool.query(
      `SELECT * FROM game_levels WHERE game_type=$1 ORDER BY level_number ASC`,
      [gameType]
    );
    return rows;
  },

  async createLevel(data) {
    const { rows } = await pool.query(
      `INSERT INTO game_levels (game_type, level_number, config_json, status)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [data.game_type, data.level_number, data.config_json, data.status || 'active']
    );
    return rows[0];
  },

  async updateLevel(id, data) {
    const { rows } = await pool.query(
      `UPDATE game_levels SET level_number=$1, config_json=$2, status=$3 WHERE id=$4 RETURNING *`,
      [data.level_number, data.config_json, data.status || 'active', id]
    );
    return rows[0] || null;
  },

  async deleteLevel(id) {
    await pool.query('DELETE FROM game_levels WHERE id=$1', [id]);
  },

  // ── Semantic Sets ─────────────────────────────────────────────────────────

  async getSemanticSets({ page = 1, limit = 20 } = {}) {
    const query = `
      SELECT ss.*,
             a.full_name AS creator_name,
             COUNT(ssi.id)::int AS item_count
        FROM semantic_sets ss
        LEFT JOIN admin_accounts a ON a.id = ss.created_by
        LEFT JOIN semantic_set_items ssi ON ssi.set_id = ss.id
        GROUP BY ss.id, a.full_name
        ORDER BY ss.created_at DESC
        LIMIT $1 OFFSET $2`;
    const countQuery = `SELECT COUNT(*)::int AS count FROM semantic_sets`;
    return paginate(query, countQuery, [], [], page, limit);
  },

  async getSemanticSetById(id) {
    const { rows } = await pool.query(
      `SELECT ss.*, a.full_name AS creator_name
         FROM semantic_sets ss
         LEFT JOIN admin_accounts a ON a.id = ss.created_by
        WHERE ss.id = $1`,
      [id]
    );
    if (!rows[0]) return null;
    const set = rows[0];

    const { rows: items } = await pool.query(
      `SELECT ssi.id, ssi.entry_id, ssi.correct_order, ssi.hint_vi,
              de.headword, de.meaning_vi
         FROM semantic_set_items ssi
         JOIN dictionary_entries de ON de.id = ssi.entry_id
        WHERE ssi.set_id = $1
        ORDER BY ssi.correct_order ASC`,
      [id]
    );
    set.items = items;
    return set;
  },

  async createSemanticSet(data, items = []) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO semantic_sets (name, scale_description, level, status, created_by)
         VALUES ($1,$2,$3,$4,$5) RETURNING *`,
        [data.name, data.scale_description, data.level, data.status, data.created_by]
      );
      const set = rows[0];
      for (const item of items) {
        await client.query(
          `INSERT INTO semantic_set_items (set_id, entry_id, correct_order, hint_vi)
           VALUES ($1,$2,$3,$4)`,
          [set.id, item.entry_id, item.correct_order, item.hint_vi || null]
        );
      }
      await client.query('COMMIT');
      return set;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async updateSemanticSet(id, data, items = []) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `UPDATE semantic_sets SET name=$1, scale_description=$2, level=$3, status=$4
          WHERE id=$5 RETURNING *`,
        [data.name, data.scale_description, data.level, data.status, id]
      );
      if (!rows[0]) { await client.query('ROLLBACK'); return null; }
      await client.query('DELETE FROM semantic_set_items WHERE set_id=$1', [id]);
      for (const item of items) {
        await client.query(
          `INSERT INTO semantic_set_items (set_id, entry_id, correct_order, hint_vi)
           VALUES ($1,$2,$3,$4)`,
          [id, item.entry_id, item.correct_order, item.hint_vi || null]
        );
      }
      await client.query('COMMIT');
      return rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async deleteSemanticSet(id) {
    await pool.query('DELETE FROM semantic_sets WHERE id=$1', [id]);
  },

  // ── Game Runs (read-only) ─────────────────────────────────────────────────

  async getGameRuns({ gameType = '', page = 1, limit = 50 } = {}) {
    const conditions = ['gr.completed = TRUE'];
    const params = [];

    if (gameType) {
      params.push(gameType);
      conditions.push(`gr.game_type = $${params.length}`);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const n = params.length;

    const query = `
      SELECT gr.id, gr.game_type, gr.score, gr.accuracy, gr.time_sec, gr.completed,
             gr.created_at,
             u.full_name, u.email,
             gwl.name AS list_name
        FROM game_runs gr
        JOIN users u ON u.id = gr.user_id
        LEFT JOIN game_word_lists gwl ON gwl.id = gr.list_id
        ${where}
        ORDER BY gr.score DESC, gr.accuracy DESC
        LIMIT $${n + 1} OFFSET $${n + 2}`;
    const countQuery = `
      SELECT COUNT(*)::int AS count FROM game_runs gr ${where}`;

    return paginate(query, countQuery, params, params, page, limit);
  },

  // ── Stats (for index page) ────────────────────────────────────────────────

  async getStats() {
    const { rows } = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM game_word_lists)  AS word_lists,
        (SELECT COUNT(*)::int FROM game_levels)       AS levels,
        (SELECT COUNT(*)::int FROM semantic_sets)     AS semantic_sets,
        (SELECT COUNT(*)::int FROM game_runs WHERE completed = TRUE) AS game_runs
    `);
    return rows[0];
  },
};

module.exports = Game;
