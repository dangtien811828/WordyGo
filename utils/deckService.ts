import pool from '../config/db';

export interface DeckUserProgress {
  mastered_count: number;
  in_progress_count: number;
  total_cards: number;
  completion_percent: number;
}

/**
 * Aggregate per-user progress for a single deck.
 *  - mastered_count: cards in Leitner box >= 5 for this user.
 *  - in_progress_count: cards with at least one user_card_progress row.
 *  - completion_percent: mastered_count / total_cards, rounded to 2 decimals (0.00 — 1.00).
 *
 * For list endpoints (/system, /mine) the same aggregates are inlined into
 * the main query to avoid N+1 — see routes/api/decks.ts.
 */
export const getUserProgressForDeck = async (
  userId: string,
  deckId: string
): Promise<DeckUserProgress> => {
  const { rows } = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM cards WHERE deck_id = $1) AS total_cards,
       (SELECT COUNT(*)::int
          FROM cards c
          JOIN leitner_cards lc ON lc.entry_id = c.entry_id AND lc.user_id = $2
          WHERE c.deck_id = $1 AND lc.box_number >= 5) AS mastered_count,
       (SELECT COUNT(*)::int
          FROM cards c
          JOIN user_card_progress ucp ON ucp.card_id = c.id AND ucp.user_id = $2
          WHERE c.deck_id = $1) AS in_progress_count`,
    [deckId, userId]
  );
  const r = rows[0];
  const total: number = r.total_cards;
  return {
    mastered_count: r.mastered_count,
    in_progress_count: r.in_progress_count,
    total_cards: total,
    completion_percent: total > 0 ? Math.round((r.mastered_count / total) * 100) / 100 : 0,
  };
};

/**
 * Compute completion_percent from raw aggregates returned by list queries.
 * Keeps rounding logic in one place.
 */
export const computeCompletionPercent = (mastered: number, total: number): number =>
  total > 0 ? Math.round((mastered / total) * 100) / 100 : 0;
