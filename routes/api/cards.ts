import { Router, Response } from 'express';
import { z } from 'zod';
import pool from '../../config/db';
import { requireApiAuth, ApiRequest } from '../../middlewares/apiAuth';
import { asyncHandler } from '../../utils/asyncHandler';
import { apiSuccess, apiError } from '../../utils/apiResponse';
import { validateBody } from '../../middlewares/validateBody';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────

// Returns deck row if user can read it; sends 404/403 and returns null otherwise.
const getDeckForRead = async (deckId: string, userId: string, res: Response) => {
  const { rows } = await pool.query(
    `SELECT id, deck_type, user_id, status FROM decks WHERE id = $1`,
    [deckId]
  );
  if (rows.length === 0) {
    apiError(res, 404, 'DECK_NOT_FOUND', 'Deck không tồn tại');
    return null;
  }
  const deck = rows[0];
  const isPublicDeck =
    deck.status === 'published' &&
    (deck.deck_type === 'premade' || deck.deck_type === 'system_generated');
  const isOwner = deck.deck_type === 'user_created' && deck.user_id === userId;
  if (!isPublicDeck && !isOwner) {
    apiError(res, 403, 'DECK_ACCESS_DENIED', 'Bạn không có quyền truy cập deck này');
    return null;
  }
  return deck;
};

// Returns deck row if user is the owner (user_created); otherwise sends error.
const getDeckForWrite = async (deckId: string, userId: string, res: Response) => {
  const { rows } = await pool.query(
    `SELECT id, deck_type, user_id FROM decks WHERE id = $1`,
    [deckId]
  );
  if (rows.length === 0) {
    apiError(res, 404, 'DECK_NOT_FOUND', 'Deck không tồn tại');
    return null;
  }
  const deck = rows[0];
  if (deck.deck_type !== 'user_created' || deck.user_id !== userId) {
    apiError(res, 403, 'DECK_ACCESS_DENIED', 'Bạn không có quyền thêm/xóa cards trong deck này');
    return null;
  }
  return deck;
};

const UPSERT_UCP_SQL = `
  INSERT INTO user_card_progress (user_id, card_id)
  VALUES ($1, $2)
  ON CONFLICT (user_id, card_id) DO NOTHING
`;

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/v1/decks/:deckId/cards
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/decks/:deckId/cards',
  requireApiAuth,
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;
    const deckId = req.params.deckId as string;

    const deck = await getDeckForRead(deckId, userId, res);
    if (!deck) return;

    const { rows } = await pool.query(
      `SELECT c.id AS card_id, c.entry_id, c.note_html, c.sort_order,
         de.headword, de.ipa_us, de.pos,
         LEFT(SPLIT_PART(de.meaning_vi, E'\\n', 1), 200) AS meaning_preview,
         ucp.times_seen, ucp.times_correct, ucp.first_seen_at, ucp.last_review,
         lc.box_number AS leitner_box_number, lc.due_at AS leitner_due_at,
         CASE WHEN ucp.card_id IS NULL THEN TRUE ELSE FALSE END AS is_new
       FROM cards c
       JOIN dictionary_entries de ON de.id = c.entry_id
       LEFT JOIN user_card_progress ucp ON ucp.card_id = c.id AND ucp.user_id = $2
       LEFT JOIN leitner_cards lc ON lc.entry_id = c.entry_id AND lc.user_id = $2
       WHERE c.deck_id = $1
       ORDER BY c.sort_order ASC`,
      [deckId, userId]
    );

    return apiSuccess(res, { items: rows, total: rows.length });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/v1/decks/:deckId/cards
// ─────────────────────────────────────────────────────────────────────────────
const addCardSchema = z.object({
  entry_id: z.string().uuid('entry_id phải là UUID hợp lệ'),
});

