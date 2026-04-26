import { Router, Request, Response } from 'express';
import ctrl from '../controllers/ebookController';
import { requireAuth } from '../middlewares/auth';
import pool from '../config/db';
import { generateChapterAudio } from '../services/chapterTtsService';

const router = Router();

// All authenticated roles can access ebooks
router.use(requireAuth);

// Static routes BEFORE /:id
router.get('/',          ctrl.getIndex);
router.get('/create',    ctrl.getCreate);
router.post('/create',   ctrl.postCreate);

// Parameterized routes
router.get('/:id',       ctrl.getShow);
router.get('/:id/edit',  ctrl.getEdit);
router.post('/:id/edit', ctrl.postEdit);
router.post('/:id/delete', ctrl.postDelete);

// ─────────────────────────────────────────────────────────────────────────────
//  Chapter TTS — admin-triggered background generation
// ─────────────────────────────────────────────────────────────────────────────

// POST /ebooks/:ebook_id/chapters/:chapter_id/generate-tts
// Body: { accent?: 'us' | 'uk' } (default 'us')
// Fire-and-forget: returns 202 immediately, generation runs in background.
router.post('/:ebook_id/chapters/:chapter_id/generate-tts', async (req: Request, res: Response) => {
  const { ebook_id, chapter_id } = req.params as { ebook_id: string; chapter_id: string };
  const accent = (req.body?.accent ?? 'us') as string;

  if (accent !== 'us' && accent !== 'uk') {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: "accent must be 'us' or 'uk'" },
    });
  }

  try {
    const { rows } = await pool.query<{ id: string; tts_status: string | null }>(
      `SELECT id, tts_status FROM chapters WHERE id = $1 AND ebook_id = $2`,
      [chapter_id, ebook_id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Chapter không tồn tại trong ebook này' },
      });
    }

    if (rows[0].tts_status === 'generating') {
      return res.status(409).json({
        success: false,
        error: {
          code: 'ALREADY_GENERATING',
          message: 'TTS đang được tạo cho chapter này, vui lòng đợi.',
        },
      });
    }

    // Fire-and-forget. The service handles its own errors and updates DB state;
    // the .catch() here is a last-resort log so an unhandled rejection cannot crash the process.
    void generateChapterAudio(chapter_id, accent as 'us' | 'uk').catch((err) => {
      console.error(`[admin/ebooks] generateChapterAudio crashed for ${chapter_id}:`, err);
    });

    return res.status(202).json({
      message: 'Generation started',
      chapter_id,
    });
  } catch (err) {
    console.error('[admin/ebooks] generate-tts error:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Không thể khởi động generation' },
    });
  }
});

// GET /ebooks/:ebook_id/chapters/:chapter_id/audio-preview
// Renders a per-paragraph audio preview page for admins to QA generated audio.
router.get('/:ebook_id/chapters/:chapter_id/audio-preview', async (req: Request, res: Response) => {
  const { ebook_id, chapter_id } = req.params as { ebook_id: string; chapter_id: string };

  try {
    const [ebookResult, chapterResult, paragraphsResult] = await Promise.all([
      pool.query<{ id: string; title: string }>(
        `SELECT id, title FROM ebooks WHERE id = $1`,
        [ebook_id]
      ),
      pool.query<{
        id: string;
        chapter_index: number;
        title: string;
        tts_status: string | null;
        tts_progress: number | null;
      }>(
        `SELECT id, chapter_index, title,
                COALESCE(tts_status, 'none') AS tts_status,
                COALESCE(tts_progress, 0)    AS tts_progress
           FROM chapters
          WHERE id = $1 AND ebook_id = $2`,
        [chapter_id, ebook_id]
      ),
      pool.query<{
        id: string;
        paragraph_index: number;
        text: string;
        audio_url: string | null;
        audio_status: string | null;
        audio_error: string | null;
      }>(
        `SELECT id, paragraph_index, text, audio_url,
                COALESCE(audio_status, 'none') AS audio_status,
                audio_error
           FROM paragraphs
          WHERE chapter_id = $1
          ORDER BY paragraph_index ASC`,
        [chapter_id]
      ),
    ]);

    if (ebookResult.rows.length === 0 || chapterResult.rows.length === 0) {
      req.flash('error', 'Chapter không tồn tại trong ebook này');
      return res.redirect(`/ebooks/${ebook_id}`);
    }

    return res.render('ebooks/audio-preview', {
      title: `Audio preview — ${chapterResult.rows[0].title}`,
      active: 'ebooks',
      ebook: ebookResult.rows[0],
      chapter: chapterResult.rows[0],
      paragraphs: paragraphsResult.rows,
    });
  } catch (err) {
    console.error('[admin/ebooks] audio-preview error:', err);
    req.flash('error', 'Không thể tải trang audio preview');
    return res.redirect(`/ebooks/${ebook_id}`);
  }
});

// GET /ebooks/:ebook_id/chapters/:chapter_id/tts-status
// Returns current generation status + paragraph counters for polling.
router.get('/:ebook_id/chapters/:chapter_id/tts-status', async (req: Request, res: Response) => {
  const { ebook_id, chapter_id } = req.params as { ebook_id: string; chapter_id: string };

  try {
    const [chapterResult, countsResult] = await Promise.all([
      pool.query<{
        id: string;
        tts_status: string | null;
        tts_progress: number | null;
        tts_started_at: Date | null;
        tts_completed_at: Date | null;
      }>(
        `SELECT id, tts_status, tts_progress, tts_started_at, tts_completed_at
           FROM chapters
          WHERE id = $1 AND ebook_id = $2`,
        [chapter_id, ebook_id]
      ),
      pool.query<{
        paragraphs_total: number;
        paragraphs_ready: number;
        paragraphs_failed: number;
      }>(
        `SELECT COUNT(*)::int                                          AS paragraphs_total,
                COUNT(*) FILTER (WHERE audio_status = 'ready')::int    AS paragraphs_ready,
                COUNT(*) FILTER (WHERE audio_status = 'failed')::int   AS paragraphs_failed
           FROM paragraphs
          WHERE chapter_id = $1`,
        [chapter_id]
      ),
    ]);

    if (chapterResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Chapter không tồn tại trong ebook này' },
      });
    }

    const chapter = chapterResult.rows[0];
    const counts = countsResult.rows[0];

    return res.json({
      chapter_id: chapter.id,
      tts_status: chapter.tts_status ?? 'none',
      tts_progress: chapter.tts_progress ?? 0,
      tts_started_at: chapter.tts_started_at,
      tts_completed_at: chapter.tts_completed_at,
      paragraphs_total: counts.paragraphs_total,
      paragraphs_ready: counts.paragraphs_ready,
      paragraphs_failed: counts.paragraphs_failed,
    });
  } catch (err) {
    console.error('[admin/ebooks] tts-status error:', err);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Không thể đọc trạng thái TTS' },
    });
  }
});

export = router;
