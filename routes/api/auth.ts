import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import pool from '../../config/db';
import { requireApiAuth, ApiRequest } from '../../middlewares/apiAuth';
import { validateBody } from '../../middlewares/validateBody';
import { asyncHandler } from '../../utils/asyncHandler';
import { apiSuccess, apiError } from '../../utils/apiResponse';
import {
  loginLimiter,
  registerLimiter,
  refreshLimiter,
} from '../../middlewares/rateLimiter';

const router = Router();

const ACCESS_TOKEN_TTL = '7d';
const REFRESH_TOKEN_TTL = '30d';
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const getSecret = (): jwt.Secret => process.env.JWT_SECRET as jwt.Secret;

const generateAccessToken = (userId: string, email: string): string =>
  jwt.sign({ userId, email }, getSecret(), { expiresIn: ACCESS_TOKEN_TTL });

const generateRefreshToken = (userId: string, tokenId: string): string =>
  jwt.sign({ userId, tokenId }, getSecret(), { expiresIn: REFRESH_TOKEN_TTL });

const formatUser = (row: any) => ({
  id: row.id,
  email: row.email,
  full_name: row.full_name,
  level: row.level,
  status: row.status,
  streak_current: row.streak_current,
  streak_longest: row.streak_longest,
  avatar_url: row.avatar_url,
});

// Issue an access + refresh token pair and persist the refresh token record.
const issueTokens = async (
  req: Request,
  user: { id: string; email: string }
) => {
  const tokenId = randomUUID();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
  const userAgent = (req.headers['user-agent'] || '').slice(0, 500) || null;
  const ipAddress = (req.ip || '').slice(0, 45) || null;

  await pool.query(
    `INSERT INTO user_refresh_tokens (user_id, token_id, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5)`,
    [user.id, tokenId, expiresAt, userAgent, ipAddress]
  );

  return {
    accessToken: generateAccessToken(user.id, user.email),
    refreshToken: generateRefreshToken(user.id, tokenId),
  };
};

// ── Schemas ──
const registerSchema = z.object({
  email: z.email(),
  password: z.string().min(6),
  full_name: z.string().min(2),
  phone: z.string().optional(),
  level: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
});

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const logoutSchema = z.object({
  refreshToken: z.string().optional(),
});

