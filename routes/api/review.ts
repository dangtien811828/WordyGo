import { Router, Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import pool from '../../config/db';
import { ApiRequest } from '../../middlewares/apiAuth';
import { asyncHandler } from '../../utils/asyncHandler';
import { apiSuccess, apiError } from '../../utils/apiResponse';
import { validateBody } from '../../middlewares/validateBody';

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function maskWord(sentence: string, word: string): string {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return sentence.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), '___');
}

function findWordInSentence(sentence: string, candidates: string[]): { form: string } | null {
  for (const candidate of candidates) {
    const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = sentence.match(new RegExp(`\\b${escaped}\\b`, 'i'));
    if (match) return { form: match[0] };
  }
  return null;
}

const FORM_TYPE_TO_TENSE: Record<string, string> = {
  past_simple: 'past simple',
  past_participle: 'past participle',
  present_participle: 'present participle',
  gerund: 'gerund',
  third_person_singular: 'third person singular',
  plural: 'plural',
  comparative: 'comparative',
  superlative: 'superlative',
};

function deriveHintTense(formType: string | null): string | null {
  if (!formType) return null;
  return FORM_TYPE_TO_TENSE[formType] ?? formType.replace(/_/g, ' ');
}

// ── SQL fragments ─────────────────────────────────────────────────────────────

// Card ownership: user's own deck OR published premade/system deck
const DECK_ACCESS = `(d.user_id = $2 OR (d.deck_type IN ('premade','system_generated') AND d.status = 'published'))`;

// First available VI meaning for an entry
const VI_COALESCE = `COALESCE(
  (SELECT es.definition_vi FROM entry_senses es
   WHERE es.entry_id = de.id AND es.definition_vi IS NOT NULL
   ORDER BY es.sense_order ASC LIMIT 1),
  de.meaning_vi
)`;

// Whether an entry has any VI meaning
const HAS_VI = `(de.meaning_vi IS NOT NULL OR EXISTS (
  SELECT 1 FROM entry_senses es
  WHERE es.entry_id = de.id AND es.definition_vi IS NOT NULL
))`;

// ─────────────────────────────────────────────────────────────────────────────
//  POST /swift-choice/question
// ─────────────────────────────────────────────────────────────────────────────
const swiftChoiceSchema = z.object({
  card_id: z.string().uuid(),
});

