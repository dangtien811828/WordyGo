import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { z } from 'zod';

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: parseInt(process.env.OPENAI_TIMEOUT_MS || '20000', 10),
});

const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-2024-08-06';

// gpt-4o-2024-08-06 pricing (USD per token)
const PRICE_IN  = 2.50  / 1_000_000;
const PRICE_OUT = 10.00 / 1_000_000;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ModerationResult {
  flagged: boolean;
  flag_type: 'sexual' | 'violence' | 'hate' | 'self_harm' | 'other' | null;
  severity: 'low' | 'medium' | 'high' | null;
  raw: object;
}

const SentenceResultSchema = z.object({
  target_word: z.string(),
  sentence: z.string(),
  used_target: z.boolean(),
  grammar_ok: z.boolean(),
  errors: z.array(z.object({
    type: z.string(),
    location: z.string(),
    message: z.string(),
  })),
  fix: z.string(),
  explanation_vi: z.string(),
});

const GradeOutputSchema = z.object({
  results: z.array(SentenceResultSchema),
  overall_score: z.number().int().min(0).max(100),
  overall_feedback_vi: z.string(),
});

export type GradeOutput = z.infer<typeof GradeOutputSchema>;

export interface GradeInput {
  targetWords: Array<{ headword: string; meaning_vi: string | null; pos: string[] }>;
  sentences: string[];
  userLevel: string;
  systemPrompt: string;
}

export interface GradeResult {
  output: GradeOutput;
  model_used: string;
  latency_ms: number;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
}

// ── moderateInput ─────────────────────────────────────────────────────────────

export async function moderateInput(text: string): Promise<ModerationResult> {
  const response = await client.moderations.create({ input: text });
  const result = response.results[0];

  if (!result.flagged) {
    return { flagged: false, flag_type: null, severity: null, raw: result as unknown as object };
  }

  const cats   = result.categories      as unknown as Record<string, boolean>;
  const scores = result.category_scores as unknown as Record<string, number>;

  let flag_type: ModerationResult['flag_type'] = 'other';
  if (cats['sexual'] || cats['sexual/minors'])
    flag_type = 'sexual';
  else if (cats['violence'] || cats['violence/graphic'])
    flag_type = 'violence';
  else if (cats['hate'] || cats['hate/threatening'])
    flag_type = 'hate';
  else if (cats['self-harm'] || cats['self-harm/intent'] || cats['self-harm/instructions'])
    flag_type = 'self_harm';

  const maxScore = Math.max(...Object.values(scores));
  const severity: ModerationResult['severity'] =
    maxScore >= 0.8 ? 'high' : maxScore >= 0.5 ? 'medium' : 'low';

  return { flagged: true, flag_type, severity, raw: result as unknown as object };
}

// ── gradeSentences ────────────────────────────────────────────────────────────

export async function gradeSentences(input: GradeInput): Promise<GradeResult> {
  const { targetWords, sentences, userLevel, systemPrompt } = input;

  const wordList = targetWords
    .map((w, i) =>
      `${i + 1}. Target word: "${w.headword}"${w.pos.length ? ` (${w.pos.join(', ')})` : ''}\n` +
      `   Vietnamese meaning: ${w.meaning_vi || '(not available)'}\n` +
      `   Sentence: "${sentences[i]}"`
    )
    .join('\n\n');

  const start = Date.now();

  const completion = await client.chat.completions.parse({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `User level: ${userLevel}\n\n${wordList}` },
    ],
    response_format: zodResponseFormat(GradeOutputSchema, 'grade_result'),
  });

  const latency_ms = Date.now() - start;
  const usage = completion.usage!;
  const tokens_in  = usage.prompt_tokens;
  const tokens_out = usage.completion_tokens;
  const cost_usd   = tokens_in * PRICE_IN + tokens_out * PRICE_OUT;

  const output = completion.choices[0].message.parsed;
  if (!output) throw new Error('OpenAI returned empty parsed output');

  return { output, model_used: completion.model, latency_ms, tokens_in, tokens_out, cost_usd };
}