// ══════════════════════════════════════
//  POST /api/v1/auth/register
// ══════════════════════════════════════
router.post(
  '/register',
  registerLimiter,
  validateBody(registerSchema),
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const { email, password, full_name, phone, level } = req.body;
    const password_hash = await bcrypt.hash(password, 10);

    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, phone, level)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, full_name, level, status,
                 streak_current, streak_longest, avatar_url`,
      [
        email.toLowerCase().trim(),
        password_hash,
        full_name.trim(),
        phone || null,
        level || 'beginner',
      ]
    );

    const user = rows[0];
    const tokens = await issueTokens(req, user);

    res.status(201).json({
      success: true,
      data: { ...tokens, user: formatUser(user) },
      message: 'Đăng ký thành công',
    });
  })
);

// ══════════════════════════════════════
//  POST /api/v1/auth/login
// ══════════════════════════════════════
router.post(
  '/login',
  loginLimiter,
  validateBody(loginSchema),
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const { email, password } = req.body;

    const { rows } = await pool.query(
      `SELECT id, email, password_hash, full_name, level, status,
              streak_current, streak_longest, avatar_url
       FROM users WHERE email = $1`,
      [email.toLowerCase().trim()]
    );

    if (rows.length === 0) {
      return apiError(res, 401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng');
    }

    const user = rows[0];

    if (user.status === 'banned') {
      return apiError(res, 403, 'ACCOUNT_BANNED', 'Tài khoản đã bị khóa. Vui lòng liên hệ hỗ trợ.');
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return apiError(res, 401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng');
    }

    await pool.query(
      'UPDATE users SET last_login_at = NOW(), last_active_at = NOW() WHERE id = $1',
      [user.id]
    );

    const tokens = await issueTokens(req, user);

    return apiSuccess(
      res,
      { ...tokens, user: formatUser(user) },
      'Đăng nhập thành công'
    );
  })
);

// ══════════════════════════════════════
//  POST /api/v1/auth/refresh — rotate refresh token
// ══════════════════════════════════════
router.post(
  '/refresh',
  refreshLimiter,
  validateBody(refreshSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken } = req.body;

    let decoded: { userId: string; tokenId: string };
    try {
      decoded = jwt.verify(refreshToken, getSecret()) as { userId: string; tokenId: string };
    } catch {
      return apiError(res, 401, 'INVALID_REFRESH_TOKEN', 'Refresh token không hợp lệ');
    }

    if (!decoded.tokenId) {
      return apiError(res, 401, 'INVALID_REFRESH_TOKEN', 'Refresh token không hợp lệ');
    }

    const { rows } = await pool.query(
      `SELECT t.id, t.revoked, t.expires_at,
              u.id AS user_id, u.email, u.full_name, u.level, u.status,
              u.streak_current, u.streak_longest, u.avatar_url
       FROM user_refresh_tokens t
       JOIN users u ON u.id = t.user_id
       WHERE t.token_id = $1`,
      [decoded.tokenId]
    );

    if (rows.length === 0) {
      return apiError(res, 401, 'INVALID_REFRESH_TOKEN', 'Refresh token không tồn tại');
    }

    const row = rows[0];

    if (row.revoked) {
      return apiError(res, 401, 'INVALID_REFRESH_TOKEN', 'Refresh token đã bị thu hồi');
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return apiError(res, 401, 'REFRESH_TOKEN_EXPIRED', 'Refresh token đã hết hạn');
    }
    if (row.status === 'banned') {
      return apiError(res, 403, 'ACCOUNT_BANNED', 'Tài khoản đã bị khóa');
    }

    // Token rotation: revoke old, issue new pair.
    await pool.query(
      `UPDATE user_refresh_tokens SET revoked = true WHERE token_id = $1`,
      [decoded.tokenId]
    );

    const user = {
      id: row.user_id,
      email: row.email,
      full_name: row.full_name,
      level: row.level,
      status: row.status,
      streak_current: row.streak_current,
      streak_longest: row.streak_longest,
      avatar_url: row.avatar_url,
    };
    const tokens = await issueTokens(req, user);

    return apiSuccess(
      res,
      { ...tokens, user: formatUser(user) },
      'Token đã được cấp mới'
    );
  })
);

// ══════════════════════════════════════
//  GET /api/v1/auth/me
// ══════════════════════════════════════
router.get(
  '/me',
  requireApiAuth,
  asyncHandler(async (req: ApiRequest, res: Response) => {
    apiSuccess(res, { user: req.user });
  })
);

// ══════════════════════════════════════
//  POST /api/v1/auth/logout — revoke the supplied refresh token (optional)
// ══════════════════════════════════════
router.post(
  '/logout',
  requireApiAuth,
  validateBody(logoutSchema),
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const { refreshToken } = req.body;

    if (refreshToken) {
      try {
        const decoded = jwt.verify(refreshToken, getSecret()) as {
          userId: string;
          tokenId: string;
        };
        // Defense-in-depth: only revoke tokens owned by the authenticated user.
        if (decoded.userId === req.user!.id && decoded.tokenId) {
          await pool.query(
            `UPDATE user_refresh_tokens SET revoked = true
             WHERE token_id = $1 AND user_id = $2`,
            [decoded.tokenId, req.user!.id]
          );
        }
      } catch {
        // Silently ignore invalid/expired refresh tokens on logout.
      }
    }

    await pool.query(
      'UPDATE users SET last_active_at = NOW() WHERE id = $1',
      [req.user!.id]
    );

    apiSuccess(res, null, 'Đã đăng xuất');
  })
);

// ══════════════════════════════════════
//  POST /api/v1/auth/logout-all — revoke every refresh token for the user
// ══════════════════════════════════════
router.post(
  '/logout-all',
  requireApiAuth,
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const { rowCount } = await pool.query(
      `UPDATE user_refresh_tokens SET revoked = true
       WHERE user_id = $1 AND revoked = false`,
      [req.user!.id]
    );

    await pool.query(
      'UPDATE users SET last_active_at = NOW() WHERE id = $1',
      [req.user!.id]
    );

    apiSuccess(
      res,
      { revokedCount: rowCount ?? 0 },
      'Đã đăng xuất khỏi tất cả thiết bị'
    );
  })
);

export default router;
