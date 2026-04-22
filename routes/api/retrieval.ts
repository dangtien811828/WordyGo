import { Router, Response } from 'express';
import pool from '../../config/db';
import { ApiRequest } from '../../middlewares/apiAuth';
import { requireFeature } from '../../middlewares/requireFeature';
import { asyncHandler } from '../../utils/asyncHandler';
import { apiSuccess, apiError } from '../../utils/apiResponse';
import { addToBox1IfNotExists } from '../../utils/leitnerManager';
import { moderateInput, gradeSentences } from '../../services/openaiService';

const router = Router();

function handleOpenAIError(res: Response, err: any): Response {
  if (err.message?.includes('OPENAI_API_KEY')) {
    return apiError(res, 503, 'SERVICE_UNAVAILABLE',
      'AI grading service is not configured. Please contact admin.');
  }
  if (err.constructor?.name === 'APIConnectionTimeoutError' || err.code === 'ETIMEDOUT') {
    return apiError(res, 504, 'GPT_TIMEOUT',
      'AI grading timed out. Please try again.');
  }
  if (err.status === 429) {
    return apiError(res, 429, 'GPT_RATE_LIMITED',
      'AI service is busy. Please try again in a minute.');
  }
  throw err;
}

// First Vietnamese definition — Pro sense first, legacy meaning_vi fallback
const VI_PREVIEW = `COALESCE(
  (SELECT es.definition_vi FROM entry_senses es
   WHERE es.entry_id = de.id AND es.definition_vi IS NOT NULL
   ORDER BY es.sense_order ASC LIMIT 1),
  NULLIF(SPLIT_PART(COALESCE(de.meaning_vi, ''), E'\\n', 1), '')
)`;

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/v1/retrieval/start
//  Returns 3 target words: leitner due → deck cards → dict fallback
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/start',
  requireFeature('retrieval_practice_daily'),
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;
    const needed = 3;

    // Priority 1: leitner cards due today
    const { rows: leitnerRows } = await pool.query(
      `SELECT lc.entry_id, de.headword, de.pos, de.ipa_us AS ipa,
              de.audio_us_url AS audio_url,
              ${VI_PREVIEW} AS meaning_vi
       FROM leitner_cards lc
       JOIN dictionary_entries de ON de.id = lc.entry_id
       WHERE lc.user_id = $1 AND lc.due_at <= NOW()
       ORDER BY RANDOM()
       LIMIT $2`,
      [userId, needed]
    );

    let words: any[] = [...leitnerRows];

    // Priority 2: cards from published decks
    if (words.length < needed) {
      const excludeIds = words.map((w: any) => w.entry_id);
      const { rows: deckRows } = await pool.query(
        `SELECT DISTINCT ON (c.entry_id)
                c.entry_id, de.headword, de.pos, de.ipa_us AS ipa,
                de.audio_us_url AS audio_url,
                ${VI_PREVIEW} AS meaning_vi
         FROM cards c
         JOIN dictionary_entries de ON de.id = c.entry_id
         JOIN decks d ON d.id = c.deck_id
         WHERE d.status = 'published'
           AND NOT (c.entry_id = ANY($2::uuid[]))
         ORDER BY c.entry_id, RANDOM()
         LIMIT $1`,
        [needed - words.length, excludeIds]
      );
      words = [...words, ...deckRows];
    }

    // Priority 3: common dictionary entries (A2–B2 level)
    if (words.length < needed) {
      const excludeIds = words.map((w: any) => w.entry_id);
      const { rows: dictRows } = await pool.query(
        `SELECT de.id AS entry_id, de.headword, de.pos, de.ipa_us AS ipa,
                de.audio_us_url AS audio_url,
                ${VI_PREVIEW} AS meaning_vi
         FROM dictionary_entries de
         WHERE NOT (de.id = ANY($2::uuid[]))
           AND de.cefr_level IN ('A2', 'B1', 'B2')
         ORDER BY de.frequency_rank ASC NULLS LAST
         LIMIT $1`,
        [needed - words.length, excludeIds]
      );
      words = [...words, ...dictRows];
    }

    return apiSuccess(res, {
      target_words: words.map((w: any) => ({
        entry_id: w.entry_id,
        headword: w.headword,
        pos: w.pos ?? [],
        ipa: w.ipa ?? null,
        meaning_vi: w.meaning_vi ?? null,
        audio_url: w.audio_url ?? null,
      })),
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
//  POST /api/v1/retrieval/submit
//  body: { target_words: string[], sentences: string[] }
//  target_words accepts headword strings OR entry_id UUIDs
// ─────────────────────────────────────────────────────────────────────────────
router.post(
  '/submit',
  requireFeature('retrieval_practice_daily'),
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;
    const { target_words, sentences } = req.body as {
      target_words: string[];
      sentences: string[];
    };

    // ── Validate ──────────────────────────────────────────────────────────────
    if (!Array.isArray(target_words) || target_words.length !== 3) {
      return apiError(res, 400, 'VALIDATION_ERROR', 'target_words must be an array of 3 items');
    }
    if (!Array.isArray(sentences) || sentences.length !== 3) {
      return apiError(res, 400, 'VALIDATION_ERROR', 'sentences must be an array of 3 items');
    }
    for (let i = 0; i < 3; i++) {
      if (typeof sentences[i] !== 'string' || sentences[i].trim().split(/\s+/).length < 6) {
        return apiError(res, 400, 'VALIDATION_ERROR', `sentences[${i}] must have at least 6 words`);
      }
    }

    // ── Step 1: Moderation ─────────────────────────────────────────────────────
    const combinedText = sentences.join(' ');
    let modResult: Awaited<ReturnType<typeof moderateInput>>;
    try {
      modResult = await moderateInput(combinedText);
    } catch (err: any) {
      return handleOpenAIError(res, err);
    }

    if (modResult.flagged) {
      await pool.query(
        `INSERT INTO moderation_logs
           (user_id, input_text, source, flag_type, severity, api_response, status)
         VALUES ($1, $2, 'retrieval_practice', $3, $4, $5, 'pending')`,
        [userId, combinedText, modResult.flag_type, modResult.severity, JSON.stringify(modResult.raw)]
      );
      return apiError(res, 400, 'FLAGGED_CONTENT', 'Content flagged by moderation');
    }

    // ── Step 2: Resolve entries ────────────────────────────────────────────────
    const isUuidLike = (s: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
    const allUuids = target_words.every(isUuidLike);

    let entryRows: any[];
    if (allUuids) {
      const { rows } = await pool.query(
        `SELECT de.id, de.headword, de.pos,
                ${VI_PREVIEW} AS meaning_vi
         FROM dictionary_entries de
         WHERE de.id = ANY($1::uuid[])`,
        [target_words]
      );
      entryRows = rows;
    } else {
      // Headword strings — pick highest-frequency entry per headword
      const { rows } = await pool.query(
        `SELECT DISTINCT ON (de.headword) de.id, de.headword, de.pos,
                ${VI_PREVIEW} AS meaning_vi
         FROM dictionary_entries de
         WHERE de.headword = ANY($1::text[])
         ORDER BY de.headword, de.frequency_rank ASC NULLS LAST`,
        [target_words]
      );
      entryRows = rows;
    }

    const byId       = new Map(entryRows.map((r: any) => [r.id,                   r]));
    const byHeadword = new Map(entryRows.map((r: any) => [r.headword.toLowerCase(), r]));

    // Preserve original order
    const resolvedWords = target_words.map((tw: string) => {
      const entry = allUuids ? byId.get(tw) : byHeadword.get(tw.toLowerCase());
      return entry
        ? { entry_id: entry.id as string, headword: entry.headword as string, meaning_vi: entry.meaning_vi as string | null, pos: (entry.pos ?? []) as string[] }
        : { entry_id: null as string | null, headword: tw, meaning_vi: null as string | null, pos: [] as string[] };
    });

    // ── Step 3: Load active prompt template ────────────────────────────────────
    const { rows: templates } = await pool.query(
      `SELECT system_prompt, model FROM prompt_templates
       WHERE name = 'retrieval_practice_grader' AND status = 'active'
       ORDER BY version DESC LIMIT 1`
    );
    if (templates.length === 0) {
      return apiError(res, 500, 'INTERNAL_ERROR', 'Grading prompt template unavailable');
    }

    // ── Step 4: Grade with OpenAI ──────────────────────────────────────────────
    let gradeResult: Awaited<ReturnType<typeof gradeSentences>>;
    try {
      gradeResult = await gradeSentences({
      targetWords: resolvedWords.map(w => ({
        headword: w.headword,
        meaning_vi: w.meaning_vi,
        pos: w.pos,
      })),
      sentences,
      userLevel: req.user!.level,
      systemPrompt: templates[0].system_prompt,
      });
    } catch (err: any) {
      return handleOpenAIError(res, err);
    }

    const { output } = gradeResult;

    // ── Step 5: Persist session ────────────────────────────────────────────────
    const targetWordStrings = resolvedWords.map(w => w.headword);
    const targetEntryIds    = resolvedWords.map(w => w.entry_id).filter(Boolean) as string[];
    const fixes             = output.results.map(r => r.fix ?? '');
    const allPassed         = output.results.every(r => r.grammar_ok && r.used_target);

    const { rows: sessionRows } = await pool.query(
      `INSERT INTO retrieval_sessions
         (user_id, target_words, target_entry_ids, sentences, fixes, results_json,
          all_passed, model_used, latency_ms, tokens_in, tokens_out, cost_usd)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [
        userId,
        targetWordStrings,
        targetEntryIds,
        sentences,
        fixes,
        JSON.stringify(output),
        allPassed,
        gradeResult.model_used,
        gradeResult.latency_ms,
        gradeResult.tokens_in,
        gradeResult.tokens_out,
        gradeResult.cost_usd,
      ]
    );
    const sessionId = sessionRows[0].id as string;

    // Log activity
    await pool.query(
      `INSERT INTO user_activity_log (user_id, action, details)
       VALUES ($1, 'retrieval_practice', $2)`,
      [userId, JSON.stringify({ session_id: sessionId, overall_score: output.overall_score })]
    );

    // ── Step 6: Leitner — add grammar_ok + used_target words ──────────────────
    let leitnerAdded   = 0;
    let leitnerSkipped = 0;
    for (let i = 0; i < output.results.length; i++) {
      const result = output.results[i];
      const word   = resolvedWords[i];
      if (result.grammar_ok && result.used_target && word.entry_id) {
        const { added } = await addToBox1IfNotExists(userId, word.entry_id, 'retrieval_practice');
        if (added) leitnerAdded++;
        else leitnerSkipped++;
      }
    }

    // XP: 10 base + 5 per correct word + 5 bonus for high score
    const grammarOkCount = output.results.filter(r => r.grammar_ok && r.used_target).length;
    const xpEarned = 10 + grammarOkCount * 5 + (output.overall_score >= 80 ? 5 : 0);

    return apiSuccess(res, {
      session_id: sessionId,
      results: output.results,
      overall_score: output.overall_score,
      overall_feedback_vi: output.overall_feedback_vi,
      xp_earned: xpEarned,
      leitner_added: { added: leitnerAdded, skipped: leitnerSkipped },
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/v1/retrieval/history
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/history',
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;
    const page   = Math.max(1, parseInt(String(req.query.page  ?? '1'),  10) || 1);
    const limit  = Math.min(50, Math.max(1, parseInt(String(req.query.limit ?? '10'), 10) || 10));
    const offset = (page - 1) * limit;

    const [{ rows }, { rows: countRows }] = await Promise.all([
      pool.query(
        `SELECT id, target_words, all_passed,
                (results_json->>'overall_score')::int AS overall_score,
                model_used, latency_ms, cost_usd, created_at
         FROM retrieval_sessions
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS total FROM retrieval_sessions WHERE user_id = $1`,
        [userId]
      ),
    ]);

    return apiSuccess(res, {
      items: rows.map((r: any) => ({
        id: r.id,
        target_words: r.target_words ?? [],
        all_passed: r.all_passed,
        overall_score: r.overall_score ?? 0,
        model_used: r.model_used ?? null,
        latency_ms: r.latency_ms ?? null,
        cost_usd: r.cost_usd ?? null,
        created_at: r.created_at,
      })),
      meta: {
        total: countRows[0]?.total ?? 0,
        page,
        limit,
      },
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
//  GET /api/v1/retrieval/sessions/:id
// ─────────────────────────────────────────────────────────────────────────────
router.get(
  '/sessions/:id',
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;
    const { id } = req.params;

    const { rows } = await pool.query(
      `SELECT * FROM retrieval_sessions WHERE id = $1`,
      [id]
    );

    if (rows.length === 0) {
      return apiError(res, 404, 'NOT_FOUND', 'Session not found');
    }
    if (rows[0].user_id !== userId) {
      return apiError(res, 403, 'FORBIDDEN', 'Access denied');
    }

    const s = rows[0];
    return apiSuccess(res, {
      id: s.id,
      target_words: s.target_words,
      target_entry_ids: s.target_entry_ids,
      sentences: s.sentences,
      fixes: s.fixes,
      results: s.results_json,
      all_passed: s.all_passed,
      model_used: s.model_used,
      latency_ms: s.latency_ms,
      tokens_in: s.tokens_in,
      tokens_out: s.tokens_out,
      cost_usd: s.cost_usd,
      created_at: s.created_at,
    });
  })
);

export default router;
