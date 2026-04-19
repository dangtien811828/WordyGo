import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import Admin from '../models/Admin';

const authController = {
  // ── GET /auth/login ──
  getLogin(req: Request, res: Response) {
    res.render('auth/login', { title: 'Đăng nhập' });
  },

  // ── POST /auth/login ──
  async postLogin(req: Request, res: Response) {
    try {
      const { email, password } = req.body;

      const admin = await Admin.findByEmail(email);
      if (!admin) {
        req.flash('error', 'Email hoặc mật khẩu không đúng');
        return res.redirect('/auth/login');
      }

      if (admin.status === 'disabled') {
        req.flash('error', 'Tài khoản đã bị vô hiệu hóa. Liên hệ Super Admin.');
        return res.redirect('/auth/login');
      }

      const isMatch = await bcrypt.compare(password, admin.password_hash);
      if (!isMatch) {
        req.flash('error', 'Email hoặc mật khẩu không đúng');
        return res.redirect('/auth/login');
      }

      // Lưu session
      req.session.admin = {
        id: admin.id,
        email: admin.email,
        full_name: admin.full_name,
        role: admin.role,
        avatar_url: admin.avatar_url,
      };

      await Admin.updateLastLogin(admin.id);

      req.flash('success', `Xin chào, ${admin.full_name}!`);
      return res.redirect('/dashboard');
    } catch (err) {
      console.error('[Auth] Login error:', err);
      req.flash('error', 'Đã xảy ra lỗi. Vui lòng thử lại.');
      return res.redirect('/auth/login');
    }
  },

  // ── GET /auth/register ──
  getRegister(req: Request, res: Response) {
    res.render('auth/register', { title: 'Tạo tài khoản Admin' });
  },

  // ── POST /auth/register ──
  async postRegister(req: Request, res: Response) {
    try {
      const { full_name, email, password, password_confirm, role } = req.body;

      // Validate
      const errors: string[] = [];
      if (!full_name || full_name.trim().length < 2) {
        errors.push('Họ tên phải có ít nhất 2 ký tự');
      }
      if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
        errors.push('Email không hợp lệ');
      }
      if (!password || password.length < 6) {
        errors.push('Mật khẩu phải có ít nhất 6 ký tự');
      }
      if (password !== password_confirm) {
        errors.push('Xác nhận mật khẩu không khớp');
      }

      if (errors.length > 0) {
        req.flash('error', errors.join('. '));
        return res.redirect('/auth/register');
      }

      // Check email tồn tại
      const existing = await Admin.findByEmail(email);
      if (existing) {
        req.flash('error', 'Email đã được sử dụng');
        return res.redirect('/auth/register');
      }

      // Chỉ super_admin mới được tạo super_admin khác
      const allowedRoles = ['content_editor', 'moderator'];
      if (req.session && req.session.admin && req.session.admin.role === 'super_admin') {
        allowedRoles.push('super_admin');
      }
      const finalRole = allowedRoles.includes(role) ? role : 'content_editor';

      const passwordHash = await bcrypt.hash(password, 10);

      await Admin.create({
        email: email.toLowerCase().trim(),
        passwordHash,
        fullName: full_name.trim(),
        role: finalRole,
      });

      req.flash('success', 'Tạo tài khoản thành công! Hãy đăng nhập.');
      return res.redirect('/auth/login');
    } catch (err) {
      console.error('[Auth] Register error:', err);
      req.flash('error', 'Đã xảy ra lỗi. Vui lòng thử lại.');
      return res.redirect('/auth/register');
    }
  },

  // ── POST /auth/logout ──
  postLogout(req: Request, res: Response) {
    req.session.destroy((err) => {
      if (err) console.error('[Auth] Logout error:', err);
      res.redirect('/auth/login');
    });
  },
};

export = authController;
