import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import pool from '../config/db';

// Mở rộng Request để có thêm field user
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
      res.status(401).json({ error: 'Không có token xác thực' });
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
      res.status(401).json({ error: 'User không tồn tại' });
      return;
    }

    if (rows[0].status === 'banned') {
      res.status(403).json({ error: 'Tài khoản đã bị khóa' });
      return;
    }

    req.user = rows[0];
    next();
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      res.status(401).json({ error: 'Token đã hết hạn' });
      return;
    }
    res.status(401).json({ error: 'Token không hợp lệ' });
  }
};