router.post(
  '/decks/:deckId/cards',
  requireApiAuth,
  validateBody(addCardSchema),
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;
    const deckId = req.params.deckId as string;
    const { entry_id } = req.body;

    const deck = await getDeckForWrite(deckId, userId, res);
    if (!deck) return;

    // Check entry exists
    const { rows: entryRows } = await pool.query(
      `SELECT id, headword, meaning_vi, pos, ipa_us FROM dictionary_entries WHERE id = $1`,
      [entry_id]
    );
    if (entryRows.length === 0) {
      return apiError(res, 404, 'ENTRY_NOT_FOUND', 'Từ điển entry không tồn tại');
    }

    // Insert card — conflict means already exists
    const { rows: cardRows } = await pool.query(
      `INSERT INTO cards (deck_id, entry_id, sort_order)
       VALUES ($1, $2, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM cards WHERE deck_id = $1))
       ON CONFLICT (deck_id, entry_id) DO NOTHING
       RETURNING id, deck_id, entry_id, sort_order, created_at`,
      [deckId, entry_id]
    );

    if (cardRows.length === 0) {
      return apiError(res, 409, 'CARD_ALREADY_EXISTS', 'Entry này đã có trong deck');
    }

    const card = cardRows[0];

    // Init user_card_progress
    await pool.query(UPSERT_UCP_SQL, [userId, card.id]);

    const { rows: ucpRows } = await pool.query(
      `SELECT ucp.times_seen, ucp.times_correct, ucp.first_seen_at,
         lc.box_number AS leitner_box_number, lc.due_at AS leitner_due_at
       FROM user_card_progress ucp
       LEFT JOIN leitner_cards lc ON lc.entry_id = $3 AND lc.user_id = $1
       WHERE ucp.user_id = $1 AND ucp.card_id = $2`,
      [userId, card.id, entry_id]
    );

    return res.status(201).json({
      success: true,
      data: {
        ...card,
        headword: entryRows[0].headword,
        meaning_vi: entryRows[0].meaning_vi,
        pos: entryRows[0].pos,
        ipa_us: entryRows[0].ipa_us,
        srs: ucpRows[0] ?? null,
      },
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/v1/decks/:deckId/cards/batch
// ─────────────────────────────────────────────────────────────────────────────
const batchAddSchema = z.object({
  entry_ids: z
    .array(z.string().uuid())
    .min(1, 'Cần ít nhất 1 entry_id')
    .max(100, 'Tối đa 100 entry mỗi lần'),
});

router.post(
  '/decks/:deckId/cards/batch',
  requireApiAuth,
  validateBody(batchAddSchema),
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;
    const deckId = req.params.deckId as string;
    const { entry_ids }: { entry_ids: string[] } = req.body;

    const deck = await getDeckForWrite(deckId, userId, res);
    if (!deck) return;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Get current max sort_order
      const { rows: maxRows } = await client.query(
        `SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM cards WHERE deck_id = $1`,
        [deckId]
      );
      let sortBase = maxRows[0].max_order as number;

      // Build bulk insert values
      const values: any[] = [];
      const placeholders = entry_ids.map((entryId: string) => {
        sortBase += 1;
        values.push(deckId, entryId, sortBase);
        const n = values.length;
        return `($${n - 2}, $${n - 1}, $${n})`;
      });

      const { rows: inserted } = await client.query(
        `INSERT INTO cards (deck_id, entry_id, sort_order)
         VALUES ${placeholders.join(', ')}
         ON CONFLICT (deck_id, entry_id) DO NOTHING
         RETURNING id, entry_id`,
        values
      );

      // Init user_card_progress for newly added cards
      if (inserted.length > 0) {
        const ucpValues: any[] = [];
        const ucpPlaceholders = inserted.map((row: any) => {
          ucpValues.push(userId, row.id);
          const n = ucpValues.length;
          return `($${n - 1}, $${n})`;
        });
        await client.query(
          `INSERT INTO user_card_progress (user_id, card_id)
           VALUES ${ucpPlaceholders.join(', ')}
           ON CONFLICT (user_id, card_id) DO NOTHING`,
          ucpValues
        );
      }

      await client.query('COMMIT');

      const added = inserted.length;
      const skipped = entry_ids.length - added;

      return res.status(201).json({
        success: true,
        data: {
          added,
          skipped,
          entry_ids_added: inserted.map((r: any) => r.entry_id),
        },
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  })
);

// ─────────────────────────────────────────────────────────────────────────────
//  DELETE /api/v1/decks/:deckId/cards/:cardId
// ─────────────────────────────────────────────────────────────────────────────
router.delete(
  '/decks/:deckId/cards/:cardId',
  requireApiAuth,
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;
    const deckId = req.params.deckId as string;
    const cardId = req.params.cardId as string;

    const deck = await getDeckForWrite(deckId, userId, res);
    if (!deck) return;

    // Verify card belongs to this deck
    const { rows } = await pool.query(
      `SELECT id FROM cards WHERE id = $1 AND deck_id = $2`,
      [cardId, deckId]
    );
    if (rows.length === 0) {
      return apiError(res, 404, 'CARD_NOT_FOUND', 'Card không tồn tại trong deck này');
    }

    // CASCADE deletes user_card_progress + reviews
    await pool.query('DELETE FROM cards WHERE id = $1', [cardId]);

    return apiSuccess(res, null, 'Card đã xóa');
  })
);

export default router;
