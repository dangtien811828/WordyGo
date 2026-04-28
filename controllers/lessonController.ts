import type { Request, Response } from 'express';
import Lesson from '../models/Lesson';
import DictionaryEntry from '../models/DictionaryEntry';
import Approval from '../models/Approval';

const VALID_LEVELS  = ['beginner', 'intermediate', 'advanced'];
const VALID_STATUSES = ['draft', 'published', 'archived'];

function parseBody(body: any, adminId: string) {
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
  async getIndex(req: Request, res: Response) {
    try {
      const { search = '', level = '', status = '', page = 1 } = req.query as any;
      const result = await Lesson.getAll({ search, level, status, page, limit: 20 });
      res.render('lessons/index', {
        title: 'Lessons',
        active: 'lessons',
        lessons: result.rows,
        pagination: result,
        filters: { search, level, status },
      });
    } catch (err) {
      console.error('[Lessons] getIndex error:', err);
      req.flash('error', 'Failed to load lesson list');
      return res.redirect('/dashboard');
    }
  },

  // GET /lessons/create
  async getCreate(req: Request, res: Response) {
    try {
      const tags = await DictionaryEntry.getAllTags();
      res.render('lessons/create', {
        title: 'Create Lesson',
        active: 'lessons',
        tags,
        VALID_LEVELS,
        isModerator: req.session.admin.role === 'moderator',
      });
    } catch (err) {
      console.error('[Lessons] getCreate error:', err);
      req.flash('error', 'Failed to load form');
      return res.redirect('/lessons');
    }
  },

  // POST /lessons/create
  async postCreate(req: Request, res: Response) {
    try {
      const { data, entryIds, tagIds } = parseBody(req.body, req.session.admin.id);

      if (!data.title) {
        req.flash('error', 'Title is required');
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
        req.flash('success', 'Lesson creation request submitted, pending Super Admin approval.');
        return res.redirect('/lessons');
      }

      const lesson = await Lesson.create(data, entryIds, tagIds);
      req.flash('success', `Lesson "${lesson.title}" created successfully`);
      return res.redirect('/lessons');
    } catch (err) {
      console.error('[Lessons] postCreate error:', err);
      req.flash('error', 'An error occurred. Please try again.');
      return res.redirect('/lessons/create');
    }
  },

  // GET /lessons/:id/edit
  async getEdit(req: Request, res: Response) {
    try {
      const [lesson, tags] = await Promise.all([
        Lesson.findById(req.params.id as string),
        DictionaryEntry.getAllTags(),
      ]);
      if (!lesson) {
        req.flash('error', 'Lesson not found');
        return res.redirect('/lessons');
      }
      res.render('lessons/edit', {
        title: `Edit — ${lesson.title}`,
        active: 'lessons',
        lesson,
        tags,
        VALID_LEVELS,
        VALID_STATUSES,
        isModerator: req.session.admin.role === 'moderator',
      });
    } catch (err) {
      console.error('[Lessons] getEdit error:', err);
      req.flash('error', 'Failed to load edit form');
      return res.redirect('/lessons');
    }
  },

  // POST /lessons/:id/edit
  async postEdit(req: Request, res: Response) {
    try {
      const { id } = req.params as { id: string };
      const { data, entryIds, tagIds } = parseBody(req.body, req.session.admin.id);

      if (!data.title) {
        req.flash('error', 'Title is required');
        return res.redirect(`/lessons/${id}/edit`);
      }

      const lesson = await Lesson.findById(id);
      if (!lesson) {
        req.flash('error', 'Lesson not found');
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
        req.flash('success', 'Lesson update request submitted, pending Super Admin approval.');
        return res.redirect('/lessons');
      }

      await Lesson.update(id, data, entryIds, tagIds);
      req.flash('success', 'Lesson updated successfully');
      return res.redirect('/lessons');
    } catch (err) {
      console.error('[Lessons] postEdit error:', err);
      req.flash('error', 'An error occurred. Please try again.');
      return res.redirect(`/lessons/${req.params.id}/edit`);
    }
  },

  // POST /lessons/:id/delete
  async postDelete(req: Request, res: Response) {
    try {
      const { id } = req.params as { id: string };
      const lesson = await Lesson.findById(id);
      if (!lesson) {
        req.flash('error', 'Lesson not found');
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
        req.flash('success', 'Lesson deletion request submitted, pending Super Admin approval.');
        return res.redirect('/lessons');
      }

      const { confirm_text } = req.body;
      if (confirm_text !== `DELETE ${lesson.title}`) {
        req.flash('error', 'Confirmation text is incorrect. Please try again.');
        return res.redirect('/lessons');
      }

      await Lesson.delete(id);
      req.flash('success', `Lesson "${lesson.title}" deleted`);
      return res.redirect('/lessons');
    } catch (err) {
      console.error('[Lessons] postDelete error:', err);
      req.flash('error', 'An error occurred. Please try again.');
      return res.redirect('/lessons');
    }
  },

  // POST /lessons/:id/toggle-status
  async postToggleStatus(req: Request, res: Response) {
    try {
      const { id } = req.params as { id: string };
      const lesson = await Lesson.findById(id);
      if (!lesson) {
        req.flash('error', 'Lesson not found');
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
            entryIds: (lesson.entries || []).map((e: any) => e.id),
            tagIds:   (lesson.tags   || []).map((t: any) => t.id),
            targetId: id,
          },
        });
        req.flash('success', 'Status change request submitted, pending approval.');
        return res.redirect('/lessons');
      }

      // Admin: preserve existing entries & tags from findById result
      const entryIds = (lesson.entries || []).map((e: any) => e.id);
      const tagIds   = (lesson.tags   || []).map((t: any) => t.id);
      await Lesson.update(id, { ...lesson, status: newStatus }, entryIds, tagIds);
      req.flash('success', `Status changed to ${newStatus}`);
      return res.redirect('/lessons');
    } catch (err) {
      console.error('[Lessons] postToggleStatus error:', err);
      req.flash('error', 'An error occurred. Please try again.');
      return res.redirect('/lessons');
    }
  },
};

export = lessonController;
