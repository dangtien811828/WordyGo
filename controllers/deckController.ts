const Deck = require('../models/Deck');
const DictionaryEntry = require('../models/DictionaryEntry');

const VALID_LEVELS   = ['beginner', 'intermediate', 'advanced'];
const VALID_STATUSES = ['draft', 'published', 'archived'];
const VALID_TYPES    = ['premade', 'system_generated'];

function parseTagIds(body) {
  return Array.isArray(body.tagIds)
    ? body.tagIds.filter(Boolean)
    : body.tagIds ? [body.tagIds] : [];
}

const deckController = {
  // GET /decks
  async getIndex(req, res) {
    try {
      const { search = '', level = '', status = '', page = 1 } = req.query;
      const result = await Deck.getAll({ search, level, status, page, limit: 20 });
      res.render('decks/index', {
        title: 'Flashcard Decks',
        active: 'flashcards',
        decks: result.rows,
        pagination: result,
        filters: { search, level, status },
      });
    } catch (err) {
      console.error('[Decks] getIndex error:', err);
      req.flash('error', 'Không thể tải danh sách decks');
      return res.redirect('/dashboard');
    }
  },

  // GET /decks/create
  async getCreate(req, res) {
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
  async postCreate(req, res) {
    try {
      const { title } = req.body;
      if (!title || !title.trim()) {
        req.flash('error', 'Tiêu đề không được để trống');
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
  async getShow(req, res) {
    try {
      const deck = await Deck.findById(req.params.id);
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
  async getEdit(req, res) {
    try {
      const [deck, tags] = await Promise.all([
        Deck.findById(req.params.id),
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
  async postEdit(req, res) {
    try {
      const { id } = req.params;
      const { title } = req.body;
      if (!title || !title.trim()) {
        req.flash('error', 'Tiêu đề không được để trống');
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
  async postDelete(req, res) {
    try {
      const { id } = req.params;
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
  async postAddCards(req, res) {
    try {
      const { id } = req.params;
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

  // POST /decks/:id/cards/:entryId/remove
  async postRemoveCard(req, res) {
    try {
      const { id, entryId } = req.params;
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

module.exports = deckController;

export {};
