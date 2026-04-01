require('dotenv').config();
const express = require('express');
const session = require('express-session');
const flash = require('connect-flash');
const path = require('path');
const expressLayouts = require('express-ejs-layouts');

const { injectAdmin } = require('./middlewares/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// ── View Engine ──
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/main');

// ── Static Files ──
app.use(express.static(path.join(__dirname, 'public')));

// ── Body Parser ──
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ── Session ──
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 24 giờ
    secure: false, // set true nếu dùng HTTPS
  },
}));

// ── Flash Messages ──
app.use(flash());

// ── Inject Admin Data vào tất cả Views ──
app.use(injectAdmin);

// ── Routes ──
app.use('/auth',      require('./routes/auth'));
app.use('/dashboard', require('./routes/dashboard'));
app.use('/approvals', require('./routes/approvals'));
app.use('/users',      require('./routes/users'));
app.use('/profile',    require('./routes/profile'));
app.use('/dictionary', require('./routes/dictionary'));
app.use('/lessons',    require('./routes/lessons'));
app.use('/decks',      require('./routes/decks'));
app.use('/ebooks',         require('./routes/ebooks'));
app.use('/subscriptions',  require('./routes/subscriptions'));
app.use('/settings',       require('./routes/settings'));

// Root redirect
app.get('/', (req, res) => {
  res.redirect('/dashboard');
});

// 404
app.use((req, res) => {
  res.status(404).render('404', { title: '404' });
});

// Error handler
app.use((err, req, res, next) => {
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
