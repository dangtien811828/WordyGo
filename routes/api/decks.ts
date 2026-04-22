import { Router, Response } from 'express';
import { z } from 'zod';
import pool from '../../config/db';
import { ApiRequest } from '../../middlewares/apiAuth';
import { asyncHandler } from '../../utils/asyncHandler';
import { apiSuccess, apiError } from '../../utils/apiResponse';
import { parsePagination } from '../../utils/pagination';
import { validateBody } from '../../middlewares/validateBody';

const router = Router();

// All deck routes require auth (mounted after requireApiAuth in app.ts)

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────

const VALID_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;

const checkOwnership = async (deckId: string, userId: string, res: Response): Promise<boolean> => {
  const { rows } = await pool.query(
    'SELECT deck_type, user_id FROM decks WHERE id = $1',
    [deckId]
  );
  if (rows.length === 0) {
    apiError(res, 404, 'DECK_NOT_FOUND', 'Deck không tồn tại');
    return false;
  }
  const deck = rows[0];
  if (deck.deck_type !== 'user_created' || deck.user_id !== userId) {
    apiError(res, 403, 'DECK_ACCESS_DENIED', 'Bạn không có quyền chỉnh sửa deck này');
    return false;
  }
  return true;
};

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/v1/decks
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/',
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;
    const { page, limit, offset } = parsePagination(req);

    const [listResult, countResult, summaryResult] = await Promise.all([
      pool.query(
        `SELECT d.id, d.title, d.description, d.level, d.deck_type, d.status,
           d.thumbnail_url, d.created_at, d.user_id,
           (SELECT COUNT(*)::int FROM cards c WHERE c.deck_id = d.id) AS total_cards,
           (SELECT COUNT(*)::int FROM cards c
            JOIN leitner_cards lc ON lc.entry_id = c.entry_id AND lc.user_id = $1
            WHERE c.deck_id = d.id AND lc.due_at <= NOW()) AS due_cards,
           (SELECT COUNT(*)::int FROM cards c
            JOIN leitner_cards lc ON lc.entry_id = c.entry_id AND lc.user_id = $1
            WHERE c.deck_id = d.id AND lc.box_number = 5) AS mastered_cards,
           (SELECT COUNT(*)::int FROM cards c
            JOIN user_card_progress ucp ON ucp.card_id = c.id AND ucp.user_id = $1
            WHERE c.deck_id = d.id) AS started_cards
         FROM decks d
         WHERE (d.status = 'published' AND d.deck_type IN ('premade','system_generated'))
            OR d.user_id = $1
         ORDER BY d.created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total FROM decks d
         WHERE (d.status = 'published' AND d.deck_type IN ('premade','system_generated'))
            OR d.user_id = $1`,
        [userId]
      ),
      pool.query(
        `SELECT
           COUNT(DISTINCT c.deck_id)::int AS decks_with_due,
           COUNT(*)::int AS total_due_cards
         FROM leitner_cards lc
         JOIN cards c ON c.entry_id = lc.entry_id
         WHERE lc.user_id = $1 AND lc.due_at <= NOW()`,
        [userId]
      ),
    ]);

    const total = countResult.rows[0].total;
    const totalPages = Math.ceil(total / limit);
    const summary = summaryResult.rows[0];

    return apiSuccess(res, {
      summary: {
        total_decks: total,
        total_due_cards: summary.total_due_cards,
      },
      items: listResult.rows,
      meta: { page, limit, total, total_pages: totalPages },
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/v1/decks/:id
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/:id',
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;
    const id = req.params.id as string;

    const { rows } = await pool.query(
      `SELECT d.id, d.title, d.description, d.level, d.deck_type, d.status,
         d.thumbnail_url, d.min_cards_to_study, d.created_at,
         (SELECT COUNT(*)::int FROM cards c WHERE c.deck_id = d.id) AS total_cards,
         (SELECT COUNT(*)::int FROM cards c
          JOIN leitner_cards lc ON lc.entry_id = c.entry_id AND lc.user_id = $2
          WHERE c.deck_id = d.id AND lc.due_at <= NOW()) AS due_cards,
         (SELECT COUNT(*)::int FROM cards c
          JOIN leitner_cards lc ON lc.entry_id = c.entry_id AND lc.user_id = $2
          WHERE c.deck_id = d.id AND lc.box_number = 5) AS mastered_cards,
         (SELECT json_agg(json_build_object(
            'card_id', c.id, 'entry_id', c.entry_id,
            'headword', de.headword, 'meaning_vi', de.meaning_vi, 'pos', de.pos
          ) ORDER BY c.sort_order)
          FROM (SELECT * FROM cards WHERE deck_id = d.id ORDER BY sort_order LIMIT 20) c
          JOIN dictionary_entries de ON de.id = c.entry_id) AS card_preview
       FROM decks d
       WHERE d.id = $1
         AND ((d.status = 'published' AND d.deck_type IN ('premade','system_generated'))
           OR d.user_id = $2)`,
      [id, userId]
    );

    if (rows.length === 0) {
      return apiError(res, 404, 'DECK_NOT_FOUND', 'Deck không tồn tại');
    }

    return apiSuccess(res, rows[0]);
  })
);

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/v1/decks
// ─────────────────────────────────────────────────────────────────────────────
const createDeckSchema = z.object({
  title: z.string().min(3, { message: 'Tiêu đề phải có ít nhất 3 ký tự' }).max(500),
  description: z.string().max(2000).optional(),
  level: z.enum(VALID_LEVELS).optional().default('beginner'),
  tag_ids: z.array(z.string().uuid()).optional(),
});

