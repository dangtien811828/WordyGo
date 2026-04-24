/**
 * IMPORT EBOOK JSON → PostgreSQL
 *
 * Chạy LOCAL:    npx tsx scripts/import-ebook.mts
 * Chạy RAILWAY:  railway run npx tsx scripts/import-ebook.mts
 *
 * Đọc tất cả file .json trong scripts/ebook-data/
 * và insert vào: ebooks → chapters → paragraphs
 */
import 'dotenv/config';
import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg   from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR  = path.join(__dirname, 'ebook-data');

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || undefined,
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'english_learning_app',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  ssl:      process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false,
});

// ══════════════════════════════════════════════════════════════
//  TYPES
// ══════════════════════════════════════════════════════════════

interface ChapterJson {
  chapter_index: number;
  title: string;
  paragraphs?: string[];
}

interface EbookJson {
  title: string;
  author?: string;
  description?: string;
  level?: 'beginner' | 'intermediate' | 'advanced';
  genre?: string[];
  required_plan?: 'free' | 'premium' | 'pro';
  status?: string;
  total_words?: number;
  chapters?: ChapterJson[];
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════');
  console.log('  📚 IMPORT EBOOKS → PostgreSQL');
  console.log('═══════════════════════════════════════════════════\n');

  if (!fs.existsSync(DATA_DIR)) {
    console.error(`❌ Thư mục ${DATA_DIR} không tồn tại!`);
    console.error('   Chạy extract-pdf-ebook.mts trước để tạo file JSON.');
    process.exit(1);
  }

  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json')).sort();
  if (files.length === 0) {
    console.error('❌ Không tìm thấy file JSON nào trong ebook-data/');
    process.exit(1);
  }

  console.log(`📁 Tìm thấy ${files.length} file JSON:\n`);
  files.forEach(f => console.log(`   ${f}`));

  const client = await pool.connect();

  try {
    // Tìm admin account để gán created_by
    const { rows: adminRows } = await client.query<{ id: string }>(
      `SELECT id FROM admin_accounts WHERE role = 'super_admin' LIMIT 1`
    );
    const createdBy: string | null = adminRows[0]?.id ?? null;

    let totalBooks = 0, totalChapters = 0, totalParagraphs = 0;

    for (const file of files) {
      console.log(`\n── ${file} ──`);

      const content = fs.readFileSync(path.join(DATA_DIR, file), 'utf-8');
      const data = JSON.parse(content) as EbookJson;

      await client.query('BEGIN');

      // ── 1. Insert ebook ──
      const { rows: [ebook] } = await client.query<{ id: string; title: string }>(`
        INSERT INTO ebooks (
          title, author, description, level, genre,
          required_plan, status, created_by,
          epub_file_url, total_chapters, total_words
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT DO NOTHING
        RETURNING id, title
      `, [
        data.title,
        data.author || 'Unknown Author',
        data.description || '',
        data.level || 'intermediate',
        data.genre || ['general'],
        data.required_plan || 'free',
        data.status || 'published',
        createdBy,
        `/uploads/ebooks/${file.replace('.json', '.pdf')}`,
        data.chapters?.length || 0,
        data.total_words || 0,
      ]);

      if (!ebook) {
        console.log('  ⚠️ Ebook đã tồn tại, bỏ qua.');
        await client.query('ROLLBACK');
        continue;
      }

      console.log(`  ✓ Ebook: "${ebook.title}" (${ebook.id.substring(0, 8)}...)`);
      totalBooks++;

      // ── 2. Insert chapters + paragraphs ──
      if (data.chapters?.length) {
        for (const chapter of data.chapters) {
          const paragraphs: string[] = chapter.paragraphs ?? [];
          const contentHtml = paragraphs.map(p => `<p>${p}</p>`).join('\n');
          const chapterWordCount = paragraphs.reduce((sum, p) => sum + countWords(p), 0);

          const { rows: [ch] } = await client.query<{ id: string }>(`
            INSERT INTO chapters (ebook_id, chapter_index, title, content_html, word_count)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (ebook_id, chapter_index) DO NOTHING
            RETURNING id
          `, [
            ebook.id,
            chapter.chapter_index,
            chapter.title,
            contentHtml,
            chapterWordCount,
          ]);

          if (!ch) continue;
          totalChapters++;

          // Insert paragraphs
          for (let pi = 0; pi < paragraphs.length; pi++) {
            await client.query(`
              INSERT INTO paragraphs (chapter_id, paragraph_index, text, word_count)
              VALUES ($1, $2, $3, $4)
              ON CONFLICT (chapter_id, paragraph_index) DO NOTHING
            `, [ch.id, pi, paragraphs[pi], countWords(paragraphs[pi])]);
            totalParagraphs++;
          }

          console.log(`  ✓ Ch ${chapter.chapter_index}: "${chapter.title}" — ${paragraphs.length} đoạn, ${chapterWordCount} words`);
        }
      }

      // Update ebook totals
      await client.query(`
        UPDATE ebooks SET
          total_chapters = (SELECT COUNT(*) FROM chapters WHERE ebook_id = $1),
          total_words = (SELECT COALESCE(SUM(word_count), 0) FROM chapters WHERE ebook_id = $1)
        WHERE id = $1
      `, [ebook.id]);

      await client.query('COMMIT');
    }

    // ── Thống kê ──
    console.log('\n═══════════════════════════════════════════════════');
    console.log('  ✅ IMPORT HOÀN TẤT');
    console.log('═══════════════════════════════════════════════════');
    console.log(`  Ebooks             : ${totalBooks}`);
    console.log(`  Chapters           : ${totalChapters}`);
    console.log(`  Paragraphs         : ${totalParagraphs}`);
    console.log('═══════════════════════════════════════════════════\n');

  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('\n❌ Lỗi:', err.message);
    console.error(err.stack);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
