/**
 * Seed a sample ebook with 2 chapters and segmented paragraphs.
 * Run: tsx scripts/seed-sample-ebook.ts
 */
import 'dotenv/config';
import pool from '../config/db';
import { segmentParagraphs, countWords } from '../utils/paragraphSegmenter';

const CHAPTER_TEXTS: { title: string; text: string }[] = [
  {
    title: 'The Power of Language',
    text: `Language is one of the most extraordinary capabilities of the human mind. It allows us to convey complex thoughts, share knowledge across generations, and build relationships with others. Every language has its own rhythm, structure, and beauty that reflects the culture of its speakers.

The acquisition of language begins at birth. Infants listen attentively to the sounds around them, gradually learning to recognize patterns in speech. By the age of two, most children can form simple sentences and communicate their basic needs effectively. This process happens naturally without formal instruction.

Reading opens doors to worlds beyond our immediate experience. When we engage with a book, we encounter ideas that challenge our thinking and expand our understanding of human nature. Great literature introduces characters whose lives are vastly different from our own, helping us develop empathy and perspective.

Writing is a skill that requires patience and practice to develop well. It forces us to organize our thoughts clearly before we can express them to others. Good writers learn to choose their words with precision, considering how each phrase will land with their audience. The discipline of writing improves thinking itself.

Vocabulary forms the foundation of effective communication in any language. The richer your vocabulary, the more precisely you can express your ideas and understand others. Learning new words daily, even just a few, compounds over time into a significant advantage. Reading widely is the most natural way to expand vocabulary organically.

Listening is often overlooked as a language skill, yet it is fundamental to all human communication. Active listening means focusing fully on the speaker, understanding not just their words but also their intent and emotion. People who listen well tend to be more effective communicators and better collaborators in every area of life.`,
  },
  {
    title: 'Learning Strategies for Success',
    text: `Effective learning requires more than simply reading material once and hoping it sticks. Research in cognitive science has shown that the brain retains information far better when it encounters material multiple times over spaced intervals. This technique, known as spaced repetition, is one of the most powerful tools available to learners of any subject.

Active recall is another strategy supported strongly by scientific evidence. Instead of passively rereading your notes, you should close the book and try to retrieve what you have learned from memory. This effortful retrieval strengthens the neural pathways associated with that knowledge, making it more durable and accessible when you need it most.

Setting clear goals before a study session dramatically improves focus and productivity. When you know exactly what you want to accomplish, your brain filters out distractions more effectively. Breaking large learning objectives into smaller, manageable chunks prevents overwhelm and creates a sense of progress that sustains motivation over the long term.

The physical environment in which you study plays a significant role in learning outcomes. A quiet, well-lit space free from digital distractions helps maintain concentration. Some learners benefit from background music without lyrics, while others prefer complete silence. Experimenting to find your optimal conditions is worthwhile effort that pays dividends.

Sleep is perhaps the most underestimated factor in effective learning. During deep sleep, the brain consolidates memories from the day, moving information from short-term to long-term storage. Sacrificing sleep to study more is therefore counterproductive. A consistent sleep schedule supports not only memory consolidation but also creativity and problem-solving ability.

Building a habit of reflection at the end of each study session cements learning. Spend a few minutes writing in your own words what you learned and why it matters. This metacognitive practice reveals gaps in understanding and reinforces what you have already absorbed. Over time, this habit transforms scattered facts into coherent and usable knowledge.`,
  },
];

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Find or use null for created_by
    const { rows: adminRows } = await client.query(
      `SELECT id FROM admin_accounts WHERE role = 'super_admin' LIMIT 1`
    );
    const createdBy: string | null = adminRows[0]?.id ?? null;

    // Insert ebook
    const { rows: [ebook] } = await client.query(
      `INSERT INTO ebooks
         (title, author, description, level, genre, required_plan, status, created_by,
          epub_file_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT DO NOTHING
       RETURNING id, title`,
      [
        'English Learning Companion',
        'Sample Author',
        'A sample ebook for testing the paragraph segmentation pipeline.',
        'intermediate',
        ['education', 'language'],
        'free',
        'published',
        createdBy,
        '/uploads/sample-ebook.epub',
      ]
    );

    if (!ebook) {
      console.log('Ebook already exists, skipping.');
      await client.query('ROLLBACK');
      return;
    }

    console.log(`Created ebook: ${ebook.title} (${ebook.id})`);

    let totalParagraphs = 0;

    for (let chapterIndex = 0; chapterIndex < CHAPTER_TEXTS.length; chapterIndex++) {
      const { title, text } = CHAPTER_TEXTS[chapterIndex];

      const paragraphs = segmentParagraphs(text);
      const chapterWordCount = paragraphs.reduce((sum, p) => sum + countWords(p), 0);

      // Insert chapter
      const { rows: [chapter] } = await client.query(
        `INSERT INTO chapters (ebook_id, chapter_index, title, word_count, content_html)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [ebook.id, chapterIndex, title, chapterWordCount, `<p>${text.replace(/\n\n/g, '</p><p>')}</p>`]
      );

      console.log(`  Chapter ${chapterIndex + 1}: "${title}" — ${paragraphs.length} paragraphs`);

      // Insert paragraphs
      for (let pi = 0; pi < paragraphs.length; pi++) {
        const paraText = paragraphs[pi];
        await client.query(
          `INSERT INTO paragraphs (chapter_id, paragraph_index, text, word_count)
           VALUES ($1, $2, $3, $4)`,
          [chapter.id, pi, paraText, countWords(paraText)]
        );
        console.log(`    [${pi}] ${countWords(paraText)} words: ${paraText.slice(0, 60)}…`);
      }

      totalParagraphs += paragraphs.length;
    }

    // Update ebook totals
    await client.query(
      `UPDATE ebooks SET
         total_chapters = $1,
         total_words    = (SELECT COALESCE(SUM(word_count), 0) FROM chapters WHERE ebook_id = $2)
       WHERE id = $2`,
      [CHAPTER_TEXTS.length, ebook.id]
    );

    await client.query('COMMIT');
    console.log(`\n✅ Seeded ebook with ${CHAPTER_TEXTS.length} chapters, ${totalParagraphs} total paragraphs.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
