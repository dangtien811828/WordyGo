const { uploadEbook } = require('../middlewares/upload');
const Ebook = require('../models/Ebook');
const Approval = require('../models/Approval');

const VALID_LEVELS = ['beginner', 'intermediate', 'advanced'];
const VALID_PLANS  = ['free', 'premium', 'pro'];
const VALID_STATUS = ['draft', 'published', 'archived'];
const VALID_GENRES = ['fiction', 'non-fiction', 'science', 'history', 'business', 'technology', 'language', 'children', 'biography', 'travel'];

// Permission helpers
function canEdit(admin, ebook) {
  if (admin.role === 'super_admin' || admin.role === 'moderator') return true;
  if (admin.role === 'content_editor') return ebook.created_by === admin.id;
  return false;
}

function canDelete(admin, ebook) {
  if (admin.role === 'super_admin') return true;
  if (admin.role === 'content_editor') return ebook.created_by === admin.id;
  return false; // moderator goes through approval
}

const ebookController = {
  // GET /ebooks
  async getIndex(req, res) {
    try {
      const { search = '', level = '', status = '', page = 1 } = req.query;
      const result = await Ebook.getAll({ search, level, status, page, limit: 20 });
      res.render('ebooks/index', {
        title: 'Ebook',
        active: 'ebooks',
        ebooks: result.rows,
        pagination: result,
        filters: { search, level, status },
      });
    } catch (err) {
      console.error('[Ebooks] getIndex error:', err);
      req.flash('error', 'Không thể tải danh sách ebook');
      return res.redirect('/dashboard');
    }
  },

  // GET /ebooks/create
  getCreate(req, res) {
    res.render('ebooks/create', {
      title: 'Upload Ebook',
      active: 'ebooks',
      VALID_LEVELS,
      VALID_PLANS,
      VALID_STATUS,
      VALID_GENRES,
    });
  },

  // POST /ebooks/create
  postCreate(req, res) {
    uploadEbook.single('ebookFile')(req, res, async (err) => {
      if (err) {
        req.flash('error', err.message || 'Lỗi upload file');
        return res.redirect('/ebooks/create');
      }
      try {
        const { title } = req.body;
        if (!title || !title.trim()) {
          req.flash('error', 'Tiêu đề không được để trống');
          return res.redirect('/ebooks/create');
        }

        const genre = Array.isArray(req.body.genre)
          ? req.body.genre
          : req.body.genre ? [req.body.genre] : [];

        const epub_file_url = req.file ? `/uploads/${req.file.filename}` : null;

        const ebook = await Ebook.create(
          { ...req.body, genre, epub_file_url },
          req.session.admin.id
        );
        req.flash('success', `Đã upload ebook "${ebook.title}"`);
        return res.redirect(`/ebooks/${ebook.id}`);
      } catch (createErr) {
        console.error('[Ebooks] postCreate error:', createErr);
        req.flash('error', 'Đã xảy ra lỗi. Vui lòng thử lại.');
        return res.redirect('/ebooks/create');
      }
    });
  },

  // GET /ebooks/:id
  async getShow(req, res) {
    try {
      const ebook = await Ebook.findById(req.params.id);
      if (!ebook) {
        req.flash('error', 'Không tìm thấy ebook');
        return res.redirect('/ebooks');
      }
      const admin = req.session.admin;
      res.render('ebooks/show', {
        title: ebook.title,
        active: 'ebooks',
        ebook,
        canEdit: canEdit(admin, ebook),
        canDelete: canDelete(admin, ebook),
        isModerator: admin.role === 'moderator',
      });
    } catch (err) {
      console.error('[Ebooks] getShow error:', err);
      req.flash('error', 'Không thể tải thông tin ebook');
      return res.redirect('/ebooks');
    }
  },

  // GET /ebooks/:id/edit
  async getEdit(req, res) {
    try {
      const ebook = await Ebook.findById(req.params.id);
      if (!ebook) {
        req.flash('error', 'Không tìm thấy ebook');
        return res.redirect('/ebooks');
      }
      if (!canEdit(req.session.admin, ebook)) {
        req.flash('error', 'Bạn không có quyền sửa ebook này');
        return res.redirect('/ebooks');
      }
      res.render('ebooks/edit', {
        title: `Sửa — ${ebook.title}`,
        active: 'ebooks',
        ebook,
        VALID_LEVELS,
        VALID_PLANS,
        VALID_STATUS,
        VALID_GENRES,
      });
    } catch (err) {
      console.error('[Ebooks] getEdit error:', err);
      req.flash('error', 'Không thể tải form sửa');
      return res.redirect('/ebooks');
    }
  },

  // POST /ebooks/:id/edit
  async postEdit(req, res) {
    try {
      const { id } = req.params;
      const ebook = await Ebook.findById(id);
      if (!ebook) {
        req.flash('error', 'Không tìm thấy ebook');
        return res.redirect('/ebooks');
      }
      if (!canEdit(req.session.admin, ebook)) {
        req.flash('error', 'Bạn không có quyền sửa ebook này');
        return res.redirect('/ebooks');
      }

      const { title } = req.body;
      if (!title || !title.trim()) {
        req.flash('error', 'Tiêu đề không được để trống');
        return res.redirect(`/ebooks/${id}/edit`);
      }

      const genre = Array.isArray(req.body.genre)
        ? req.body.genre
        : req.body.genre ? [req.body.genre] : [];

      await Ebook.update(id, { ...req.body, genre });
      req.flash('success', 'Đã cập nhật ebook');
      return res.redirect(`/ebooks/${id}`);
    } catch (err) {
      console.error('[Ebooks] postEdit error:', err);
      req.flash('error', 'Đã xảy ra lỗi. Vui lòng thử lại.');
      return res.redirect(`/ebooks/${req.params.id}/edit`);
    }
  },

  // POST /ebooks/:id/delete
  async postDelete(req, res) {
    try {
      const { id } = req.params;
      const ebook = await Ebook.findById(id);
      if (!ebook) {
        req.flash('error', 'Không tìm thấy ebook');
        return res.redirect('/ebooks');
      }

      const admin = req.session.admin;

      // Moderator → approval
      if (admin.role === 'moderator') {
        await Approval.create({
          requesterId: admin.id,
          action: 'delete',
          module: 'ebooks',
          targetType: 'ebook',
          targetId: id,
          payload: { targetId: id, title: ebook.title },
        });
        req.flash('success', 'Yêu cầu xóa ebook đã được gửi, chờ Super Admin duyệt.');
        return res.redirect('/ebooks');
      }

      if (!canDelete(admin, ebook)) {
        req.flash('error', 'Bạn không có quyền xóa ebook này');
        return res.redirect(`/ebooks/${id}`);
      }

      const { confirm_text } = req.body;
      if (confirm_text !== `DELETE ${ebook.title}`) {
        req.flash('error', 'Xác nhận không đúng. Vui lòng thử lại.');
        return res.redirect(`/ebooks/${id}`);
      }

      await Ebook.delete(id);
      req.flash('success', `Đã xóa ebook "${ebook.title}"`);
      return res.redirect('/ebooks');
    } catch (err) {
      console.error('[Ebooks] postDelete error:', err);
      req.flash('error', 'Đã xảy ra lỗi. Vui lòng thử lại.');
      return res.redirect('/ebooks');
    }
  },
};

module.exports = ebookController;

export {};
