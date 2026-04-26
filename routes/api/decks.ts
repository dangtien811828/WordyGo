import { Router, Response } from 'express';
import { z } from 'zod';
import pool from '../../config/db';
import { ApiRequest } from '../../middlewares/apiAuth';
import { asyncHandler } from '../../utils/asyncHandler';
import { apiSuccess, apiError } from '../../utils/apiResponse';
import { parsePagination } from '../../utils/pagination';
import { validateBody } from '../../middlewares/validateBody';
import { requireFeature } from '../../middlewares/requireFeature';
import { computeCompletionPercent } from '../../utils/deckService';

const router = Router();

// All deck routes require auth (mounted after requireApiAuth in app.ts)

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────

const VALID_LEVELS = ['beginner', 'intermediate', 'advanced'] as const;

/**
 * Returns deck row {is_system, user_id, status} or sends an error and returns null.
 * For ownership-gated mutations (PATCH/DELETE) — system decks are 403, missing 404.
 */
const checkUserOwnership = async (
  deckId: string,
  userId: string,
  res: Response
): Promise<boolean> => {
  const { rows } = await pool.query(
    `SELECT is_system, user_id FROM decks WHERE id = $1`,
    [deckId]
  );
  if (rows.length === 0) {
    apiError(res, 404, 'DECK_NOT_FOUND', 'Deck không tồn tại');
    return false;
  }
  const deck = rows[0];
  if (deck.is_system === true) {
    apiError(res, 403, 'SYSTEM_DECK_FORBIDDEN', 'Không thể chỉnh sửa system deck');
    return false;
  }
  if (deck.user_id !== userId) {
    apiError(res, 403, 'DECK_ACCESS_DENIED', 'Bạn không có quyền chỉnh sửa deck này');
    return false;
  }
  return true;
};

/**
 * Normalize a query param that may come as undefined | string | string[].
 * Filters out falsy entries.
 */
const toArray = (v: unknown): string[] => {
  if (v === undefined || v === null) return [];
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  return [String(v)].filter(Boolean);
};

/**
 * Shape a row from the list query into the /system or /mine response item.
 */
const shapeDeckRow = (row: any) => ({
  id: row.id,
  title: row.title,
  description: row.description,
  thumbnail_url: row.thumbnail_url,
  level: row.level,
  deck_type: row.deck_type,
  total_cards: row.total_cards,
  is_favorite: row.is_favorite,
  is_system: row.is_system,
  user_progress: {
    mastered_count: row.mastered_count,
    in_progress_count: row.in_progress_count,
    completion_percent: computeCompletionPercent(row.mastered_count, row.total_cards),
  },
  tags: row.tags ?? [],
});

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/v1/decks/system  (NEW)
// ─────────────────────────────────────────────────────────────────────────────
const systemDecksQuerySchema = z.object({
  search: z.string().trim().min(1).max(100).optional(),
  level: z.enum(VALID_LEVELS).optional(),
});

