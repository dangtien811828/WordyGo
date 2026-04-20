import { Response, NextFunction } from 'express';
import pool from '../config/db';
import { ApiRequest } from './apiAuth';
import { updateStreak } from '../utils/streakCalculator';

const TRACKED_SEGMENTS = ['flashcard', 'review', 'game', 'lookup'];

const inferAction = (path: string): string | null => {
  for (const seg of TRACKED_SEGMENTS) {
    if (path.includes(seg)) return seg;
  }
  return null;
};

/**
 * Factory: trả middleware log activity SAU khi response finish.
 * - Nếu `explicitAction` truyền vào: dùng nguyên string đó.
 * - Nếu không: suy ra từ req.path (flashcard/review/game/lookup).
 * Log fire-and-forget — không block response; errors chỉ log console.
 *
 * Mount sau apiAuth: `router.use(requireApiAuth, trackActivity('review'))`
 */
export const trackActivity =
  (explicitAction?: string) =>
  (req: ApiRequest, res: Response, next: NextFunction): void => {
    res.on('finish', () => {
      if (res.statusCode >= 400) return;
      if (!req.user) return;

      const action = explicitAction || inferAction(req.path);
      if (!action) return;

      // Fire-and-forget
      void (async () => {
        try {
          await pool.query(
            `INSERT INTO user_activity_log (user_id, action, details)
             VALUES ($1, $2, $3)`,
            [req.user!.id, action, { path: req.path, method: req.method }]
          );
          await updateStreak(req.user!.id);
        } catch (err) {
          console.error('[trackActivity]', err);
        }
      })();
    });
    next();
  };
