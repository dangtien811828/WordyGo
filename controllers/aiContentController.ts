const AIContent = require('../models/AIContent');

module.exports = {
  // GET /ai-content
  async getIndex(req, res) {
    try {
      const [stats, recentSessions, recentMod] = await Promise.all([
        AIContent.getStats(),
        AIContent.getRecentSessions(5),
        AIContent.getRecentModerationLogs(5),
      ]);
      res.render('ai-content/index', {
        title: 'Nội dung AI',
        active: 'ai',
        stats,
        recentSessions,
        recentMod,
      });
    } catch (err) {
      console.error('[AIContent] getIndex error:', err);
      req.flash('error', 'Không thể tải trang AI Content');
      return res.redirect('/dashboard');
    }
  },

  // GET /ai-content/sessions
  async getSessions(req, res) {
    try {
      const { userId = '', allPassed = '', page = 1 } = req.query;
      const result = await AIContent.getRetrievalSessions({ userId, allPassed, page, limit: 20 });
      res.render('ai-content/sessions', {
        title: 'Retrieval Sessions',
        active: 'ai',
        sessions: result.rows,
        pagination: result,
        filters: { userId, allPassed },
      });
    } catch (err) {
      console.error('[AIContent] getSessions error:', err);
      req.flash('error', 'Không thể tải danh sách sessions');
      return res.redirect('/ai-content');
    }
  },

  // GET /ai-content/sessions/:id
  async getSessionDetail(req, res) {
    try {
      const session = await AIContent.getRetrievalSessionById(req.params.id);
      if (!session) {
        req.flash('error', 'Session không tồn tại');
        return res.redirect('/ai-content/sessions');
      }
      res.render('ai-content/session-detail', {
        title: 'Chi tiết Session',
        active: 'ai',
        session,
      });
    } catch (err) {
      console.error('[AIContent] getSessionDetail error:', err);
      req.flash('error', 'Không thể tải chi tiết session');
      return res.redirect('/ai-content/sessions');
    }
  },

  // GET /ai-content/moderation
  async getModeration(req, res) {
    try {
      const { status = '', flagType = '', page = 1 } = req.query;
      const result = await AIContent.getModerationLogs({ status, flagType, page, limit: 20 });
      res.render('ai-content/moderation', {
        title: 'Moderation Logs',
        active: 'ai',
        logs: result.rows,
        pagination: result,
        filters: { status, flagType },
      });
    } catch (err) {
      console.error('[AIContent] getModeration error:', err);
      req.flash('error', 'Không thể tải moderation logs');
      return res.redirect('/ai-content');
    }
  },

  // GET /ai-content/moderation/:id
  async getModerationDetail(req, res) {
    try {
      const log = await AIContent.getModerationLogById(req.params.id);
      if (!log) {
        req.flash('error', 'Moderation log không tồn tại');
        return res.redirect('/ai-content/moderation');
      }
      res.render('ai-content/moderation-detail', {
        title: 'Chi tiết Moderation',
        active: 'ai',
        log,
      });
    } catch (err) {
      console.error('[AIContent] getModerationDetail error:', err);
      req.flash('error', 'Không thể tải chi tiết moderation log');
      return res.redirect('/ai-content/moderation');
    }
  },

  // GET /ai-content/prompts
  async getPrompts(req, res) {
    try {
      const templates = await AIContent.getPromptTemplates();
      res.render('ai-content/prompts', {
        title: 'Prompt Templates',
        active: 'ai',
        templates,
      });
    } catch (err) {
      console.error('[AIContent] getPrompts error:', err);
      req.flash('error', 'Không thể tải prompt templates');
      return res.redirect('/ai-content');
    }
  },
};
