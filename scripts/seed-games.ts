/**
 * Seed game data: 9 levels, 5 LexiSweep word lists, 5 Anagram word lists, 5 semantic sets.
 *
 * Run: tsx scripts/seed-games.ts
 * Safe to re-run (upserts everywhere).
 */
import 'dotenv/config';
import type { PoolClient } from 'pg';
import pool from '../config/db';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function ins(client: PoolClient, sql: string, params: any[] = []): Promise<string | null> {
  const { rows } = await client.query(sql, params);
  return rows[0]?.id ?? null;
}

// ── Dictionary entries needed for game content ─────────────────────────────────

const EXTRA_WORDS: Array<[string, string, string, string, string[], string, string, string, string, string, number]> = [
  // Happiness scale
  ['content',   'content',   '/ˈkɒntent/',   '/ˈkɒntent/',   ['adjective'], 'hài lòng, mãn nguyện',          'satisfied with what you have',    'She felt content.',              'Cô ấy cảm thấy hài lòng.',              'B1', 9000],
  ['happy',     'happy',     '/ˈhæpi/',       '/ˈhæpi/',       ['adjective'], 'hạnh phúc, vui vẻ',             'feeling or showing joy',           'She was happy.',                 'Cô ấy hạnh phúc.',                      'A1',  100],
  ['joyful',    'joyful',    '/ˈdʒɔɪfəl/',    '/ˈdʒɔɪfəl/',    ['adjective'], 'vui sướng, phấn khởi',          'feeling great happiness',          'It was a joyful event.',         'Đó là sự kiện vui sướng.',              'B2', 8000],
  ['ecstatic',  'ecstatic',  '/ɪkˈstætɪk/',   '/ɪkˈstætɪk/',   ['adjective'], 'sung sướng cực độ',             'overwhelmingly happy and excited', 'She was ecstatic.',              'Cô ấy sung sướng cực độ.',              'C1', 11000],
  ['euphoric',  'euphoric',  '/juːˈfɒrɪk/',   '/juːˈfɒrɪk/',   ['adjective'], 'hân hoan, hạnh phúc tràn ngập', 'intensely happy and excited',      'He felt euphoric.',              'Anh ấy cảm thấy hân hoan.',             'C2', 14000],
  // Cold scale
  ['cool',      'cool',      '/kuːl/',         '/kuːl/',         ['adjective'], 'mát mẻ, tương đối lạnh',        'slightly cold in a pleasant way',  'The water is cool.',             'Nước mát mẻ.',                          'A1',  200],
  ['cold',      'cold',      '/koʊld/',        '/kəʊld/',        ['adjective'], 'lạnh',                          'having a low temperature',         'It was cold outside.',           'Bên ngoài trời lạnh.',                  'A1',  150],
  ['freezing',  'freezing',  '/ˈfriːzɪŋ/',    '/ˈfriːzɪŋ/',    ['adjective'], 'lạnh giá, giá băng',            'extremely cold',                   'It was freezing outside.',       'Bên ngoài giá băng.',                   'B1', 6000],
  ['frigid',    'frigid',    '/ˈfrɪdʒɪd/',    '/ˈfrɪdʒɪd/',    ['adjective'], 'giá lạnh, cực lạnh',            'very cold and unfriendly',         'The frigid air hurt.',           'Không khí giá lạnh khó chịu.',          'C1', 13000],
  ['arctic',    'arctic',    '/ˈɑːrktɪk/',    '/ˈɑːktɪk/',     ['adjective'], 'lạnh giá cực độ',               'extremely and bitterly cold',      'Arctic conditions prevailed.',   'Điều kiện Bắc Cực ngự trị.',            'C1', 15000],
  // Speed scale
  ['slow',      'slow',      '/sloʊ/',         '/sləʊ/',         ['adjective'], 'chậm, chậm chạp',               'not moving quickly',               'The car was slow.',              'Chiếc xe chạy chậm.',                   'A1',  300],
  ['brisk',     'brisk',     '/brɪsk/',        '/brɪsk/',        ['adjective'], 'nhanh nhẹn, hoạt bát',          'quick and energetic',              'A brisk walk is healthy.',       'Đi bộ nhanh nhẹn tốt cho sức khỏe.',   'B2', 8500],
  ['fast',      'fast',      '/fæst/',         '/fɑːst/',        ['adjective'], 'nhanh',                         'moving or happening quickly',      'He is a fast runner.',           'Anh ấy chạy nhanh.',                    'A1',  250],
  ['rapid',     'rapid',     '/ˈræpɪd/',       '/ˈræpɪd/',       ['adjective'], 'nhanh chóng, mau lẹ',           'happening or done quickly',        'Rapid growth occurred.',         'Tăng trưởng nhanh chóng đã xảy ra.',    'B2', 4000],
  ['lightning', 'lightning', '/ˈlaɪtnɪŋ/',    '/ˈlaɪtnɪŋ/',    ['adjective'], 'nhanh như chớp',                'extremely fast',                   'Lightning reflexes needed.',     'Cần phản xạ nhanh như chớp.',           'C1', 7000],
  // Size scale
  ['tiny',      'tiny',      '/ˈtaɪni/',       '/ˈtaɪni/',       ['adjective'], 'tí hon, cực nhỏ',               'very small',                       'A tiny bug appeared.',           'Một con bug tí hon xuất hiện.',         'A2', 3000],
  ['small',     'small',     '/smɔːl/',        '/smɔːl/',        ['adjective'], 'nhỏ, nhỏ bé',                   'little in size',                   'A small car.',                   'Một chiếc xe nhỏ.',                     'A1',  180],
  ['medium',    'medium',    '/ˈmiːdiəm/',     '/ˈmiːdiəm/',     ['adjective'], 'trung bình',                    'of middle size or amount',         'A medium shirt.',                'Áo cỡ trung.',                          'A2', 2000],
  ['large',     'large',     '/lɑːrdʒ/',       '/lɑːdʒ/',        ['adjective'], 'lớn',                           'big in size',                      'A large house.',                 'Một ngôi nhà lớn.',                     'A1',  170],
  ['enormous',  'enormous',  '/ɪˈnɔːrməs/',   '/ɪˈnɔːməs/',    ['adjective'], 'khổng lồ, to lớn',              'very large in size or amount',     'An enormous whale.',             'Một con cá voi khổng lồ.',              'B2', 5000],
];