router.post(
  '/swift-choice/question',
  validateBody(swiftChoiceSchema),
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;
    const { card_id } = req.body;

    // Card + entry with ownership check ($1=card_id, $2=userId)
    const { rows: cardRows } = await pool.query(
      `SELECT
         c.entry_id,
         de.headword, de.ipa_us, de.pos, de.cefr_level,
         ${VI_COALESCE} AS correct_vi
       FROM cards c
       JOIN dictionary_entries de ON de.id = c.entry_id
       JOIN decks d ON d.id = c.deck_id
       WHERE c.id = $1 AND ${DECK_ACCESS}`,
      [card_id, userId]
    );

    if (cardRows.length === 0) {
      return apiError(res, 404, 'CARD_NOT_FOUND', 'Card không tồn tại');
    }

    const card = cardRows[0];
    const posArray: string[] | null =
      Array.isArray(card.pos) && card.pos.length > 0 ? card.pos : null;

    // Distractor selection: 2-tier fallback
    // Tier 1: same CEFR + POS overlap
    // Tier 2: drop CEFR, keep POS overlap
    // Error if < 3 after both tiers
    const DISTRACTOR_SELECT = `
      SELECT ${VI_COALESCE} AS display_vi
      FROM dictionary_entries de`;

    let distractors: any[] = [];

    if (posArray) {
      ({ rows: distractors } = await pool.query(
        `${DISTRACTOR_SELECT}
         WHERE de.cefr_level = $1 AND de.id != $2 AND de.pos && $3::varchar[] AND ${HAS_VI}
         ORDER BY RANDOM() LIMIT 3`,
        [card.cefr_level, card.entry_id, posArray]
      ));

      if (distractors.length < 3) {
        ({ rows: distractors } = await pool.query(
          `${DISTRACTOR_SELECT}
           WHERE de.id != $1 AND de.pos && $2::varchar[] AND ${HAS_VI}
           ORDER BY RANDOM() LIMIT 3`,
          [card.entry_id, posArray]
        ));
      }
    } else {
      // No POS info: tier 1 = same CEFR only, tier 2 = any entry
      ({ rows: distractors } = await pool.query(
        `${DISTRACTOR_SELECT}
         WHERE de.cefr_level = $1 AND de.id != $2 AND ${HAS_VI}
         ORDER BY RANDOM() LIMIT 3`,
        [card.cefr_level, card.entry_id]
      ));

      if (distractors.length < 3) {
        ({ rows: distractors } = await pool.query(
          `${DISTRACTOR_SELECT}
           WHERE de.id != $1 AND ${HAS_VI}
           ORDER BY RANDOM() LIMIT 3`,
          [card.entry_id]
        ));
      }
    }

    if (distractors.length < 3) {
      return apiError(res, 422, 'INSUFFICIENT_DISTRACTORS', 'Không đủ distractors');
    }

    // First example sentence as hint (mask the headword)
    const { rows: exRows } = await pool.query(
      `SELECT se.example_en
       FROM sense_examples se
       JOIN entry_senses es ON es.id = se.sense_id
       WHERE es.entry_id = $1 AND se.example_en IS NOT NULL
       ORDER BY es.sense_order ASC, se.sort_order ASC
       LIMIT 1`,
      [card.entry_id]
    );

    const hintExample = exRows.length > 0
      ? `e.g., ${maskWord(exRows[0].example_en, card.headword)}`
      : null;

    const optionItems = shuffleArray([
      { text: card.correct_vi || '', correct: true },
      { text: distractors[0].display_vi || '', correct: false },
      { text: distractors[1].display_vi || '', correct: false },
      { text: distractors[2].display_vi || '', correct: false },
    ]);

    const options = optionItems.map((opt, idx) => ({ index: idx, text: opt.text }));
    const correct_index = optionItems.findIndex(opt => opt.correct);
    const pos = posArray ? posArray[0] : null;

    return apiSuccess(res, {
      card_id,
      question_type: 'meaning_from_word',
      prompt: {
        word: card.headword,
        ipa_us: card.ipa_us || null,
        pos,
      },
      hint_example: hintExample,
      options,
      correct_index,
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
//  POST /cloze/question
// ─────────────────────────────────────────────────────────────────────────────
const clozeSchema = z.object({
  card_id: z.string().uuid(),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

router.post(
  '/cloze/question',
  validateBody(clozeSchema),
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;
    const { card_id, level } = req.body;

    // Card + entry with ownership check ($1=card_id, $2=userId)
    const { rows: cardRows } = await pool.query(
      `SELECT c.entry_id, de.headword, de.pos
       FROM cards c
       JOIN dictionary_entries de ON de.id = c.entry_id
       JOIN decks d ON d.id = c.deck_id
       WHERE c.id = $1 AND ${DECK_ACCESS}`,
      [card_id, userId]
    );

    if (cardRows.length === 0) {
      return apiError(res, 404, 'CARD_NOT_FOUND', 'Card không tồn tại');
    }

    const card = cardRows[0];

    // Fetch word_forms + examples in parallel
    const [{ rows: wfRows }, { rows: examples }] = await Promise.all([
      pool.query(
        `SELECT form_value, form_type FROM word_forms WHERE entry_id = $1`,
        [card.entry_id]
      ),
      pool.query(
        `SELECT example_en FROM (
           SELECT se.example_en, 0 AS priority, es.sense_order, se.sort_order
           FROM sense_examples se
           JOIN entry_senses es ON es.id = se.sense_id
           WHERE es.entry_id = $1 AND se.example_en IS NOT NULL

           UNION ALL

           SELECT TRIM(unnest) AS example_en, 1 AS priority, 0 AS sense_order, ordinality::int AS sort_order
           FROM dictionary_entries de,
                LATERAL unnest(string_to_array(de.example_en, E'\\n')) WITH ORDINALITY AS unnest
           WHERE de.id = $1 AND de.example_en IS NOT NULL AND TRIM(unnest) != ''
         ) AS combined
         ORDER BY priority ASC, sense_order ASC, sort_order ASC`,
        [card.entry_id]
      ),
    ]);

    if (examples.length === 0) {
      return apiError(res, 422, 'NO_EXAMPLES', 'Card này không có câu ví dụ');
    }

    // Candidates: headword first, then word forms longer-first (more specific match wins)
    const wordForms: Array<{ value: string; type: string }> = wfRows.map(r => ({
      value: r.form_value,
      type: r.form_type,
    }));
    const candidates = [
      card.headword,
      ...wordForms.sort((a, b) => b.value.length - a.value.length).map(wf => wf.value),
    ];

    // Pick a random example that contains the headword or a known word form
    let targetWord: string | null = null;
    let targetExample: string | null = null;
    let matchedFormType: string | null = null;

    for (const ex of shuffleArray(examples)) {
      const found = findWordInSentence(ex.example_en, candidates);
      if (found) {
        targetWord = found.form;
        targetExample = ex.example_en;
        const lowerForm = found.form.toLowerCase();
        const matchedWF = wordForms.find(wf => wf.value.toLowerCase() === lowerForm);
        matchedFormType = matchedWF ? matchedWF.type : null;
        break;
      }
    }

    if (!targetWord || !targetExample) {
      return apiError(res, 422, 'NO_EXAMPLES', 'Không tìm được câu ví dụ phù hợp');
    }

    const sentenceMasked = maskWord(targetExample, targetWord);
    const hintPos = Array.isArray(card.pos) && card.pos.length > 0 ? card.pos[0] : null;
    const hintTense = deriveHintTense(matchedFormType);

    let wordChoices: string[] | null = null;
    let scrambledLetters: string[] | null = null;

    if (level === 1) {
      // Prefer same-POS distractors; order by POS match then RANDOM()
      const { rows: wrongWords } = hintPos
        ? await pool.query(
            `SELECT de.headword FROM dictionary_entries de
             WHERE de.id != $1
             ORDER BY CASE WHEN $2 = ANY(de.pos) THEN 0 ELSE 1 END, RANDOM()
             LIMIT 3`,
            [card.entry_id, hintPos]
          )
        : await pool.query(
            `SELECT de.headword FROM dictionary_entries de
             WHERE de.id != $1 ORDER BY RANDOM() LIMIT 3`,
            [card.entry_id]
          );

      wordChoices = shuffleArray([
        targetWord,
        ...wrongWords.map((r: any) => r.headword as string),
      ]);
    } else if (level === 2) {
      // Scramble letters of targetWord + add 1-2 consonant decoys
      const CONSONANTS = 'bcdfghjklmnpqrstvwxyz';
      const letters = targetWord.split('');
      const decoyCount = letters.length <= 4 ? 1 : 2;
      for (let i = 0; i < decoyCount; i++) {
        letters.push(CONSONANTS[Math.floor(Math.random() * CONSONANTS.length)]);
      }
      scrambledLetters = shuffleArray(letters);
    }

    return apiSuccess(res, {
      card_id,
      level,
      target_word: targetWord,
      sentence_masked: sentenceMasked,
      sentence_full: targetExample,
      hint_pos: hintPos,
      hint_tense: hintTense,
      word_choices: wordChoices,
      scrambled_letters: scrambledLetters,
    });
  })
);

// ─────────────────────────────────────────────────────────────────────────────
//  POST /pair-link/session
// ─────────────────────────────────────────────────────────────────────────────
const pairLinkSchema = z.object({
  deck_id: z.string().uuid().nullable().optional(),
  count: z.number().int().min(1).max(10).default(5),
});

// Priority: due leitner cards → box 1-2 not-yet-due → new (no leitner record) → else
const PAIR_ORDER = `
  CASE
    WHEN lc.id IS NOT NULL AND lc.due_at <= NOW() THEN 0
    WHEN lc.id IS NOT NULL AND lc.box_number IN (1, 2) THEN 1
    WHEN lc.id IS NULL THEN 2
    ELSE 3
  END, lc.due_at ASC NULLS LAST, RANDOM()
`;

router.post(
  '/pair-link/session',
  validateBody(pairLinkSchema),
  asyncHandler(async (req: ApiRequest, res: Response) => {
    const userId = req.user!.id;
    const { deck_id = null, count = 5 } = req.body;

    let rows: any[];

    if (deck_id) {
      // Verify deck access
      const { rows: deckRows } = await pool.query(
        `SELECT id FROM decks WHERE id = $1
         AND (user_id = $2 OR deck_type IN ('premade','system_generated'))`,
        [deck_id, userId]
      );
      if (deckRows.length === 0) {
        return apiError(res, 404, 'CARD_NOT_FOUND', 'Deck không tồn tại hoặc không có quyền truy cập');
      }

      ({ rows } = await pool.query(
        `SELECT c.id AS card_id, de.headword, ${VI_COALESCE} AS vi_text
         FROM cards c
         JOIN dictionary_entries de ON de.id = c.entry_id
         LEFT JOIN user_card_progress ucp ON ucp.card_id = c.id AND ucp.user_id = $2
         LEFT JOIN leitner_cards lc ON lc.entry_id = c.entry_id AND lc.user_id = $2
         WHERE c.deck_id = $1
         ORDER BY ${PAIR_ORDER}
         LIMIT $3`,
        [deck_id, userId, count]
      ));
    } else {
      // Cross-deck: all accessible decks for this user
      ({ rows } = await pool.query(
        `SELECT c.id AS card_id, de.headword, ${VI_COALESCE} AS vi_text
         FROM cards c
         JOIN dictionary_entries de ON de.id = c.entry_id
         JOIN decks d ON d.id = c.deck_id
         LEFT JOIN user_card_progress ucp ON ucp.card_id = c.id AND ucp.user_id = $1
         LEFT JOIN leitner_cards lc ON lc.entry_id = c.entry_id AND lc.user_id = $1
         WHERE (
           (d.deck_type IN ('premade','system_generated') AND d.status = 'published')
           OR d.user_id = $1
         )
         ORDER BY ${PAIR_ORDER}
         LIMIT $2`,
        [userId, count]
      ));
    }

    const pairs = rows.map((row: any, idx: number) => ({
      card_id: row.card_id,
      pair_id: `p${idx + 1}`,
      en: row.headword,
      vi: row.vi_text || '',
    }));

    return apiSuccess(res, {
      session_id: randomUUID(),
      pairs,
    });
  })
);

export default router;
