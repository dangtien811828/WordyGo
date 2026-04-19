import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import flash from 'connect-flash';
import path from 'path';
import expressLayouts from 'express-ejs-layouts';

import { injectAdmin } from './middlewares/auth';

import cors from 'cors';
import apiAuthRoutes from './routes/api/auth';

import authRoutes from './routes/auth';
import dashboardRoutes from './routes/dashboard';
import approvalsRoutes from './routes/approvals';
import usersRoutes from './routes/users';
import profileRoutes from './routes/profile';
import dictionaryRoutes from './routes/dictionary';
import lessonsRoutes from './routes/lessons';
import decksRoutes from './routes/decks';
import ebooksRoutes from './routes/ebooks';
import subscriptionsRoutes from './routes/subscriptions';
import settingsRoutes from './routes/settings';
import gamesRoutes from './routes/games';
import aiContentRoutes from './routes/ai-content';

const app = express();

// Resolve project root — works both in dev (tsx from root) and prod (node dist/app.js from root).
const PROJECT_ROOT = process.cwd();

// ── View Engine ──
app.set('view engine', 'ejs');
app.set('views', path.join(PROJECT_ROOT, 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/main');

// ── Static Files ──
app.use(express.static(path.join(PROJECT_ROOT, 'public')));

// ── Body Parser ──
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// CORS — cho phép mobile app gọi API
app.use(cors());

// ── Session ──
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'fallback-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000,
      secure: false,
    },
  })
);

// ── Flash Messages ──
app.use(flash());

// ── Inject Admin Data vào tất cả Views ──
app.use(injectAdmin);

// ── Routes ──
app.use('/auth', authRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/approvals', approvalsRoutes);
app.use('/users', usersRoutes);
app.use('/profile', profileRoutes);
app.use('/dictionary', dictionaryRoutes);
app.use('/lessons', lessonsRoutes);
app.use('/decks', decksRoutes);
app.use('/ebooks', ebooksRoutes);
app.use('/subscriptions', subscriptionsRoutes);
app.use('/settings', settingsRoutes);
app.use('/games', gamesRoutes);
app.use('/ai-content', aiContentRoutes);

// API routes cho mobile app
app.use('/api/v1/auth', apiAuthRoutes);

// Root redirect
app.get('/', (_req: Request, res: Response) => {
  res.redirect('/dashboard');
});

// 404
app.use((_req: Request, res: Response) => {
  res.status(404).render('404', { title: '404' });
});

// Error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[Server] Error:', err);
  res.status(500).send('Đã xảy ra lỗi server. Vui lòng thử lại.');
});


const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
// ── Start ──
app.listen(PORT, () => {
  console.log(`\n══════════════════════════════════════`);
  console.log(`  English Admin Dashboard`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`══════════════════════════════════════\n`);
});