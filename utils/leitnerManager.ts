import NodeCache from 'node-cache';
import pool from '../config/db';

const DEFAULT_INTERVALS = [1, 2, 4, 7, 14];
const intervalsCache = new NodeCache({ stdTTL: 300 }); // 5 min

export async function getIntervals(): Promise<number[]> {
  const cached = intervalsCache.get<number[]>('leitner_intervals_days');
  if (cached) return cached;

  const { rows } = await pool.query(
    `SELECT config_value FROM system_configs WHERE config_key = 'leitner_intervals_days'`
  );
  const val = rows[0]?.config_value;
  const intervals = Array.isArray(val) && val.length === 5
    ? (val as number[])
    : DEFAULT_INTERVALS;
  intervalsCache.set('leitner_intervals_days', intervals);
  return intervals;
}

export async function addToBox1IfNotExists(
  userId: string,
  entryId: string,
  mode: string
): Promise<{ added: boolean; existingBoxNumber?: number }> {
  const intervals = await getIntervals();
  const dueAt = new Date(Date.now() + intervals[0] * 24 * 60 * 60 * 1000);

  const { rows } = await pool.query(
    `INSERT INTO leitner_cards
       (user_id, entry_id, box_number, due_at, source, added_from_mode)
     VALUES ($1, $2, 1, $3, 'practice', $4)
     ON CONFLICT (user_id, entry_id) DO NOTHING
     RETURNING id`,
    [userId, entryId, dueAt, mode]
  );

  if (rows.length > 0) return { added: true };

  const { rows: existing } = await pool.query(
    `SELECT box_number FROM leitner_cards WHERE user_id = $1 AND entry_id = $2`,
    [userId, entryId]
  );
  return { added: false, existingBoxNumber: existing[0]?.box_number };
}

export async function addBatchToBox1(
  userId: string,
  entryIds: string[],
  mode: string
): Promise<{ added: number; skipped: number }> {
  if (entryIds.length === 0) return { added: 0, skipped: 0 };

  const intervals = await getIntervals();
  const dueAt = new Date(Date.now() + intervals[0] * 24 * 60 * 60 * 1000);

  const { rows } = await pool.query(
    `INSERT INTO leitner_cards
       (user_id, entry_id, box_number, due_at, source, added_from_mode)
     SELECT $1, unnest($2::uuid[]), 1, $3, 'practice', $4
     ON CONFLICT (user_id, entry_id) DO NOTHING
     RETURNING id`,
    [userId, entryIds, dueAt, mode]
  );

  const added = rows.length;
  return { added, skipped: entryIds.length - added };
}

export async function moveCard(
  leitnerCardId: string,
  userId: string,
  correct: boolean,
  timeMsArg?: number
): Promise<{ newBoxNumber: number; nextDueAt: Date; masteredNow: boolean }> {
  const intervals = await getIntervals();

  const { rows } = await pool.query(
    `SELECT id, box_number FROM leitner_cards WHERE id = $1 AND user_id = $2`,
    [leitnerCardId, userId]
  );
  if (rows.length === 0) {
    const err = Object.assign(new Error('CARD_NOT_FOUND'), { statusCode: 404 });
    throw err;
  }

  const oldBox: number = rows[0].box_number;
  const newBox = correct ? Math.min(oldBox + 1, 5) : 1;
  const nextDueAt = new Date(Date.now() + intervals[newBox - 1] * 24 * 60 * 60 * 1000);
  const masteredNow = newBox === 5 && oldBox < 5;

  await pool.query(
    `UPDATE leitner_cards
     SET box_number        = $1,
         due_at            = $2,
         last_reviewed_at  = now(),
         correct_streak    = CASE WHEN $3 THEN correct_streak + 1 ELSE 0 END,
         total_reviews     = total_reviews + 1,
         updated_at        = now()
     WHERE id = $4`,
    [newBox, nextDueAt, correct, leitnerCardId]
  );

  await pool.query(
    `INSERT INTO leitner_reviews
       (leitner_card_id, user_id, correct, old_box, new_box, time_ms)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [leitnerCardId, userId, correct, oldBox, newBox, timeMsArg ?? null]
  );

  return { newBoxNumber: newBox, nextDueAt, masteredNow };
}
