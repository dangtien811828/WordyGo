import pool from '../config/db';
import { normalizeVietnameseAnswer } from '../utils/answerNormalizer';
import {
  buildAnswerCandidates,
  matchVietnameseAnswer,
} from '../utils/answerMatcher';
import {
  gradeVietnameseAnswer,
  isOpenAIConfigured,
} from './openaiService';

export type AnswerVerdict = 'correct' | 'near_correct' | 'wrong';
export type AnswerGradingSource =
  | 'exact'
  | 'alias'
  | 'semantic_cache'
  | 'openai'
  | 'client_legacy'
  | 'deterministic_miss'
  | 'openai_unavailable';

export interface PracticeAnswerGradeResult {
  correct: boolean;
  verdict: AnswerVerdict;
  confidence: number;
  grading_source: AnswerGradingSource;
  matched_answer: string | null;
  accepted_answers: string[];
  reason_vi: string | null;
  details: Record<string, any>;
}

interface EntryForCard {
  card_id: string;
  entry_id: string;
  headword: string;
  pos: string[] | null;
  meaning_vi: string | null;
}

interface SemanticCacheRow {
  verdict: AnswerVerdict;
  confidence: string | number;
  reason_vi: string | null;
  matched_answer: string | null;
  accepted_answers: any;
  model_used: string | null;
  latency_ms: number | null;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_usd: string | number | null;
}

const CORRECT_CONFIDENCE_MIN = 0.75;

export async function gradePracticeAnswer(
  cardId: string,
  userAnswer: string
): Promise<PracticeAnswerGradeResult> {
  const entry = await fetchEntryForCard(cardId);
  return gradeEntryAnswer(entry, userAnswer);
}

export async function gradeLeitnerAnswer(
  leitnerCardId: string,
  userId: string,
  userAnswer: string
): Promise<PracticeAnswerGradeResult> {
  const entry = await fetchEntryForLeitnerCard(leitnerCardId, userId);
  return gradeEntryAnswer(entry, userAnswer);
}

async function gradeEntryAnswer(
  entry: EntryForCard,
  userAnswer: string
): Promise<PracticeAnswerGradeResult> {
  const normalizedUserAnswer = normalizeVietnameseAnswer(userAnswer);

  const [senseDefinitions, aliases] = await Promise.all([
    fetchSenseDefinitions(entry.entry_id),
    fetchActiveAliases(entry.entry_id),
  ]);

  const candidates = buildAnswerCandidates({
    meaningVi: entry.meaning_vi,
    senseDefinitions,
    aliases,
  });

  const deterministic = matchVietnameseAnswer(userAnswer, candidates);
  if (deterministic.matched) {
    return {
      correct: true,
      verdict: 'correct',
      confidence: 1,
      grading_source: deterministic.grading_source,
      matched_answer: deterministic.matched_answer,
      accepted_answers: deterministic.accepted_answers,
      reason_vi: 'Khớp với một đáp án được chấp nhận.',
      details: { normalized_user_answer: normalizedUserAnswer },
    };
  }

  if (!normalizedUserAnswer) {
    return {
      correct: false,
      verdict: 'wrong',
      confidence: 0,
      grading_source: 'deterministic_miss',
      matched_answer: null,
      accepted_answers: deterministic.accepted_answers,
      reason_vi: 'Bạn chưa nhập đáp án.',
      details: { normalized_user_answer: normalizedUserAnswer },
    };
  }

  const cached = await fetchSemanticCache(entry.entry_id, normalizedUserAnswer);
  if (cached) {
    return fromSemanticCache(cached, deterministic.accepted_answers);
  }

  if (!isOpenAIConfigured()) {
    return {
      correct: false,
      verdict: 'wrong',
      confidence: 0,
      grading_source: 'openai_unavailable',
      matched_answer: null,
      accepted_answers: deterministic.accepted_answers,
      reason_vi: 'Dịch vụ chấm ngữ nghĩa chưa được cấu hình.',
      details: { normalized_user_answer: normalizedUserAnswer },
    };
  }

  try {
    const systemPrompt = await fetchPromptTemplate();
    const grade = await gradeVietnameseAnswer({
      headword: entry.headword,
      pos: entry.pos ?? [],
      expectedAnswers: deterministic.accepted_answers,
      userAnswer,
      systemPrompt,
    });

    const verdict = grade.output.verdict;
    const confidence = clampConfidence(grade.output.confidence);
    const correct = verdict === 'correct' && confidence >= CORRECT_CONFIDENCE_MIN;

    await saveSemanticCache({
      entryId: entry.entry_id,
      normalizedUserAnswer,
      userAnswer,
      verdict,
      confidence,
      reasonVi: grade.output.reason_vi,
      matchedAnswer: grade.output.matched_answer,
      acceptedAnswers: deterministic.accepted_answers,
      modelUsed: grade.model_used,
      latencyMs: grade.latency_ms,
      tokensIn: grade.tokens_in,
      tokensOut: grade.tokens_out,
      costUsd: grade.cost_usd,
    });

    if (correct && confidence >= 0.9) {
      await rememberHighConfidenceAlias(entry.entry_id, userAnswer, normalizedUserAnswer);
    }

    return {
      correct,
      verdict,
      confidence,
      grading_source: 'openai',
      matched_answer: grade.output.matched_answer,
      accepted_answers: deterministic.accepted_answers,
      reason_vi: grade.output.reason_vi,
      details: {
        normalized_user_answer: normalizedUserAnswer,
        model_used: grade.model_used,
        latency_ms: grade.latency_ms,
        tokens_in: grade.tokens_in,
        tokens_out: grade.tokens_out,
        cost_usd: grade.cost_usd,
      },
    };
  } catch (err: any) {
    return {
      correct: false,
      verdict: 'wrong',
      confidence: 0,
      grading_source: 'openai_unavailable',
      matched_answer: null,
      accepted_answers: deterministic.accepted_answers,
      reason_vi: 'Không thể chấm ngữ nghĩa lúc này. Vui lòng thử lại.',
      details: {
        normalized_user_answer: normalizedUserAnswer,
        error: String(err?.message ?? err).slice(0, 500),
      },
    };
  }
}

