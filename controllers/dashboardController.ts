import type { Request, Response } from 'express';
import pool from '../config/db';
import Admin from '../models/Admin';

const dashboardController = {
  async getDashboard(req: Request, res: Response) {
    try {
      // Thống kê nhanh
      const [usersCount, adminsCount, entriesCount, lessonsCount] = await Promise.all([
        pool.query('SELECT COUNT(*)::int as count FROM users'),
        pool.query('SELECT COUNT(*)::int as count FROM admin_accounts'),
        pool.query('SELECT COUNT(*)::int as count FROM dictionary_entries'),
        pool.query('SELECT COUNT(*)::int as count FROM lessons'),
      ]);

      const stats = {
        users: usersCount.rows[0].count,
        admins: adminsCount.rows[0].count,
        entries: entriesCount.rows[0].count,
        lessons: lessonsCount.rows[0].count,
      };

      // Admin list
      const admins = await Admin.getAll();

      res.render('dashboard', {
        title: 'Dashboard',
        stats,
        admins,
      });
    } catch (err) {
      console.error('[Dashboard] Error:', err);
      req.flash('error', 'Không thể tải dữ liệu dashboard');
      res.render('dashboard', { title: 'Dashboard', stats: {}, admins: [] });
    }
  },
};

export = dashboardController;
