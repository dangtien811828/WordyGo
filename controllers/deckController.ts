import type { Request, Response } from 'express';
import Deck from '../models/Deck';
import DictionaryEntry from '../models/DictionaryEntry';

const VALID_LEVELS   = ['beginner', 'intermediate', 'advanced'];
const VALID_STATUSES = ['draft', 'published', 'archived'];
const VALID_TYPES    = ['premade', 'system_generated'];

function parseTagIds(body: any) {
  return Array.isArray(body.tagIds)
    ? body.tagIds.filter(Boolean)
    : body.tagIds ? [body.tagIds] : [];
}

const deckController = {
  // GET /decks
  async getIndex(req: Request, res: Response) {
    try {
      const { search = '', level = '', status = '', type = 'all', page = 1 } = req.query as any;
      const safeType: 'all' | 'system' | 'user' =
        type === 'system' || type === 'user' ? type : 'all';
      const result = await Deck.getAll({ search, level, status, type: safeType, page, limit: 20 });
      res.render('decks/index', {
        title: 'Flashcard Decks',
        active: 'flashcards',
        decks: result.rows,
        pagination: result,
        filters: { search, level, status, type: safeType },
      });
    } catch (err) {
      console.error('[Decks] getIndex error:', err);
      req.flash('error', 'Không thể tải danh sách decks');
      return res.redirect('/dashboard');
    }
  },

  // GET /decks/create
  async getCreate(req: Request, res: Response) {
    try {
      const tags = await DictionaryEntry.getAllTags();
      res.render('decks/create', {
        title: 'Tạo Deck',
        active: 'flashcards',
        tags,
        VALID_LEVELS,
        VALID_STATUSES,
        VALID_TYPES,
      });
    } catch (err) {
      console.error('[Decks] getCreate error:', err);
      req.flash('error', 'Không thể tải form');
      return res.redirect('/decks');
    }
  },

  // POST /decks/create
  async postCreate(req: Request, res: Response) {
    try {
      const { title, deck_type } = req.body;
      if (!title || !title.trim()) {
        req.flash('error', 'Tiêu đề không được để trống');
        return res.redirect('/decks/create');
      }
      // Reject deck_type='user_created' from admin website — would create
      // an orphan (NULL user_id) deck invisible to mobile system + mine lists.
      if (deck_type && !VALID_TYPES.includes(deck_type)) {
        req.flash('error', `Loại deck phải là một trong: ${VALID_TYPES.join(', ')}`);
        return res.redirect('/decks/create');
      }
      const tagIds = parseTagIds(req.body);
      const deck = await Deck.create({ ...req.body, created_by: req.session.admin.id }, tagIds);
      req.flash('success', `Đã tạo deck "${deck.title}"`);
      return res.redirect(`/decks/${deck.id}`);
    } catch (err) {
      console.error('[Decks] postCreate error:', err);
      req.flash('error', 'Đã xảy ra lỗi. Vui lòng thử lại.');
      return res.redirect('/decks/create');
    }
  },

  // GET /decks/:id
  async getShow(req: Request, res: Response) {
    try {
      const deck = await Deck.findById(req.params.id as string);
      if (!deck) {
        req.flash('error', 'Không tìm thấy deck');
        return res.redirect('/decks');
      }
      res.render('decks/show', {
        title: deck.title,
        active: 'flashcards',
        deck,
      });
    } catch (err) {
      console.error('[Decks] getShow error:', err);
      req.flash('error', 'Không thể tải thông tin deck');
      return res.redirect('/decks');
    }
  },

  // GET /decks/:id/edit
  async getEdit(req: Request, res: Response) {
    try {
      const [deck, tags] = await Promise.all([
        Deck.findById(req.params.id as string),
        DictionaryEntry.getAllTags(),
      ]);
      if (!deck) {
        req.flash('error', 'Không tìm thấy deck');
        return res.redirect('/decks');
      }
      res.render('decks/edit', {
        title: `Sửa — ${deck.title}`,
        active: 'flashcards',
        deck,
        tags,
        VALID_LEVELS,
        VALID_STATUSES,
        VALID_TYPES,
      });
    } catch (err) {
      console.error('[Decks] getEdit error:', err);
      req.flash('error', 'Không thể tải form sửa');
      return res.redirect('/decks');
    }
  },

  // POST /decks/:id/edit
  async postEdit(req: Request, res: Response) {
    try {
      const { id } = req.params as { id: string };
      const { title, deck_type } = req.body;
      if (!title || !title.trim()) {
        req.flash('error', 'Tiêu đề không được để trống');
        return res.redirect(`/decks/${id}/edit`);
      }
      if (deck_type && !VALID_TYPES.includes(deck_type)) {
        req.flash('error', `Loại deck phải là một trong: ${VALID_TYPES.join(', ')}`);
        return res.redirect(`/decks/${id}/edit`);
      }
      const tagIds = parseTagIds(req.body);
      await Deck.update(id, req.body, tagIds);
      req.flash('success', 'Đã cập nhật deck');
      return res.redirect(`/decks/${id}`);
    } catch (err) {
      console.error('[Decks] postEdit error:', err);
      req.flash('error', 'Đã xảy ra lỗi. Vui lòng thử lại.');
      return res.redirect(`/decks/${req.params.id}/edit`);
    }
  },

  // POST /decks/:id/delete
  async postDelete(req: Request, res: Response) {
    try {
      const { id } = req.params as { id: string };
      const { confirm_text } = req.body;
      const deck = await Deck.findById(id);
      if (!deck) {
        req.flash('error', 'Không tìm thấy deck');
        return res.redirect('/decks');
      }
      if (confirm_text !== `DELETE ${deck.title}`) {
        req.flash('error', 'Xác nhận không đúng. Vui lòng thử lại.');
        return res.redirect(`/decks/${id}`);
      }
      await Deck.delete(id);
      req.flash('success', `Đã xóa deck "${deck.title}"`);
      return res.redirect('/decks');
    } catch (err) {
      console.error('[Decks] postDelete error:', err);
      req.flash('error', 'Đã xảy ra lỗi. Vui lòng thử lại.');
      return res.redirect('/decks');
    }
  },

  // POST /decks/:id/cards/add
  async postAddCards(req: Request, res: Response) {
    try {
      const { id } = req.params as { id: string };
      const entryIds = Array.isArray(req.body.entryIds)
        ? req.body.entryIds.filter(Boolean)
        : req.body.entryIds ? [req.body.entryIds] : [];

      if (!entryIds.length) {
        req.flash('error', 'Chưa chọn từ nào để thêm');
        return res.redirect(`/decks/${id}`);
      }

      const { added, skipped } = await Deck.addCards(id, entryIds);
      req.flash('success', `Đã thêm ${added} từ${skipped > 0 ? `, bỏ qua ${skipped} từ đã có` : ''}`);
      return res.redirect(`/decks/${id}`);
    } catch (err) {
      console.error('[Decks] postAddCards error:', err);
      req.flash('error', 'Đã xảy ra lỗi. Vui lòng thử lại.');
      return res.redirect(`/decks/${req.params.id}`);
    }
  },

  // POST /decks/:id/reorder  (AJAX — JSON in, JSON/204 out)
  async postReorder(req: Request, res: Response) {
    try {
      const { id } = req.params as { id: string };
      const direction = (req.body || {}).direction;
      if (direction !== 'up' && direction !== 'down') {
        return res.status(400).json({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: "direction must be 'up' or 'down'" },
        });
      }
      const result = await Deck.reorder(id, direction);
      if (result.ok === false) {
        const map = {
          NOT_FOUND: { status: 404, code: 'NOT_FOUND', message: 'Deck không tồn tại' },
          NOT_SYSTEM: { status: 400, code: 'NOT_SYSTEM', message: 'Chỉ system deck mới reorder được' },
        } as const;
        const e = map[result.reason];
        return res.status(e.status).json({
          success: false,
          error: { code: e.code, message: e.message },
        });
      }
      return res.status(204).end();
    } catch (err) {
      console.error('[Decks] postReorder error:', err);
      return res.status(500).json({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Reorder thất bại' },
      });
    }
  },

  // POST /decks/:id/cards/:entryId/remove
  async postRemoveCard(req: Request, res: Response) {
    try {
      const { id, entryId } = req.params as { id: string; entryId: string };
      await Deck.removeCard(id, entryId);
      req.flash('success', 'Đã xóa card khỏi deck');
      return res.redirect(`/decks/${id}`);
    } catch (err) {
      console.error('[Decks] postRemoveCard error:', err);
      req.flash('error', 'Đã xảy ra lỗi. Vui lòng thử lại.');
      return res.redirect(`/decks/${req.params.id}`);
    }
  },
};

export = deckController;