// Headwords already present in seed.ts that we want to reference
const EXISTING_WORDS = [
  'organize','discover','achieve','environment','significant','communicate',
  'opportunity','challenge','research','technology','develop','essential',
  'strategy','analyze','collaborate','annoyed','irritated','furious','livid','enraged',
];

// ── Game levels ────────────────────────────────────────────────────────────────

const LEVELS = [
  { game_type: 'lexisweep', level_number: 1, config_json: { grid_size: 10, directions: ['h','v','d'], time_limit: 120, min_words: 8 } },
  { game_type: 'lexisweep', level_number: 2, config_json: { grid_size: 12, directions: ['h','v','d'], time_limit: 100, min_words: 10 } },
  { game_type: 'lexisweep', level_number: 3, config_json: { grid_size: 15, directions: ['h','v','d','r'], time_limit: 90, min_words: 12 } },
  { game_type: 'anagram', level_number: 1, config_json: { word_length_min: 4, word_length_max: 8, time_per_word: 30, hints_allowed: 2 } },
  { game_type: 'anagram', level_number: 2, config_json: { word_length_min: 5, word_length_max: 9, time_per_word: 25, hints_allowed: 1 } },
  { game_type: 'anagram', level_number: 3, config_json: { word_length_min: 6, word_length_max: 12, time_per_word: 20, hints_allowed: 0 } },
  { game_type: 'ladder', level_number: 1, config_json: { words_per_set: 5, time_limit: 90 } },
  { game_type: 'ladder', level_number: 2, config_json: { words_per_set: 5, time_limit: 75 } },
  { game_type: 'ladder', level_number: 3, config_json: { words_per_set: 5, time_limit: 60 } },
];

// ── Word lists ─────────────────────────────────────────────────────────────────

const LEXISWEEP_LISTS = [
  { name: 'Academic Vocabulary',  topic: 'Academic',  level: 'intermediate', words: ['organize','achieve','research','strategy','analyze','collaborate','significant','essential'] },
  { name: 'Technology Terms',     topic: 'Technology', level: 'beginner',     words: ['technology','develop','communicate','discover'] },
  { name: 'Business English',     topic: 'Business',   level: 'intermediate', words: ['strategy','collaborate','opportunity','challenge','communicate'] },
  { name: 'Emotions Intensity',   topic: 'Emotions',   level: 'advanced',     words: ['annoyed','irritated','furious','enraged','livid'] },
  { name: 'IELTS Core Vocabulary',topic: 'IELTS',     level: 'advanced',     words: ['significant','environment','research','essential','analyze','opportunity'] },
];

