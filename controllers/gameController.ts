import type { Request, Response } from 'express';
import Game from '../models/Game';
import Approval from '../models/Approval';

const VALID_LEVELS  = ['beginner', 'intermediate', 'advanced'];
const VALID_STATUSES = ['draft', 'published', 'archived'];
const VALID_GAME_TYPES = ['lexisweep', 'anagram'];
const VALID_LEVEL_STATUSES = ['active', 'inactive'];

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseEntryIds(body: any) {
  const ids: any[] = ([] as any[]).concat(body['item_entry_id[]'] || []);
  return ids.filter(Boolean);
}

function parseItems(body: any) {
  const entryIds: any[] = ([] as any[]).concat(body['item_entry_id[]'] || []);
  const hints: any[]    = ([] as any[]).concat(body['item_hint_vi[]']  || []);
  return entryIds
    .map((id, i) => ({
      entry_id:      id,
      correct_order: i + 1,
      hint_vi:       (hints[i] || '').trim() || null,
    }))
    .filter(it => it.entry_id);
}

function parseWordListData(body: any, adminId: string) {
  return {
    game_type:  VALID_GAME_TYPES.includes(body.game_type) ? body.game_type : 'lexisweep',
    name:       (body.name || '').trim(),
    topic:      (body.topic || '').trim() || null,
    level:      VALID_LEVELS.includes(body.level) ? body.level : 'beginner',
    status:     VALID_STATUSES.includes(body.status) ? body.status : 'draft',
    created_by: adminId,
  };
}

function parseSemanticSetData(body: any, adminId: string) {
  return {
    name:              (body.name || '').trim(),
    scale_description: (body.scale_description || '').trim(),
    level:             VALID_LEVELS.includes(body.level) ? body.level : 'intermediate',
    status:            VALID_STATUSES.includes(body.status) ? body.status : 'draft',
    created_by:        adminId,
  };
}

function tryParseJson(str: string) {
  try { return { ok: true, value: JSON.parse(str) }; }
  catch (e) { return { ok: false }; }
}

// ── Controllers ───────────────────────────────────────────────────────────────

