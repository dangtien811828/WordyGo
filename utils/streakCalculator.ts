import pool from '../config/db';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface StreakResult {
  current: number;
  longest: number;
}

/**
 * Tính streak_current + streak_longest cho 1 user dựa trên DISTINCT ngày
 * trong user_activity_log. Current = số ngày liên tiếp tính ngược từ HÔM NAY.
 */
export async function calculateStreak(userId: string): Promise<StreakResult> {
  const { rows } = await pool.query<{ d: Date }>(
    `SELECT DISTINCT DATE(created_at AT TIME ZONE 'UTC') AS d
     FROM user_activity_log
     WHERE user_id = $1
     ORDER BY d DESC`,
    [userId]
  );
  if (rows.length === 0) return { current: 0, longest: 0 };

  const dates = rows
    .map((r) => {
      const d = r.d instanceof Date ? r.d : new Date(String(r.d));
      return Math.floor(d.getTime() / DAY_MS) * DAY_MS;
    })
    .sort((a, b) => b - a); // DESC

  const todayUtc = Math.floor(Date.now() / DAY_MS) * DAY_MS;

  // Current streak: từ hôm nay đi lùi, đếm ngày liên tục có activity.
  let current = 0;
  let cursor = todayUtc;
  for (const ts of dates) {
    if (ts === cursor) {
      current++;
      cursor -= DAY_MS;
    } else if (ts < cursor) {
      break;
    }
  }

  // Longest: scan ascending, đếm run dài nhất với bước = 1 ngày.
  const asc = dates.slice().reverse();
  let longest = 1;
  let run = 1;
  for (let i = 1; i < asc.length; i++) {
    if (asc[i] - asc[i - 1] === DAY_MS) {
      run++;
      if (run > longest) longest = run;
    } else {
      run = 1;
    }
  }

  return { current, longest };
}

/**
 * Recalculate + persist streak vào bảng users + cập nhật last_active_at.
 * Dùng từ trackActivity middleware; an toàn khi gọi sai (best-effort).
 */
export async function updateStreak(userId: string): Promise<void> {
  const { current, longest } = await calculateStreak(userId);
  await pool.query(
    `UPDATE users SET
       streak_current = $1,
       streak_longest = GREATEST(COALESCE(streak_longest, 0), $2),
       last_active_at = NOW()
     WHERE id = $3`,
    [current, longest, userId]
  );
}