const ANAGRAM_LISTS = [
  { name: 'Verbs of Action',       topic: 'General',  level: 'beginner',     words: ['organize','discover','achieve','develop','communicate','analyze'] },
  { name: 'Descriptive Adjectives',topic: 'General',  level: 'intermediate', words: ['significant','essential','furious','ecstatic','enormous'] },
  { name: 'Academic Words',        topic: 'Academic', level: 'advanced',     words: ['collaborate','research','strategy','environment','opportunity'] },
  { name: 'Emotions Scale',        topic: 'Emotions', level: 'intermediate', words: ['content','happy','joyful','ecstatic','euphoric'] },
  { name: 'Mixed Vocabulary',      topic: 'General',  level: 'beginner',     words: ['challenge','technology','medium','rapid','freezing'] },
];

// ── Semantic sets ─────────────────────────────────────────────────────────────

const SEMANTIC_SETS = [
  {
    name: 'Anger intensity',
    scale_description: 'Words ordered from mildly annoyed to extremely angry',
    level: 'intermediate',
    items: [
      { word: 'annoyed',   order: 1, hint_vi: 'Hơi khó chịu, bực bội nhẹ' },
      { word: 'irritated', order: 2, hint_vi: 'Bực bội, cáu kỉnh hơn một chút' },
      { word: 'furious',   order: 3, hint_vi: 'Tức giận, phẫn nộ mạnh' },
      { word: 'enraged',   order: 4, hint_vi: 'Nổi cơn thịnh nộ dữ dội' },
      { word: 'livid',     order: 5, hint_vi: 'Tức điên - mức cao nhất' },
    ],
  },
  {
    name: 'Happiness',
    scale_description: 'Words ordered from mildly content to overwhelmingly euphoric',
    level: 'intermediate',
    items: [
      { word: 'content',  order: 1, hint_vi: 'Hài lòng, mãn nguyện nhẹ' },
      { word: 'happy',    order: 2, hint_vi: 'Hạnh phúc, vui vẻ' },
      { word: 'joyful',   order: 3, hint_vi: 'Vui sướng, phấn khởi hơn' },
      { word: 'ecstatic', order: 4, hint_vi: 'Sung sướng cực độ' },
      { word: 'euphoric', order: 5, hint_vi: 'Hân hoan tràn ngập - mức cao nhất' },
    ],
  },
  {
    name: 'Cold',
    scale_description: 'Words ordered from mildly cool to extremely arctic cold',
    level: 'beginner',
    items: [
      { word: 'cool',     order: 1, hint_vi: 'Mát mẻ, hơi lạnh dễ chịu' },
      { word: 'cold',     order: 2, hint_vi: 'Lạnh' },
      { word: 'freezing', order: 3, hint_vi: 'Lạnh giá, giá băng' },
      { word: 'frigid',   order: 4, hint_vi: 'Giá lạnh, cực lạnh' },
      { word: 'arctic',   order: 5, hint_vi: 'Lạnh giá cực độ như Bắc Cực - mức cao nhất' },
    ],
  },
  {
    name: 'Speed',
    scale_description: 'Words ordered from slow to lightning fast',
    level: 'beginner',
    items: [
      { word: 'slow',      order: 1, hint_vi: 'Chậm chạp' },
      { word: 'brisk',     order: 2, hint_vi: 'Nhanh nhẹn, hoạt bát' },
      { word: 'fast',      order: 3, hint_vi: 'Nhanh' },
      { word: 'rapid',     order: 4, hint_vi: 'Nhanh chóng, mau lẹ' },
      { word: 'lightning', order: 5, hint_vi: 'Nhanh như chớp - mức cao nhất' },
    ],
  },
  {
    name: 'Size',
    scale_description: 'Words ordered from tiny to enormous',
    level: 'beginner',
    items: [
      { word: 'tiny',     order: 1, hint_vi: 'Tí hon, cực nhỏ' },
      { word: 'small',    order: 2, hint_vi: 'Nhỏ' },
      { word: 'medium',   order: 3, hint_vi: 'Trung bình' },
      { word: 'large',    order: 4, hint_vi: 'Lớn' },
      { word: 'enormous', order: 5, hint_vi: 'Khổng lồ - mức cao nhất' },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Find an editor to use as created_by (nullable FK so null is also fine)
    const { rows: admins } = await client.query(
      `SELECT id FROM admin_accounts ORDER BY created_at ASC LIMIT 1`
    );
    const editorId: string | null = admins[0]?.id ?? null;

    // ── 1. Upsert extra dictionary entries ──────────────────────────────────
    const entryIds: Record<string, string> = {};

    for (const [hw, lm, ipUs, ipUk, pos, vi, en, exEn, exVi, cefr, freq] of EXTRA_WORDS) {
      const { rows } = await client.query(
        `INSERT INTO dictionary_entries
           (headword, lemma, ipa_us, ipa_uk, pos, meaning_vi, meaning_en,
            example_en, example_vi, cefr_level, frequency_rank, source, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'manual',$12)
         ON CONFLICT (headword, lemma) DO UPDATE SET ipa_us = EXCLUDED.ipa_us
         RETURNING id`,
        [hw, lm, ipUs, ipUk, pos, vi, en, exEn, exVi, cefr, freq, editorId]
      );
      entryIds[hw] = rows[0].id;
    }

    // Look up entries already in DB from main seed
    for (const hw of EXISTING_WORDS) {
      const { rows } = await client.query(
        `SELECT id FROM dictionary_entries WHERE headword = $1 LIMIT 1`,
        [hw]
      );
      if (rows[0]) entryIds[hw] = rows[0].id;
    }

    console.log(`  [✓] ${Object.keys(entryIds).length} dictionary entries resolved`);

    // ── 2. Game levels ──────────────────────────────────────────────────────
    for (const lv of LEVELS) {
      await client.query(
        `INSERT INTO game_levels (game_type, level_number, config_json, status)
         VALUES ($1, $2, $3, 'active')
         ON CONFLICT (game_type, level_number)
         DO UPDATE SET config_json = EXCLUDED.config_json`,
        [lv.game_type, lv.level_number, JSON.stringify(lv.config_json)]
      );
    }
    console.log('  [✓] 9 game levels');

    // ── 3. Word lists helper ────────────────────────────────────────────────
    async function seedWordList(gameType: string, list: { name: string; topic: string; level: string; words: string[] }) {
      const validWords = list.words.filter((w) => entryIds[w]);
      if (validWords.length === 0) return;

      const { rows: existing } = await client.query(
        `SELECT id FROM game_word_lists WHERE game_type = $1 AND name = $2`,
        [gameType, list.name]
      );

      let listId: string;
      if (existing[0]) {
        listId = existing[0].id;
        await client.query(`DELETE FROM game_word_list_items WHERE list_id = $1`, [listId]);
        await client.query(
          `UPDATE game_word_lists SET topic = $1, level = $2, status = 'published' WHERE id = $3`,
          [list.topic, list.level, listId]
        );
      } else {
        const id = await ins(
          client,
          `INSERT INTO game_word_lists (game_type, name, topic, level, status, created_by)
           VALUES ($1, $2, $3, $4, 'published', $5) RETURNING id`,
          [gameType, list.name, list.topic, list.level, editorId]
        );
        listId = id!;
      }

      for (const w of validWords) {
        await client.query(
          `INSERT INTO game_word_list_items (list_id, entry_id) VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [listId, entryIds[w]]
        );
      }
    }

    for (const list of LEXISWEEP_LISTS) await seedWordList('lexisweep', list);
    console.log('  [✓] 5 LexiSweep word lists');

    for (const list of ANAGRAM_LISTS) await seedWordList('anagram', list);
    console.log('  [✓] 5 Anagram word lists');

    // ── 4. Semantic sets ────────────────────────────────────────────────────
    for (const set of SEMANTIC_SETS) {
      const validItems = set.items.filter((item) => entryIds[item.word]);
      if (validItems.length < 2) {
        console.warn(`  [!] Skipping set "${set.name}" — not enough entries resolved`);
        continue;
      }

      const { rows: existing } = await client.query(
        `SELECT id FROM semantic_sets WHERE name = $1`,
        [set.name]
      );

      let setId: string;
      if (existing[0]) {
        setId = existing[0].id;
        await client.query(`DELETE FROM semantic_set_items WHERE set_id = $1`, [setId]);
        await client.query(
          `UPDATE semantic_sets SET scale_description = $1, level = $2, status = 'published' WHERE id = $3`,
          [set.scale_description, set.level, setId]
        );
      } else {
        const id = await ins(
          client,
          `INSERT INTO semantic_sets (name, scale_description, level, status, created_by)
           VALUES ($1, $2, $3, 'published', $4) RETURNING id`,
          [set.name, set.scale_description, set.level, editorId]
        );
        setId = id!;
      }

      for (const item of validItems) {
        await client.query(
          `INSERT INTO semantic_set_items (set_id, entry_id, correct_order, hint_vi)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (set_id, entry_id)
           DO UPDATE SET correct_order = EXCLUDED.correct_order, hint_vi = EXCLUDED.hint_vi`,
          [setId, entryIds[item.word], item.order, item.hint_vi]
        );
      }
    }
    console.log('  [✓] 5 semantic sets');

    await client.query('COMMIT');
    console.log('\n[✓] seed-games completed successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[✗] Seed failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
