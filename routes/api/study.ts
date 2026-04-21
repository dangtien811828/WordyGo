import { Router, Response } from 'express';
import { z } from 'zod';
import pool from '../../config/db';
import { requireApiAuth, ApiRequest } from '../../middlewares/apiAuth';
import { asyncHandler } from '../../utils/asyncHandler';
import { apiSuccess, apiError } from '../../utils/apiResponse';
import { validateBody } from '../../middlewares/validateBody';
import { calculateSrs } from '../../utils/srsCalculator';
import { updateStreak } from '../../utils/streakCalculator';

const router = Router();

const VALID_MODES = ['flashcard', 'swift_choice', 'cloze_craft', 'pair_link', 'leitner'] as const;

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/v1/study/queue
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/study/queue',
  requireApiAuth,
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;

    // Read cards_per_session from system_configs
    const { rows: cfgRows } = await pool.query(
      `SELECT config_value FROM system_configs WHERE config_key = 'cards_per_session'`
    );
    const cardsPerSession: number =
      cfgRows.length > 0 ? (cfgRows[0].config_value as number) : 20;

    // Due cards first
    const { rows: dueCards } = await pool.query(
      `SELECT c.id AS card_id, c.deck_id, c.entry_id, c.note_html,
         de.headword, de.ipa_us, de.meaning_vi, de.pos,
         ucp.leitner_box, ucp.ease, ucp.review_interval, ucp.due_at, ucp.lapses,
         FALSE AS is_new
       FROM user_card_progress ucp
       JOIN cards c ON c.id = ucp.card_id
       JOIN dictionary_entries de ON de.id = c.entry_id
       WHERE ucp.user_id = $1 AND ucp.due_at <= NOW()
       ORDER BY ucp.due_at ASC
       LIMIT $2`,
      [userId, cardsPerSession]
    );

    const remaining = cardsPerSession - dueCards.length;
    let newCards: any[] = [];

    if (remaining > 0) {
      const { rows } = await pool.query(
        // Include cards with no UCP record OR UCP with NULL due_at (initialized but not yet reviewed)
        `SELECT c.id AS card_id, c.deck_id, c.entry_id, c.note_html,
           de.headword, de.ipa_us, de.meaning_vi, de.pos,
           ucp.leitner_box, ucp.ease, ucp.review_interval,
           ucp.due_at, ucp.lapses,
           TRUE AS is_new
         FROM cards c
         JOIN dictionary_entries de ON de.id = c.entry_id
         JOIN decks d ON d.id = c.deck_id
         LEFT JOIN user_card_progress ucp ON ucp.card_id = c.id AND ucp.user_id = $1
         WHERE (
           (d.deck_type IN ('premade','system_generated') AND d.status = 'published')
           OR d.user_id = $1
         )
           AND (ucp.card_id IS NULL OR ucp.due_at IS NULL)
         ORDER BY c.sort_order ASC
         LIMIT $2`,
        [userId, remaining]
      );
      newCards = rows;
    }

    // Count separately for total_due (not capped by cardsPerSession)
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS total_due
       FROM user_card_progress
       WHERE user_id = $1 AND due_at <= NOW()`,
      [userId]
    );

    return apiSuccess(res, {
      cards: [...dueCards, ...newCards],
      total_due: countRows[0].total_due,
      cards_per_session: cardsPerSession,
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/v1/study/review
// ─────────────────────────────────────────────────────────────────────────────
const reviewSchema = z.object({
  card_id: z.string().uuid('card_id phải là UUID hợp lệ'),
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  mode: z.enum(VALID_MODES),
  time_ms: z.number().int().min(0).optional(),
});

router.post(
  '/study/review',
  requireApiAuth,
  validateBody(reviewSchema),
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;
    const { card_id, rating, mode, time_ms } = req.body;

    // Verify card exists
    const { rows: cardRows } = await pool.query(
      `SELECT id FROM cards WHERE id = $1`,
      [card_id]
    );
    if (cardRows.length === 0) {
      return apiError(res, 404, 'CARD_NOT_FOUND', 'Card không tồn tại');
    }

    // Fetch current SRS state (or use new-card defaults)
    const { rows: ucpRows } = await pool.query(
      `SELECT leitner_box, ease, review_interval, lapses
       FROM user_card_progress WHERE user_id = $1 AND card_id = $2`,
      [userId, card_id]
    );

    const current = ucpRows.length > 0
      ? ucpRows[0]
      : { leitner_box: 1, ease: 2.5, review_interval: 0, lapses: 0 };

    const next = calculateSrs(current, rating as 1 | 2 | 3 | 4);

    // UPSERT user_card_progress
    await pool.query(
      `INSERT INTO user_card_progress
         (user_id, card_id, leitner_box, ease, review_interval, due_at, lapses, last_review)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (user_id, card_id) DO UPDATE SET
         leitner_box = $3, ease = $4, review_interval = $5,
         due_at = $6, lapses = $7, last_review = NOW(), updated_at = NOW()`,
      [userId, card_id, next.leitner_box, next.ease, next.review_interval, next.due_at, next.lapses]
    );

    // Record in reviews
    await pool.query(
      `INSERT INTO reviews (user_id, card_id, rating, mode, time_ms, correct)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, card_id, rating, mode, time_ms ?? null, next.correct]
    );

    return apiSuccess(res, {
      card_id,
      leitner_box: next.leitner_box,
      ease: next.ease,
      review_interval: next.review_interval,
      due_at: next.due_at,
      correct: next.correct,
      lapses: next.lapses,
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/v1/study/session-complete
// ─────────────────────────────────────────────────────────────────────────────
const sessionCompleteSchema = z.object({
  reviews_count: z.number().int().min(0),
  correct_count: z.number().int().min(0),
  deck_id: z.string().uuid().optional(),
});

router.post(
  '/study/session-complete',
  requireApiAuth,
  validateBody(sessionCompleteSchema),
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;
    const { correct_count } = req.body;

    const xpEarned = correct_count * 10;

    // Log activity so streak calculator sees today
    await pool.query(
      `INSERT INTO user_activity_log (user_id, action) VALUES ($1, 'study_session')`,
      [userId]
    );

    // Update streak and persist
    await updateStreak(userId);

    // Fetch fresh streak values after update
    const { rows } = await pool.query(
      `SELECT streak_current, streak_longest FROM users WHERE id = $1`,
      [userId]
    );
    const streakCurrent: number = rows[0]?.streak_current ?? 0;
    const streakLongest: number = rows[0]?.streak_longest ?? 0;

    return apiSuccess(res, {
      xp_earned: xpEarned,
      streak_current: streakCurrent,
      streak_longest: streakLongest,
    });
  })
);

export default router;
