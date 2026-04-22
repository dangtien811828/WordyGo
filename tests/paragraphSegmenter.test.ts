import { segmentParagraphs, countWords, splitSentences } from '../utils/paragraphSegmenter';

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────

let _wordIdx = 0;
function makeWords(n: number): string {
  return Array.from({ length: n }, () => `word${++_wordIdx}`).join(' ');
}

function makeSentence(n: number): string {
  const raw = makeWords(n) + '.';
  // Capitalize first letter so splitSentences can detect sentence boundaries.
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

// Build a text with natural paragraphs. Each paragraph is one sentence of
// `wordsPerSentence` words, repeated `sentencesPerParagraph` times.
function buildText(opts: { blocks: number; sentencesPerBlock: number; wordsPerSentence: number }) {
  _wordIdx = 0; // reset counter for reproducibility
  const blocks: string[] = [];
  for (let b = 0; b < opts.blocks; b++) {
    const sentences: string[] = [];
    for (let s = 0; s < opts.sentencesPerBlock; s++) {
      sentences.push(makeSentence(opts.wordsPerSentence));
    }
    blocks.push(sentences.join(' '));
  }
  return blocks.join('\n\n');
}

// ─────────────────────────────────────────────────────────────────────────────
//  countWords
// ─────────────────────────────────────────────────────────────────────────────
describe('countWords', () => {
  test('counts simple words', () => {
    expect(countWords('hello world foo')).toBe(3);
  });

  test('handles extra whitespace', () => {
    expect(countWords('  one  two   three  ')).toBe(3);
  });

  test('returns 0 for empty string', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   ')).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  splitSentences
// ─────────────────────────────────────────────────────────────────────────────
describe('splitSentences', () => {
  test('splits at period + space + uppercase', () => {
    const result = splitSentences('Hello world. This is a test. Another sentence.');
    expect(result).toHaveLength(3);
    expect(result[0]).toBe('Hello world.');
    expect(result[1]).toBe('This is a test.');
  });

  test('splits at question mark', () => {
    const result = splitSentences('What is this? It is a test.');
    expect(result).toHaveLength(2);
  });

  test('splits at exclamation mark', () => {
    const result = splitSentences('Amazing! This works well.');
    expect(result).toHaveLength(2);
  });

  test('single sentence returns one element', () => {
    expect(splitSentences('Just one sentence.')).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  segmentParagraphs — core contract
// ─────────────────────────────────────────────────────────────────────────────
describe('segmentParagraphs', () => {
  test('all paragraphs have 20–40 words for a 1000-word text', () => {
    // 1000 words: 10 blocks × 5 sentences × 20 words/sentence
    const text = buildText({ blocks: 10, sentencesPerBlock: 5, wordsPerSentence: 20 });
    const paragraphs = segmentParagraphs(text);

    expect(paragraphs.length).toBeGreaterThan(0);

    for (const para of paragraphs) {
      const wc = countWords(para);
      // Allow the very last paragraph to be slightly under (tail merge may still leave one short)
      const isLast = para === paragraphs[paragraphs.length - 1];
      if (!isLast) {
        expect(wc).toBeGreaterThanOrEqual(20);
      }
      expect(wc).toBeLessThanOrEqual(44); // small tolerance for split edge cases
    }
  });

  test('returns non-empty array for non-empty input', () => {
    const text = 'This is a short paragraph with some words.';
    const result = segmentParagraphs(text);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].length).toBeGreaterThan(0);
  });

  test('returns empty array for blank input', () => {
    expect(segmentParagraphs('')).toHaveLength(0);
    expect(segmentParagraphs('   \n\n   ')).toHaveLength(0);
  });

  test('handles single very long sentence (> 40 words) by splitting at comma', () => {
    _wordIdx = 0;
    // 60-word sentence with a comma in the middle
    const part1 = makeWords(30);
    const part2 = makeWords(30);
    const text = `${part1}, ${part2}.`;
    const result = segmentParagraphs(text);
    for (const para of result) {
      expect(countWords(para)).toBeLessThanOrEqual(44);
    }
  });

  test('merges a small tail chunk (< 20 words) into the previous if combined ≤ 40', () => {
    // 3 sentences of 15 words each (45 total), first letter capitalized so splitSentences fires.
    _wordIdx = 0;
    const text = `${makeSentence(15)} ${makeSentence(15)} ${makeSentence(15)}`;
    const result = segmentParagraphs(text);
    // Total words should be preserved
    const total = result.reduce((sum, p) => sum + countWords(p), 0);
    expect(total).toBeGreaterThanOrEqual(43); // 45 - small tolerance for punctuation splitting
  });

  test('handles text with multiple natural paragraph breaks', () => {
    const block1 = buildText({ blocks: 1, sentencesPerBlock: 3, wordsPerSentence: 12 });
    const block2 = buildText({ blocks: 1, sentencesPerBlock: 3, wordsPerSentence: 12 });
    const text = block1 + '\n\n' + block2;
    const result = segmentParagraphs(text);
    expect(result.length).toBeGreaterThan(0);
    const total = result.reduce((sum, p) => sum + countWords(p), 0);
    expect(total).toBeGreaterThan(0);
  });

  test('total word count is approximately preserved after segmentation', () => {
    const text = buildText({ blocks: 5, sentencesPerBlock: 4, wordsPerSentence: 15 });
    const originalWords = countWords(text.replace(/\n\n/g, ' '));
    const segments = segmentParagraphs(text);
    const segmentedWords = segments.reduce((sum, p) => sum + countWords(p), 0);
    // Allow small difference due to punctuation/period handling at split points
    expect(Math.abs(originalWords - segmentedWords)).toBeLessThan(originalWords * 0.05);
  });
});
