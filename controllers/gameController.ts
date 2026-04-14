const Game = require('../models/Game');
const Approval = require('../models/Approval');

const VALID_LEVELS  = ['beginner', 'intermediate', 'advanced'];
const VALID_STATUSES = ['draft', 'published', 'archived'];
const VALID_GAME_TYPES = ['lexisweep', 'anagram'];
const VALID_LEVEL_STATUSES = ['active', 'inactive'];

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseEntryIds(body) {
  const ids = [].concat(body['item_entry_id[]'] || []);
  return ids.filter(Boolean);
}

function parseItems(body) {
  const entryIds = [].concat(body['item_entry_id[]'] || []);
  const hints    = [].concat(body['item_hint_vi[]']  || []);
  return entryIds
    .map((id, i) => ({
      entry_id:      id,
      correct_order: i + 1,
      hint_vi:       (hints[i] || '').trim() || null,
    }))
    .filter(it => it.entry_id);
}

function parseWordListData(body, adminId) {
  return {
    game_type:  VALID_GAME_TYPES.includes(body.game_type) ? body.game_type : 'lexisweep',
    name:       (body.name || '').trim(),
    topic:      (body.topic || '').trim() || null,
    level:      VALID_LEVELS.includes(body.level) ? body.level : 'beginner',
    status:     VALID_STATUSES.includes(body.status) ? body.status : 'draft',
    created_by: adminId,
  };
}

function parseSemanticSetData(body, adminId) {
  return {
    name:              (body.name || '').trim(),
    scale_description: (body.scale_description || '').trim(),
    level:             VALID_LEVELS.includes(body.level) ? body.level : 'intermediate',
    status:            VALID_STATUSES.includes(body.status) ? body.status : 'draft',
    created_by:        adminId,
  };
}

function tryParseJson(str) {
  try { return { ok: true, value: JSON.parse(str) }; }
  catch (e) { return { ok: false }; }
}

// ── Controllers ───────────────────────────────────────────────────────────────