async function fetchEntryForCard(cardId: string): Promise<EntryForCard> {
  const { rows } = await pool.query<EntryForCard>(
    `SELECT c.id AS card_id, c.entry_id, de.headword, de.pos, de.meaning_vi
       FROM cards c
       JOIN dictionary_entries de ON de.id = c.entry_id
      WHERE c.id = $1`,
    [cardId]
  );

  if (rows.length === 0) {
    throw new Error('CARD_NOT_FOUND');
  }

  return rows[0];
}

async function fetchEntryForLeitnerCard(
  leitnerCardId: string,
  userId: string
): Promise<EntryForCard> {
  const { rows } = await pool.query<EntryForCard>(
    `SELECT lc.id AS card_id, lc.entry_id, de.headword, de.pos, de.meaning_vi
       FROM leitner_cards lc
       JOIN dictionary_entries de ON de.id = lc.entry_id
      WHERE lc.id = $1 AND lc.user_id = $2`,
    [leitnerCardId, userId]
  );

  if (rows.length === 0) {
    const err = Object.assign(new Error('CARD_NOT_FOUND'), { statusCode: 404 });
    throw err;
  }

  return rows[0];
}

async function fetchSenseDefinitions(entryId: string): Promise<string[]> {
  const { rows } = await pool.query<{ definition_vi: string }>(
    `SELECT definition_vi
       FROM entry_senses
      WHERE entry_id = $1 AND definition_vi IS NOT NULL
      ORDER BY sense_order ASC`,
    [entryId]
  );
  return rows.map((row) => row.definition_vi);
}

async function fetchActiveAliases(entryId: string): Promise<string[]> {
  const { rows } = await pool.query<{ answer_text: string }>(
    `SELECT answer_text
       FROM entry_answer_aliases
      WHERE entry_id = $1 AND status = 'active'
      ORDER BY created_at ASC`,
    [entryId]
  );
  return rows.map((row) => row.answer_text);
}

