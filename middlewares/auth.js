/**
 * Middleware xác thực & phân quyền
 */

// Yêu cầu đăng nhập
function requireAuth(req, res, next) {
  if (req.session && req.session.admin) {
    return next();
  }
  req.flash('error', 'Vui lòng đăng nhập để tiếp tục');
  return res.redirect('/auth/login');
}

// Yêu cầu role cụ thể
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session || !req.session.admin) {
      req.flash('error', 'Vui lòng đăng nhập');
      return res.redirect('/auth/login');
    }
    if (!roles.includes(req.session.admin.role)) {
      req.flash('error', 'Bạn không có quyền truy cập trang này');
      return res.redirect('/dashboard');
    }
    return next();
  };
}

// Chặn truy cập trang auth khi đã login
function redirectIfAuth(req, res, next) {
  if (req.session && req.session.admin) {
    return res.redirect('/dashboard');
  }
  return next();
}

// Inject admin data vào tất cả views
function injectAdmin(req, res, next) {
  res.locals.admin = req.session ? req.session.admin : null;
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  next();
}

module.exports = { requireAuth, requireRole, redirectIfAuth, injectAdmin };
