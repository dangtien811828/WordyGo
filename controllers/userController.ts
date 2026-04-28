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
        title: 'Users',
        active: 'users',
        users: result.rows,
        pagination: result,
        statusCounts,
        filters: { search, status, level },
      });
    } catch (err) {
      console.error('[Users] getIndex error:', err);
      req.flash('error', 'Failed to load user list');
      return res.redirect('/dashboard');
    }
  },

  // GET /users/create
  getCreate(req: Request, res: Response) {
    res.render('users/create', { title: 'Add User', active: 'users' });
  },

  // POST /users/create
  async postCreate(req: Request, res: Response) {
    try {
      const { full_name, email, password, phone, level } = req.body;
      const errors: string[] = [];
      if (!full_name || full_name.trim().length < 2) errors.push('Full name must be at least 2 characters');
      if (!email || !/^\S+@\S+\.\S+$/.test(email))  errors.push('Invalid email address');
      if (!password || password.length < 6)          errors.push('Password must be at least 6 characters');
      if (!VALID_LEVELS.includes(level))             errors.push('Invalid level');

      if (errors.length > 0) {
        req.flash('error', errors.join('. '));
        return res.redirect('/users/create');
      }

      const existing = await User.findByEmail(email.toLowerCase().trim());
      if (existing) {
        req.flash('error', 'Email is already in use');
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

      req.flash('success', 'User added successfully');
      return res.redirect('/users');
    } catch (err) {
      console.error('[Users] postCreate error:', err);
      req.flash('error', 'An error occurred. Please try again.');
      return res.redirect('/users/create');
    }
  },

  // GET /users/:id
  async getShow(req: Request, res: Response) {
    try {
      const user = await User.findById(req.params.id as string);
      if (!user) {
        req.flash('error', 'User not found');
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
      req.flash('error', 'Failed to load user information');
      return res.redirect('/users');
    }
  },

  // GET /users/:id/edit
  async getEdit(req: Request, res: Response) {
    try {
      const user = await User.findById(req.params.id as string);
      if (!user) {
        req.flash('error', 'User not found');
        return res.redirect('/users');
      }
      res.render('users/edit', { title: `Edit — ${user.full_name}`, active: 'users', user });
    } catch (err) {
      console.error('[Users] getEdit error:', err);
      req.flash('error', 'Failed to load user information');
      return res.redirect('/users');
    }
  },

  // POST /users/:id/edit
  async postEdit(req: Request, res: Response) {
    try {
      const { id } = req.params as { id: string };
      const { full_name, phone, level, status } = req.body;
      const errors: string[] = [];
      if (!full_name || full_name.trim().length < 2) errors.push('Full name must be at least 2 characters');
      if (!VALID_LEVELS.includes(level))             errors.push('Invalid level');
      if (!VALID_STATUSES.includes(status))          errors.push('Invalid status');

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
      req.flash('success', 'User information updated');
      return res.redirect(`/users/${id}`);
    } catch (err) {
      console.error('[Users] postEdit error:', err);
      req.flash('error', 'An error occurred. Please try again.');
      return res.redirect(`/users/${req.params.id}/edit`);
    }
  },

  // POST /users/:id/toggle-status
  async postToggleStatus(req: Request, res: Response) {
    try {
      const { id } = req.params as { id: string };
      const { new_status } = req.body;

      if (!VALID_STATUSES.includes(new_status)) {
        req.flash('error', 'Invalid status');
        return res.redirect('/users');
      }

      await User.setStatus(id, new_status);

      const labels: Record<string, string> = { active: 'Account activated', inactive: 'Account disabled', banned: 'Account banned' };
      req.flash('success', labels[new_status]);
      return res.redirect('back');
    } catch (err) {
      console.error('[Users] postToggleStatus error:', err);
      req.flash('error', 'An error occurred. Please try again.');
      return res.redirect('/users');
    }
  },

};

export = userController;
