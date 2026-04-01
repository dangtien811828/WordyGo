const Approval = require('../models/Approval');

const approvalController = {
  // GET /approvals
  async getIndex(req, res) {
    try {
      const requests = await Approval.findPending();
      res.render('approvals/index', {
        title: 'Chờ duyệt',
        active: 'approvals',
        requests,
      });
    } catch (err) {
      console.error('[Approvals] getIndex error:', err);
      req.flash('error', 'Không thể tải danh sách yêu cầu');
      return res.redirect('/dashboard');
    }
  },

  // POST /approvals/:id/approve
  async postApprove(req, res) {
    try {
      const { id } = req.params;
      const { reviewer_note } = req.body;
      const result = await Approval.approve(id, req.session.admin.id, reviewer_note || null);
      if (!result) {
        req.flash('error', 'Yêu cầu không tồn tại hoặc đã được xử lý');
        return res.redirect('/approvals');
      }

      // Execute deferred lesson actions
      if (result.module === 'lessons') {
        const Lesson = require('../models/Lesson');
        const { data = {}, entryIds = [], tagIds = [], targetId } = result.payload || {};
        if (result.action === 'create') {
          await Lesson.create(data, entryIds, tagIds);
        } else if (result.action === 'update') {
          await Lesson.update(targetId, data, entryIds, tagIds);
        } else if (result.action === 'delete') {
          await Lesson.delete(targetId);
        }
      }

      req.flash('success', 'Đã phê duyệt và thực thi yêu cầu');
      return res.redirect('/approvals');
    } catch (err) {
      console.error('[Approvals] postApprove error:', err);
      req.flash('error', 'Đã xảy ra lỗi. Vui lòng thử lại.');
      return res.redirect('/approvals');
    }
  },

  // POST /approvals/:id/reject
  async postReject(req, res) {
    try {
      const { id } = req.params;
      const { reviewer_note } = req.body;
      const result = await Approval.reject(id, req.session.admin.id, reviewer_note || null);
      if (!result) {
        req.flash('error', 'Yêu cầu không tồn tại hoặc đã được xử lý');
      } else {
        req.flash('success', 'Đã từ chối yêu cầu');
      }
      return res.redirect('/approvals');
    } catch (err) {
      console.error('[Approvals] postReject error:', err);
      req.flash('error', 'Đã xảy ra lỗi. Vui lòng thử lại.');
      return res.redirect('/approvals');
    }
  },
};

module.exports = approvalController;
