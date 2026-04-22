import { Router, Response } from 'express';
import pool from '../../config/db';
import { ApiRequest } from '../../middlewares/apiAuth';
import { requireFeature } from '../../middlewares/requireFeature';
import { asyncHandler } from '../../utils/asyncHandler';
import { apiSuccess, apiError } from '../../utils/apiResponse';
import { parsePagination } from '../../utils/pagination';
import { getActiveSubscription } from '../../utils/subscriptionHelper';
import { translateText } from '../../services/translationService';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────

const PLAN_TIER: Record<string, number> = { free: 0, premium: 1, pro: 2 };

async function getUserPlanTier(userId: string): Promise<number> {
  const sub = await getActiveSubscription(userId);
  if (!sub) return PLAN_TIER.free;
  const name = String(sub.plan_name ?? '').toLowerCase();
  if (name.includes('pro')) return PLAN_TIER.pro;
  if (name.includes('premium')) return PLAN_TIER.premium;
  return PLAN_TIER.free;
}

const FULL_ENTRY_SQL = `
  SELECT e.*,
    (SELECT json_agg(
       json_build_object(
         'id', s.id, 'pos', s.pos, 'sense_order', s.sense_order,
         'definition_en', s.definition_en, 'definition_vi', s.definition_vi,
         'register', s.register, 'domain', s.domain,
         'grammar_note', s.grammar_note, 'usage_note', s.usage_note, 'region', s.region,
         'examples', (SELECT json_agg(
             json_build_object('example_en', ex.example_en, 'example_vi', ex.example_vi, 'source', ex.source)
             ORDER BY ex.sort_order
           ) FROM sense_examples ex WHERE ex.sense_id = s.id),
         'synonyms', (SELECT json_agg(ss.synonym_text) FROM sense_synonyms ss WHERE ss.sense_id = s.id),
         'antonyms', (SELECT json_agg(sa.antonym_text) FROM sense_antonyms sa WHERE sa.sense_id = s.id)
       ) ORDER BY s.sense_order
     ) FROM entry_senses s WHERE s.entry_id = e.id) AS senses,
    (SELECT json_agg(
       json_build_object(
         'id', wf.id, 'form_type', wf.form_type, 'form_value', wf.form_value,
         'ipa', wf.ipa, 'audio_url', wf.audio_url, 'tags', wf.tags
       ) ORDER BY wf.sort_order
     ) FROM word_forms wf WHERE wf.entry_id = e.id) AS word_forms,
    (SELECT json_agg(
       json_build_object(
         'id', pv.id, 'phrasal_verb', pv.phrasal_verb, 'particle', pv.particle,
         'is_separable', pv.is_separable, 'definition_en', pv.definition_en,
         'definition_vi', pv.definition_vi, 'example_en', pv.example_en, 'example_vi', pv.example_vi
       )
     ) FROM phrasal_verbs pv WHERE pv.entry_id = e.id) AS phrasal_verbs,
    (SELECT json_agg(
       json_build_object(
         'id', idi.id, 'idiom_text', idi.idiom_text,
         'definition_en', idi.definition_en, 'definition_vi', idi.definition_vi,
         'example_en', idi.example_en, 'example_vi', idi.example_vi, 'register', idi.register
       )
     ) FROM entry_idioms idi WHERE idi.entry_id = e.id) AS idioms,
    (SELECT json_agg(
       json_build_object(
         'id', col.id, 'sense_id', col.sense_id, 'collocation', col.collocation,
         'pattern', col.pattern, 'example_en', col.example_en, 'example_vi', col.example_vi,
         'frequency', col.frequency
       )
     ) FROM collocations col WHERE col.entry_id = e.id) AS collocations,
    (SELECT json_agg(t.name ORDER BY t.name)
     FROM entry_tags et JOIN tags t ON t.id = et.tag_id
     WHERE et.entry_id = e.id) AS tags,
    (SELECT json_build_object(
       'family_root', wf.family_root,
       'members', (SELECT json_agg(
          json_build_object('entry_id', m.entry_id, 'headword', de.headword, 'relation', m.relation)
        ) FROM word_family_members m
          JOIN dictionary_entries de ON de.id = m.entry_id
          WHERE m.family_id = wf.id AND m.entry_id != e.id)
     )
     FROM word_family_members wfm
     JOIN word_families wf ON wf.id = wfm.family_id
     WHERE wfm.entry_id = e.id
     LIMIT 1) AS word_family
  FROM dictionary_entries e
`;

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/v1/ebooks/reading-stats — MUST be before /:id
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/reading-stats',
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;

    const [timeRows, booksRows, lookupRows, topBooksRows, topWordsRows, streakRows] =
      await Promise.all([
        // Total reading time
        pool.query<{ total_time_minutes: number }>(
          `SELECT COALESCE(SUM(total_time_sec), 0)::float / 60 AS total_time_minutes
           FROM user_reading_progress WHERE user_id = $1`,
          [userId]
        ),
        // Finished vs in-progress
        pool.query<{ books_finished: number; books_in_progress: number }>(
          `SELECT
             COUNT(*) FILTER (WHERE progress >= 1)::int        AS books_finished,
             COUNT(*) FILTER (WHERE progress > 0 AND progress < 1)::int AS books_in_progress
           FROM user_reading_progress WHERE user_id = $1`,
          [userId]
        ),
        // Total word lookups
        pool.query<{ words_looked_up: number }>(
          `SELECT COUNT(*)::int AS words_looked_up
           FROM word_lookups WHERE user_id = $1 AND source = 'ebook'`,
          [userId]
        ),
        // Top 5 books by time spent
        pool.query(
          `SELECT e.id AS ebook_id, e.title, e.cover_url,
                  urp.progress, urp.total_time_sec
           FROM user_reading_progress urp
           JOIN ebooks e ON e.id = urp.ebook_id
           WHERE urp.user_id = $1 AND urp.total_time_sec > 0
           ORDER BY urp.total_time_sec DESC
           LIMIT 5`,
          [userId]
        ),
        // Top 5 most looked-up words
        pool.query(
          `SELECT de.headword, COUNT(*)::int AS lookup_count
           FROM word_lookups wl
           JOIN dictionary_entries de ON de.id = wl.entry_id
           WHERE wl.user_id = $1 AND wl.source = 'ebook'
           GROUP BY de.headword
           ORDER BY lookup_count DESC
           LIMIT 5`,
          [userId]
        ),
        // Reading streak (distinct active days)
        pool.query<{ days_streak: number }>(
          `SELECT COUNT(DISTINCT DATE(last_read_at))::int AS days_streak
           FROM user_reading_progress
           WHERE user_id = $1 AND last_read_at >= NOW() - INTERVAL '30 days'`,
          [userId]
        ),
      ]);

    return apiSuccess(res, {
      total_time_minutes: Math.round(timeRows.rows[0]?.total_time_minutes ?? 0),
      books_finished: booksRows.rows[0]?.books_finished ?? 0,
      books_in_progress: booksRows.rows[0]?.books_in_progress ?? 0,
      words_looked_up: lookupRows.rows[0]?.words_looked_up ?? 0,
      top_books: topBooksRows.rows.map((r: any) => ({
        ebook_id: r.ebook_id,
        title: r.title,
        cover_url: r.cover_url ?? null,
        progress: r.progress,
        total_time_sec: r.total_time_sec,
      })),
      top_looked_up_words: topWordsRows.rows.map((r: any) => ({
        headword: r.headword,
        lookup_count: r.lookup_count,
      })),
      days_streak: streakRows.rows[0]?.days_streak ?? 0,
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/v1/ebooks — list published ebooks
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/',
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;
    const { page, limit, offset } = parsePagination(req);

    const genre = req.query.genre ? String(req.query.genre) : null;
    const level = req.query.level ? String(req.query.level) : null;

    const params: unknown[] = [userId];
    const conditions: string[] = ["e.status = 'published'"];

    if (genre) {
      params.push(genre);
      conditions.push(`$${params.length} = ANY(e.genre)`);
    }
    if (level) {
      params.push(level);
      conditions.push(`e.level = $${params.length}`);
    }

    const where = conditions.join(' AND ');
    params.push(limit, offset);
    const limitIdx = params.length - 1;
    const offsetIdx = params.length;

    const [dataRows, countRows] = await Promise.all([
      pool.query(
        `SELECT e.id, e.title, e.author, e.cover_url, e.level, e.required_plan,
                e.total_chapters, e.total_words,
                COALESCE(urp.progress, 0)                            AS progress,
                urp.current_paragraph_index,
                (f.user_id IS NOT NULL)                              AS is_favorite
         FROM ebooks e
         LEFT JOIN user_reading_progress urp
               ON urp.ebook_id = e.id AND urp.user_id = $1
         LEFT JOIN user_ebook_favorites f
               ON f.ebook_id = e.id AND f.user_id = $1
         WHERE ${where}
         ORDER BY e.sort_order ASC NULLS LAST, e.created_at DESC
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        params
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total
         FROM ebooks e
         WHERE ${where}`,
        params.slice(0, params.length - 2)
      ),
    ]);

    return apiSuccess(res, {
      items: dataRows.rows.map((r: any) => ({
        id: r.id,
        title: r.title,
        author: r.author,
        cover_url: r.cover_url ?? null,
        level: r.level,
        required_plan: r.required_plan,
        total_chapters: r.total_chapters,
        total_words: r.total_words,
        progress: r.progress,
        is_favorite: r.is_favorite,
      })),
      total: countRows.rows[0]?.total ?? 0,
      page,
      limit,
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/v1/ebooks/:id — ebook detail + chapters + lock status
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/:id',
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;
    const ebookId = req.params.id;

    const [ebookRows, chaptersRows, progressRows, favoriteRows] = await Promise.all([
      pool.query(
        `SELECT id, title, author, isbn, description, cover_url, epub_file_url,
                level, genre, total_chapters, total_words, required_plan,
                tts_voice, tts_speed, status, created_at
         FROM ebooks WHERE id = $1 AND status = 'published'`,
        [ebookId]
      ),
      pool.query(
        `SELECT id, chapter_index, title, word_count, has_tts
         FROM chapters WHERE ebook_id = $1 ORDER BY chapter_index ASC`,
        [ebookId]
      ),
      pool.query(
        `SELECT progress, current_paragraph_index, total_time_sec, last_read_at
         FROM user_reading_progress WHERE ebook_id = $1 AND user_id = $2`,
        [ebookId, userId]
      ),
      pool.query(
        `SELECT 1 FROM user_ebook_favorites WHERE ebook_id = $1 AND user_id = $2`,
        [ebookId, userId]
      ),
    ]);

    if (ebookRows.rows.length === 0) {
      return apiError(res, 404, 'NOT_FOUND', 'Ebook không tồn tại');
    }

    const ebook = ebookRows.rows[0];
    const requiredTier = PLAN_TIER[ebook.required_plan] ?? 0;
    const userTier = await getUserPlanTier(userId);
    const locked = userTier < requiredTier;

    const chapters = chaptersRows.rows.map((c: any) => ({
      id: c.id,
      chapter_index: c.chapter_index,
      title: c.title,
      word_count: c.word_count,
      has_tts: c.has_tts,
    }));

    const progress = progressRows.rows[0] ?? null;
    const is_favorite = favoriteRows.rows.length > 0;

    const payload: Record<string, unknown> = {
      id: ebook.id,
      title: ebook.title,
      author: ebook.author,
      isbn: ebook.isbn ?? null,
      description: ebook.description ?? null,
      cover_url: ebook.cover_url ?? null,
      level: ebook.level,
      genre: ebook.genre ?? [],
      total_chapters: ebook.total_chapters,
      total_words: ebook.total_words,
      required_plan: ebook.required_plan,
      tts_voice: ebook.tts_voice ?? null,
      tts_speed: ebook.tts_speed,
      created_at: ebook.created_at,
      chapters,
      progress: progress
        ? {
            progress: progress.progress,
            current_paragraph_index: progress.current_paragraph_index ?? 0,
            total_time_sec: progress.total_time_sec,
            last_read_at: progress.last_read_at,
          }
        : null,
      is_favorite,
    };

    if (locked) {
      payload.locked = true;
      payload.locked_reason = 'UPGRADE_REQUIRED';
      const firstChapter = chapters.find((c: any) => c.chapter_index === 0);
      payload.preview_chapter_ids = firstChapter ? [firstChapter.id] : [];
    }

    return apiSuccess(res, payload);
  })
);

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/v1/ebooks/:id/chapters/:chapter_id
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/:id/chapters/:chapter_id',
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;
    const { id: ebookId, chapter_id: chapterId } = req.params;
    const includeTranslations = req.query.include_translations === 'true';

    // Fetch ebook + chapter in parallel
    const [ebookRows, chapterRows] = await Promise.all([
      pool.query(
        `SELECT id, required_plan, status FROM ebooks WHERE id = $1`,
        [ebookId]
      ),
      pool.query(
        `SELECT id, chapter_index, title, word_count, has_tts
         FROM chapters WHERE id = $1 AND ebook_id = $2`,
        [chapterId, ebookId]
      ),
    ]);

    if (ebookRows.rows.length === 0 || ebookRows.rows[0].status !== 'published') {
      return apiError(res, 404, 'NOT_FOUND', 'Ebook không tồn tại');
    }
    if (chapterRows.rows.length === 0) {
      return apiError(res, 404, 'NOT_FOUND', 'Chapter không tồn tại');
    }

    const ebook = ebookRows.rows[0];
    const chapter = chapterRows.rows[0];

    // Access check: non-free ebook → only chapter_index 0 is free preview
    const requiredTier = PLAN_TIER[ebook.required_plan] ?? 0;
    const userTier = await getUserPlanTier(userId);

    if (userTier < requiredTier && chapter.chapter_index > 0) {
      return apiError(
        res, 403, 'FEATURE_NOT_AVAILABLE',
        'Upgrade required to read this chapter'
      );
    }

    // Paragraphs + progress
    const paragraphCols = includeTranslations
      ? 'id, paragraph_index, text, word_count, translation_vi, audio_url, duration_ms'
      : 'id, paragraph_index, text, word_count, audio_url, duration_ms';

    const [paragraphRows, progressRows] = await Promise.all([
      pool.query(
        `SELECT ${paragraphCols}
         FROM paragraphs WHERE chapter_id = $1
         ORDER BY paragraph_index ASC`,
        [chapterId]
      ),
      pool.query(
        `SELECT current_paragraph_index
         FROM user_reading_progress WHERE ebook_id = $1 AND user_id = $2`,
        [ebookId, userId]
      ),
    ]);

    // Update last_read_at (fire-and-forget)
    void pool.query(
      `INSERT INTO user_reading_progress (user_id, ebook_id, last_read_at, started_at)
       VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT (user_id, ebook_id) DO UPDATE SET last_read_at = NOW()`,
      [userId, ebookId]
    ).catch((err) => console.error('[ebooks] last_read_at update failed:', err));

    return apiSuccess(res, {
      chapter: {
        id: chapter.id,
        index: chapter.chapter_index,
        title: chapter.title,
        word_count: chapter.word_count,
        has_tts: chapter.has_tts,
      },
      paragraphs: paragraphRows.rows.map((p: any) => ({
        id: p.id,
        index: p.paragraph_index,
        text: p.text,
        word_count: p.word_count,
        ...(includeTranslations ? { translation_vi: p.translation_vi ?? null } : {}),
        audio_url: p.audio_url ?? null,
        duration_ms: p.duration_ms ?? null,
      })),
      progress: {
        current_paragraph_index: progressRows.rows[0]?.current_paragraph_index ?? 0,
      },
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/v1/ebooks/:id/chapters/:chapter_id/progress
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/:id/chapters/:chapter_id/progress',
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;
    const { id: ebookId, chapter_id: chapterId } = req.params;
    const { current_paragraph_index, time_spent_sec } = req.body as {
      current_paragraph_index: number;
      time_spent_sec?: number;
    };

    if (typeof current_paragraph_index !== 'number' || current_paragraph_index < 0) {
      return apiError(res, 400, 'VALIDATION_ERROR', 'current_paragraph_index phải là số nguyên >= 0');
    }

    // Verify chapter belongs to ebook
    const { rows: chRows } = await pool.query(
      `SELECT chapter_index FROM chapters WHERE id = $1 AND ebook_id = $2`,
      [chapterId, ebookId]
    );
    if (chRows.length === 0) {
      return apiError(res, 404, 'NOT_FOUND', 'Chapter không tồn tại');
    }

    // Get total paragraphs to compute progress ratio
    const [totalParaRows, totalChapRows] = await Promise.all([
      pool.query<{ cnt: number }>(
        `SELECT COUNT(*)::int AS cnt FROM paragraphs WHERE chapter_id = $1`,
        [chapterId]
      ),
      pool.query<{ cnt: number }>(
        `SELECT COUNT(*)::int AS cnt FROM chapters WHERE ebook_id = $1`,
        [ebookId]
      ),
    ]);

    const totalParagraphs = totalParaRows.rows[0]?.cnt ?? 1;
    const totalChapters = totalChapRows.rows[0]?.cnt ?? 1;
    const chapterIndex = chRows[0].chapter_index as number;

    // Progress = (completed chapters + fractional current chapter) / total chapters
    const paraFraction = Math.min(1, (current_paragraph_index + 1) / totalParagraphs);
    const progress = Math.min(1, (chapterIndex + paraFraction) / totalChapters);

    await pool.query(
      `INSERT INTO user_reading_progress
         (user_id, ebook_id, current_chapter, current_paragraph_index, progress,
          total_time_sec, last_read_at, started_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       ON CONFLICT (user_id, ebook_id) DO UPDATE SET
         current_chapter          = EXCLUDED.current_chapter,
         current_paragraph_index  = EXCLUDED.current_paragraph_index,
         progress                 = GREATEST(user_reading_progress.progress, EXCLUDED.progress),
         total_time_sec           = user_reading_progress.total_time_sec + $6,
         last_read_at             = NOW()`,
      [userId, ebookId, chapterIndex, current_paragraph_index, progress, time_spent_sec ?? 0]
    );

    return res.status(204).send();
  })
);

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/v1/ebooks/:id/lookup
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/:id/lookup',
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;
    const ebookId = req.params.id;
    const { word, paragraph_id } = req.body as { word: string; paragraph_id?: string };

    if (!word || typeof word !== 'string' || word.trim().length === 0) {
      return apiError(res, 400, 'VALIDATION_ERROR', 'word là bắt buộc');
    }

    const cleanWord = word.trim().toLowerCase();

    // Exact headword match first, then lemma match
    const { rows } = await pool.query(
      `${FULL_ENTRY_SQL}
       WHERE e.published = TRUE
         AND (LOWER(e.headword) = $1 OR LOWER(e.lemma) = $1)
       ORDER BY
         CASE WHEN LOWER(e.headword) = $1 THEN 0 ELSE 1 END
       LIMIT 1`,
      [cleanWord]
    );

    if (rows.length === 0) {
      return apiError(res, 404, 'ENTRY_NOT_FOUND', `Không tìm thấy từ "${word}" trong từ điển`);
    }

    const entry = rows[0];

    // Verify paragraph belongs to this ebook (optional validation)
    let verifiedParagraphId: string | null = null;
    if (paragraph_id) {
      const { rows: pRows } = await pool.query(
        `SELECT p.id FROM paragraphs p
         JOIN chapters c ON c.id = p.chapter_id
         WHERE p.id = $1 AND c.ebook_id = $2`,
        [paragraph_id, ebookId]
      );
      verifiedParagraphId = pRows.length > 0 ? paragraph_id : null;
    }

    // Fire-and-forget lookup log
    void pool.query(
      `INSERT INTO word_lookups (user_id, entry_id, source, ebook_id)
       VALUES ($1, $2, 'ebook', $3)`,
      [userId, entry.id, ebookId]
    ).catch((err) => console.error('[ebooks] word_lookups insert failed:', err));

    // Update words_looked_up counter
    void pool.query(
      `INSERT INTO user_reading_progress (user_id, ebook_id, words_looked_up, started_at)
       VALUES ($1, $2, 1, NOW())
       ON CONFLICT (user_id, ebook_id) DO UPDATE SET
         words_looked_up = user_reading_progress.words_looked_up + 1`,
      [userId, ebookId]
    ).catch((err) => console.error('[ebooks] words_looked_up update failed:', err));

    return apiSuccess(res, { entry, paragraph_id: verifiedParagraphId });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/v1/ebooks/:id/translate-paragraph
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/:id/translate-paragraph',
  requireFeature('translation_daily'),
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const ebookId = req.params.id;
    const { paragraph_id } = req.body as { paragraph_id: string };

    if (!paragraph_id || typeof paragraph_id !== 'string') {
      return apiError(res, 400, 'VALIDATION_ERROR', 'paragraph_id là bắt buộc');
    }

    // Verify paragraph belongs to ebook
    const { rows: pRows } = await pool.query(
      `SELECT p.id, p.text, p.translation_vi
       FROM paragraphs p
       JOIN chapters c ON c.id = p.chapter_id
       WHERE p.id = $1 AND c.ebook_id = $2`,
      [paragraph_id, ebookId]
    );

    if (pRows.length === 0) {
      return apiError(res, 404, 'NOT_FOUND', 'Paragraph không tồn tại trong ebook này');
    }

    const para = pRows[0];

    // Precomputed translation already in the row
    if (para.translation_vi) {
      return apiSuccess(res, { translation_vi: para.translation_vi, source: 'precomputed' });
    }

    // Translate via service (checks translation_cache, then Google API)
    const result = await translateText(para.text);

    if (!result.translated_text) {
      return apiSuccess(res, { translation_vi: null, source: 'unavailable' });
    }

    // Persist fresh translation back to paragraph
    if (result.source === 'fresh') {
      void pool.query(
        `UPDATE paragraphs SET translation_vi = $1 WHERE id = $2`,
        [result.translated_text, paragraph_id]
      ).catch((err) => console.error('[ebooks] paragraph translation_vi update failed:', err));
    }

    return apiSuccess(res, { translation_vi: result.translated_text, source: result.source });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/v1/ebooks/:id/favorite
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/:id/favorite',
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;
    const ebookId = req.params.id;

    const { rows } = await pool.query(
      `SELECT 1 FROM ebooks WHERE id = $1 AND status = 'published'`,
      [ebookId]
    );
    if (rows.length === 0) {
      return apiError(res, 404, 'NOT_FOUND', 'Ebook không tồn tại');
    }

    await pool.query(
      `INSERT INTO user_ebook_favorites (user_id, ebook_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, ebookId]
    );

    return res.status(201).json({ success: true });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
//  DELETE /api/v1/ebooks/:id/favorite
// ─────────────────────────────────────────────────────────────────────────────
router.delete(
  '/:id/favorite',
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;
    const ebookId = req.params.id;

    await pool.query(
      `DELETE FROM user_ebook_favorites WHERE user_id = $1 AND ebook_id = $2`,
      [userId, ebookId]
    );

    return res.status(204).send();
  })
);

export default router;
