// scripts/import-oxford.mjs
// Chạy: node scripts/import-oxford.mjs

import fs   from 'fs';
import path from 'path';
import pg   from 'pg';
import { v4 as uuidv4 } from 'uuid';

// ══ CẤU HÌNH ══════════════════════════
const DB_CONFIG = {
  host:     'localhost',
  port:     5432,
  database: 'english_learning_app', 
  user:     'postgres',       
  password: 'postgres',       
};

// Đường dẫn tới repo đã clone
const REPO_DIR  = 'P:/oxford-5000-vocabulary-audio-definition'; 
const JSON_FILE = path.join(REPO_DIR, 'data/oxford_5000.json');
const AUDIO_DIR = path.join(REPO_DIR, 'audio'); 


const TRANSLATE_DELAY = 1300; // ms — tránh rate limit MyMemory
const TRANSLATE_BATCH = 500;  // số từ dịch mỗi lần chạy

const sleep = ms => new Promise(r => setTimeout(r, ms));
function log(msg) {
  const time = new Date().toLocaleTimeString('vi-VN');
  console.log(`[${time}] ${msg}`);
}

// ══ CẤU HÌNH DỊCH ════════════════════════════════════════════
const MYMEMORY_EMAIL = 'DangTien311399@gmail.com'; // ← điền email đăng ký MyMemory

// Các public instance của LibreTranslate (thử lần lượt nếu 1 cái chết)
const LIBRE_INSTANCES = [
  'https://libretranslate.com',
  'https://translate.argosopentech.com',
  'https://libretranslate.de',
];

// Các instance của Lingva (Google Translate proxy)
const LINGVA_INSTANCES = [
  'https://lingva.ml',
  'https://lingva.thedaviddelta.com',
];

