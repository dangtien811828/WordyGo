import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import pool from '../config/db';
import User from '../models/User';

const VALID_LEVELS  = ['beginner', 'intermediate', 'advanced'];
const VALID_STATUSES = ['active', 'inactive', 'banned'];

const userController = {
  // GET /users
  async getIndex(req: Request, res: Response) {
    try {
      const { search = '', status = '', level = '', page = 1 } = req.query as any;
      const [result, statusCounts] = await Promise.all([
        User.getAll({ search, status, level, page, limit: 20 }),
        User.countByStatus(),
      ]);
      res.render('users/index', {
        title: 'Người dùng',
        active: 'users',
        users: result.rows,
        pagination: result,
        statusCounts,
        filters: { search, status, level },
      });
    } catch (err) {
      console.error('[Users] getIndex error:', err);
      req.flash('error', 'Không thể tải danh sách người dùng');
      return res.redirect('/dashboard');
    }
  },

  // GET /users/create
  getCreate(req: Request, res: Response) {
    res.render('users/create', { title: 'Thêm người dùng', active: 'users' });
  },

  // POST /users/create
  async postCreate(req: Request, res: Response) {
    try {
      const { full_name, email, password, phone, level } = req.body;
      const errors: string[] = [];
      if (!full_name || full_name.trim().length < 2) errors.push('Họ tên phải có ít nhất 2 ký tự');
      if (!email || !/^\S+@\S+\.\S+$/.test(email))  errors.push('Email không hợp lệ');
      if (!password || password.length < 6)          errors.push('Mật khẩu phải có ít nhất 6 ký tự');
      if (!VALID_LEVELS.includes(level))             errors.push('Cấp độ không hợp lệ');

      if (errors.length > 0) {
        req.flash('error', errors.join('. '));
        return res.redirect('/users/create');
      }

      const existing = await User.findByEmail(email.toLowerCase().trim());
      if (existing) {
        req.flash('error', 'Email đã được sử dụng');
        return res.redirect('/users/create');
      }

      const passwordHash = await bcrypt.hash(password, 10);
      await User.create({
        email: email.toLowerCase().trim(),
        passwordHash,
        fullName: full_name.trim(),
        phone: phone ? phone.trim() || null : null,
        level,
      });

      req.flash('success', 'Đã thêm người dùng thành công');
      return res.redirect('/users');
    } catch (err) {
      console.error('[Users] postCreate error:', err);
      req.flash('error', 'Đã xảy ra lỗi. Vui lòng thử lại.');
      return res.redirect('/users/create');
    }
  },

  // GET /users/:id
  async getShow(req: Request, res: Response) {
    try {
      const user = await User.findById(req.params.id as string);
      if (!user) {
        req.flash('error', 'Không tìm thấy người dùng');
        return res.redirect('/users');
      }
      const [reviewsRes, lessonsRes] = await Promise.all([
        pool.query('SELECT COUNT(*)::int AS count FROM reviews WHERE user_id = $1', [user.id]),
        pool.query('SELECT COUNT(*)::int AS count FROM user_lesson_progress WHERE user_id = $1 AND completed = true', [user.id]),
      ]);
      res.render('users/show', {
        title: user.full_name,
        active: 'users',
        user,
        stats: {
          reviews:          reviewsRes.rows[0].count,
          lessonsCompleted: lessonsRes.rows[0].count,
        },
      });
    } catch (err) {
      console.error('[Users] getShow error:', err);
      req.flash('error', 'Không thể tải thông tin người dùng');
      return res.redirect('/users');
    }
  },

  // GET /users/:id/edit
  async getEdit(req: Request, res: Response) {
    try {
      const user = await User.findById(req.params.id as string);
      if (!user) {
        req.flash('error', 'Không tìm thấy người dùng');
        return res.redirect('/users');
      }
      res.render('users/edit', { title: `Sửa — ${user.full_name}`, active: 'users', user });
    } catch (err) {
      console.error('[Users] getEdit error:', err);
      req.flash('error', 'Không thể tải thông tin người dùng');
      return res.redirect('/users');
    }
  },

  // POST /users/:id/edit
  async postEdit(req: Request, res: Response) {
    try {
      const { id } = req.params as { id: string };
      const { full_name, phone, level, status } = req.body;
      const errors: string[] = [];
      if (!full_name || full_name.trim().length < 2) errors.push('Họ tên phải có ít nhất 2 ký tự');
      if (!VALID_LEVELS.includes(level))             errors.push('Cấp độ không hợp lệ');
      if (!VALID_STATUSES.includes(status))          errors.push('Trạng thái không hợp lệ');

      if (errors.length > 0) {
        req.flash('error', errors.join('. '));
        return res.redirect(`/users/${id}/edit`);
      }

      await User.update(id, {
        fullName: full_name.trim(),
        phone: phone ? phone.trim() || null : null,
        level,
        status,
      });
      req.flash('success', 'Đã cập nhật thông tin người dùng');
      return res.redirect(`/users/${id}`);
    } catch (err) {
      console.error('[Users] postEdit error:', err);
      req.flash('error', 'Đã xảy ra lỗi. Vui lòng thử lại.');
      return res.redirect(`/users/${req.params.id}/edit`);
    }
  },

  // POST /users/:id/toggle-status
  async postToggleStatus(req: Request, res: Response) {
    try {
      const { id } = req.params as { id: string };
      const { new_status } = req.body;

      if (!VALID_STATUSES.includes(new_status)) {
        req.flash('error', 'Trạng thái không hợp lệ');
        return res.redirect('/users');
      }

      await User.setStatus(id, new_status);

      const labels: Record<string, string> = { active: 'Đã kích hoạt', inactive: 'Đã vô hiệu hóa', banned: 'Đã cấm tài khoản' };
      req.flash('success', labels[new_status]);
      return res.redirect('back');
    } catch (err) {
      console.error('[Users] postToggleStatus error:', err);
      req.flash('error', 'Đã xảy ra lỗi. Vui lòng thử lại.');
      return res.redirect('/users');
    }
  },

  // POST /users/:id/delete  (super_admin only — enforced in controller)
  async postDelete(req: Request, res: Response) {
    try {
      if (req.session.admin.role !== 'super_admin') {
        req.flash('error', 'Chỉ Super Admin mới có thể xóa người dùng');
        return res.redirect('/users');
      }

      const { id } = req.params as { id: string };
      const { confirm_text } = req.body;

      const user = await User.findById(id);
      if (!user) {
        req.flash('error', 'Không tìm thấy người dùng');
        return res.redirect('/users');
      }

      const confirmTarget = user.full_name && user.full_name.trim()
        ? user.full_name.trim()
        : user.email;
      if (confirm_text !== `DELETE ${confirmTarget}`) {
        req.flash('error', 'Xác nhận không đúng. Vui lòng thử lại.');
        return res.redirect(`/users/${id}`);
      }

      await User.delete(id);
      req.flash('success', `Đã xóa người dùng ${confirmTarget}`);
      return res.redirect('/users');
    } catch (err) {
      console.error('[Users] postDelete error:', err);
      req.flash('error', 'Đã xảy ra lỗi. Vui lòng thử lại.');
      return res.redirect('/users');
    }
  },
};

export = userController;