async function fetchSemanticCache(
  entryId: string,
  normalizedAnswer: string
): Promise<SemanticCacheRow | null> {
  const { rows } = await pool.query<SemanticCacheRow>(
    `SELECT verdict, confidence, reason_vi, matched_answer, accepted_answers,
            model_used, latency_ms, tokens_in, tokens_out, cost_usd
       FROM answer_semantic_cache
      WHERE entry_id = $1 AND normalized_answer = $2`,
    [entryId, normalizedAnswer]
  );
  return rows[0] ?? null;
}

function fromSemanticCache(
  row: SemanticCacheRow,
  fallbackAcceptedAnswers: string[]
): PracticeAnswerGradeResult {
  const confidence = clampConfidence(Number(row.confidence));
  const acceptedAnswers = Array.isArray(row.accepted_answers)
    ? row.accepted_answers
    : fallbackAcceptedAnswers;

  return {
    correct: row.verdict === 'correct' && confidence >= CORRECT_CONFIDENCE_MIN,
    verdict: row.verdict,
    confidence,
    grading_source: 'semantic_cache',
    matched_answer: row.matched_answer,
    accepted_answers: acceptedAnswers,
    reason_vi: row.reason_vi,
    details: {
      model_used: row.model_used,
      latency_ms: row.latency_ms,
      tokens_in: row.tokens_in,
      tokens_out: row.tokens_out,
      cost_usd: row.cost_usd,
    },
  };
}

async function fetchPromptTemplate(): Promise<string | undefined> {
  const { rows } = await pool.query<{ system_prompt: string }>(
    `SELECT system_prompt
       FROM prompt_templates
      WHERE name = 'vietnamese_answer_grader' AND status = 'active'
      ORDER BY version DESC
      LIMIT 1`
  );
  return rows[0]?.system_prompt;
}

async function saveSemanticCache(input: {
  entryId: string;
  normalizedUserAnswer: string;
  userAnswer: string;
  verdict: AnswerVerdict;
  confidence: number;
  reasonVi: string;
  matchedAnswer: string | null;
  acceptedAnswers: string[];
  modelUsed: string;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}): Promise<void> {
  await pool.query(
    `INSERT INTO answer_semantic_cache
       (entry_id, normalized_answer, user_answer, verdict, confidence, reason_vi,
        matched_answer, accepted_answers, model_used, latency_ms, tokens_in, tokens_out, cost_usd)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (entry_id, normalized_answer)
     DO UPDATE SET
       user_answer      = EXCLUDED.user_answer,
       verdict          = EXCLUDED.verdict,
       confidence       = EXCLUDED.confidence,
       reason_vi        = EXCLUDED.reason_vi,
       matched_answer   = EXCLUDED.matched_answer,
       accepted_answers = EXCLUDED.accepted_answers,
       model_used       = EXCLUDED.model_used,
       latency_ms       = EXCLUDED.latency_ms,
       tokens_in        = EXCLUDED.tokens_in,
       tokens_out       = EXCLUDED.tokens_out,
       cost_usd         = EXCLUDED.cost_usd,
       updated_at       = NOW()`,
    [
      input.entryId,
      input.normalizedUserAnswer,
      input.userAnswer,
      input.verdict,
      input.confidence,
      input.reasonVi,
      input.matchedAnswer,
      JSON.stringify(input.acceptedAnswers),
      input.modelUsed,
      input.latencyMs,
      input.tokensIn,
      input.tokensOut,
      input.costUsd,
    ]
  );
}

async function rememberHighConfidenceAlias(
  entryId: string,
  userAnswer: string,
  normalizedUserAnswer: string
): Promise<void> {
  await pool
    .query(
      `INSERT INTO entry_answer_aliases
         (entry_id, answer_text, normalized_answer, source, status)
       SELECT $1, $2, $3, 'ai_accepted', 'pending'
       WHERE NOT EXISTS (
         SELECT 1 FROM entry_answer_aliases
          WHERE entry_id = $1 AND normalized_answer = $3
       )`,
      [entryId, normalizeVietnameseAnswer(userAnswer), normalizedUserAnswer]
    )
    .catch((err) => {
      console.error('[answer-grading] failed to remember alias:', err);
    });
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
