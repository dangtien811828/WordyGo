import type { Request, Response, NextFunction, RequestHandler } from 'express';
import Approval from '../models/Approval';

type AdminRole = 'super_admin' | 'content_editor' | 'moderator';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.session && req.session.admin) {
    return next();
  }
  req.flash('error', 'Vui lòng đăng nhập để tiếp tục');
  return res.redirect('/auth/login');
}

export function requireRole(...roles: AdminRole[]): RequestHandler {
  return (req, res, next) => {
    if (!req.session || !req.session.admin) {
      req.flash('error', 'Vui lòng đăng nhập');
      return res.redirect('/auth/login');
    }
    if (!roles.includes(req.session.admin.role as AdminRole)) {
      req.flash('error', 'Bạn không có quyền truy cập trang này');
      return res.redirect('/dashboard');
    }
    return next();
  };
}

export function redirectIfAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.session && req.session.admin) {
    return res.redirect('/dashboard');
  }
  return next();
}

export async function injectAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.locals.admin = req.session ? req.session.admin : null;
    res.locals.success = req.flash('success');
    res.locals.error = req.flash('error');
    res.locals.currentQuery = req.query;
    res.locals.pendingApprovals = 0;

    if (res.locals.admin && res.locals.admin.role === 'super_admin') {
      res.locals.pendingApprovals = await Approval.countPending();
    }

    next();
  } catch (err) {
    console.error('[injectAdmin] Error:', err);
    next(err);
  }
}
