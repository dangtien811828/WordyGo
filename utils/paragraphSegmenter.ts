const MIN_WORDS = 20;
const MAX_WORDS = 40;

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function splitSentences(text: string): string[] {
  // Split at sentence-ending punctuation followed by whitespace + uppercase letter.
  // Lookbehind keeps the punctuation with the preceding sentence.
  return text
    .split(/(?<=[.!?…])\s+(?=[A-Z"'(])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Split a sentence that exceeds MAX_WORDS at the nearest comma or clause boundary.
 */
function splitLongSentence(sentence: string): string[] {
  const parts = sentence.split(/,\s+/);
  const result: string[] = [];
  let buffer = '';
  let bufferWords = 0;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const partWords = countWords(part);
    const separator = i < parts.length - 1 ? ', ' : '';

    if (bufferWords + partWords > MAX_WORDS && buffer) {
      result.push(buffer.trimEnd().replace(/,$/, ''));
      buffer = part + separator;
      bufferWords = partWords;
    } else {
      buffer += (buffer ? '' : '') + part + separator;
      bufferWords += partWords;
    }
  }

  if (buffer.trim()) {
    result.push(buffer.trimEnd().replace(/,\s*$/, ''));
  }

  return result.filter(Boolean);
}

/**
 * Merge consecutive chunks that are shorter than MIN_WORDS into the next chunk,
 * as long as the combined length stays within MAX_WORDS.
 */
function mergeSmallChunks(chunks: string[]): string[] {
  const result: string[] = [];
  let i = 0;

  while (i < chunks.length) {
    const current = chunks[i];
    const currentWords = countWords(current);

    if (currentWords < MIN_WORDS && i + 1 < chunks.length) {
      const next = chunks[i + 1];
      const combined = current + ' ' + next;
      if (countWords(combined) <= MAX_WORDS) {
        result.push(combined);
        i += 2;
        continue;
      }
    }

    result.push(current);
    i++;
  }

  return result;
}

/**
 * Segment raw chapter text into paragraphs of 20–40 words.
 *
 * Algorithm:
 *  1. Split by natural breaks (\n\n+).
 *  2. Each natural block → splitSentences.
 *  3. Any sentence > 40 words → split at comma/clause boundary.
 *  4. Group sentences into 20–40-word chunks (break at sentence end).
 *  5. After grouping, merge chunks < 20 words with next if combined ≤ 40.
 */
export function segmentParagraphs(rawText: string): string[] {
  // Step 1 — natural blocks
  const naturalBlocks = rawText
    .split(/\n\n+/)
    .map((b) => b.replace(/\n/g, ' ').trim())
    .filter(Boolean);

  // Step 2 — all sentences across blocks
  const sentences: string[] = [];
  for (const block of naturalBlocks) {
    sentences.push(...splitSentences(block));
  }

  // Step 3 — expand sentences > MAX_WORDS
  const expanded: string[] = [];
  for (const sent of sentences) {
    if (countWords(sent) > MAX_WORDS) {
      expanded.push(...splitLongSentence(sent));
    } else {
      expanded.push(sent);
    }
  }

  // Step 4 — group into 20–40-word chunks
  const chunks: string[] = [];
  let buffer: string[] = [];
  let bufferWords = 0;

  for (const sent of expanded) {
    const w = countWords(sent);

    if (bufferWords + w > MAX_WORDS && bufferWords > 0) {
      chunks.push(buffer.join(' '));
      buffer = [sent];
      bufferWords = w;
    } else {
      buffer.push(sent);
      bufferWords += w;
    }
  }

  if (buffer.length > 0) {
    chunks.push(buffer.join(' '));
  }

  // Step 5 — merge small tail chunks
  return mergeSmallChunks(chunks);
}
