import type { Request, Response } from 'express';
import Approval from '../models/Approval';
import Lesson from '../models/Lesson';
import Ebook from '../models/Ebook';

const approvalController = {
  // GET /approvals
  async getIndex(req: Request, res: Response) {
    try {
      const requests = await Approval.findPending();
      res.render('approvals/index', {
        title: 'Pending Approvals',
        active: 'approvals',
        requests,
      });
    } catch (err) {
      console.error('[Approvals] getIndex error:', err);
      req.flash('error', 'Failed to load request list');
      return res.redirect('/dashboard');
    }
  },

  // POST /approvals/:id/approve
  async postApprove(req: Request, res: Response) {
    try {
      const { id } = req.params as { id: string };
      const { reviewer_note } = req.body;
      const result = await Approval.approve(id, req.session.admin.id, reviewer_note || null);
      if (!result) {
        req.flash('error', 'Request not found or already processed');
        return res.redirect('/approvals');
      }

      // Execute deferred lesson actions
      if (result.module === 'lessons') {
        const { data = {}, entryIds = [], tagIds = [], targetId } = result.payload || {};
        if (result.action === 'create') {
          await Lesson.create(data, entryIds, tagIds);
        } else if (result.action === 'update') {
          await Lesson.update(targetId, data, entryIds, tagIds);
        } else if (result.action === 'delete') {
          await Lesson.delete(targetId);
        }
      }

      // Execute deferred ebook delete
      if (result.module === 'ebooks' && result.action === 'delete') {
        await Ebook.delete(result.payload.targetId);
      }

      req.flash('success', 'Request approved and executed');
      return res.redirect('/approvals');
    } catch (err) {
      console.error('[Approvals] postApprove error:', err);
      req.flash('error', 'An error occurred. Please try again.');
      return res.redirect('/approvals');
    }
  },

  // POST /approvals/:id/reject
  async postReject(req: Request, res: Response) {
    try {
      const { id } = req.params as { id: string };
      const { reviewer_note } = req.body;
      const result = await Approval.reject(id, req.session.admin.id, reviewer_note || null);
      if (!result) {
        req.flash('error', 'Request not found or already processed');
      } else {
        req.flash('success', 'Request rejected');
      }
      return res.redirect('/approvals');
    } catch (err) {
      console.error('[Approvals] postReject error:', err);
      req.flash('error', 'An error occurred. Please try again.');
      return res.redirect('/approvals');
    }
  },
};

export = approvalController;
