import { Router, Request, Response } from 'express';
import pool from '../../config/db';
import {
  requireApiAuth,
  optionalApiAuth,
  ApiRequest,
} from '../../middlewares/apiAuth';
import { asyncHandler } from '../../utils/asyncHandler';
import { apiSuccess, apiError } from '../../utils/apiResponse';
import { parsePagination } from '../../utils/pagination';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────

const meaningPreview = (meaningVi: string | null): string | null => {
  if (!meaningVi) return null;
  const firstLine = meaningVi.split('\n')[0].trim();
  return firstLine.length > 200 ? firstLine.slice(0, 200) + '…' : firstLine;
};

const logSlow = (label: string, startMs: number, threshold = 200) => {
  const elapsed = Date.now() - startMs;
  if (elapsed > threshold) {
    console.warn(`[dict] ${label} took ${elapsed}ms (>${threshold}ms)`);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/v1/dictionary/search
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/search',
  asyncHandler(async (req: Request, res: Response) => {
    const q = String(req.query.q ?? '').trim();
    if (q.length < 1) {
      return apiError(res, 400, 'VALIDATION_ERROR', 'Tham số q là bắt buộc (min 1 ký tự)');
    }

    const { page, limit, offset } = parsePagination(req);
    const posFilter = req.query.pos
      ? String(req.query.pos)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const cefr = req.query.cefr ? String(req.query.cefr).toUpperCase() : null;

    const t0 = Date.now();
    const params: any[] = [q];
    let posClause = '';
    if (posFilter.length > 0) {
      params.push(posFilter);
      posClause = `AND pos && $${params.length}::varchar[]`;
    }
    let cefrClause = '';
    if (cefr) {
      params.push(cefr);
      cefrClause = `AND cefr_level = $${params.length}`;
    }
    params.push(limit, offset);

    const dataQuery = `
      SELECT id, headword, lemma, ipa_us, pos, meaning_vi, cefr_level, frequency_rank
      FROM dictionary_entries
      WHERE published = TRUE
        AND (headword ILIKE '%' || $1 || '%' OR lemma ILIKE '%' || $1 || '%')
        ${posClause}
        ${cefrClause}
      ORDER BY
        CASE
          WHEN LOWER(headword) = LOWER($1) THEN 0
          WHEN headword ILIKE $1 || '%' THEN 1
          ELSE 2
        END,
        frequency_rank ASC NULLS LAST,
        headword ASC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;
    const countQuery = `
      SELECT COUNT(*)::int AS count
      FROM dictionary_entries
      WHERE published = TRUE
        AND (headword ILIKE '%' || $1 || '%' OR lemma ILIKE '%' || $1 || '%')
        ${posClause}
        ${cefrClause}
    `;
    const countParams = params.slice(0, params.length - 2);

    const [data, count] = await Promise.all([
      pool.query(dataQuery, params),
      pool.query(countQuery, countParams),
    ]);

    logSlow('search', t0, 100);

    res.set('Cache-Control', 'public, max-age=3600');
    return apiSuccess(res, {
      items: data.rows.map((r: any) => ({
        id: r.id,
        headword: r.headword,
        lemma: r.lemma,
        ipa_us: r.ipa_us,
        pos: r.pos,
        meaning_preview: meaningPreview(r.meaning_vi),
        cefr_level: r.cefr_level,
        frequency_rank: r.frequency_rank,
      })),
      meta: {
        total: count.rows[0].count,
        page,
        limit,
      },
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/v1/dictionary/trending
//  In-memory cache TTL 1h. Bypass khi NODE_ENV=test.
// ─────────────────────────────────────────────────────────────────────────────
interface TrendingCache {
  data: unknown;
  expires: number;
}
let trendingCache: TrendingCache | null = null;
const TRENDING_TTL_MS = 60 * 60 * 1000;

router.get(
  '/trending',
  asyncHandler(async (_req: Request, res: Response) => {
    const bypassCache = process.env.NODE_ENV === 'test';
    if (!bypassCache && trendingCache && trendingCache.expires > Date.now()) {
      return apiSuccess(res, trendingCache.data);
    }

    const { rows } = await pool.query(
      `SELECT e.id, e.headword, e.ipa_us, e.meaning_vi,
              COUNT(*)::int AS lookup_count
       FROM word_lookups wl
       JOIN dictionary_entries e ON e.id = wl.entry_id
       WHERE wl.created_at >= NOW() - INTERVAL '7 days'
         AND e.published = TRUE
       GROUP BY e.id, e.headword, e.ipa_us, e.meaning_vi
       ORDER BY lookup_count DESC, e.headword ASC
       LIMIT 20`
    );

    const payload = rows.map((r: any) => ({
      id: r.id,
      headword: r.headword,
      ipa_us: r.ipa_us,
      meaning_preview: meaningPreview(r.meaning_vi),
      lookup_count: r.lookup_count,
    }));

    if (!bypassCache) {
      trendingCache = { data: payload, expires: Date.now() + TRENDING_TTL_MS };
    }
    res.set('Cache-Control', 'public, max-age=3600');
    return apiSuccess(res, payload);
  })
);

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/v1/dictionary/categories  — list tags + entry count
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/categories',
  asyncHandler(async (_req: Request, res: Response) => {
    const { rows } = await pool.query(
      `SELECT t.id AS tag_id, t.name, COUNT(et.entry_id)::int AS entry_count
       FROM tags t
       LEFT JOIN entry_tags et ON et.tag_id = t.id
       GROUP BY t.id, t.name
       ORDER BY t.name ASC`
    );
    res.set('Cache-Control', 'public, max-age=3600');
    return apiSuccess(res, rows);
  })
);

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/v1/dictionary/categories/:tag_id/entries
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/categories/:tag_id/entries',
  asyncHandler(async (req: Request, res: Response) => {
    const tagId = req.params.tag_id;
    const { page, limit, offset } = parsePagination(req);

    const [data, count] = await Promise.all([
      pool.query(
        `SELECT e.id, e.headword, e.lemma, e.ipa_us, e.pos, e.meaning_vi,
                e.cefr_level, e.frequency_rank
         FROM dictionary_entries e
         JOIN entry_tags et ON et.entry_id = e.id
         WHERE et.tag_id = $1 AND e.published = TRUE
         ORDER BY e.frequency_rank ASC NULLS LAST, e.headword ASC
         LIMIT $2 OFFSET $3`,
        [tagId, limit, offset]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS count
         FROM entry_tags et
         JOIN dictionary_entries e ON e.id = et.entry_id
         WHERE et.tag_id = $1 AND e.published = TRUE`,
        [tagId]
      ),
    ]);

    return apiSuccess(res, {
      items: data.rows.map((r: any) => ({
        id: r.id,
        headword: r.headword,
        lemma: r.lemma,
        ipa_us: r.ipa_us,
        pos: r.pos,
        meaning_preview: meaningPreview(r.meaning_vi),
        cefr_level: r.cefr_level,
        frequency_rank: r.frequency_rank,
      })),
      meta: {
        total: count.rows[0].count,
        page,
        limit,
      },
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
//  Full entry SQL — scalar subquery + json_agg (tránh N+1 JOIN GROUP BY).
// ─────────────────────────────────────────────────────────────────────────────
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
    (SELECT json_agg(
       json_build_object('id', d.id, 'headword', d.headword)
     )
     FROM entry_synonyms es JOIN dictionary_entries d ON d.id = es.synonym_id
     WHERE es.entry_id = e.id) AS legacy_synonyms,
    (SELECT json_agg(
       json_build_object('id', d.id, 'headword', d.headword)
     )
     FROM entry_antonyms ea JOIN dictionary_entries d ON d.id = ea.antonym_id
     WHERE ea.entry_id = e.id) AS legacy_antonyms,
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

const fireAndForgetLookup = (
  userId: string,
  entryId: string,
  source: 'ebook' | 'flashcard' | 'manual_search',
  ebookId: string | null
): void => {
  void pool
    .query(
      `INSERT INTO word_lookups (user_id, entry_id, source, ebook_id)
       VALUES ($1, $2, $3, $4)`,
      [userId, entryId, source, ebookId]
    )
    .catch((err) => console.error('[dict] word_lookups insert failed:', err));
};

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/v1/dictionary/entries/:id
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/entries/:id',
  optionalApiAuth,
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const t0 = Date.now();
    const { rows } = await pool.query(`${FULL_ENTRY_SQL} WHERE e.id = $1`, [req.params.id]);
    logSlow(`entry/${req.params.id}`, t0);

    if (rows.length === 0) {
      return apiError(res, 404, 'ENTRY_NOT_FOUND', 'Không tìm thấy từ');
    }

    const entry = rows[0];
    if (req.user) {
      const source = (req.query.source as string) === 'ebook' ? 'ebook' : 'manual_search';
      const ebookId = source === 'ebook' ? ((req.query.ebook_id as string) ?? null) : null;
      fireAndForgetLookup(req.user.id, entry.id, source, ebookId);
    }

    return apiSuccess(res, entry);
  })
);

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/v1/dictionary/entries/by-headword/:headword
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/entries/by-headword/:headword',
  optionalApiAuth,
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const t0 = Date.now();
    const { rows } = await pool.query(
      `${FULL_ENTRY_SQL} WHERE LOWER(e.headword) = LOWER($1) AND e.published = TRUE LIMIT 1`,
      [req.params.headword]
    );
    logSlow(`entry-by-headword/${req.params.headword}`, t0);

    if (rows.length === 0) {
      return apiError(res, 404, 'ENTRY_NOT_FOUND', 'Không tìm thấy từ');
    }

    const entry = rows[0];
    if (req.user) {
      const source = (req.query.source as string) === 'ebook' ? 'ebook' : 'manual_search';
      const ebookId = source === 'ebook' ? ((req.query.ebook_id as string) ?? null) : null;
      fireAndForgetLookup(req.user.id, entry.id, source, ebookId);
    }

    return apiSuccess(res, entry);
  })
);

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/v1/dictionary/entries/:id/bookmark
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/entries/:id/bookmark',
  requireApiAuth,
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const { rows } = await pool.query(
      `INSERT INTO user_saved_words (user_id, entry_id, note)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, entry_id) DO UPDATE SET note = EXCLUDED.note
       RETURNING id`,
      [req.user!.id, req.params.id, req.body?.note ?? null]
    );
    res.status(201).json({
      success: true,
      data: { saved: true, saved_word_id: rows[0].id },
      message: 'Đã lưu từ vào danh sách',
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
//  DELETE /api/v1/dictionary/entries/:id/bookmark
// ─────────────────────────────────────────────────────────────────────────────
router.delete(
  '/entries/:id/bookmark',
  requireApiAuth,
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const result = await pool.query(
      `DELETE FROM user_saved_words WHERE user_id = $1 AND entry_id = $2`,
      [req.user!.id, req.params.id]
    );
    if (result.rowCount === 0) {
      return apiError(res, 404, 'BOOKMARK_NOT_FOUND', 'Từ chưa được lưu');
    }
    return apiSuccess(res, { saved: false });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/v1/dictionary/saved-words
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/saved-words',
  requireApiAuth,
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;
    const { page, limit, offset } = parsePagination(req);

    const mastery = req.query.mastery_level ? String(req.query.mastery_level) : null;
    const cefr = req.query.cefr ? String(req.query.cefr).toUpperCase() : null;
    const pos = req.query.pos
      ? String(req.query.pos)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    const params: any[] = [userId];
    let clauses = '';
    if (mastery) {
      params.push(mastery);
      clauses += ` AND sw.mastery_level = $${params.length}`;
    }
    if (cefr) {
      params.push(cefr);
      clauses += ` AND e.cefr_level = $${params.length}`;
    }
    if (pos.length > 0) {
      params.push(pos);
      clauses += ` AND e.pos && $${params.length}::varchar[]`;
    }

    const itemsParams = [...params, limit, offset];
    const [itemsRes, countRes, statsRes] = await Promise.all([
      pool.query(
        `SELECT sw.id AS saved_word_id, sw.mastery_level, sw.note, sw.created_at AS saved_at,
                e.id, e.headword, e.lemma, e.ipa_us, e.pos, e.meaning_vi,
                e.cefr_level, e.frequency_rank
         FROM user_saved_words sw
         JOIN dictionary_entries e ON e.id = sw.entry_id
         WHERE sw.user_id = $1 ${clauses}
         ORDER BY sw.created_at DESC
         LIMIT $${itemsParams.length - 1} OFFSET $${itemsParams.length}`,
        itemsParams
      ),
      pool.query(
        `SELECT COUNT(*)::int AS count
         FROM user_saved_words sw
         JOIN dictionary_entries e ON e.id = sw.entry_id
         WHERE sw.user_id = $1 ${clauses}`,
        params
      ),
      // Stats agg: 1 query trả tất cả counters.
      pool.query(
        `SELECT
           COUNT(*)::int AS total_saved,
           COUNT(*) FILTER (WHERE sw.created_at >= NOW() - INTERVAL '7 days')::int AS saved_this_week,
           COUNT(*) FILTER (WHERE e.cefr_level = 'A1')::int AS a1,
           COUNT(*) FILTER (WHERE e.cefr_level = 'A2')::int AS a2,
           COUNT(*) FILTER (WHERE e.cefr_level = 'B1')::int AS b1,
           COUNT(*) FILTER (WHERE e.cefr_level = 'B2')::int AS b2,
           COUNT(*) FILTER (WHERE e.cefr_level = 'C1')::int AS c1,
           COUNT(*) FILTER (WHERE e.cefr_level = 'C2')::int AS c2
         FROM user_saved_words sw
         JOIN dictionary_entries e ON e.id = sw.entry_id
         WHERE sw.user_id = $1`,
        [userId]
      ),
    ]);

    const s = statsRes.rows[0];
    return apiSuccess(res, {
      stats: {
        total_saved: s.total_saved,
        saved_this_week: s.saved_this_week,
        level_progress: {
          A1: s.a1,
          A2: s.a2,
          B1: s.b1,
          B2: s.b2,
          C1: s.c1,
          C2: s.c2,
        },
      },
      items: itemsRes.rows.map((r: any) => ({
        saved_word_id: r.saved_word_id,
        saved_at: r.saved_at,
        mastery_level: r.mastery_level,
        note: r.note,
        id: r.id,
        headword: r.headword,
        lemma: r.lemma,
        ipa_us: r.ipa_us,
        pos: r.pos,
        meaning_preview: meaningPreview(r.meaning_vi),
        cefr_level: r.cefr_level,
        frequency_rank: r.frequency_rank,
      })),
      meta: {
        total: countRes.rows[0].count,
        page,
        limit,
      },
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/v1/dictionary/lookup-history
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/lookup-history',
  requireApiAuth,
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;
    const { page, limit, offset } = parsePagination(req);

    const source = req.query.source ? String(req.query.source) : null;
    const ebookId = req.query.ebook_id ? String(req.query.ebook_id) : null;

    const params: any[] = [userId];
    let clauses = '';
    if (source) {
      params.push(source);
      clauses += ` AND wl.source = $${params.length}`;
    }
    if (ebookId) {
      params.push(ebookId);
      clauses += ` AND wl.ebook_id = $${params.length}`;
    }

    const itemsParams = [...params, limit, offset];
    const [itemsRes, countRes] = await Promise.all([
      pool.query(
        `SELECT wl.id AS lookup_id, wl.source, wl.ebook_id, wl.created_at,
                e.id AS entry_id, e.headword, e.ipa_us, e.meaning_vi
         FROM word_lookups wl
         JOIN dictionary_entries e ON e.id = wl.entry_id
         WHERE wl.user_id = $1 ${clauses}
         ORDER BY wl.created_at DESC
         LIMIT $${itemsParams.length - 1} OFFSET $${itemsParams.length}`,
        itemsParams
      ),
      pool.query(
        `SELECT COUNT(*)::int AS count
         FROM word_lookups wl
         WHERE wl.user_id = $1 ${clauses}`,
        params
      ),
    ]);

    // Group theo ngày (UTC) trên server.
    const groups = new Map<string, any[]>();
    for (const r of itemsRes.rows) {
      const day = new Date(r.created_at).toISOString().slice(0, 10);
      const item = {
        lookup_id: r.lookup_id,
        source: r.source,
        ebook_id: r.ebook_id,
        looked_up_at: r.created_at,
        entry_id: r.entry_id,
        headword: r.headword,
        ipa_us: r.ipa_us,
        meaning_preview: meaningPreview(r.meaning_vi),
      };
      const arr = groups.get(day) ?? [];
      arr.push(item);
      groups.set(day, arr);
    }
    const groupedItems = Array.from(groups.entries()).map(([date, items]) => ({
      date,
      items,
    }));

    return apiSuccess(res, {
      items: groupedItems,
      meta: {
        total: countRes.rows[0].count,
        page,
        limit,
      },
    });
  })
);

export default router;