// ══ NGUỒN 1: MyMemory (có email) ════════════════════════════
async function translateMyMemory(text) {
  try {
    const q   = encodeURIComponent(text.slice(0, 280));
    const url = `https://api.mymemory.translated.net/get?q=${q}&langpair=en|vi&de=${MYMEMORY_EMAIL}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;

    const data       = await res.json();
    const translated = data?.responseData?.translatedText;

    // Kiểm tra các dạng warning/lỗi từ MyMemory
    if (!translated)                                    return null;
    if (translated.includes('MYMEMORY WARNING'))        return null;
    if (translated.includes('YOU USED ALL AVAILABLE'))  return null;
    if (translated.includes('INVALID'))                 return null;
    if (translated === text)                            return null; // không dịch được

    return translated;
  } catch {
    return null;
  }
}

// ══ NGUỒN 2: LibreTranslate (thử từng instance) ═════════════
async function translateLibre(text) {
  for (const instance of LIBRE_INSTANCES) {
    try {
      const res = await fetch(`${instance}/translate`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          q:      text.slice(0, 500),
          source: 'en',
          target: 'vi',
          format: 'text',
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) continue;
      const data        = await res.json();
      const translated  = data?.translatedText;

      if (translated && translated !== text) return translated;
    } catch {
      continue; // thử instance tiếp theo
    }
  }
  return null;
}

// ══ NGUỒN 3: Lingva Translate (Google proxy) ════════════════
async function translateLingva(text) {
  for (const instance of LINGVA_INSTANCES) {
    try {
      const encoded = encodeURIComponent(text.slice(0, 500));
      const url     = `${instance}/api/v1/en/vi/${encoded}`;
      const res     = await fetch(url, { signal: AbortSignal.timeout(10000) });

      if (!res.ok) continue;
      const data       = await res.json();
      const translated = data?.translation;

      if (translated && translated !== text) return translated;
    } catch {
      continue;
    }
  }
  return null;
}

// ══ HÀM DỊCH CHÍNH: Thử lần lượt 3 nguồn ═══════════════════
async function translateVI(text) {
  if (!text?.trim()) return null;

  // Nguồn 1: MyMemory
  const result1 = await translateMyMemory(text);
  if (result1) return result1;

  await sleep(500); // nghỉ nhỏ trước khi thử nguồn tiếp

  // Nguồn 2: LibreTranslate
  const result2 = await translateLibre(text);
  if (result2) return result2;

  await sleep(500);

  // Nguồn 3: Lingva
  const result3 = await translateLingva(text);
  if (result3) return result3;

  // Tất cả đều thất bại
  return null;
}

// ══ KIỂM TRA FILE AUDIO CÓ TỒN TẠI ══════════════════════════
function resolveAudioUrl(word) {
  // Audio file: happy_uk.mp3 / happy_us.mp3
  const ukFile = path.join(AUDIO_DIR, `${word}_uk.mp3`);
  const usFile = path.join(AUDIO_DIR, `${word}_us.mp3`);

  return {
    audio_uk_url: fs.existsSync(ukFile) ? ukFile : null,
    audio_us_url: fs.existsSync(usFile) ? usFile : null,
  };
}

// ══ PHASE 1: IMPORT TỪ VỰNG ══════════════════════════════════
async function phase1_import(client) {
  log('📖 Đọc oxford_5000.json...');

  if (!fs.existsSync(JSON_FILE)) {
    console.error(`❌ Không tìm thấy file: ${JSON_FILE}`);
    console.error('   Hãy clone repo trước: git clone https://github.com/winterdl/oxford-5000-vocabulary-audio-definition.git');
    process.exit(1);
  }

  const raw  = fs.readFileSync(JSON_FILE, 'utf-8');
  const data = JSON.parse(raw);

  // JSON dạng object {index: entry} → chuyển thành array
  const entries = Object.values(data);
  log(`✓ Tổng số entries: ${entries.length}`);

  // Tạm thời bỏ NOT NULL để import trước, dịch sau
  await client.query(
    `ALTER TABLE dictionary_entries ALTER COLUMN meaning_vi DROP NOT NULL`
  );
  log('✓ Đã tạm bỏ NOT NULL trên meaning_vi\n');

  let success = 0, skip = 0, error = 0;

  for (let i = 0; i < entries.length; i++) {
    const item = entries[i];

    // ── Parse fields từ Oxford JSON ──────────────────────────
    const headword = item.word?.toLowerCase()?.trim();
    if (!headword) { skip++; continue; }

    // pos: Oxford trả về string → wrap thành array cho varchar[]
    const posRaw = item.pos?.trim();
    const pos    = posRaw ? [posRaw] : [];

    // IPA: phon_br = UK, phon_n_am = US (từ scraper code)
    const ipa_uk = item.phon_br     || null;
    const ipa_us = item.phon_n_am   || null;

    // Definition & Example
    const meaning_en = item.definition?.trim() || null;
    const example_en = item.example?.trim()    || null;

    // CEFR level: Oxford dùng "a1","b2",... → uppercase
    const cefrRaw   = item.cefr?.trim();
    const cefr_level = cefrRaw ? cefrRaw.toUpperCase() : null;

    // Audio files
    const { audio_uk_url, audio_us_url } = resolveAudioUrl(headword);

    // ── Insert vào PostgreSQL ─────────────────────────────────
    try {
      await client.query(`
        INSERT INTO dictionary_entries (
          id,
          headword, lemma,
          ipa_us, ipa_uk,
          audio_us_url, audio_uk_url,
          pos,
          meaning_en, meaning_vi,
          example_en, example_vi,
          cefr_level,
          source, published,
          created_at, updated_at
        ) VALUES (
          $1,
          $2, $3,
          $4, $5,
          $6, $7,
          $8,
          $9,  $10,
          $11, $12,
          $13,
          $14, $15,
          NOW(), NOW()
        )
        ON CONFLICT (headword, lemma) DO UPDATE SET
          ipa_us       = EXCLUDED.ipa_us,
          ipa_uk       = EXCLUDED.ipa_uk,
          cefr_level   = EXCLUDED.cefr_level,
          audio_us_url = EXCLUDED.audio_us_url,
          audio_uk_url = EXCLUDED.audio_uk_url,
          updated_at   = NOW()
      `, [
        uuidv4(),
        headword, headword,       // headword, lemma
        ipa_us, ipa_uk,
        audio_us_url, audio_uk_url,
        pos,                      // varchar[]
        meaning_en, null,         // meaning_vi: dịch ở phase 2
        example_en, null,         // example_vi: dịch ở phase 2
        cefr_level,
        'wiktionary', true,
      ]);
      success++;

    } catch (err) {
      if (err.code === '23505') {
        skip++; // duplicate key — bỏ qua bình thường
      } else {
        log(`❌ Lỗi từ "${headword}": ${err.message}`);
        error++;
      }
    }

    // Progress mỗi 50 từ
    if ((i + 1) % 50 === 0 || i === entries.length - 1) {
      const pct = (((i + 1) / entries.length) * 100).toFixed(1);
      process.stdout.write(
        `\r⏳ [Phase 1] ${i+1}/${entries.length} (${pct}%) | ✅ ${success} | ⏭️ ${skip} | ❌ ${error}  `
      );
    }
  }

  console.log('\n');
  log(`✅ Phase 1 XONG! Import: ${success} | Bỏ qua: ${skip} | Lỗi: ${error}`);
  return success;
}

// ══ PHASE 2: DỊCH TIẾNG VIỆT ════════════════════════════════
async function phase2_translate(client) {
  log(`\n🌐 Phase 2: Dịch tiếng Việt (tối đa ${TRANSLATE_BATCH} từ/lần)...`);

  const { rows } = await client.query(`
    SELECT id, headword, meaning_en, example_en
    FROM dictionary_entries
    WHERE (meaning_vi IS NULL OR meaning_vi = '[pending]')
    AND meaning_en IS NOT NULL
    ORDER BY
      CASE cefr_level
        WHEN 'A1' THEN 1 WHEN 'A2' THEN 2
        WHEN 'B1' THEN 3 WHEN 'B2' THEN 4
        WHEN 'C1' THEN 5 WHEN 'C2' THEN 6
        ELSE 7
      END,
      headword ASC
    LIMIT $1
  `, [TRANSLATE_BATCH]);

  if (rows.length === 0) {
    log('🎉 Tất cả từ đã có nghĩa tiếng Việt!');
    return 0;
  }

  log(`  → Cần dịch: ${rows.length} từ`);
  log(`  → Ước tính: ~${Math.ceil(rows.length * 2 * 1.3 / 60)} phút\n`);

  let translated = 0, failed = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];

    // Dịch meaning (thử 3 nguồn)
    const meaning_vi = await translateVI(row.meaning_en);
    await sleep(800); // delay nhỏ hơn vì đã có fallback

    // Dịch example nếu có
    let example_vi = null;
    if (row.example_en && meaning_vi) { // chỉ dịch example khi meaning thành công
      example_vi = await translateVI(row.example_en);
      await sleep(800);
    }

    if (meaning_vi) {
      await client.query(`
        UPDATE dictionary_entries
        SET meaning_vi = $1,
            example_vi = $2,
            updated_at = NOW()
        WHERE id = $3
      `, [meaning_vi, example_vi, row.id]);
      translated++;
    } else {
      await client.query(`
        UPDATE dictionary_entries
        SET meaning_vi = '[pending]',
            updated_at = NOW()
        WHERE id = $1
      `, [row.id]);
      failed++;
    }

    const pct = (((i + 1) / rows.length) * 100).toFixed(1);
    process.stdout.write(
      `\r  🌐 [Phase 2] ${i+1}/${rows.length} (${pct}%) | ✅ ${translated} | ⚠️ ${failed}  `
    );
  }

  console.log('\n');
  log(`✅ Phase 2 XONG! Dịch thành công: ${translated} | Thất bại: ${failed}`);

  // Báo còn bao nhiêu từ chưa dịch
  const { rows: remaining } = await client.query(`
    SELECT COUNT(*) as cnt FROM dictionary_entries
    WHERE meaning_vi IS NULL OR meaning_vi = '[pending]'
  `);
  const remainCount = parseInt(remaining[0].cnt);
  if (remainCount > 0) {
    log(`⚠️  Còn ${remainCount} từ chưa dịch → chạy lại script để tiếp tục`);
  }

  return translated;
}

// ══ PHASE 3: KHÔI PHỤC NOT NULL SAU KHI DỊCH XONG ══════════
async function phase3_finalize(client) {
  const { rows } = await client.query(`
    SELECT COUNT(*) as cnt FROM dictionary_entries
    WHERE meaning_vi IS NULL OR meaning_vi = '[pending]'
  `);
  const pending = parseInt(rows[0].cnt);

  if (pending > 0) {
    log(`⚠️  Còn ${pending} từ chưa có meaning_vi → chưa thể khôi phục NOT NULL`);
    log('   Hãy chạy lại script thêm vài lần nữa để dịch hết');
  } else {
    await client.query(
      `ALTER TABLE dictionary_entries ALTER COLUMN meaning_vi SET NOT NULL`
    );
    log('✅ Đã khôi phục NOT NULL constraint trên meaning_vi');
  }
}

// ══ MAIN ═════════════════════════════════════════════════════
async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  Oxford 5000 → PostgreSQL Importer');
  console.log('═══════════════════════════════════════════════\n');

  const pool   = new pg.Pool(DB_CONFIG);
  const client = await pool.connect();
  log('✓ Đã kết nối PostgreSQL\n');

  try {
    // Kiểm tra xem đã import chưa
    const { rows: existing } = await client.query(
      `SELECT COUNT(*) as cnt FROM dictionary_entries WHERE source = 'wiktionary'`
    );
    const alreadyImported = parseInt(existing[0].cnt);

    if (alreadyImported === 0) {
      // Lần đầu chạy → import từ vựng
      await phase1_import(client);
    } else {
      log(`ℹ️  Đã có ${alreadyImported} từ trong DB → bỏ qua Phase 1`);
    }

    // Luôn chạy phase 2 để dịch từ còn thiếu
    await phase2_translate(client);

    // Kiểm tra và finalize
    await phase3_finalize(client);

    // Thống kê cuối
    console.log('\n══════════════════════════════════');
    const { rows: stats } = await client.query(`
      SELECT
        COUNT(*)                                          AS tong_so,
        COUNT(*) FILTER (WHERE meaning_vi IS NOT NULL
          AND meaning_vi != '[pending]')                 AS da_dich_vi,
        COUNT(*) FILTER (WHERE ipa_us IS NOT NULL)       AS co_ipa_us,
        COUNT(*) FILTER (WHERE ipa_uk IS NOT NULL)       AS co_ipa_uk,
        COUNT(*) FILTER (WHERE audio_us_url IS NOT NULL) AS co_audio_us,
        COUNT(*) FILTER (WHERE cefr_level IS NOT NULL)   AS co_cefr
      FROM dictionary_entries
    `);
    const s = stats[0];
    console.log('📊 THỐNG KÊ DATABASE:');
    console.log(`   Tổng số từ    : ${s.tong_so}`);
    console.log(`   Có nghĩa VI   : ${s.da_dich_vi}`);
    console.log(`   Có IPA US     : ${s.co_ipa_us}`);
    console.log(`   Có IPA UK     : ${s.co_ipa_uk}`);
    console.log(`   Có audio US   : ${s.co_audio_us}`);
    console.log(`   Có CEFR level : ${s.co_cefr}`);
    console.log('══════════════════════════════════\n');

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('\n❌ Lỗi nghiêm trọng:', err.message);
  process.exit(1);
});