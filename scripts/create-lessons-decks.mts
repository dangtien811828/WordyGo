// scripts/create-lessons-decks.mts
import 'dotenv/config';
import pg from 'pg';
import { v4 as uuidv4 } from 'uuid';

// ══════════════════════════════════════════════════════════════
//  TYPES
// ══════════════════════════════════════════════════════════════
type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
type AppLevel = 'beginner' | 'intermediate' | 'advanced';

interface TopicEntryRow {
  tag_id: string;
  topic: string;
  cefr_level: CefrLevel;
  entry_id: string;
  headword: string;
}

interface EntryLite {
  id: string;
  word: string;
}

interface TopicGroup {
  tag_id: string;
  topic: string;
  cefr_level: CefrLevel;
  entries: EntryLite[];
}

// ══════════════════════════════════════════════════════════════
//  CẤU HÌNH
// ══════════════════════════════════════════════════════════════
const DB_CONFIG = {
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'english_learning_app',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
};

// ID của admin mặc định (lấy từ DB)
const DEFAULT_ADMIN_ID = '55c6f046-b411-4b64-bed4-eff8c8e04ce0';

const CEFR_TO_LEVEL: Record<CefrLevel, AppLevel> = {
  A1: 'beginner',
  A2: 'beginner',
  B1: 'intermediate',
  B2: 'intermediate',
  C1: 'advanced',
  C2: 'advanced',
};

const WORDS_PER_LESSON = 20; // tối đa 20 từ/lesson

// ══════════════════════════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════════════════════════
async function main(): Promise<void> {
  const pool   = new pg.Pool(DB_CONFIG);
  const client = await pool.connect();

  // Lấy tất cả topics có từ
  const { rows: topicGroups } = await client.query<TopicEntryRow>(`
    SELECT
      t.id   AS tag_id,
      t.name AS topic,
      de.cefr_level,
      de.id  AS entry_id,
      de.headword
    FROM tags t
    JOIN entry_tags et           ON t.id = et.tag_id
    JOIN dictionary_entries de   ON et.entry_id = de.id
    WHERE de.published = true
      AND de.cefr_level IS NOT NULL
    ORDER BY t.name, de.cefr_level, de.frequency_rank
  `);

  // Gom nhóm: topic → cefr → [words]
  const groups: Record<string, TopicGroup> = {};
  for (const row of topicGroups) {
    const key = `${row.topic}__${row.cefr_level}`;
    if (!groups[key]) {
      groups[key] = {
        tag_id:     row.tag_id,
        topic:      row.topic,
        cefr_level: row.cefr_level,
        entries:    [],
      };
    }
    groups[key].entries.push({ id: row.entry_id, word: row.headword });
  }

  let lessonCount = 0;
  let deckCount   = 0;

  for (const group of Object.values(groups)) {
    const entries    = group.entries;
    const level      = CEFR_TO_LEVEL[group.cefr_level] || 'beginner';
    const topicLabel = group.topic.replace(/_/g, ' ');

    // Chia nhỏ nếu quá 20 từ
    for (let part = 0; part * WORDS_PER_LESSON < entries.length; part++) {
      const slice     = entries.slice(part * WORDS_PER_LESSON, (part + 1) * WORDS_PER_LESSON);
      const partLabel = entries.length > WORDS_PER_LESSON ? ` (Part ${part + 1})` : '';
      const title     = `${topicLabel.charAt(0).toUpperCase() + topicLabel.slice(1)} — ${group.cefr_level}${partLabel}`;

      // ── Tạo Lesson ──────────────────────────────────────────
      const lessonId = uuidv4();
      await client.query(`
        INSERT INTO lessons (id, title, level, status, sort_order, created_by, created_at, updated_at)
        VALUES ($1, $2, $3, 'published', $4, $5, NOW(), NOW())
        ON CONFLICT DO NOTHING
      `, [lessonId, title, level, lessonCount, DEFAULT_ADMIN_ID]);

      // Gắn tag cho lesson
      await client.query(`
        INSERT INTO lesson_tags (lesson_id, tag_id)
        VALUES ($1, $2) ON CONFLICT DO NOTHING
      `, [lessonId, group.tag_id]);

      // Thêm từ vào lesson
      for (let i = 0; i < slice.length; i++) {
        await client.query(`
          INSERT INTO lesson_entries (lesson_id, entry_id, sort_order)
          VALUES ($1, $2, $3) ON CONFLICT DO NOTHING
        `, [lessonId, slice[i].id, i + 1]);
      }

      lessonCount++;

      // ── Tạo Deck SRS tương ứng ───────────────────────────────
      const deckId = uuidv4();
      await client.query(`
        INSERT INTO decks (id, title, level, deck_type, status, created_by, created_at, updated_at)
        VALUES ($1, $2, $3, 'premade', 'published', $4, NOW(), NOW())
        ON CONFLICT DO NOTHING
      `, [deckId, title, level, DEFAULT_ADMIN_ID]);

      // Gắn tag cho deck
      await client.query(`
        INSERT INTO deck_tags (deck_id, tag_id)
        VALUES ($1, $2) ON CONFLICT DO NOTHING
      `, [deckId, group.tag_id]);

      // Thêm cards
      for (let i = 0; i < slice.length; i++) {
        await client.query(`
          INSERT INTO cards (id, deck_id, entry_id, sort_order, created_at)
          VALUES ($1, $2, $3, $4, NOW())
          ON CONFLICT (deck_id, entry_id) DO NOTHING
        `, [uuidv4(), deckId, slice[i].id, i + 1]);
      }

      deckCount++;
    }

    process.stdout.write(`\r📚 Lessons: ${lessonCount} | 🃏 Decks: ${deckCount}`);
  }

  console.log(`\n\n✅ Xong! Tạo ${lessonCount} lessons và ${deckCount} decks`);
  client.release();
  await pool.end();
}

main().catch((err: unknown) => {
  console.error('\n❌ Lỗi nghiêm trọng:', err);
  process.exit(1);
});