module.exports = {
  // GET /games
  async getIndex(req, res) {
    try {
      const [lexisweepLists, anagramLists, lexisweepLevels, anagramLevels, ladderLevels, stats] =
        await Promise.all([
          Game.getWordLists({ gameType: 'lexisweep', limit: 1 }),
          Game.getWordLists({ gameType: 'anagram',   limit: 1 }),
          Game.getLevels('lexisweep'),
          Game.getLevels('anagram'),
          Game.getLevels('ladder'),
          Game.getStats(),
        ]);
      res.render('games/index', {
        title: 'Mini-games',
        active: 'games',
        stats,
        levelCounts: {
          lexisweep: lexisweepLevels.length,
          anagram:   anagramLevels.length,
          ladder:    ladderLevels.length,
        },
        wordListCounts: {
          lexisweep: lexisweepLists.total,
          anagram:   anagramLists.total,
        },
      });
    } catch (err) {
      console.error('[Games] getIndex error:', err);
      req.flash('error', 'Không thể tải trang Mini-games');
      return res.redirect('/dashboard');
    }
  },

  // GET /games/word-lists
  async getWordLists(req, res) {
    try {
      const { gameType = '', search = '', page = 1 } = req.query;
      const result = await Game.getWordLists({ gameType, search, page, limit: 20 });
      res.render('games/word-lists', {
        title: 'Word Lists',
        active: 'games',
        lists: result.rows,
        pagination: result,
        filters: { gameType, search },
      });
    } catch (err) {
      console.error('[Games] getWordLists error:', err);
      req.flash('error', 'Không thể tải danh sách word lists');
      return res.redirect('/games');
    }
  },

  // GET /games/word-lists/create
  getWordListsCreate(req, res) {
    res.render('games/word-lists-form', {
      title: 'Tạo Word List',
      active: 'games',
      list: null,
      formAction: '/games/word-lists/create',
    });
  },

  // GET /games/word-lists/:id/edit
  async getWordListsEdit(req, res) {
    try {
      const list = await Game.getWordListById(req.params.id);
      if (!list) {
        req.flash('error', 'Word list không tồn tại');
        return res.redirect('/games/word-lists');
      }
      res.render('games/word-lists-form', {
        title: `Sửa: ${list.name}`,
        active: 'games',
        list,
        formAction: `/games/word-lists/${list.id}/edit`,
      });
    } catch (err) {
      console.error('[Games] getWordListsEdit error:', err);
      req.flash('error', 'Không thể tải word list');
      return res.redirect('/games/word-lists');
    }
  },

  // POST /games/word-lists/create
  async postWordListsCreate(req, res) {
    try {
      const data = parseWordListData(req.body, req.session.admin.id);
      const entryIds = parseEntryIds(req.body);
      if (!data.name) {
        req.flash('error', 'Tên word list không được để trống');
        return res.redirect('/games/word-lists/create');
      }

      if (req.session.admin.role === 'moderator') {
        await Approval.create({
          requesterId: req.session.admin.id,
          action: 'create',
          module: 'games',
          targetType: 'word_list',
          targetId: null,
          payload: { data, entryIds },
        });
        req.flash('success', 'Yêu cầu tạo word list đã được gửi, chờ Super Admin duyệt.');
        return res.redirect('/games/word-lists');
      }

      const list = await Game.createWordList(data, entryIds);
      req.flash('success', `Đã tạo word list "${list.name}"`);
      return res.redirect('/games/word-lists');
    } catch (err) {
      console.error('[Games] postWordListsCreate error:', err);
      req.flash('error', 'Không thể tạo word list');
      return res.redirect('/games/word-lists/create');
    }
  },

  // POST /games/word-lists/:id/edit
  async postWordListsEdit(req, res) {
    const { id } = req.params;
    try {
      const data = parseWordListData(req.body, req.session.admin.id);
      const entryIds = parseEntryIds(req.body);
      if (!data.name) {
        req.flash('error', 'Tên word list không được để trống');
        return res.redirect(`/games/word-lists/${id}/edit`);
      }

      if (req.session.admin.role === 'moderator') {
        await Approval.create({
          requesterId: req.session.admin.id,
          action: 'update',
          module: 'games',
          targetType: 'word_list',
          targetId: id,
          payload: { data, entryIds, targetId: id },
        });
        req.flash('success', 'Yêu cầu sửa word list đã được gửi, chờ Super Admin duyệt.');
        return res.redirect('/games/word-lists');
      }

      const list = await Game.updateWordList(id, data, entryIds);
      if (!list) {
        req.flash('error', 'Word list không tồn tại');
        return res.redirect('/games/word-lists');
      }
      req.flash('success', `Đã cập nhật word list "${list.name}"`);
      return res.redirect('/games/word-lists');
    } catch (err) {
      console.error('[Games] postWordListsEdit error:', err);
      req.flash('error', 'Không thể cập nhật word list');
      return res.redirect(`/games/word-lists/${id}/edit`);
    }
  },

  // POST /games/word-lists/:id/delete
  async postWordListsDelete(req, res) {
    const { id } = req.params;
    try {
      if (req.session.admin.role === 'moderator') {
        const list = await Game.getWordListById(id);
        await Approval.create({
          requesterId: req.session.admin.id,
          action: 'delete',
          module: 'games',
          targetType: 'word_list',
          targetId: id,
          payload: { targetId: id, name: list ? list.name : id },
        });
        req.flash('success', 'Yêu cầu xóa word list đã được gửi, chờ Super Admin duyệt.');
        return res.redirect('/games/word-lists');
      }

      await Game.deleteWordList(id);
      req.flash('success', 'Đã xóa word list');
      return res.redirect('/games/word-lists');
    } catch (err) {
      console.error('[Games] postWordListsDelete error:', err);
      req.flash('error', 'Không thể xóa word list');
      return res.redirect('/games/word-lists');
    }
  },

  // GET /games/levels
  async getLevels(req, res) {
    try {
      const [lexisweep, anagram, ladder] = await Promise.all([
        Game.getLevels('lexisweep'),
        Game.getLevels('anagram'),
        Game.getLevels('ladder'),
      ]);
      const activeTab = req.query.tab || 'lexisweep';
      res.render('games/levels', {
        title: 'Game Levels',
        active: 'games',
        levels: { lexisweep, anagram, ladder },
        activeTab,
      });
    } catch (err) {
      console.error('[Games] getLevels error:', err);
      req.flash('error', 'Không thể tải levels');
      return res.redirect('/games');
    }
  },

  // POST /games/levels/create
  async postLevelsCreate(req, res) {
    const gameType = req.body.game_type || 'lexisweep';
    try {
      const configStr = (req.body.config_json || '{}').trim();
      const parsed = tryParseJson(configStr);
      if (!parsed.ok) {
        req.flash('error', 'Config JSON không hợp lệ');
        return res.redirect(`/games/levels?tab=${gameType}`);
      }

      const data = {
        game_type:    ['lexisweep','anagram','ladder'].includes(gameType) ? gameType : 'lexisweep',
        level_number: parseInt(req.body.level_number) || 1,
        config_json:  configStr,
        status:       VALID_LEVEL_STATUSES.includes(req.body.status) ? req.body.status : 'active',
      };

      if (req.session.admin.role === 'moderator') {
        await Approval.create({
          requesterId: req.session.admin.id,
          action: 'create',
          module: 'games',
          targetType: 'game_level',
          targetId: null,
          payload: { data },
        });
        req.flash('success', 'Yêu cầu tạo level đã được gửi, chờ Super Admin duyệt.');
        return res.redirect(`/games/levels?tab=${gameType}`);
      }

      await Game.createLevel(data);
      req.flash('success', `Đã tạo level ${data.level_number} cho ${gameType}`);
      return res.redirect(`/games/levels?tab=${gameType}`);
    } catch (err) {
      if (err.code === '23505') {
        req.flash('error', 'Level number đã tồn tại cho game type này');
      } else {
        console.error('[Games] postLevelsCreate error:', err);
        req.flash('error', 'Không thể tạo level');
      }
      return res.redirect(`/games/levels?tab=${gameType}`);
    }
  },

  // POST /games/levels/:id/edit
  async postLevelsEdit(req, res) {
    const { id } = req.params;
    const gameType = req.body.game_type || 'lexisweep';
    try {
      const configStr = (req.body.config_json || '{}').trim();
      const parsed = tryParseJson(configStr);
      if (!parsed.ok) {
        req.flash('error', 'Config JSON không hợp lệ');
        return res.redirect(`/games/levels?tab=${gameType}`);
      }

      const data = {
        level_number: parseInt(req.body.level_number) || 1,
        config_json:  configStr,
        status:       VALID_LEVEL_STATUSES.includes(req.body.status) ? req.body.status : 'active',
      };

      if (req.session.admin.role === 'moderator') {
        await Approval.create({
          requesterId: req.session.admin.id,
          action: 'update',
          module: 'games',
          targetType: 'game_level',
          targetId: id,
          payload: { data, targetId: id },
        });
        req.flash('success', 'Yêu cầu sửa level đã được gửi, chờ Super Admin duyệt.');
        return res.redirect(`/games/levels?tab=${gameType}`);
      }

      await Game.updateLevel(id, data);
      req.flash('success', 'Đã cập nhật level');
      return res.redirect(`/games/levels?tab=${gameType}`);
    } catch (err) {
      console.error('[Games] postLevelsEdit error:', err);
      req.flash('error', 'Không thể cập nhật level');
      return res.redirect(`/games/levels?tab=${gameType}`);
    }
  },

  // POST /games/levels/:id/delete
  async postLevelsDelete(req, res) {
    const { id } = req.params;
    const gameType = req.body.game_type || 'lexisweep';
    try {
      if (req.session.admin.role === 'moderator') {
        await Approval.create({
          requesterId: req.session.admin.id,
          action: 'delete',
          module: 'games',
          targetType: 'game_level',
          targetId: id,
          payload: { targetId: id },
        });
        req.flash('success', 'Yêu cầu xóa level đã được gửi, chờ Super Admin duyệt.');
        return res.redirect(`/games/levels?tab=${gameType}`);
      }

      await Game.deleteLevel(id);
      req.flash('success', 'Đã xóa level');
      return res.redirect(`/games/levels?tab=${gameType}`);
    } catch (err) {
      console.error('[Games] postLevelsDelete error:', err);
      req.flash('error', 'Không thể xóa level');
      return res.redirect(`/games/levels?tab=${gameType}`);
    }
  },

  // GET /games/semantic-sets
  async getSemanticSets(req, res) {
    try {
      const { page = 1 } = req.query;
      const result = await Game.getSemanticSets({ page, limit: 20 });
      res.render('games/semantic-sets', {
        title: 'Semantic Sets',
        active: 'games',
        sets: result.rows,
        pagination: result,
      });
    } catch (err) {
      console.error('[Games] getSemanticSets error:', err);
      req.flash('error', 'Không thể tải danh sách semantic sets');
      return res.redirect('/games');
    }
  },

  // GET /games/semantic-sets/create
  getSemanticSetsCreate(req, res) {
    res.render('games/semantic-sets-form', {
      title: 'Tạo Semantic Set',
      active: 'games',
      set: null,
      formAction: '/games/semantic-sets/create',
    });
  },

  // GET /games/semantic-sets/:id/edit
  async getSemanticSetsEdit(req, res) {
    try {
      const set = await Game.getSemanticSetById(req.params.id);
      if (!set) {
        req.flash('error', 'Semantic set không tồn tại');
        return res.redirect('/games/semantic-sets');
      }
      res.render('games/semantic-sets-form', {
        title: `Sửa: ${set.name}`,
        active: 'games',
        set,
        formAction: `/games/semantic-sets/${set.id}/edit`,
      });
    } catch (err) {
      console.error('[Games] getSemanticSetsEdit error:', err);
      req.flash('error', 'Không thể tải semantic set');
      return res.redirect('/games/semantic-sets');
    }
  },

  // POST /games/semantic-sets/create
  async postSemanticSetsCreate(req, res) {
    try {
      const data  = parseSemanticSetData(req.body, req.session.admin.id);
      const items = parseItems(req.body);
      if (!data.name) {
        req.flash('error', 'Tên semantic set không được để trống');
        return res.redirect('/games/semantic-sets/create');
      }
      if (!data.scale_description) {
        req.flash('error', 'Scale description không được để trống');
        return res.redirect('/games/semantic-sets/create');
      }

      if (req.session.admin.role === 'moderator') {
        await Approval.create({
          requesterId: req.session.admin.id,
          action: 'create',
          module: 'games',
          targetType: 'semantic_set',
          targetId: null,
          payload: { data, items },
        });
        req.flash('success', 'Yêu cầu tạo semantic set đã được gửi, chờ Super Admin duyệt.');
        return res.redirect('/games/semantic-sets');
      }

      const set = await Game.createSemanticSet(data, items);
      req.flash('success', `Đã tạo semantic set "${set.name}"`);
      return res.redirect('/games/semantic-sets');
    } catch (err) {
      console.error('[Games] postSemanticSetsCreate error:', err);
      req.flash('error', 'Không thể tạo semantic set');
      return res.redirect('/games/semantic-sets/create');
    }
  },

  // POST /games/semantic-sets/:id/edit
  async postSemanticSetsEdit(req, res) {
    const { id } = req.params;
    try {
      const data  = parseSemanticSetData(req.body, req.session.admin.id);
      const items = parseItems(req.body);
      if (!data.name) {
        req.flash('error', 'Tên semantic set không được để trống');
        return res.redirect(`/games/semantic-sets/${id}/edit`);
      }

      if (req.session.admin.role === 'moderator') {
        await Approval.create({
          requesterId: req.session.admin.id,
          action: 'update',
          module: 'games',
          targetType: 'semantic_set',
          targetId: id,
          payload: { data, items, targetId: id },
        });
        req.flash('success', 'Yêu cầu sửa semantic set đã được gửi, chờ Super Admin duyệt.');
        return res.redirect('/games/semantic-sets');
      }

      const set = await Game.updateSemanticSet(id, data, items);
      if (!set) {
        req.flash('error', 'Semantic set không tồn tại');
        return res.redirect('/games/semantic-sets');
      }
      req.flash('success', `Đã cập nhật semantic set "${set.name}"`);
      return res.redirect('/games/semantic-sets');
    } catch (err) {
      console.error('[Games] postSemanticSetsEdit error:', err);
      req.flash('error', 'Không thể cập nhật semantic set');
      return res.redirect(`/games/semantic-sets/${id}/edit`);
    }
  },

  // POST /games/semantic-sets/:id/delete
  async postSemanticSetsDelete(req, res) {
    const { id } = req.params;
    try {
      if (req.session.admin.role === 'moderator') {
        const set = await Game.getSemanticSetById(id);
        await Approval.create({
          requesterId: req.session.admin.id,
          action: 'delete',
          module: 'games',
          targetType: 'semantic_set',
          targetId: id,
          payload: { targetId: id, name: set ? set.name : id },
        });
        req.flash('success', 'Yêu cầu xóa semantic set đã được gửi, chờ Super Admin duyệt.');
        return res.redirect('/games/semantic-sets');
      }

      await Game.deleteSemanticSet(id);
      req.flash('success', 'Đã xóa semantic set');
      return res.redirect('/games/semantic-sets');
    } catch (err) {
      console.error('[Games] postSemanticSetsDelete error:', err);
      req.flash('error', 'Không thể xóa semantic set');
      return res.redirect('/games/semantic-sets');
    }
  },

  // GET /games/leaderboard
  async getLeaderboard(req, res) {
    try {
      const { gameType = '', page = 1 } = req.query;
      const result = await Game.getGameRuns({ gameType, page, limit: 50 });
      res.render('games/leaderboard', {
        title: 'Leaderboard',
        active: 'games',
        runs: result.rows,
        pagination: result,
        filters: { gameType },
      });
    } catch (err) {
      console.error('[Games] getLeaderboard error:', err);
      req.flash('error', 'Không thể tải leaderboard');
      return res.redirect('/games');
    }
  },
};

export {};
