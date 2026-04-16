import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../../config/db';
import { requireApiAuth, ApiRequest } from '../../middlewares/apiAuth';

const router = Router();

// ══ Helper: tạo JWT token (fix TypeScript typing) ══
const generateToken = (userId: string, email: string): string => {
  const secret = process.env.JWT_SECRET as jwt.Secret;
  const options: jwt.SignOptions = {
    expiresIn: '7d',
  };
  return jwt.sign({ userId, email }, secret, options);
};

// ══ Helper: format user response ══
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

// ══════════════════════════════════════
//  POST /api/v1/auth/register
// ══════════════════════════════════════
router.post('/register', async (req: ApiRequest, res: Response): Promise<void> => {
  try {
    const { email, password, full_name, phone, level } = req.body;

    if (!email || !password || !full_name) {
      res.status(400).json({ error: 'Vui lòng điền đầy đủ: email, mật khẩu, họ tên' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'Mật khẩu phải có ít nhất 6 ký tự' });
      return;
    }

    const existing = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );
    if (existing.rows.length > 0) {
      res.status(409).json({ error: 'Email đã được sử dụng' });
      return;
    }

    const password_hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, phone, level)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, full_name, level, status,
                 streak_current, streak_longest, avatar_url`,
      [email.toLowerCase().trim(), password_hash, full_name.trim(), phone || null, level || 'beginner']
    );

    const user = rows[0];
    const token = generateToken(user.id, user.email);

    res.status(201).json({
      message: 'Đăng ký thành công',
      token,
      user: formatUser(user),
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ══════════════════════════════════════
//  POST /api/v1/auth/login
// ══════════════════════════════════════
router.post('/login', async (req: ApiRequest, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Vui lòng nhập email và mật khẩu' });
      return;
    }

    const { rows } = await pool.query(
      `SELECT id, email, password_hash, full_name, level, status,
              streak_current, streak_longest, avatar_url
       FROM users WHERE email = $1`,
      [email.toLowerCase().trim()]
    );

    if (rows.length === 0) {
      res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });
      return;
    }

    const user = rows[0];

    if (user.status === 'banned') {
      res.status(403).json({ error: 'Tài khoản đã bị khóa. Vui lòng liên hệ hỗ trợ.' });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });
      return;
    }

    await pool.query(
      'UPDATE users SET last_login_at = NOW(), last_active_at = NOW() WHERE id = $1',
      [user.id]
    );

    const token = generateToken(user.id, user.email);

    res.json({
      message: 'Đăng nhập thành công',
      token,
      user: formatUser(user),
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ══════════════════════════════════════
//  GET /api/v1/auth/me
// ══════════════════════════════════════
router.get('/me', requireApiAuth, (req: ApiRequest, res: Response) => {
  res.json({ user: req.user });
});

// ══════════════════════════════════════
//  POST /api/v1/auth/logout
// ══════════════════════════════════════
router.post('/logout', requireApiAuth, async (req: ApiRequest, res: Response) => {
  await pool.query(
    'UPDATE users SET last_active_at = NOW() WHERE id = $1',
    [req.user!.id]
  );
  res.json({ message: 'Đã đăng xuất' });
});

export default router;