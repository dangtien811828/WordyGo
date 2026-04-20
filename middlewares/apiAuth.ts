import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../config/db';
import { apiError } from '../utils/apiResponse';

export interface ApiRequest extends Request {
  user?: {
    id: string;
    email: string;
    full_name: string;
    level: string;
    status: string;
    streak_current: number;
    streak_longest: number;
    avatar_url: string | null;
  };
}

interface JwtPayload {
  userId: string;
  email: string;
}

export const requireApiAuth = async (
  req: ApiRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      apiError(res, 401, 'NO_TOKEN', 'Không có token xác thực');
      return;
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;

    const { rows } = await pool.query(
      `SELECT id, email, full_name, level, status,
              streak_current, streak_longest, avatar_url
       FROM users WHERE id = $1`,
      [decoded.userId]
    );

    if (rows.length === 0) {
      apiError(res, 401, 'INVALID_TOKEN', 'User không tồn tại');
      return;
    }

    if (rows[0].status === 'banned') {
      apiError(res, 403, 'ACCOUNT_BANNED', 'Tài khoản đã bị khóa');
      return;
    }

    req.user = rows[0];
    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      apiError(res, 401, 'TOKEN_EXPIRED', 'Token đã hết hạn');
      return;
    }
    apiError(res, 401, 'INVALID_TOKEN', 'Token không hợp lệ');
  }
};
