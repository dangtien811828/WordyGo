/**
 * Paragraph segmenter for ebook ingestion.
 *
 * Contract (see doc: "splitter must respect author boundaries"):
 *  1. Author paragraph breaks (\n\n+ in the input — emitted by the EPUB stripper
 *     as `</p>` → "\n\n") are SACRED. Each natural block becomes at least one
 *     paragraph row; we never merge across them.
 *  2. If a single block is too long (> MAX_WORDS), split it ONLY at sentence
 *     boundaries. Sentence detection uses `sbd` so abbreviations like "Mr.",
 *     "i.e.", "U.S.", "1.5", "J.K. Rowling" do not produce false splits.
 *  3. NEVER split mid-sentence. Even a single 200-word sentence stays whole.
 *
 * Field guide:
 *  - MAX_WORDS is a soft cap — large no-split-point sentences may exceed it.
 *  - countWords() preserves the legacy contract (callers in scripts/ + tests).
 */
import sbd from 'sbd';

const MAX_WORDS = 60;

const SBD_OPTIONS = {
  // Don't split on newlines — natural blocks were already split upstream.
  newline_boundaries: false,
  // Don't reach inside HTML — input is plain text.
  html_boundaries: false,
  // Use sbd's built-in abbreviation list (Mr./Mrs./Dr./Jr./Sr./St./vs./etc./
  // e.g./i.e./a.m./p.m. + many more) and detect initials like "J.K. Rowling".
  sanitize: false,
  allowed_tags: false,
  preserve_whitespace: false,
  abbreviations: undefined as string[] | undefined, // use defaults
};

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Split a block into sentences using `sbd`. Returns trimmed sentences with
 * their terminal punctuation preserved.
 */
export function splitSentences(text: string): string[] {
  const sentences = sbd.sentences(text, SBD_OPTIONS as any);
  return sentences.map((s) => s.trim()).filter(Boolean);
}

/**
 * Group sentences from a single block into paragraphs of <= MAX_WORDS,
 * breaking ONLY at sentence boundaries. A sentence longer than MAX_WORDS
 * becomes its own paragraph (kept whole — better one long paragraph than a
 * sentence cut in half).
 */
function groupSentencesIntoChunks(sentences: string[]): string[] {
  if (sentences.length === 0) return [];

  const chunks: string[] = [];
  let buffer: string[] = [];
  let bufferWords = 0;

  for (const sent of sentences) {
    const w = countWords(sent);

    // If adding this sentence would push the buffer past the cap, flush.
    if (bufferWords > 0 && bufferWords + w > MAX_WORDS) {
      chunks.push(buffer.join(' '));
      buffer = [];
      bufferWords = 0;
    }

    buffer.push(sent);
    bufferWords += w;
  }

  if (buffer.length > 0) {
    chunks.push(buffer.join(' '));
  }

  return chunks;
}

/**
 * Segment raw chapter text into paragraph rows.
 *
 * Algorithm:
 *  1. Split on \n\n+ → natural blocks (author paragraphs). Each block is a
 *    sealed unit — we never merge across blocks.
 *  2. For each block:
 *     - If it fits within MAX_WORDS → emit as a single paragraph row.
 *     - Else → run `sbd` to get sentences, then group into chunks <= MAX_WORDS,
 *       always breaking at sentence boundaries (never mid-sentence).
 */
export function segmentParagraphs(rawText: string): string[] {
  const naturalBlocks = rawText
    .split(/\n\n+/)
    // Collapse single newlines inside a block into spaces (HTML <br/> etc.).
    .map((b) => b.replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const result: string[] = [];

  for (const block of naturalBlocks) {
    if (countWords(block) <= MAX_WORDS) {
      // Author paragraph fits in one row → keep as-is, no sub-splitting.
      result.push(block);
      continue;
    }

    const sentences = splitSentences(block);
    if (sentences.length <= 1) {
      // Single mega-sentence (no detectable sentence boundaries) → emit whole.
      result.push(block);
      continue;
    }

    result.push(...groupSentencesIntoChunks(sentences));
  }

  return result;
}