router.get(
  '/system',
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;
    const { page, limit, offset } = parsePagination(req);

    const parsed = systemDecksQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return apiError(
        res,
        400,
        'VALIDATION_ERROR',
        'Dữ liệu không hợp lệ',
        parsed.error.issues
      );
    }
    const level = parsed.data.level ?? null;
    const search = parsed.data.search ? `%${parsed.data.search}%` : null;
    const tagIds = toArray(req.query.tag);

    // List query: $1 userId, $2 level, $3 search, $4 tagIds (uuid[]), $5 limit, $6 offset.
    // Count query: $1 level, $2 search, $3 tagIds — separate numbering avoids
    // unused-parameter type-inference errors from PostgreSQL.
    const filterWhere = (n: { level: number; search: number; tagIds: number }) => `
      WHERE d.is_system = true
        AND d.status = 'published'
        AND ($${n.level}::text IS NULL OR d.level = $${n.level})
        AND ($${n.search}::text IS NULL OR d.title ILIKE $${n.search})
        AND (
          COALESCE(array_length($${n.tagIds}::uuid[], 1), 0) = 0
          OR EXISTS (
            SELECT 1 FROM deck_tags dt
            WHERE dt.deck_id = d.id AND dt.tag_id = ANY($${n.tagIds}::uuid[])
          )
        )
    `;

    const [listResult, countResult] = await Promise.all([
      pool.query(
        `SELECT d.id, d.title, d.description, d.thumbnail_url, d.level, d.deck_type, d.is_system,
           (SELECT COUNT(*)::int FROM cards WHERE deck_id = d.id) AS total_cards,
           (SELECT COUNT(*)::int FROM cards c
              JOIN leitner_cards lc ON lc.entry_id = c.entry_id AND lc.user_id = $1
              WHERE c.deck_id = d.id AND lc.box_number >= 5) AS mastered_count,
           (SELECT COUNT(*)::int FROM cards c
              JOIN user_card_progress ucp ON ucp.card_id = c.id AND ucp.user_id = $1
              WHERE c.deck_id = d.id) AS in_progress_count,
           EXISTS (SELECT 1 FROM user_deck_favorites
                    WHERE user_id = $1 AND deck_id = d.id) AS is_favorite,
           COALESCE(
             (SELECT json_agg(jsonb_build_object(
                'id', t.id,
                'name', t.name,
                'slug', LOWER(REPLACE(t.name, ' ', '-'))
              ) ORDER BY t.name)
              FROM deck_tags dt JOIN tags t ON t.id = dt.tag_id
              WHERE dt.deck_id = d.id),
             '[]'::json
           ) AS tags
         FROM decks d
         ${filterWhere({ level: 2, search: 3, tagIds: 4 })}
         ORDER BY d.sort_order ASC, d.created_at DESC
         LIMIT $5 OFFSET $6`,
        [userId, level, search, tagIds, limit, offset]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total
         FROM decks d
         ${filterWhere({ level: 1, search: 2, tagIds: 3 })}`,
        [level, search, tagIds]
      ),
    ]);

    return apiSuccess(res, {
      items: listResult.rows.map(shapeDeckRow),
      total: countResult.rows[0].total,
      page,
      limit,
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/v1/decks/mine  (NEW)
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/mine',
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;
    const { page, limit, offset } = parsePagination(req);

    const [listResult, countResult] = await Promise.all([
      pool.query(
        `SELECT d.id, d.title, d.description, d.thumbnail_url, d.level, d.deck_type, d.is_system,
           (SELECT COUNT(*)::int FROM cards WHERE deck_id = d.id) AS total_cards,
           (SELECT COUNT(*)::int FROM cards c
              JOIN leitner_cards lc ON lc.entry_id = c.entry_id AND lc.user_id = $1
              WHERE c.deck_id = d.id AND lc.box_number >= 5) AS mastered_count,
           (SELECT COUNT(*)::int FROM cards c
              JOIN user_card_progress ucp ON ucp.card_id = c.id AND ucp.user_id = $1
              WHERE c.deck_id = d.id) AS in_progress_count,
           false AS is_favorite,
           COALESCE(
             (SELECT json_agg(jsonb_build_object(
                'id', t.id,
                'name', t.name,
                'slug', LOWER(REPLACE(t.name, ' ', '-'))
              ) ORDER BY t.name)
              FROM deck_tags dt JOIN tags t ON t.id = dt.tag_id
              WHERE dt.deck_id = d.id),
             '[]'::json
           ) AS tags
         FROM decks d
         WHERE d.is_system = false AND d.user_id = $1
         ORDER BY d.updated_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total
         FROM decks d
         WHERE d.is_system = false AND d.user_id = $1`,
        [userId]
      ),
    ]);

    return apiSuccess(res, {
      items: listResult.rows.map(shapeDeckRow),
      total: countResult.rows[0].total,
      page,
      limit,
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/v1/decks  (DEPRECATED — keeps old shape, behavior = /mine)
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/',
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;
    const { page, limit, offset } = parsePagination(req);

    res.setHeader(
      'X-Deprecated',
      'Use /api/v1/decks/mine or /api/v1/decks/system. Will be removed in v2.'
    );
    console.warn(`[deprecated] GET /api/v1/decks called by user ${userId}`);

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
         WHERE d.is_system = false AND d.user_id = $1
         ORDER BY d.updated_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total FROM decks d
         WHERE d.is_system = false AND d.user_id = $1`,
        [userId]
      ),
      pool.query(
        `SELECT
           COUNT(DISTINCT c.deck_id)::int AS decks_with_due,
           COUNT(*)::int AS total_due_cards
         FROM leitner_cards lc
         JOIN cards c ON c.entry_id = lc.entry_id
         JOIN decks d ON d.id = c.deck_id
         WHERE lc.user_id = $1
           AND lc.due_at <= NOW()
           AND d.is_system = false
           AND d.user_id = $1`,
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
         d.thumbnail_url, d.min_cards_to_study, d.is_system, d.created_at,
         (SELECT COUNT(*)::int FROM cards c WHERE c.deck_id = d.id) AS total_cards,
         (SELECT COUNT(*)::int FROM cards c
          JOIN leitner_cards lc ON lc.entry_id = c.entry_id AND lc.user_id = $2
          WHERE c.deck_id = d.id AND lc.box_number >= 5) AS mastered_count,
         (SELECT COUNT(*)::int FROM cards c
          JOIN leitner_cards lc ON lc.entry_id = c.entry_id AND lc.user_id = $2
          WHERE c.deck_id = d.id AND lc.box_number = 5) AS mastered_cards,
         (SELECT COUNT(*)::int FROM cards c
          JOIN user_card_progress ucp ON ucp.card_id = c.id AND ucp.user_id = $2
          WHERE c.deck_id = d.id) AS in_progress_count,
         (SELECT COUNT(*)::int FROM cards c
          JOIN leitner_cards lc ON lc.entry_id = c.entry_id AND lc.user_id = $2
          WHERE c.deck_id = d.id AND lc.due_at <= NOW()) AS due_cards,
         EXISTS (SELECT 1 FROM user_deck_favorites
                  WHERE user_id = $2 AND deck_id = d.id) AS is_favorite,
         (SELECT json_agg(json_build_object(
            'card_id', c.id, 'entry_id', c.entry_id,
            'headword', de.headword, 'meaning_vi', de.meaning_vi, 'pos', de.pos
          ) ORDER BY c.sort_order)
          FROM (SELECT * FROM cards WHERE deck_id = d.id ORDER BY sort_order LIMIT 20) c
          JOIN dictionary_entries de ON de.id = c.entry_id) AS card_preview,
         COALESCE(
           (SELECT json_agg(jsonb_build_object(
              'id', t.id,
              'name', t.name,
              'slug', LOWER(REPLACE(t.name, ' ', '-'))
            ) ORDER BY t.name)
            FROM deck_tags dt JOIN tags t ON t.id = dt.tag_id
            WHERE dt.deck_id = d.id),
           '[]'::json
         ) AS tags
       FROM decks d
       WHERE d.id = $1
         AND ((d.is_system = true AND d.status = 'published')
           OR d.user_id = $2)`,
      [id, userId]
    );

    if (rows.length === 0) {
      return apiError(res, 404, 'DECK_NOT_FOUND', 'Deck không tồn tại');
    }

    const r = rows[0];
    return apiSuccess(res, {
      ...r,
      user_progress: {
        mastered_count: r.mastered_count,
        in_progress_count: r.in_progress_count,
        completion_percent: computeCompletionPercent(r.mastered_count, r.total_cards),
      },
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/v1/decks
//
//  Note: deck_type is hard-coded to 'user_created' here so the GENERATED
//  is_system column always evaluates to false. The Zod schema does not include
//  is_system, so any client-supplied value is silently stripped.
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
  requireFeature('flashcard_max_decks'),
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;
    const { title, description, level, tag_ids } = req.body;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `INSERT INTO decks (title, description, level, deck_type, user_id, status, created_by)
         VALUES ($1, $2, $3, 'user_created', $4, 'published', NULL)
         RETURNING id, title, description, level, deck_type, status, user_id, is_system, created_at`,
        [title, description ?? null, level, userId]
      );
      const deck = rows[0];

      if (tag_ids && tag_ids.length > 0) {
        const tagValues = tag_ids
          .map((_: string, i: number) => `($${i * 2 + 1}, $${i * 2 + 2})`)
          .join(', ');
        const tagParams: string[] = [];
        tag_ids.forEach((tagId: string) => {
          tagParams.push(deck.id, tagId);
        });
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

    const allowed = await checkUserOwnership(id, userId, res);
    if (!allowed) return;

    const { title, description, level } = req.body;
    const fields: string[] = [];
    const params: any[] = [];

    if (title !== undefined) {
      params.push(title);
      fields.push(`title = $${params.length}`);
    }
    if (description !== undefined) {
      params.push(description);
      fields.push(`description = $${params.length}`);
    }
    if (level !== undefined) {
      params.push(level);
      fields.push(`level = $${params.length}`);
    }

    params.push(id);
    const { rows } = await pool.query(
      `UPDATE decks SET ${fields.join(', ')}, updated_at = NOW()
       WHERE id = $${params.length}
       RETURNING id, title, description, level, deck_type, status, is_system, updated_at`,
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

    const allowed = await checkUserOwnership(id, userId, res);
    if (!allowed) return;

    // CASCADE deletes cards → user_card_progress, plus user_deck_favorites
    await pool.query('DELETE FROM decks WHERE id = $1', [id]);

    return apiSuccess(res, null, 'Deck đã xóa');
  })
);

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/v1/decks/:id/favorite  (NEW)
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/:id/favorite',
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;
    const id = req.params.id as string;

    const { rows } = await pool.query(
      `SELECT is_system, status FROM decks WHERE id = $1`,
      [id]
    );
    if (rows.length === 0) {
      return apiError(res, 404, 'DECK_NOT_FOUND', 'Deck không tồn tại');
    }
    const deck = rows[0];
    if (deck.is_system !== true) {
      return apiError(
        res,
        400,
        'INVALID_OPERATION',
        'Cannot favorite your own deck. Favorites are only for system decks.'
      );
    }
    if (deck.status !== 'published') {
      return apiError(
        res,
        400,
        'INVALID_OPERATION',
        'Only published system decks can be favorited.'
      );
    }

    await pool.query(
      `INSERT INTO user_deck_favorites (user_id, deck_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, id]
    );

    return res.status(204).end();
  })
);

// ─────────────────────────────────────────────────────────────────────────────
//  DELETE /api/v1/decks/:id/favorite  (NEW — idempotent)
// ─────────────────────────────────────────────────────────────────────────────
router.delete(
  '/:id/favorite',
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;
    const id = req.params.id as string;

    await pool.query(
      `DELETE FROM user_deck_favorites WHERE user_id = $1 AND deck_id = $2`,
      [userId, id]
    );

    return res.status(204).end();
  })
);

export default router;
