import { Router, Response } from 'express';
import NodeCache from 'node-cache';
import pool from '../../config/db';
import { ApiRequest } from '../../middlewares/apiAuth';
import { asyncHandler } from '../../utils/asyncHandler';
import { apiSuccess, apiError } from '../../utils/apiResponse';
import { getIntervals, moveCard } from '../../utils/leitnerManager';

const statsCache = new NodeCache({ stdTTL: 300, checkperiod: 60 });

const router = Router();

// First VI definition — Pro sense first, legacy meaning_vi fallback
const VI_PREVIEW = `COALESCE(
  (SELECT es.definition_vi FROM entry_senses es
   WHERE es.entry_id = de.id AND es.definition_vi IS NOT NULL
   ORDER BY es.sense_order ASC LIMIT 1),
  NULLIF(SPLIT_PART(COALESCE(de.meaning_vi, ''), E'\\n', 1), '')
)`;

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/v1/leitner/overview
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/overview',
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;
    const intervals = await getIntervals();

    const [{ rows: boxRows }, { rows: retRows }, { rows: masteredRows }, { rows: avgRows }] =
      await Promise.all([
        // Box distribution + due counts
        pool.query(
          `SELECT
             box_number,
             COUNT(*)::int                                        AS total_cards,
             COUNT(*) FILTER (WHERE due_at <= NOW())::int        AS due_today
           FROM leitner_cards
           WHERE user_id = $1
           GROUP BY box_number
           ORDER BY box_number`,
          [userId]
        ),
        // Retention rate last 30 days
        pool.query(
          `SELECT
             COUNT(*) FILTER (WHERE correct = true)::float
               / NULLIF(COUNT(*), 0) AS rate
           FROM leitner_reviews
           WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '30 days'`,
          [userId]
        ),
        // Mastered (box 5) all time
        pool.query(
          `SELECT COUNT(*)::int AS mastered
           FROM leitner_cards WHERE user_id = $1 AND box_number = 5`,
          [userId]
        ),
        // Avg days from card creation to reaching box 5
        pool.query(
          `SELECT AVG(
             EXTRACT(EPOCH FROM (last_reviewed_at - created_at)) / 86400
           )::numeric(10,1) AS avg_days
           FROM leitner_cards
           WHERE user_id = $1 AND box_number = 5 AND last_reviewed_at IS NOT NULL`,
          [userId]
        ),
      ]);

    const boxMap = new Map<number, { total_cards: number; due_today: number }>(
      boxRows.map((r: any) => [r.box_number as number, r])
    );

    const boxes = [1, 2, 3, 4, 5].map(n => {
      const row = boxMap.get(n);
      return {
        box_number: n,
        interval_days: intervals[n - 1],
        total_cards: row?.total_cards ?? 0,
        due_today: row?.due_today ?? 0,
      };
    });

    return apiSuccess(res, {
      boxes,
      today_due_total: boxes.reduce((sum, b) => sum + b.due_today, 0),
      stats: {
        retention_30d: Math.round((retRows[0]?.rate ?? 0) * 100) / 100,
        mastered_all_time: masteredRows[0]?.mastered ?? 0,
        avg_days_to_box_5: parseFloat(avgRows[0]?.avg_days ?? '0') || 0,
      },
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/v1/leitner/due?limit=20&offset=0
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/due',
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;
    const safeLimit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '20'), 10) || 20));
    const safeOffset = Math.max(0, parseInt(String(req.query.offset || '0'), 10) || 0);

    const [{ rows: items }, { rows: countRows }] = await Promise.all([
      pool.query(
        `SELECT
           lc.id,
           lc.entry_id,
           lc.box_number,
           lc.due_at,
           lc.last_reviewed_at,
           lc.correct_streak,
           lc.total_reviews,
           lc.source,
           lc.added_from_mode,
           lc.created_at,
           de.headword,
           de.lemma,
           de.ipa_us,
           de.ipa_uk,
           de.audio_us_url,
           de.audio_uk_url,
           de.pos,
           de.cefr_level,
           ${VI_PREVIEW}  AS meaning_preview
         FROM leitner_cards lc
         JOIN dictionary_entries de ON de.id = lc.entry_id
         WHERE lc.user_id = $1 AND lc.due_at <= NOW()
         ORDER BY lc.due_at ASC
         LIMIT $2 OFFSET $3`,
        [userId, safeLimit, safeOffset]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total_due
         FROM leitner_cards
         WHERE user_id = $1 AND due_at <= NOW()`,
        [userId]
      ),
    ]);

    return apiSuccess(res, {
      items: items.map((row: any) => ({
        id: row.id,
        entry_id: row.entry_id,
        box_number: row.box_number,
        due_at: row.due_at,
        last_reviewed_at: row.last_reviewed_at ?? null,
        correct_streak: row.correct_streak ?? 0,
        total_reviews: row.total_reviews ?? 0,
        source: row.source ?? null,
        added_from_mode: row.added_from_mode ?? null,
        created_at: row.created_at,
        entry: {
          id: row.entry_id,
          headword: row.headword,
          lemma: row.lemma ?? null,
          ipa_us: row.ipa_us ?? null,
          ipa_uk: row.ipa_uk ?? null,
          audio_us_url: row.audio_us_url ?? null,
          audio_uk_url: row.audio_uk_url ?? null,
          pos: row.pos ?? [],
          meaning_preview: row.meaning_preview ?? null,
          cefr_level: row.cefr_level ?? null,
        },
      })),
      meta: {
        total_due: countRows[0]?.total_due ?? 0,
        returned: items.length,
        offset: safeOffset,
      },
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/v1/leitner/box/:box_number?page=1&limit=20
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/box/:box_number',
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;
    const boxNumber = parseInt(req.params.box_number as string, 10);

    if (!Number.isInteger(boxNumber) || boxNumber < 1 || boxNumber > 5) {
      return apiError(res, 400, 'INVALID_BOX_NUMBER', 'box_number phải là 1–5');
    }

    const intervals = await getIntervals();
    const safePage = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const safeLimit = Math.max(1, parseInt(String(req.query.limit || '20'), 10) || 20);
    const offset = (safePage - 1) * safeLimit;

    const [{ rows: items }, { rows: countRows }] = await Promise.all([
      pool.query(
        `SELECT
           lc.id,
           lc.entry_id,
           lc.box_number,
           lc.due_at,
           lc.last_reviewed_at,
           lc.correct_streak,
           lc.total_reviews,
           lc.source,
           lc.added_from_mode,
           lc.created_at,
           de.headword,
           de.lemma,
           de.ipa_us,
           de.ipa_uk,
           de.audio_us_url,
           de.audio_uk_url,
           de.pos,
           de.cefr_level,
           ${VI_PREVIEW}  AS meaning_preview
         FROM leitner_cards lc
         JOIN dictionary_entries de ON de.id = lc.entry_id
         WHERE lc.user_id = $1 AND lc.box_number = $2
         ORDER BY lc.due_at ASC NULLS LAST
         LIMIT $3 OFFSET $4`,
        [userId, boxNumber, safeLimit, offset]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS count
         FROM leitner_cards WHERE user_id = $1 AND box_number = $2`,
        [userId, boxNumber]
      ),
    ]);

    const total: number = countRows[0]?.count ?? 0;

    return apiSuccess(res, {
      box_number: boxNumber,
      items: items.map((row: any) => ({
        id: row.id,
        entry_id: row.entry_id,
        box_number: row.box_number,
        due_at: row.due_at,
        last_reviewed_at: row.last_reviewed_at ?? null,
        correct_streak: row.correct_streak ?? 0,
        total_reviews: row.total_reviews ?? 0,
        source: row.source ?? null,
        added_from_mode: row.added_from_mode ?? null,
        created_at: row.created_at,
        entry: {
          id: row.entry_id,
          headword: row.headword,
          lemma: row.lemma ?? null,
          ipa_us: row.ipa_us ?? null,
          ipa_uk: row.ipa_uk ?? null,
          audio_us_url: row.audio_us_url ?? null,
          audio_uk_url: row.audio_uk_url ?? null,
          pos: row.pos ?? [],
          meaning_preview: row.meaning_preview ?? null,
          cefr_level: row.cefr_level ?? null,
        },
      })),
      total,
      page: safePage,
      limit: safeLimit,
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/v1/leitner/review
//  body: { leitner_card_id, correct, time_ms? }
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/review',
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;
    const { leitner_card_id, correct, time_ms } = req.body as {
      leitner_card_id: string;
      correct: boolean;
      time_ms?: number;
    };

    if (!leitner_card_id || typeof leitner_card_id !== 'string') {
      return apiError(res, 400, 'VALIDATION_ERROR', 'leitner_card_id là bắt buộc');
    }
    if (typeof correct !== 'boolean') {
      return apiError(res, 400, 'VALIDATION_ERROR', 'correct phải là boolean');
    }

    let result: { newBoxNumber: number; nextDueAt: Date; masteredNow: boolean };
    try {
      result = await moveCard(leitner_card_id, userId, correct, time_ms);
    } catch (err: any) {
      if (err.statusCode === 404) {
        return apiError(res, 404, 'CARD_NOT_FOUND', 'Leitner card không tồn tại');
      }
      throw err;
    }

    return apiSuccess(res, {
      new_box_number: result.newBoxNumber,
      next_due_at: result.nextDueAt,
      mastered_now: result.masteredNow,
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/v1/leitner/stats?range=7d|30d|all
// ─────────────────────────────────────────────────────────────────────────────
const VALID_RANGES = ['7d', '30d', 'all'] as const;
type ValidRange = (typeof VALID_RANGES)[number];
const RANGE_INTERVAL: Record<ValidRange, string | null> = {
  '7d': '7 days',
  '30d': '30 days',
  all: null,
};

router.get(
  '/stats',
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;
    const rangeParam = String(req.query.range || '30d');

    if (!(VALID_RANGES as readonly string[]).includes(rangeParam)) {
      return apiError(res, 400, 'INVALID_RANGE', 'range phải là "7d", "30d", hoặc "all"');
    }

    const range = rangeParam as ValidRange;
    const cacheKey = `stats:${userId}:${range}`;
    const cached = statsCache.get<object>(cacheKey);
    if (cached) return apiSuccess(res, cached);

    const intervalStr = RANGE_INTERVAL[range];
    const dateFilter = intervalStr
      ? `AND lr.created_at >= NOW() - INTERVAL '${intervalStr}'`
      : '';

    const [{ rows: distRows }, { rows: retRows }, { rows: hardRows }, { rows: easyRows }] =
      await Promise.all([
        // 1. Box distribution
        pool.query(
          `SELECT box_number, COUNT(*)::int AS cnt
           FROM leitner_cards WHERE user_id = $1
           GROUP BY box_number`,
          [userId]
        ),

        // 2. Retention rate in range
        pool.query(
          `SELECT
             COUNT(*) FILTER (WHERE lr.correct = true)::float
               / NULLIF(COUNT(*), 0) AS rate,
             COUNT(*)::int AS total
           FROM leitner_reviews lr
           WHERE lr.user_id = $1 ${dateFilter}`,
          [userId]
        ),

        // 3. Top hardest: most lapses (times sent back to box 1 from higher box)
        pool.query(
          `SELECT de.id AS entry_id, de.headword,
             COUNT(*) FILTER (WHERE lr.new_box = 1 AND lr.old_box > 1)::int AS lapses
           FROM leitner_cards lc
           JOIN dictionary_entries de ON de.id = lc.entry_id
           JOIN leitner_reviews lr ON lr.leitner_card_id = lc.id
           WHERE lc.user_id = $1 ${dateFilter.replace(/lr\./g, 'lr.')}
           GROUP BY de.id, de.headword
           HAVING COUNT(*) FILTER (WHERE lr.new_box = 1 AND lr.old_box > 1) > 0
           ORDER BY lapses DESC
           LIMIT 5`,
          [userId]
        ),

        // 4. Top easiest: highest correct_streak
        pool.query(
          `SELECT de.id AS entry_id, de.headword, lc.correct_streak AS consecutive_correct
           FROM leitner_cards lc
           JOIN dictionary_entries de ON de.id = lc.entry_id
           WHERE lc.user_id = $1 AND lc.correct_streak > 0
           ORDER BY lc.correct_streak DESC
           LIMIT 5`,
          [userId]
        ),
      ]);

    const distribution: Record<string, number> = {
      box_1: 0, box_2: 0, box_3: 0, box_4: 0, box_5: 0,
    };
    for (const row of distRows) {
      distribution[`box_${row.box_number}`] = row.cnt;
    }

    const statsData = {
      distribution,
      retention_rate: Math.round((retRows[0]?.rate ?? 0) * 100) / 100,
      top_hardest: hardRows.map((row: any) => ({
        entry_id: row.entry_id,
        headword: row.headword,
        lapses: row.lapses,
      })),
      top_easiest: easyRows.map((row: any) => ({
        entry_id: row.entry_id,
        headword: row.headword,
        consecutive_correct: row.consecutive_correct,
      })),
    };

    statsCache.set(cacheKey, statsData);
    return apiSuccess(res, statsData);
  })
);

export default router;
