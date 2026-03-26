/**
 * Seed: Dữ liệu test cho toàn bộ hệ thống
 * Chạy: npm run db:seed
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../config/db');

// ── Helpers ──
async function ins(client, sql, params) {
  const { rows } = await client.query(sql, params || []);
  return rows[0]?.id;
}

const hoursAgo  = (h) => new Date(Date.now() - h * 3600000);
const daysAgo   = (d) => new Date(Date.now() - d * 86400000);
const daysLater = (d) => new Date(Date.now() + d * 86400000);

const seed = async () => {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('╔══════════════════════════════════════════╗');
    console.log('║   English Learning App — DB Seed         ║');
    console.log('╚══════════════════════════════════════════╝\n');

    const hash = await bcrypt.hash('password123', 10);

    // ═══════════════════════════════
    //  DOMAIN 1: ADMINS & USERS
    // ═══════════════════════════════
    console.log('── Domain 1: Auth ──');

    const adminId = await ins(client,
      `INSERT INTO admin_accounts (email, password_hash, full_name, role)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT(email) DO UPDATE SET full_name=EXCLUDED.full_name RETURNING id`,
      ['admin@english-app.com', hash, 'Super Admin', 'super_admin']);

    const editorId = await ins(client,
      `INSERT INTO admin_accounts (email, password_hash, full_name, role)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT(email) DO UPDATE SET full_name=EXCLUDED.full_name RETURNING id`,
      ['editor@english-app.com', hash, 'Nguyễn Văn Editor', 'content_editor']);

    const modId = await ins(client,
      `INSERT INTO admin_accounts (email, password_hash, full_name, role)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT(email) DO UPDATE SET full_name=EXCLUDED.full_name RETURNING id`,
      ['mod@english-app.com', hash, 'Trần Thị Moderator', 'moderator']);

    console.log('  [✓] 3 admin accounts');

    const userIds = [];
    const usersData = [
      ['an.nguyen@gmail.com',   'Nguyễn Văn An',  'beginner',     12, 15, hoursAgo(2)],
      ['binh.tran@gmail.com',   'Trần Minh Bình', 'intermediate', 45, 50, hoursAgo(1)],
      ['chi.le@gmail.com',      'Lê Thị Chi',     'advanced',     90, 120, hoursAgo(5)],
      ['dung.pham@gmail.com',   'Phạm Văn Dũng',  'beginner',     3,  5,  hoursAgo(24)],
      ['em.hoang@gmail.com',    'Hoàng Thị Em',   'intermediate', 22, 30, hoursAgo(10)],
    ];

    for (const [email, name, level, streak, longest, lastActive] of usersData) {
      const uid = await ins(client,
        `INSERT INTO users (email, password_hash, full_name, level, streak_current, streak_longest, last_active_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT(email) DO UPDATE SET full_name=EXCLUDED.full_name RETURNING id`,
        [email, hash, name, level, streak, longest, lastActive]);
      userIds.push(uid);
    }
    console.log('  [✓] 5 mobile users');

    // ═══════════════════════════════
    //  DOMAIN 2: TAGS & DICTIONARY
    // ═══════════════════════════════
    console.log('\n── Domain 2: Content ──');

    const tagNames = ['IELTS', 'TOEIC', 'Business', 'Daily', 'Academic', 'Travel', 'Technology', 'Science'];
    const tagIds = {};
    for (const name of tagNames) {
      const id = await ins(client,
        `INSERT INTO tags (name) VALUES ($1)
         ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
        [name]);
      tagIds[name] = id;
    }
    console.log('  [✓] 8 tags');

    // 20 dictionary entries — pos dùng JS array, pg tự convert sang VARCHAR[]
    const entriesData = [
      ['organize',    'organize',   '/ˈɔːɡənaɪz/',    ['verb'],              'tổ chức, sắp xếp',         'to arrange systematically',            'Please organize the files.',                 'Hãy sắp xếp các tài liệu.'],
      ['discover',    'discover',   '/dɪˈskʌvər/',     ['verb'],              'khám phá, phát hiện',       'to find for the first time',            'Scientists discovered a new species.',        'Các nhà khoa học phát hiện loài mới.'],
      ['achieve',     'achieve',    '/əˈtʃiːv/',       ['verb'],              'đạt được, hoàn thành',      'to reach a goal',                       'She achieved her dream.',                     'Cô ấy đạt được ước mơ.'],
      ['environment', 'environment','/ɪnˈvaɪrənmənt/', ['noun'],              'môi trường',                'the natural world around us',            'We must protect the environment.',            'Chúng ta phải bảo vệ môi trường.'],
      ['significant', 'significant','/sɪɡˈnɪfɪkənt/',  ['adjective'],         'đáng kể, quan trọng',       'large enough to be important',           'There was a significant improvement.',        'Đã có sự cải thiện đáng kể.'],
      ['communicate', 'communicate','/kəˈmjuːnɪkeɪt/', ['verb'],              'giao tiếp, truyền đạt',     'to share information',                   'We communicate through language.',            'Chúng ta giao tiếp qua ngôn ngữ.'],
      ['opportunity', 'opportunity','/ˌɒpəˈtjuːnəti/', ['noun'],              'cơ hội',                    'a chance for progress',                  'This is a great opportunity.',                'Đây là cơ hội tuyệt vời.'],
      ['challenge',   'challenge',  '/ˈtʃælɪndʒ/',     ['noun', 'verb'],      'thử thách',                 'a difficult task',                       'The exam was a real challenge.',               'Kỳ thi là thử thách thực sự.'],
      ['research',    'research',   '/rɪˈsɜːtʃ/',      ['noun', 'verb'],      'nghiên cứu',                'systematic investigation',               'More research is needed.',                    'Cần thêm nghiên cứu.'],
      ['technology',  'technology', '/tekˈnɒlədʒi/',    ['noun'],              'công nghệ',                 'application of science',                 'Technology is advancing rapidly.',             'Công nghệ đang tiến bộ nhanh.'],
      ['develop',     'develop',    '/dɪˈveləp/',       ['verb'],              'phát triển',                'to grow or cause to grow',               'We need to develop new skills.',               'Cần phát triển kỹ năng mới.'],
      ['essential',   'essential',  '/ɪˈsenʃəl/',      ['adjective'],         'thiết yếu',                 'absolutely necessary',                   'Water is essential for life.',                 'Nước thiết yếu cho sự sống.'],
      ['strategy',    'strategy',   '/ˈstrætədʒi/',     ['noun'],              'chiến lược',                'a plan of action',                       'We need a new strategy.',                     'Cần chiến lược mới.'],
      ['analyze',     'analyze',    '/ˈænəlaɪz/',      ['verb'],              'phân tích',                 'to examine in detail',                   'Let me analyze the data.',                    'Để tôi phân tích dữ liệu.'],
      ['collaborate', 'collaborate','/kəˈlæbəreɪt/',   ['verb'],              'hợp tác',                   'to work together',                       'Teams collaborate on projects.',               'Các nhóm hợp tác trong dự án.'],
      ['annoyed',     'annoy',      '/əˈnɔɪd/',        ['adjective'],         'hơi bực, khó chịu',         'slightly angry',                         'She was annoyed by the noise.',                'Cô ấy hơi bực vì tiếng ồn.'],
      ['irritated',   'irritate',   '/ˈɪrɪteɪtɪd/',    ['adjective'],         'bực bội, cáu',              'annoyed or angered',                     'He felt irritated.',                           'Anh ấy cảm thấy bực bội.'],
      ['furious',     'furious',    '/ˈfjʊəriəs/',     ['adjective'],         'giận dữ, phẫn nộ',          'extremely angry',                        'She was furious about the lie.',               'Cô ấy giận dữ vì lời nói dối.'],
      ['livid',       'livid',      '/ˈlɪvɪd/',        ['adjective'],         'tức điên',                  'extremely angry, furious',                'He was livid when he found out.',              'Anh ấy tức điên khi phát hiện.'],
      ['enraged',     'enrage',     '/ɪnˈreɪdʒd/',     ['adjective'],         'nổi cơn thịnh nộ',          'filled with rage',                       'The crowd was enraged.',                       'Đám đông nổi cơn thịnh nộ.'],
    ];

    const entryIds = [];
    for (const [headword, lemma, ipa, pos, vi, en, exEn, exVi] of entriesData) {
      const id = await ins(client,
        `INSERT INTO dictionary_entries (headword, lemma, ipa, pos, meaning_vi, meaning_en, example_en, example_vi, source, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'manual',$9)
         ON CONFLICT(headword, lemma) DO UPDATE SET ipa=EXCLUDED.ipa RETURNING id`,
        [headword, lemma, ipa, pos, vi, en, exEn, exVi, editorId]);
      entryIds.push(id);
    }
    console.log('  [✓] 20 dictionary entries');

    // Entry-tag links
    const entryTagMap = [
      [0,'IELTS'],[0,'Business'],[1,'Daily'],[2,'IELTS'],[2,'Academic'],
      [3,'IELTS'],[3,'Science'],[4,'Academic'],[5,'Daily'],[5,'Business'],
      [6,'Business'],[7,'IELTS'],[8,'Academic'],[8,'Science'],[9,'Technology'],
      [10,'Business'],[11,'IELTS'],[12,'Business'],[13,'Academic'],[14,'Business'],
    ];
    for (const [ei, tagName] of entryTagMap) {
      await client.query(
        'INSERT INTO entry_tags (entry_id, tag_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [entryIds[ei], tagIds[tagName]]);
    }
    console.log('  [✓] 20 entry-tag links');

    // Lessons
    const lesson1Id = await ins(client,
      `INSERT INTO lessons (title, description, content_html, level, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      ['Business English Essentials', 'Từ vựng thiết yếu cho giao tiếp công sở',
       '<h2>Business Vocabulary</h2><p>Học các từ vựng quan trọng trong môi trường kinh doanh.</p>',
       'intermediate', 'published', editorId]);

    const lesson2Id = await ins(client,
      `INSERT INTO lessons (title, description, content_html, level, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      ['Academic Writing Words', 'Từ vựng cho viết luận học thuật',
       '<h2>Academic Vocabulary</h2><p>Từ vựng thường gặp trong IELTS Writing Task 2.</p>',
       'advanced', 'published', editorId]);

    for (let i = 0; i < 8; i++) {
      await client.query('INSERT INTO lesson_entries (lesson_id,entry_id,sort_order) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [lesson1Id, entryIds[i], i]);
    }
    for (let i = 8; i < 15; i++) {
      await client.query('INSERT INTO lesson_entries (lesson_id,entry_id,sort_order) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [lesson2Id, entryIds[i], i - 8]);
    }

    await client.query('INSERT INTO lesson_tags VALUES ($1,$2) ON CONFLICT DO NOTHING', [lesson1Id, tagIds['Business']]);
    await client.query('INSERT INTO lesson_tags VALUES ($1,$2) ON CONFLICT DO NOTHING', [lesson2Id, tagIds['Academic']]);
    await client.query('INSERT INTO lesson_tags VALUES ($1,$2) ON CONFLICT DO NOTHING', [lesson2Id, tagIds['IELTS']]);
    console.log('  [✓] 2 lessons + entries + tags');

    // User lesson progress — ngày tính trong JS
    await client.query(
      `INSERT INTO user_lesson_progress (user_id, lesson_id, completed, progress, started_at)
       VALUES ($1,$2,false,0.6,$3) ON CONFLICT DO NOTHING`,
      [userIds[1], lesson1Id, daysAgo(3)]);
    await client.query(
      `INSERT INTO user_lesson_progress (user_id, lesson_id, completed, progress, started_at, completed_at)
       VALUES ($1,$2,true,1.0,$3,$4) ON CONFLICT DO NOTHING`,
      [userIds[2], lesson2Id, daysAgo(7), daysAgo(5)]);
    console.log('  [✓] 2 user lesson progress');

    // ═══════════════════════════════
    //  DOMAIN 3+4: LEARNING
    // ═══════════════════════════════
    console.log('\n── Domain 3+4: Learning ──');

    const deck1Id = await ins(client,
      `INSERT INTO decks (title, description, level, status, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      ['IELTS Core Vocabulary', 'Từ vựng cốt lõi cho IELTS', 'intermediate', 'published', editorId]);

    const deck2Id = await ins(client,
      `INSERT INTO decks (title, description, level, status, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      ['Daily English 500', '500 từ giao tiếp hàng ngày', 'beginner', 'published', editorId]);

    await client.query('INSERT INTO deck_tags VALUES ($1,$2) ON CONFLICT DO NOTHING', [deck1Id, tagIds['IELTS']]);
    await client.query('INSERT INTO deck_tags VALUES ($1,$2) ON CONFLICT DO NOTHING', [deck2Id, tagIds['Daily']]);

    const cardIds = [];
    for (let i = 0; i < 10; i++) {
      const cid = await ins(client,
        'INSERT INTO cards (deck_id,entry_id,sort_order) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id',
        [deck1Id, entryIds[i], i]);
      if (cid) cardIds.push(cid);
    }
    for (let i = 0; i < 8; i++) {
      const cid = await ins(client,
        'INSERT INTO cards (deck_id,entry_id,sort_order) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id',
        [deck2Id, entryIds[i], i]);
      if (cid) cardIds.push(cid);
    }
    console.log(`  [✓] 2 decks + ${cardIds.length} cards`);

    // SRS progress — tính due_at trong JS, không dùng SQL interval
    const intervals = [1, 2, 7, 14, 30];
    for (let i = 0; i < Math.min(5, cardIds.length); i++) {
      const box = i + 1;
      await client.query(
        `INSERT INTO user_card_progress (user_id, card_id, leitner_box, ease, interval, due_at)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
        [userIds[1], cardIds[i], box, 2.5 + (i * 0.1), intervals[i], daysLater(intervals[i])]);

      // Reviews — created_at tính trong JS
      for (let r = 0; r < 2; r++) {
        const correct = Math.random() > 0.3;
        await client.query(
          `INSERT INTO reviews (user_id, card_id, rating, mode, time_ms, correct, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [userIds[1], cardIds[i], correct ? 3 : 1, 'flashcard',
           1500 + Math.floor(Math.random() * 3000), correct, daysAgo(r + 1)]);
      }
    }
    console.log('  [✓] SRS progress + reviews');

    // Retrieval session — UUID[] dùng explicit cast
    await client.query(
      `INSERT INTO retrieval_sessions
       (user_id, target_words, target_entry_ids, sentences, fixes, all_passed, model_used, latency_ms, tokens_in, tokens_out, cost_usd)
       VALUES ($1, $2::varchar[], $3::uuid[], $4::text[], $5::text[], $6, $7, $8, $9, $10, $11)`,
      [userIds[1],
       ['organize', 'discover', 'achieve'],
       [entryIds[0], entryIds[1], entryIds[2]],
       ['I need to organize my desk.', 'She discovered a new restaurant.', 'He achieved his goal.'],
       ['I need to organize my desk.', 'She discovered a new restaurant.', 'He achieved his goal.'],
       true, 'gpt-4o', 2340, 450, 380, 0.0082]);
    console.log('  [✓] 1 retrieval session');

    // ═══════════════════════════════
    //  DOMAIN 5: EBOOK
    // ═══════════════════════════════
    console.log('\n── Domain 5: Ebook ──');

    const book1Id = await ins(client,
      `INSERT INTO ebooks (title, author, description, epub_file_url, level, genre, total_chapters, total_words, required_plan, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      ['The Little Prince', 'Antoine de Saint-Exupéry', 'Câu chuyện cổ tích triết lý',
       '/uploads/ebooks/little-prince.epub', 'beginner', ['fiction'], 5, 15200, 'free', 'published', editorId]);

    const book2Id = await ins(client,
      `INSERT INTO ebooks (title, author, description, epub_file_url, level, genre, total_chapters, total_words, required_plan, status, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      ['Atomic Habits', 'James Clear', 'Thói quen nguyên tử',
       '/uploads/ebooks/atomic-habits.epub', 'intermediate', ['non_fiction', 'self_help'], 8, 52000, 'premium', 'published', editorId]);

    const ch1 = ['The Pilot','The Asteroid','The Rose','The Fox','The Journey Home'];
    for (let i = 0; i < ch1.length; i++) {
      await client.query('INSERT INTO chapters (ebook_id,chapter_index,title,word_count) VALUES ($1,$2,$3,$4)',
        [book1Id, i + 1, ch1[i], 2500 + Math.floor(Math.random() * 1500)]);
    }
    const ch2 = ['The Fundamentals','How Habits Work','Make It Obvious','Make It Attractive',
                 'Make It Easy','Make It Satisfying','Advanced Tactics','Conclusion'];
    for (let i = 0; i < ch2.length; i++) {
      await client.query('INSERT INTO chapters (ebook_id,chapter_index,title,word_count) VALUES ($1,$2,$3,$4)',
        [book2Id, i + 1, ch2[i], 5000 + Math.floor(Math.random() * 3000)]);
    }
    console.log('  [✓] 2 ebooks + 13 chapters');

    await client.query('INSERT INTO ebook_glossary (ebook_id,term_en,translation_vi,domain,occurrences) VALUES ($1,$2,$3,$4,$5)',
      [book1Id, 'asteroid', 'tiểu hành tinh', 'astronomy', 12]);
    await client.query('INSERT INTO ebook_glossary (ebook_id,term_en,translation_vi,domain,occurrences) VALUES ($1,$2,$3,$4,$5)',
      [book2Id, 'habit loop', 'vòng lặp thói quen', 'psychology', 28]);
    await client.query('INSERT INTO ebook_glossary (ebook_id,term_en,translation_vi,domain,occurrences) VALUES ($1,$2,$3,$4,$5)',
      [book2Id, 'cue', 'tín hiệu kích hoạt', 'psychology', 45]);

    await client.query(
      `INSERT INTO user_reading_progress (user_id,ebook_id,current_chapter,progress,total_time_sec,words_looked_up,started_at,last_read_at)
       VALUES ($1,$2,3,0.6,5400,34,$3,$4) ON CONFLICT DO NOTHING`,
      [userIds[1], book1Id, daysAgo(5), daysAgo(1)]);
    console.log('  [✓] 3 glossary + 1 reading progress');

    // ═══════════════════════════════
    //  DOMAIN 6: GAMING
    // ═══════════════════════════════
    console.log('\n── Domain 6: Gaming ──');

    const gameLevels = [
      ['lexisweep', 1, { grid_size: 6, directions: ['horizontal','vertical'], time_limit: 120, show_word_list: true, min_words: 5 }],
      ['lexisweep', 2, { grid_size: 8, directions: ['horizontal','vertical','diagonal'], time_limit: 100, show_word_list: true, min_words: 8 }],
      ['lexisweep', 3, { grid_size: 10, directions: ['horizontal','vertical','diagonal','reverse'], time_limit: 90, show_word_list: false, min_words: 10 }],
      ['anagram', 1, { word_length_min: 3, word_length_max: 5, time_per_word: 45, hints_allowed: 3, points_per_solve: 1000, penalty_per_hint: 300 }],
      ['anagram', 2, { word_length_min: 5, word_length_max: 8, time_per_word: 30, hints_allowed: 2, points_per_solve: 2000, penalty_per_hint: 500 }],
      ['anagram', 3, { word_length_min: 7, word_length_max: 12, time_per_word: 20, hints_allowed: 1, points_per_solve: 3000, penalty_per_hint: 800 }],
      ['ladder', 1, { words_per_set: 4, time_limit: 120, penalty_per_info: 50 }],
      ['ladder', 2, { words_per_set: 6, time_limit: 90, penalty_per_info: 100 }],
      ['ladder', 3, { words_per_set: 8, time_limit: 60, penalty_per_info: 200 }],
    ];

    const levelIds = {};
    for (const [type, num, config] of gameLevels) {
      const id = await ins(client,
        `INSERT INTO game_levels (game_type,level_number,config_json) VALUES ($1,$2,$3)
         ON CONFLICT(game_type,level_number) DO UPDATE SET config_json=EXCLUDED.config_json RETURNING id`,
        [type, num, JSON.stringify(config)]);
      levelIds[`${type}_${num}`] = id;
    }
    console.log('  [✓] 9 game levels');

    const wlId = await ins(client,
      `INSERT INTO game_word_lists (game_type,name,topic,level,created_by)
       VALUES ('lexisweep','Business Basics','Business','intermediate',$1) RETURNING id`, [editorId]);
    for (let i = 0; i < 10; i++) {
      await client.query('INSERT INTO game_word_list_items VALUES ($1,$2) ON CONFLICT DO NOTHING', [wlId, entryIds[i]]);
    }
    console.log('  [✓] 1 word list + 10 items');

    const ssId = await ins(client,
      `INSERT INTO semantic_sets (name,scale_description,level,created_by)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      ['Anger Intensity', 'Sắp xếp theo mức độ giận dữ từ nhẹ đến mạnh', 'advanced', editorId]);

    const angerWords = [
      [entryIds[15], 1, 'hơi bực'], [entryIds[16], 2, 'bực bội'],
      [entryIds[17], 3, 'giận dữ'], [entryIds[19], 4, 'nổi cơn thịnh nộ'],
      [entryIds[18], 5, 'tức điên'],
    ];
    for (const [eid, order, hint] of angerWords) {
      await client.query('INSERT INTO semantic_set_items (set_id,entry_id,correct_order,hint_vi) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
        [ssId, eid, order, hint]);
    }
    console.log('  [✓] 1 semantic set + 5 items');

    await client.query(
      `INSERT INTO game_runs (user_id,game_type,level_id,list_id,score,accuracy,time_sec,completed,details_json)
       VALUES ($1,'lexisweep',$2,$3,3400,0.85,95,true,$4)`,
      [userIds[1], levelIds['lexisweep_1'], wlId, JSON.stringify({ words_found: 8, total_words: 10, combos: 3 })]);
    await client.query(
      `INSERT INTO game_runs (user_id,game_type,level_id,set_id,score,accuracy,time_sec,completed,details_json)
       VALUES ($1,'ladder',$2,$3,2800,0.80,45,true,$4)`,
      [userIds[2], levelIds['ladder_2'], ssId, JSON.stringify({ correct_positions: 4, total: 5, hints_used: 1 })]);
    console.log('  [✓] 2 game runs');

    // ═══════════════════════════════
    //  DOMAIN 7: SUBSCRIPTIONS
    // ═══════════════════════════════
    console.log('\n── Domain 7: Commerce ──');

    const freePlanId = await ins(client,
      `INSERT INTO subscription_plans (name,description,icon_color,price_monthly,price_yearly,sort_order,status)
       VALUES ('Free','Gói miễn phí cơ bản','#94A3B8',0,0,1,'active') RETURNING id`);

    const premiumPlanId = await ins(client,
      `INSERT INTO subscription_plans (name,description,icon_color,price_monthly,price_yearly,trial_days,is_recommended,sort_order,status)
       VALUES ('Premium','Mở khóa toàn bộ tính năng','#2563EB',99000,899000,7,true,2,'active') RETURNING id`);

    const proPlanId = await ins(client,
      `INSERT INTO subscription_plans (name,description,icon_color,price_monthly,price_yearly,sort_order,status)
       VALUES ('Pro','Trải nghiệm cao cấp nhất','#F59E0B',199000,1790000,3,'active') RETURNING id`);

    const features = [
      [freePlanId,'flashcard_max_decks','2'],[freePlanId,'review_modes','swift_choice'],
      [freePlanId,'retrieval_practice','false'],[freePlanId,'leitner','false'],
      [freePlanId,'games','lexisweep'],[freePlanId,'ebook_max','3'],
      [freePlanId,'tts','false'],[freePlanId,'translation_daily','10'],
      [freePlanId,'ads','true'],[freePlanId,'offline','limited'],
      [premiumPlanId,'flashcard_max_decks','20'],[premiumPlanId,'review_modes','swift_choice,cloze_craft,pair_link'],
      [premiumPlanId,'retrieval_practice','5'],[premiumPlanId,'leitner','true'],
      [premiumPlanId,'games','lexisweep,anagram,ladder'],[premiumPlanId,'ebook_max','50'],
      [premiumPlanId,'tts','standard'],[premiumPlanId,'translation_daily','100'],
      [premiumPlanId,'ads','false'],[premiumPlanId,'offline','full'],
      [proPlanId,'flashcard_max_decks','unlimited'],[proPlanId,'review_modes','swift_choice,cloze_craft,pair_link'],
      [proPlanId,'retrieval_practice','unlimited'],[proPlanId,'leitner','true'],
      [proPlanId,'games','lexisweep,anagram,ladder,exclusive'],[proPlanId,'ebook_max','unlimited'],
      [proPlanId,'tts','premium'],[proPlanId,'translation_daily','unlimited'],
      [proPlanId,'ads','false'],[proPlanId,'offline','full'],
    ];
    for (const [pid, key, val] of features) {
      await client.query('INSERT INTO plan_features (plan_id,feature_key,feature_value) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [pid, key, val]);
    }
    console.log('  [✓] 3 plans + 30 features');

    const sub1Id = await ins(client,
      `INSERT INTO user_subscriptions (user_id,plan_id,billing_cycle,price_paid,status,current_period_start,current_period_end)
       VALUES ($1,$2,'monthly',99000,'active',$3,$4) RETURNING id`,
      [userIds[1], premiumPlanId, daysAgo(15), daysLater(15)]);
    await client.query(
      `INSERT INTO transactions (user_id,subscription_id,type,amount,payment_method,payment_ref,status)
       VALUES ($1,$2,'new',99000,'momo','MOMO_TXN_001','completed')`,
      [userIds[1], sub1Id]);

    const sub2Id = await ins(client,
      `INSERT INTO user_subscriptions (user_id,plan_id,billing_cycle,price_paid,status,current_period_start,current_period_end)
       VALUES ($1,$2,'yearly',1790000,'active',$3,$4) RETURNING id`,
      [userIds[2], proPlanId, daysAgo(60), daysLater(305)]);
    await client.query(
      `INSERT INTO transactions (user_id,subscription_id,type,amount,payment_method,payment_ref,status)
       VALUES ($1,$2,'new',1790000,'zalopay','ZALO_TXN_002','completed')`,
      [userIds[2], sub2Id]);
    console.log('  [✓] 2 subscriptions + 2 transactions');

    // ═══════════════════════════════
    //  DOMAIN 8: AI & SYNC
    // ═══════════════════════════════
    console.log('\n── Domain 8: AI & Sync ──');

    const promptSchema = {
      type: 'object',
      properties: {
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              sentence_index: { type: 'integer' },
              used_target: { type: 'boolean' },
              grammar_ok: { type: 'boolean' },
              errors: { type: 'array' },
              fix: { type: 'string' },
              explanation_vi: { type: 'string' },
            }
          }
        }
      }
    };

    await client.query(
      `INSERT INTO prompt_templates (name,description,model,system_prompt,expected_schema,version,status,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      ['Retrieval Practice Grader v1',
       'Chấm ngữ pháp 3 câu tiếng Anh + target words',
       'gpt-4o',
       'You are an English grammar checker. Check each sentence for target word usage and grammar.',
       JSON.stringify(promptSchema), 1, 'active', adminId]);
    console.log('  [✓] 1 prompt template');

    const glossaryTerms = [
      ['machine learning','học máy','tech'],
      ['artificial intelligence','trí tuệ nhân tạo','tech'],
      ['database','cơ sở dữ liệu','tech'],
      ['spaced repetition','lặp lại ngắt quãng','education'],
    ];
    for (const [en, vi, domain] of glossaryTerms) {
      await client.query('INSERT INTO translation_glossary (term_en,translation_vi,domain,created_by) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
        [en, vi, domain, editorId]);
    }
    console.log('  [✓] 4 glossary terms');

    const batchId = await ins(client,
      `INSERT INTO micro_delta_batches (seq,entries_count,batch_type,status,published_at,created_by)
       VALUES (1,5,'manual','published',NOW(),$1) RETURNING id`, [editorId]);
    for (let i = 0; i < 5; i++) {
      const snapshot = { headword: entriesData[i][0], ipa: entriesData[i][2], meaning_vi: entriesData[i][4] };
      await client.query('INSERT INTO batch_entries (batch_id,entry_id,action,entry_snapshot) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
        [batchId, entryIds[i], 'upsert', JSON.stringify(snapshot)]);
    }
    console.log('  [✓] 1 batch + 5 entries');

    // ═══════════════════════════════
    //  DOMAIN 9: SYSTEM
    // ═══════════════════════════════
    console.log('\n── Domain 9: System ──');

    const configs = [
      ['leitner_intervals', [1,2,7,14,30], 'Box intervals (ngày)'],
      ['fsrs_default_ease', 2.5, 'FSRS ease factor'],
      ['fsrs_retention_target', 0.9, 'Retention target (90%)'],
      ['cards_per_session', 20, 'Cards mỗi session'],
      ['min_cards_to_start', 5, 'Min cards để bắt đầu'],
      ['tts_default_voice', 'en-US-Wavenet-D', 'TTS voice'],
      ['tts_default_speed', 1.0, 'TTS speed'],
      ['tts_max_cache_gb', 10, 'Max TTS cache (GB)'],
      ['gpt_active_model', 'gpt-4o', 'GPT model'],
      ['gpt_timeout_ms', 4500, 'GPT timeout (ms)'],
      ['translation_daily_free', 10, 'Translations/day (Free)'],
      ['translation_daily_premium', 100, 'Translations/day (Premium)'],
      ['notification_time', '08:00', 'Daily reminder time'],
      ['batch_size', 100, 'Entries per batch'],
      ['maintenance_mode', { enabled: false, message: '', allow_admin: true }, 'Maintenance mode'],
    ];
    for (const [key, value, desc] of configs) {
      await client.query(
        `INSERT INTO system_configs (config_key,config_value,description,updated_by)
         VALUES ($1,$2,$3,$4) ON CONFLICT(config_key) DO UPDATE SET config_value=EXCLUDED.config_value`,
        [key, JSON.stringify(value), desc, adminId]);
    }
    console.log('  [✓] 15 system configs');

    // Audit logs — details dùng parameter binding
    await client.query(
      `INSERT INTO audit_logs (admin_id,action,module,target_type,target_label,details,ip_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [adminId, 'LOGIN', 'auth', 'admin', 'admin@english-app.com', JSON.stringify({ method: 'password' }), '127.0.0.1']);
    await client.query(
      `INSERT INTO audit_logs (admin_id,action,module,target_type,target_label,details,ip_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [editorId, 'CREATE', 'dictionary', 'entry', 'organize', JSON.stringify({ source: 'manual' }), '127.0.0.1']);
    await client.query(
      `INSERT INTO audit_logs (admin_id,action,module,target_type,target_label,details,ip_address)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [editorId, 'PUBLISH', 'lessons', 'lesson', 'Business English Essentials', JSON.stringify({ entries_count: 8 }), '127.0.0.1']);
    console.log('  [✓] 3 audit logs');

    // Notifications
    await client.query(
      'INSERT INTO notifications (admin_id,type,title,message,link_url) VALUES ($1,$2,$3,$4,$5)',
      [adminId, 'system_alert', 'Chào mừng!', 'Hệ thống đã khởi tạo thành công.', '/dashboard']);
    await client.query(
      'INSERT INTO notifications (admin_id,type,title,message,link_url) VALUES ($1,$2,$3,$4,$5)',
      [editorId, 'batch_published', 'Batch #1 đã publish', '5 entries đã sync.', '/dictionary/batches']);
    console.log('  [✓] 2 notifications');

    // Activity logs — tất cả ngày tính trong JS
    const activities = [
      [userIds[0], 'flashcard_session', { deck: 'Daily English 500', cards: 15 }, 720, hoursAgo(3)],
      [userIds[1], 'flashcard_session', { deck: 'IELTS Core', cards: 25 }, 1080, hoursAgo(6)],
      [userIds[1], 'review_session',    { mode: 'swift_choice', items: 20 }, 600, hoursAgo(12)],
      [userIds[1], 'ebook_read',        { book: 'The Little Prince', chapter: 3 }, 1800, hoursAgo(24)],
      [userIds[1], 'game_play',         { game: 'lexisweep', level: 1 }, 180, hoursAgo(30)],
      [userIds[2], 'retrieval_practice', { words: ['analyze','collaborate','research'] }, 420, hoursAgo(8)],
      [userIds[2], 'ebook_read',        { book: 'Atomic Habits', chapter: 5 }, 2400, hoursAgo(15)],
      [userIds[3], 'flashcard_session', { deck: 'Daily English 500', cards: 10 }, 480, hoursAgo(48)],
      [userIds[4], 'game_play',         { game: 'ladder', level: 2 }, 240, hoursAgo(20)],
      [userIds[4], 'lesson_view',       { lesson: 'Business English' }, 300, hoursAgo(36)],
    ];
    for (const [uid, action, details, dur, createdAt] of activities) {
      await client.query(
        'INSERT INTO user_activity_log (user_id,action,details,duration_sec,created_at) VALUES ($1,$2,$3,$4,$5)',
        [uid, action, JSON.stringify(details), dur, createdAt]);
    }
    console.log('  [✓] 10 activity logs');

    // ═══════════════════════════════
    await client.query('COMMIT');

    console.log('\n══════════════════════════════════════════');
    console.log('✅ Seed hoàn tất!');
    console.log('══════════════════════════════════════════');
    console.log('');
    console.log('  ADMIN ACCOUNTS (password: password123)');
    console.log('  admin@english-app.com  → super_admin');
    console.log('  editor@english-app.com → content_editor');
    console.log('  mod@english-app.com    → moderator');
    console.log('');

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ Seed thất bại:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

seed();
