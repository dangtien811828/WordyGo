import { Router, Response } from 'express';
import NodeCache from 'node-cache';
import { z } from 'zod';
import pool from '../../config/db';
import { ApiRequest } from '../../middlewares/apiAuth';
import { asyncHandler } from '../../utils/asyncHandler';
import { apiSuccess, apiError } from '../../utils/apiResponse';
import { validateBody } from '../../middlewares/validateBody';
import { parsePagination } from '../../utils/pagination';

const router = Router();

// 10s per-user unread-count cache. Invalidated on any read/delete write.
const unreadCountCache = new NodeCache({ stdTTL: 10, checkperiod: 5 });

const VALID_FILTERS = ['all', 'unread', 'system'] as const;
const SYSTEM_TYPES = [
  'system_update',
  'subscription_activated',
  'subscription_pending',
  'subscription_rejected',
];

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/v1/notifications?filter=all|unread|system&page=1&limit=20
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/',
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;
    const filter = String(req.query.filter ?? 'all');
    if (!(VALID_FILTERS as readonly string[]).includes(filter)) {
      return apiError(
        res,
        400,
        'VALIDATION_ERROR',
        `filter phải là: ${VALID_FILTERS.join(', ')}`,
      );
    }

    const { page, limit, offset } = parsePagination(req);

    const params: any[] = [userId];
    const conds: string[] = ['user_id = $1'];
    if (filter === 'unread') {
      conds.push('is_read = FALSE');
    } else if (filter === 'system') {
      params.push(SYSTEM_TYPES);
      conds.push(`type = ANY($${params.length}::varchar[])`);
    }

    params.push(limit, offset);
    const limitPh = `$${params.length - 1}`;
    const offsetPh = `$${params.length}`;

    const where = `WHERE ${conds.join(' AND ')}`;

    const [items, totalsR] = await Promise.all([
      pool.query(
        `SELECT id, type, title, message, link_url, is_read, created_at
           FROM user_notifications
           ${where}
          ORDER BY created_at DESC
          LIMIT ${limitPh} OFFSET ${offsetPh}`,
        params,
      ),
      pool.query<{ total: number; unread_count: number }>(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE is_read = FALSE)::int AS unread_count
         FROM user_notifications
         WHERE user_id = $1`,
        [userId],
      ),
    ]);

    return apiSuccess(res, {
      items: items.rows.map((r: any) => ({
        id: r.id,
        type: r.type,
        title: r.title,
        message: r.message ?? null,
        link_url: r.link_url ?? null,
        is_read: r.is_read,
        created_at: r.created_at,
      })),
      total: totalsR.rows[0]?.total ?? 0,
      page,
      limit,
      unread_count: totalsR.rows[0]?.unread_count ?? 0,
    });
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/v1/notifications/unread-count
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/unread-count',
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;
    const cacheKey = `unread:${userId}`;
    const cached = unreadCountCache.get<number>(cacheKey);
    if (cached !== undefined) {
      return apiSuccess(res, { count: cached });
    }
    const { rows } = await pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
         FROM user_notifications
        WHERE user_id = $1 AND is_read = FALSE`,
      [userId],
    );
    const count = rows[0]?.count ?? 0;
    unreadCountCache.set(cacheKey, count);
    return apiSuccess(res, { count });
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/v1/notifications/read-all
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/read-all',
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;
    await pool.query(
      `UPDATE user_notifications
          SET is_read = TRUE
        WHERE user_id = $1 AND is_read = FALSE`,
      [userId],
    );
    unreadCountCache.del(`unread:${userId}`);
    return res.status(204).send();
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/v1/notifications/fcm-token
//  Phase 12 placeholder — registers/refreshes the device token. Push dispatch
//  itself is deferred. Upserts on (user_id, device_id).
// ─────────────────────────────────────────────────────────────────────────────
const fcmTokenSchema = z.object({
  token: z.string().min(1).max(500),
  device_id: z.string().min(1).max(200),
  platform: z.enum(['ios', 'android', 'web']),
});

router.post(
  '/fcm-token',
  validateBody(fcmTokenSchema),
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;
    const { token, device_id, platform } = req.body as z.infer<typeof fcmTokenSchema>;
    await pool.query(
      `INSERT INTO user_fcm_tokens (user_id, token, device_id, platform)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, device_id)
       DO UPDATE SET token        = EXCLUDED.token,
                     platform     = EXCLUDED.platform,
                     last_used_at = NOW()`,
      [userId, token, device_id, platform],
    );
    return res.status(204).send();
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/v1/notifications/:id/read
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/:id/read',
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;
    const { id } = req.params;
    const { rowCount } = await pool.query(
      `UPDATE user_notifications
          SET is_read = TRUE
        WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    if (!rowCount) {
      return apiError(res, 404, 'NOT_FOUND', 'Notification không tồn tại');
    }
    unreadCountCache.del(`unread:${userId}`);
    return res.status(204).send();
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
//  DELETE /api/v1/notifications/:id
// ─────────────────────────────────────────────────────────────────────────────
router.delete(
  '/:id',
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;
    const { id } = req.params;
    const { rowCount } = await pool.query(
      `DELETE FROM user_notifications
        WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    if (!rowCount) {
      return apiError(res, 404, 'NOT_FOUND', 'Notification không tồn tại');
    }
    unreadCountCache.del(`unread:${userId}`);
    return res.status(204).send();
  }),
);

export default router;
