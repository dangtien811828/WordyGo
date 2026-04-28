import bcrypt from 'bcryptjs';
import type { Request, Response } from 'express';
import Admin from '../models/Admin';

const profileController = {
  // GET /profile
  async getProfile(req: Request, res: Response) {
    try {
      const admin = await Admin.findById(req.session.admin.id);
      if (!admin) {
        req.flash('error', 'Account not found');
        return res.redirect('/dashboard');
      }
      res.render('profile/index', {
        title: 'My Profile',
        active: 'profile',
        profileAdmin: admin,
      });
    } catch (err) {
      console.error('[Profile] getProfile error:', err);
      req.flash('error', 'Failed to load profile information');
      return res.redirect('/dashboard');
    }
  },

  // POST /profile/update
  async postUpdate(req: Request, res: Response) {
    try {
      const { full_name } = req.body;
      const adminId = req.session.admin.id;

      if (!full_name || full_name.trim().length < 2) {
        req.flash('error', 'Full name must be at least 2 characters');
        return res.redirect('/profile');
      }

      const avatarUrl = req.file
        ? `/uploads/${req.file.filename}`
        : req.session.admin.avatar_url;

      await Admin.updateProfile(adminId, { fullName: full_name.trim(), avatarUrl });

      req.session.admin.full_name = full_name.trim();
      req.session.admin.avatar_url = avatarUrl;

      req.flash('success', 'Profile updated successfully');
      return res.redirect('/profile');
    } catch (err) {
      console.error('[Profile] postUpdate error:', err);
      req.flash('error', 'An error occurred. Please try again.');
      return res.redirect('/profile');
    }
  },

  // POST /profile/password
  async postPassword(req: Request, res: Response) {
    try {
      const { old_password, new_password, confirm_password } = req.body;
      const adminId = req.session.admin.id;

      if (!new_password || new_password.length < 6) {
        req.flash('error', 'New password must be at least 6 characters');
        return res.redirect('/profile');
      }
      if (new_password !== confirm_password) {
        req.flash('error', 'Password confirmation does not match');
        return res.redirect('/profile');
      }

      const admin = await Admin.findByEmail(req.session.admin.email);
      const isMatch = await bcrypt.compare(old_password, admin.password_hash);
      if (!isMatch) {
        req.flash('error', 'Current password is incorrect');
        return res.redirect('/profile');
      }

      const newHash = await bcrypt.hash(new_password, 10);
      await Admin.updatePassword(adminId, newHash);

      req.flash('success', 'Password changed successfully');
      return res.redirect('/profile');
    } catch (err) {
      console.error('[Profile] postPassword error:', err);
      req.flash('error', 'An error occurred. Please try again.');
      return res.redirect('/profile');
    }
  },

  // POST /profile/delete
  async postDelete(req: Request, res: Response) {
    try {
      const { confirm_text } = req.body;
      const expected = `DELETE ${req.session.admin.email}`;

      if (confirm_text !== expected) {
        req.flash('error', 'Confirmation text is incorrect. Please enter the exact text shown.');
        return res.redirect('/profile');
      }

      await Admin.deleteAccount(req.session.admin.id);

      req.session.destroy((err) => {
        if (err) console.error('[Profile] session destroy error:', err);
        res.redirect('/auth/login');
      });
    } catch (err) {
      console.error('[Profile] postDelete error:', err);
      req.flash('error', 'An error occurred. Please try again.');
      return res.redirect('/profile');
    }
  },
};

export = profileController;
