import {
  dedupeNormalizedAnswers,
  normalizeVietnameseAnswer,
  splitVietnameseAnswers,
} from './answerNormalizer';

export type AnswerCandidateSource = 'meaning_vi' | 'sense' | 'alias';

export interface AnswerCandidate {
  text: string;
  normalized: string;
  source: AnswerCandidateSource;
}

export interface BuildAcceptedAnswersInput {
  meaningVi?: string | null;
  senseDefinitions?: Array<string | null | undefined>;
  aliases?: Array<string | null | undefined>;
}

export interface AnswerMatchResult {
  matched: boolean;
  grading_source: 'exact' | 'alias' | 'deterministic_miss';
  matched_answer: string | null;
  accepted_answers: string[];
}

export function buildAnswerCandidates(input: BuildAcceptedAnswersInput): AnswerCandidate[] {
  const candidates: AnswerCandidate[] = [];

  addSplitCandidates(candidates, input.meaningVi, 'meaning_vi');

  for (const definition of input.senseDefinitions ?? []) {
    addSplitCandidates(candidates, definition, 'sense');
  }

  for (const alias of input.aliases ?? []) {
    addSplitCandidates(candidates, alias, 'alias');
  }

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (!candidate.normalized || seen.has(candidate.normalized)) return false;
    seen.add(candidate.normalized);
    return true;
  });
}

export function matchVietnameseAnswer(
  userAnswer: string,
  candidates: AnswerCandidate[]
): AnswerMatchResult {
  const accepted_answers = candidates.map((candidate) => candidate.text);
  const normalizedAttempts = buildUserAnswerAttempts(userAnswer);

  for (const normalizedAttempt of normalizedAttempts) {
    const match = candidates.find((candidate) => candidate.normalized === normalizedAttempt);
    if (match) {
      return {
        matched: true,
        grading_source: match.source === 'alias' ? 'alias' : 'exact',
        matched_answer: match.text,
        accepted_answers,
      };
    }
  }

  return {
    matched: false,
    grading_source: 'deterministic_miss',
    matched_answer: null,
    accepted_answers,
  };
}

export function buildAcceptedAnswerTexts(input: BuildAcceptedAnswersInput): string[] {
  return buildAnswerCandidates(input).map((candidate) => candidate.text);
}

function addSplitCandidates(
  candidates: AnswerCandidate[],
  value: string | null | undefined,
  source: AnswerCandidateSource
): void {
  for (const answer of splitVietnameseAnswers(value)) {
    candidates.push({
      text: answer,
      normalized: normalizeVietnameseAnswer(answer),
      source,
    });
  }
}

function buildUserAnswerAttempts(userAnswer: string): string[] {
  return dedupeNormalizedAnswers([
    normalizeVietnameseAnswer(userAnswer),
    ...splitVietnameseAnswers(userAnswer),
  ]);
}
