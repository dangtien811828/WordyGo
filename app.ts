import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import flash from 'connect-flash';
import path from 'path';
import expressLayouts from 'express-ejs-layouts';

import { injectAdmin } from './middlewares/auth';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

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
app.use('/auth', require('./routes/auth'));
app.use('/dashboard', require('./routes/dashboard'));
app.use('/approvals', require('./routes/approvals'));
app.use('/users', require('./routes/users'));
app.use('/profile', require('./routes/profile'));
app.use('/dictionary', require('./routes/dictionary'));
app.use('/lessons', require('./routes/lessons'));
app.use('/decks', require('./routes/decks'));
app.use('/ebooks', require('./routes/ebooks'));
app.use('/subscriptions', require('./routes/subscriptions'));
app.use('/settings', require('./routes/settings'));
app.use('/games', require('./routes/games'));
app.use('/ai-content', require('./routes/ai-content'));

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

// ── Start ──
app.listen(PORT, () => {
  console.log(`\n══════════════════════════════════════`);
  console.log(`  English Admin Dashboard`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`══════════════════════════════════════\n`);
});