const gameController = {
  // GET /games
  async getIndex(req: Request, res: Response) {
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
      req.flash('error', 'Failed to load Mini-games page');
      return res.redirect('/dashboard');
    }
  },

  // GET /games/word-lists
  async getWordLists(req: Request, res: Response) {
    try {
      const { gameType = '', search = '', page = 1 } = req.query as any;
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
      req.flash('error', 'Failed to load word list');
      return res.redirect('/games');
    }
  },

  // GET /games/word-lists/create
  getWordListsCreate(req: Request, res: Response) {
    res.render('games/word-lists-form', {
      title: 'Create Word List',
      active: 'games',
      list: null,
      formAction: '/games/word-lists/create',
    });
  },

  // GET /games/word-lists/:id/edit
  async getWordListsEdit(req: Request, res: Response) {
    try {
      const list = await Game.getWordListById(req.params.id as string);
      if (!list) {
        req.flash('error', 'Word list not found');
        return res.redirect('/games/word-lists');
      }
      res.render('games/word-lists-form', {
        title: `Edit: ${list.name}`,
        active: 'games',
        list,
        formAction: `/games/word-lists/${list.id}/edit`,
      });
    } catch (err) {
      console.error('[Games] getWordListsEdit error:', err);
      req.flash('error', 'Failed to load word list');
      return res.redirect('/games/word-lists');
    }
  },

  // POST /games/word-lists/create
  async postWordListsCreate(req: Request, res: Response) {
    try {
      const data = parseWordListData(req.body, req.session.admin.id);
      const entryIds = parseEntryIds(req.body);
      if (!data.name) {
        req.flash('error', 'Word list name is required');
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
        req.flash('success', 'Word list creation request submitted, pending Super Admin approval.');
        return res.redirect('/games/word-lists');
      }

      const list = await Game.createWordList(data, entryIds);
      req.flash('success', `Word list "${list.name}" created successfully`);
      return res.redirect('/games/word-lists');
    } catch (err) {
      console.error('[Games] postWordListsCreate error:', err);
      req.flash('error', 'Failed to create word list');
      return res.redirect('/games/word-lists/create');
    }
  },

  // POST /games/word-lists/:id/edit
  async postWordListsEdit(req: Request, res: Response) {
    const { id } = req.params as { id: string };
    try {
      const data = parseWordListData(req.body, req.session.admin.id);
      const entryIds = parseEntryIds(req.body);
      if (!data.name) {
        req.flash('error', 'Word list name is required');
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
        req.flash('success', 'Word list update request submitted, pending Super Admin approval.');
        return res.redirect('/games/word-lists');
      }

      const list = await Game.updateWordList(id, data, entryIds);
      if (!list) {
        req.flash('error', 'Word list not found');
        return res.redirect('/games/word-lists');
      }
      req.flash('success', `Word list "${list.name}" updated successfully`);
      return res.redirect('/games/word-lists');
    } catch (err) {
      console.error('[Games] postWordListsEdit error:', err);
      req.flash('error', 'Failed to update word list');
      return res.redirect(`/games/word-lists/${id}/edit`);
    }
  },

  // POST /games/word-lists/:id/delete
  async postWordListsDelete(req: Request, res: Response) {
    const { id } = req.params as { id: string };
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
        req.flash('success', 'Word list deletion request submitted, pending Super Admin approval.');
        return res.redirect('/games/word-lists');
      }

      await Game.deleteWordList(id);
      req.flash('success', 'Word list deleted');
      return res.redirect('/games/word-lists');
    } catch (err) {
      console.error('[Games] postWordListsDelete error:', err);
      req.flash('error', 'Failed to delete word list');
      return res.redirect('/games/word-lists');
    }
  },

  // GET /games/levels
  async getLevels(req: Request, res: Response) {
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
      req.flash('error', 'Failed to load levels');
      return res.redirect('/games');
    }
  },

  // POST /games/levels/create
  async postLevelsCreate(req: Request, res: Response) {
    const gameType = req.body.game_type || 'lexisweep';
    try {
      const configStr = (req.body.config_json || '{}').trim();
      const parsed = tryParseJson(configStr);
      if (!parsed.ok) {
        req.flash('error', 'Invalid config JSON');
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
        req.flash('success', 'Level creation request submitted, pending Super Admin approval.');
        return res.redirect(`/games/levels?tab=${gameType}`);
      }

      await Game.createLevel(data);
      req.flash('success', `Level ${data.level_number} created for ${gameType}`);
      return res.redirect(`/games/levels?tab=${gameType}`);
    } catch (err) {
      const error = err as { code?: string };
      if (error.code === '23505') {
        req.flash('error', 'Level number already exists for this game type');
      } else {
        console.error('[Games] postLevelsCreate error:', err);
        req.flash('error', 'Failed to create level');
      }
      return res.redirect(`/games/levels?tab=${gameType}`);
    }
  },

  // POST /games/levels/:id/edit
  async postLevelsEdit(req: Request, res: Response) {
    const { id } = req.params as { id: string };
    const gameType = req.body.game_type || 'lexisweep';
    try {
      const configStr = (req.body.config_json || '{}').trim();
      const parsed = tryParseJson(configStr);
      if (!parsed.ok) {
        req.flash('error', 'Invalid config JSON');
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
        req.flash('success', 'Level update request submitted, pending Super Admin approval.');
        return res.redirect(`/games/levels?tab=${gameType}`);
      }

      await Game.updateLevel(id, data);
      req.flash('success', 'Level updated successfully');
      return res.redirect(`/games/levels?tab=${gameType}`);
    } catch (err) {
      console.error('[Games] postLevelsEdit error:', err);
      req.flash('error', 'Failed to update level');
      return res.redirect(`/games/levels?tab=${gameType}`);
    }
  },

  // POST /games/levels/:id/delete
  async postLevelsDelete(req: Request, res: Response) {
    const { id } = req.params as { id: string };
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
        req.flash('success', 'Level deletion request submitted, pending Super Admin approval.');
        return res.redirect(`/games/levels?tab=${gameType}`);
      }

      await Game.deleteLevel(id);
      req.flash('success', 'Level deleted');
      return res.redirect(`/games/levels?tab=${gameType}`);
    } catch (err) {
      console.error('[Games] postLevelsDelete error:', err);
      req.flash('error', 'Failed to delete level');
      return res.redirect(`/games/levels?tab=${gameType}`);
    }
  },

  // GET /games/semantic-sets
  async getSemanticSets(req: Request, res: Response) {
    try {
      const { page = 1 } = req.query as any;
      const result = await Game.getSemanticSets({ page, limit: 20 });
      res.render('games/semantic-sets', {
        title: 'Semantic Sets',
        active: 'games',
        sets: result.rows,
        pagination: result,
      });
    } catch (err) {
      console.error('[Games] getSemanticSets error:', err);
      req.flash('error', 'Failed to load semantic set list');
      return res.redirect('/games');
    }
  },

  // GET /games/semantic-sets/create
  getSemanticSetsCreate(req: Request, res: Response) {
    res.render('games/semantic-sets-form', {
      title: 'Create Semantic Set',
      active: 'games',
      set: null,
      formAction: '/games/semantic-sets/create',
    });
  },

  // GET /games/semantic-sets/:id/edit
  async getSemanticSetsEdit(req: Request, res: Response) {
    try {
      const set = await Game.getSemanticSetById(req.params.id as string);
      if (!set) {
        req.flash('error', 'Semantic set not found');
        return res.redirect('/games/semantic-sets');
      }
      res.render('games/semantic-sets-form', {
        title: `Edit: ${set.name}`,
        active: 'games',
        set,
        formAction: `/games/semantic-sets/${set.id}/edit`,
      });
    } catch (err) {
      console.error('[Games] getSemanticSetsEdit error:', err);
      req.flash('error', 'Failed to load semantic set');
      return res.redirect('/games/semantic-sets');
    }
  },

  // POST /games/semantic-sets/create
  async postSemanticSetsCreate(req: Request, res: Response) {
    try {
      const data  = parseSemanticSetData(req.body, req.session.admin.id);
      const items = parseItems(req.body);
      if (!data.name) {
        req.flash('error', 'Semantic set name is required');
        return res.redirect('/games/semantic-sets/create');
      }
      if (!data.scale_description) {
        req.flash('error', 'Scale description is required');
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
        req.flash('success', 'Semantic set creation request submitted, pending Super Admin approval.');
        return res.redirect('/games/semantic-sets');
      }

      const set = await Game.createSemanticSet(data, items);
      req.flash('success', `Semantic set "${set.name}" created successfully`);
      return res.redirect('/games/semantic-sets');
    } catch (err) {
      console.error('[Games] postSemanticSetsCreate error:', err);
      req.flash('error', 'Failed to create semantic set');
      return res.redirect('/games/semantic-sets/create');
    }
  },

  // POST /games/semantic-sets/:id/edit
  async postSemanticSetsEdit(req: Request, res: Response) {
    const { id } = req.params as { id: string };
    try {
      const data  = parseSemanticSetData(req.body, req.session.admin.id);
      const items = parseItems(req.body);
      if (!data.name) {
        req.flash('error', 'Semantic set name is required');
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
        req.flash('success', 'Semantic set update request submitted, pending Super Admin approval.');
        return res.redirect('/games/semantic-sets');
      }

      const set = await Game.updateSemanticSet(id, data, items);
      if (!set) {
        req.flash('error', 'Semantic set not found');
        return res.redirect('/games/semantic-sets');
      }
      req.flash('success', `Semantic set "${set.name}" updated successfully`);
      return res.redirect('/games/semantic-sets');
    } catch (err) {
      console.error('[Games] postSemanticSetsEdit error:', err);
      req.flash('error', 'Failed to update semantic set');
      return res.redirect(`/games/semantic-sets/${id}/edit`);
    }
  },

  // POST /games/semantic-sets/:id/delete
  async postSemanticSetsDelete(req: Request, res: Response) {
    const { id } = req.params as { id: string };
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
        req.flash('success', 'Semantic set deletion request submitted, pending Super Admin approval.');
        return res.redirect('/games/semantic-sets');
      }

      await Game.deleteSemanticSet(id);
      req.flash('success', 'Semantic set deleted');
      return res.redirect('/games/semantic-sets');
    } catch (err) {
      console.error('[Games] postSemanticSetsDelete error:', err);
      req.flash('error', 'Failed to delete semantic set');
      return res.redirect('/games/semantic-sets');
    }
  },

  // GET /games/leaderboard
  async getLeaderboard(req: Request, res: Response) {
    try {
      const { gameType = '', page = 1 } = req.query as any;
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
      req.flash('error', 'Failed to load leaderboard');
      return res.redirect('/games');
    }
  },
};

export = gameController;
