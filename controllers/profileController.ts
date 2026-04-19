import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import Admin from '../models/Admin';

const profileController = {
  // GET /profile
  async getProfile(req: Request, res: Response) {
    try {
      const admin = await Admin.findById(req.session.admin.id);
      if (!admin) {
        req.flash('error', 'Không tìm thấy tài khoản');
        return res.redirect('/dashboard');
      }
      res.render('profile/index', {
        title: 'Hồ sơ cá nhân',
        active: 'profile',
        profileAdmin: admin,
      });
    } catch (err) {
      console.error('[Profile] getProfile error:', err);
      req.flash('error', 'Không thể tải thông tin');
      return res.redirect('/dashboard');
    }
  },

  // POST /profile/update
  async postUpdate(req: Request, res: Response) {
    try {
      const { full_name } = req.body;
      const adminId = req.session.admin.id;

      if (!full_name || full_name.trim().length < 2) {
        req.flash('error', 'Họ tên phải có ít nhất 2 ký tự');
        return res.redirect('/profile');
      }

      const avatarUrl = req.file
        ? `/uploads/${req.file.filename}`
        : req.session.admin.avatar_url;

      await Admin.updateProfile(adminId, { fullName: full_name.trim(), avatarUrl });

      req.session.admin.full_name = full_name.trim();
      req.session.admin.avatar_url = avatarUrl;

      req.flash('success', 'Đã cập nhật thông tin');
      return res.redirect('/profile');
    } catch (err) {
      console.error('[Profile] postUpdate error:', err);
      req.flash('error', 'Đã xảy ra lỗi. Vui lòng thử lại.');
      return res.redirect('/profile');
    }
  },

  // POST /profile/password
  async postPassword(req: Request, res: Response) {
    try {
      const { old_password, new_password, confirm_password } = req.body;
      const adminId = req.session.admin.id;

      if (!new_password || new_password.length < 6) {
        req.flash('error', 'Mật khẩu mới phải có ít nhất 6 ký tự');
        return res.redirect('/profile');
      }
      if (new_password !== confirm_password) {
        req.flash('error', 'Xác nhận mật khẩu không khớp');
        return res.redirect('/profile');
      }

      const admin = await Admin.findByEmail(req.session.admin.email);
      const isMatch = await bcrypt.compare(old_password, admin.password_hash);
      if (!isMatch) {
        req.flash('error', 'Mật khẩu cũ không đúng');
        return res.redirect('/profile');
      }

      const newHash = await bcrypt.hash(new_password, 10);
      await Admin.updatePassword(adminId, newHash);

      req.flash('success', 'Đã đổi mật khẩu thành công');
      return res.redirect('/profile');
    } catch (err) {
      console.error('[Profile] postPassword error:', err);
      req.flash('error', 'Đã xảy ra lỗi. Vui lòng thử lại.');
      return res.redirect('/profile');
    }
  },

  // POST /profile/delete
  async postDelete(req: Request, res: Response) {
    try {
      const { confirm_text } = req.body;
      const expected = `DELETE ${req.session.admin.email}`;

      if (confirm_text !== expected) {
        req.flash('error', 'Xác nhận không đúng. Vui lòng nhập đúng cú pháp.');
        return res.redirect('/profile');
      }

      await Admin.deleteAccount(req.session.admin.id);

      req.session.destroy((err) => {
        if (err) console.error('[Profile] session destroy error:', err);
        res.redirect('/auth/login');
      });
    } catch (err) {
      console.error('[Profile] postDelete error:', err);
      req.flash('error', 'Đã xảy ra lỗi. Vui lòng thử lại.');
      return res.redirect('/profile');
    }
  },
};

export = profileController;
