import pool from '../config/db';
import { paginate } from '../helpers/pagination';

const Deck = {
  async getAll({ search = '', level = '', status = '', page = 1, limit = 20 }: { search?: string; level?: string; status?: string; page?: number; limit?: number } = {}) {
    const conditions: string[] = [];
    const params: any[] = [];

    if (search) {
      params.push(`%${search}%`);
      conditions.push(`d.title ILIKE $${params.length}`);
    }
    if (level) {
      params.push(level);
      conditions.push(`d.level = $${params.length}`);
    }
    if (status) {
      params.push(status);
      conditions.push(`d.status = $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const n = params.length;

    const query = `
      SELECT d.id, d.title, d.level, d.deck_type, d.status, d.min_cards_to_study, d.created_at,
             a.full_name AS creator_name,
             (SELECT COUNT(*)::int FROM cards c WHERE c.deck_id = d.id) AS card_count
      FROM decks d
      LEFT JOIN admin_accounts a ON a.id = d.created_by
      ${where}
      ORDER BY d.created_at DESC
      LIMIT $${n + 1} OFFSET $${n + 2}`;
    const countQuery = `SELECT COUNT(*)::int AS count FROM decks d ${where}`;

    return paginate(query, countQuery, params, params, page, limit);
  },

  async findById(id: string) {
    const { rows } = await pool.query(`
      SELECT d.*,
             a.full_name AS creator_name,
             COALESCE(
               json_agg(DISTINCT jsonb_build_object('id', t.id, 'name', t.name))
               FILTER (WHERE t.id IS NOT NULL), '[]'
             ) AS tags
      FROM decks d
      LEFT JOIN admin_accounts a  ON a.id  = d.created_by
      LEFT JOIN deck_tags dt      ON dt.deck_id = d.id
      LEFT JOIN tags t            ON t.id = dt.tag_id
      WHERE d.id = $1
      GROUP BY d.id, a.full_name`,
      [id]
    );
    if (!rows[0]) return null;

    // Fetch cards separately (cleaner than nested agg)
    const { rows: cards } = await pool.query(`
      SELECT c.id AS card_id, c.entry_id, c.note_html, c.sort_order,
             de.headword, de.lemma, de.ipa_us, de.meaning_vi
      FROM cards c
      JOIN dictionary_entries de ON de.id = c.entry_id
      WHERE c.deck_id = $1
      ORDER BY c.sort_order ASC, de.headword ASC`,
      [id]
    );

    return { ...rows[0], cards };
  },

  async create(data: any, tagIds: string[] = []) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(`
        INSERT INTO decks
          (title, description, level, thumbnail_url, deck_type, min_cards_to_study, status, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        RETURNING *`,
        [
          data.title.trim(),
          data.description || null,
          data.level || 'beginner',
          data.thumbnail_url || null,
          data.deck_type || 'premade',
          data.min_cards_to_study ? parseInt(data.min_cards_to_study) : 5,
          data.status || 'draft',
          data.created_by || null,
        ]
      );
      const deck = rows[0];
      for (const tid of tagIds) {
        await client.query(
          'INSERT INTO deck_tags (deck_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
          [deck.id, tid]
        );
      }
      await client.query('COMMIT');
      return deck;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async update(id: string, data: any, tagIds: string[] = []) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        UPDATE decks SET
          title              = $1,
          description        = $2,
          level              = $3,
          thumbnail_url      = $4,
          deck_type          = $5,
          min_cards_to_study = $6,
          status             = $7,
          updated_at         = NOW()
        WHERE id = $8`,
        [
          data.title.trim(),
          data.description || null,
          data.level || 'beginner',
          data.thumbnail_url || null,
          data.deck_type || 'premade',
          data.min_cards_to_study ? parseInt(data.min_cards_to_study) : 5,
          data.status || 'draft',
          id,
        ]
      );
      await client.query('DELETE FROM deck_tags WHERE deck_id = $1', [id]);
      for (const tid of tagIds) {
        await client.query(
          'INSERT INTO deck_tags (deck_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
          [id, tid]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async delete(id: string) {
    // CASCADE on cards, and user_card_progress cascades from cards
    await pool.query('DELETE FROM decks WHERE id = $1', [id]);
  },

  async addCards(deckId: string, entryIds: string[] = []) {
    let added = 0;
    let skipped = 0;
    for (const entryId of entryIds) {
      // Get current max sort_order
      const { rows } = await pool.query(
        'SELECT COALESCE(MAX(sort_order), -1)::int AS max_order FROM cards WHERE deck_id = $1',
        [deckId]
      );
      const nextOrder = rows[0].max_order + 1;
      const { rowCount } = await pool.query(
        `INSERT INTO cards (deck_id, entry_id, sort_order)
         VALUES ($1,$2,$3)
         ON CONFLICT (deck_id, entry_id) DO NOTHING`,
        [deckId, entryId, nextOrder]
      );
      if (rowCount > 0) added++;
      else skipped++;
    }
    return { added, skipped };
  },

  async removeCard(deckId: string, entryId: string) {
    await pool.query(
      'DELETE FROM cards WHERE deck_id = $1 AND entry_id = $2',
      [deckId, entryId]
    );
  },
};

export = Deck;
