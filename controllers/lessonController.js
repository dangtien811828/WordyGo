const Lesson = require('../models/Lesson');
const DictionaryEntry = require('../models/DictionaryEntry');
const Approval = require('../models/Approval');

const VALID_LEVELS  = ['beginner', 'intermediate', 'advanced'];
const VALID_STATUSES = ['draft', 'published', 'archived'];

function parseBody(body, adminId) {
  const entryIds = Array.isArray(body.entryIds)
    ? body.entryIds.filter(Boolean)
    : body.entryIds ? [body.entryIds] : [];
  const tagIds = Array.isArray(body.tagIds)
    ? body.tagIds.filter(Boolean)
    : body.tagIds ? [body.tagIds] : [];
  const data = {
    title:        (body.title || '').trim(),
    description:  body.description || null,
    content_html: body.content_html || null,
    level:        VALID_LEVELS.includes(body.level) ? body.level : 'beginner',
    thumbnail_url: body.thumbnail_url || null,
    status:       VALID_STATUSES.includes(body.status) ? body.status : 'draft',
    publish_at:   body.publish_at || null,
    sort_order:   body.sort_order ? parseInt(body.sort_order) : 0,
    created_by:   adminId,
  };
  return { data, entryIds, tagIds };
}

const lessonController = {
  // GET /lessons
  async getIndex(req, res) {
    try {
      const { search = '', level = '', status = '', page = 1 } = req.query;
      const result = await Lesson.getAll({ search, level, status, page, limit: 20 });
      res.render('lessons/index', {
        title: 'Bài học',
        active: 'lessons',
        lessons: result.rows,
        pagination: result,
        filters: { search, level, status },
      });
    } catch (err) {
      console.error('[Lessons] getIndex error:', err);
      req.flash('error', 'Không thể tải danh sách bài học');
      return res.redirect('/dashboard');
    }
  },

  // GET /lessons/create
  async getCreate(req, res) {
    try {
      const tags = await DictionaryEntry.getAllTags();
      res.render('lessons/create', {
        title: 'Tạo bài học',
        active: 'lessons',
        tags,
        VALID_LEVELS,
        isModerator: req.session.admin.role === 'moderator',
      });
    } catch (err) {
      console.error('[Lessons] getCreate error:', err);
      req.flash('error', 'Không thể tải form');
      return res.redirect('/lessons');
    }
  },

  // POST /lessons/create
  async postCreate(req, res) {
    try {
      const { data, entryIds, tagIds } = parseBody(req.body, req.session.admin.id);

      if (!data.title) {
        req.flash('error', 'Tiêu đề không được để trống');
        return res.redirect('/lessons/create');
      }

      if (req.session.admin.role === 'moderator') {
        await Approval.create({
          requesterId: req.session.admin.id,
          action: 'create',
          module: 'lessons',
          targetType: 'lesson',
          targetId: null,
          payload: { data, entryIds, tagIds },
        });
        req.flash('success', 'Yêu cầu tạo bài học đã được gửi, chờ Super Admin duyệt.');
        return res.redirect('/lessons');
      }

      const lesson = await Lesson.create(data, entryIds, tagIds);
      req.flash('success', `Đã tạo bài học "${lesson.title}" thành công`);
      return res.redirect('/lessons');
    } catch (err) {
      console.error('[Lessons] postCreate error:', err);
      req.flash('error', 'Đã xảy ra lỗi. Vui lòng thử lại.');
      return res.redirect('/lessons/create');
    }
  },

  // GET /lessons/:id/edit
  async getEdit(req, res) {
    try {
      const [lesson, tags] = await Promise.all([
        Lesson.findById(req.params.id),
        DictionaryEntry.getAllTags(),
      ]);
      if (!lesson) {
        req.flash('error', 'Không tìm thấy bài học');
        return res.redirect('/lessons');
      }
      res.render('lessons/edit', {
        title: `Sửa — ${lesson.title}`,
        active: 'lessons',
        lesson,
        tags,
        VALID_LEVELS,
        VALID_STATUSES,
        isModerator: req.session.admin.role === 'moderator',
      });
    } catch (err) {
      console.error('[Lessons] getEdit error:', err);
      req.flash('error', 'Không thể tải form sửa');
      return res.redirect('/lessons');
    }
  },

  // POST /lessons/:id/edit
  async postEdit(req, res) {
    try {
      const { id } = req.params;
      const { data, entryIds, tagIds } = parseBody(req.body, req.session.admin.id);

      if (!data.title) {
        req.flash('error', 'Tiêu đề không được để trống');
        return res.redirect(`/lessons/${id}/edit`);
      }

      const lesson = await Lesson.findById(id);
      if (!lesson) {
        req.flash('error', 'Không tìm thấy bài học');
        return res.redirect('/lessons');
      }

      if (req.session.admin.role === 'moderator') {
        await Approval.create({
          requesterId: req.session.admin.id,
          action: 'update',
          module: 'lessons',
          targetType: 'lesson',
          targetId: id,
          payload: { data, entryIds, tagIds, targetId: id },
        });
        req.flash('success', 'Yêu cầu sửa bài học đã được gửi, chờ Super Admin duyệt.');
        return res.redirect('/lessons');
      }

      await Lesson.update(id, data, entryIds, tagIds);
      req.flash('success', 'Đã cập nhật bài học thành công');
      return res.redirect('/lessons');
    } catch (err) {
      console.error('[Lessons] postEdit error:', err);
      req.flash('error', 'Đã xảy ra lỗi. Vui lòng thử lại.');
      return res.redirect(`/lessons/${req.params.id}/edit`);
    }
  },

  // POST /lessons/:id/delete
  async postDelete(req, res) {
    try {
      const { id } = req.params;
      const lesson = await Lesson.findById(id);
      if (!lesson) {
        req.flash('error', 'Không tìm thấy bài học');
        return res.redirect('/lessons');
      }

      if (req.session.admin.role === 'moderator') {
        await Approval.create({
          requesterId: req.session.admin.id,
          action: 'delete',
          module: 'lessons',
          targetType: 'lesson',
          targetId: id,
          payload: { targetId: id, title: lesson.title },
        });
        req.flash('success', 'Yêu cầu xóa bài học đã được gửi, chờ Super Admin duyệt.');
        return res.redirect('/lessons');
      }

      const { confirm_text } = req.body;
      if (confirm_text !== `DELETE ${lesson.title}`) {
        req.flash('error', 'Xác nhận không đúng. Vui lòng thử lại.');
        return res.redirect('/lessons');
      }

      await Lesson.delete(id);
      req.flash('success', `Đã xóa bài học "${lesson.title}"`);
      return res.redirect('/lessons');
    } catch (err) {
      console.error('[Lessons] postDelete error:', err);
      req.flash('error', 'Đã xảy ra lỗi. Vui lòng thử lại.');
      return res.redirect('/lessons');
    }
  },

  // POST /lessons/:id/toggle-status
  async postToggleStatus(req, res) {
    try {
      const { id } = req.params;
      const lesson = await Lesson.findById(id);
      if (!lesson) {
        req.flash('error', 'Không tìm thấy bài học');
        return res.redirect('/lessons');
      }

      const newStatus = lesson.status === 'published' ? 'draft' : 'published';

      if (req.session.admin.role === 'moderator') {
        await Approval.create({
          requesterId: req.session.admin.id,
          action: 'update',
          module: 'lessons',
          targetType: 'lesson',
          targetId: id,
          payload: {
            data: { ...lesson, status: newStatus },
            entryIds: (lesson.entries || []).map(e => e.id),
            tagIds:   (lesson.tags   || []).map(t => t.id),
            targetId: id,
          },
        });
        req.flash('success', 'Yêu cầu thay đổi trạng thái đã được gửi, chờ duyệt.');
        return res.redirect('/lessons');
      }

      // Admin: preserve existing entries & tags from findById result
      const entryIds = (lesson.entries || []).map(e => e.id);
      const tagIds   = (lesson.tags   || []).map(t => t.id);
      await Lesson.update(id, { ...lesson, status: newStatus }, entryIds, tagIds);
      req.flash('success', `Đã chuyển sang trạng thái ${newStatus}`);
      return res.redirect('/lessons');
    } catch (err) {
      console.error('[Lessons] postToggleStatus error:', err);
      req.flash('error', 'Đã xảy ra lỗi. Vui lòng thử lại.');
      return res.redirect('/lessons');
    }
  },
};

module.exports = lessonController;