router.post(
  '/',
  validateBody(createDeckSchema),
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;
    const { title, description, level, tag_ids } = req.body;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `INSERT INTO decks (title, description, level, deck_type, user_id, status, created_by)
         VALUES ($1, $2, $3, 'user_created', $4, 'published', NULL)
         RETURNING id, title, description, level, deck_type, status, user_id, created_at`,
        [title, description ?? null, level, userId]
      );
      const deck = rows[0];

      if (tag_ids && tag_ids.length > 0) {
        const tagValues = tag_ids.map((_: string, i: number) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ');
        const tagParams: string[] = [];
        tag_ids.forEach((tagId: string) => { tagParams.push(deck.id, tagId); });
        await client.query(
          `INSERT INTO deck_tags (deck_id, tag_id) VALUES ${tagValues} ON CONFLICT DO NOTHING`,
          tagParams
        );
      }

      await client.query('COMMIT');
      return res.status(201).json({ success: true, data: deck });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })
);

// ─────────────────────────────────────────────────────────────────────────────
//  PATCH /api/v1/decks/:id
// ─────────────────────────────────────────────────────────────────────────────
const updateDeckSchema = z.object({
  title: z.string().min(3).max(500).optional(),
  description: z.string().max(2000).nullable().optional(),
  level: z.enum(VALID_LEVELS).optional(),
});

router.patch(
  '/:id',
  validateBody(updateDeckSchema, { rejectEmpty: true }),
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;
    const id = req.params.id as string;

    const allowed = await checkOwnership(id, userId, res);
    if (!allowed) return;

    const { title, description, level } = req.body;
    const fields: string[] = [];
    const params: any[] = [];

    if (title !== undefined) { params.push(title); fields.push(`title = $${params.length}`); }
    if (description !== undefined) { params.push(description); fields.push(`description = $${params.length}`); }
    if (level !== undefined) { params.push(level); fields.push(`level = $${params.length}`); }

    params.push(id);
    const { rows } = await pool.query(
      `UPDATE decks SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${params.length}
       RETURNING id, title, description, level, deck_type, status, updated_at`,
      params
    );

    return apiSuccess(res, rows[0]);
  })
);

// ─────────────────────────────────────────────────────────────────────────────
//  DELETE /api/v1/decks/:id
// ─────────────────────────────────────────────────────────────────────────────
router.delete(
  '/:id',
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;
    const id = req.params.id as string;

    const allowed = await checkOwnership(id, userId, res);
    if (!allowed) return;

    // CASCADE deletes cards → user_card_progress → reviews (via FK)
    await pool.query('DELETE FROM decks WHERE id = $1', [id]);

    return apiSuccess(res, null, 'Deck đã xóa');
  })
);

export default router;
