/**
 * Smart Database Seed
 *
 * npm run db:seed            → seed APP data only (admins, users, lessons, decks, plans...)
 * npm run db:seed:content    → seed CONTENT only (dictionary entries, synonyms, antonyms)
 * npm run db:seed:all        → seed EVERYTHING
 *
 * Content = data that's expensive to recreate (dictionary, tags, synonyms, antonyms)
 * App     = data that's cheap to recreate (admins, users, lessons, test data)
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import type { PoolClient } from 'pg';
import pool from '../config/db';

async function ins(client: PoolClient, sql: string, params?: any[]): Promise<any> {
  const { rows } = await client.query(sql, params || []);
  return rows[0]?.id;
}
const hoursAgo  = (h: number) => new Date(Date.now() - h * 3600000);
const daysAgo   = (d: number) => new Date(Date.now() - d * 86400000);
const daysLater = (d: number) => new Date(Date.now() + d * 86400000);

// ═══════════════════════════════════════════════
//  CONTENT SEED — Dictionary, Tags, Synonyms
// ═══════════════════════════════════════════════
async function seedContent(client: PoolClient, editorId: string) {
  console.log('\n── Content: Tags & Dictionary ──');

  // Tags
  const tagNames = ['IELTS','TOEIC','Business','Daily','Academic','Travel','Technology','Science'];
  const tagIds: Record<string, any> = {};
  for (const name of tagNames) {
    tagIds[name] = await ins(client,
      'INSERT INTO tags (name) VALUES ($1) ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id', [name]);
  }
  console.log('  [✓] 8 tags');

  // 20 entries: [headword, lemma, ipa_us, ipa_uk, pos, meaning_vi, meaning_en, ex_en, ex_vi, cefr, freq]
  const E = [
    ['organize',    'organize',    '/ˈɔːrɡənaɪz/',  '/ˈɔːɡənaɪz/',   ['verb'],          'to chuc, sap xep',    'to arrange systematically',  'Please organize the files.',          'Hay sap xep cac tai lieu.',          'B1', 2100],
    ['discover',    'discover',    '/dɪˈskʌvɚ/',     '/dɪˈskʌvər/',    ['verb'],          'kham pha, phat hien', 'to find for the first time', 'Scientists discovered a new species.','Cac nha khoa hoc phat hien loai moi.','B1', 1800],
    ['achieve',     'achieve',     '/əˈtʃiːv/',      '/əˈtʃiːv/',      ['verb'],          'dat duoc',            'to reach a goal',            'She achieved her dream.',             'Co ay dat duoc uoc mo.',             'B2', 1500],
    ['environment', 'environment', '/ɪnˈvaɪrənmənt/','/ɪnˈvaɪrənmənt/',['noun'],          'moi truong',          'the natural world',          'We must protect the environment.',    'Chung ta phai bao ve moi truong.',    'B1', 1200],
    ['significant', 'significant', '/sɪɡˈnɪfɪkənt/','/sɪɡˈnɪfɪkənt/',['adjective'],     'dang ke, quan trong', 'important enough to notice',  'There was a significant improvement.','Da co su cai thien dang ke.',         'B2', 2500],
    ['communicate', 'communicate', '/kəˈmjuːnɪkeɪt/','/kəˈmjuːnɪkeɪt/',['verb'],         'giao tiep',           'to share information',       'We communicate through language.',    'Chung ta giao tiep qua ngon ngu.',    'B1', 2800],
    ['opportunity', 'opportunity', '/ˌɑːpərˈtuːnəti/','/ˌɒpəˈtjuːnəti/',['noun'],        'co hoi',              'a chance for progress',      'This is a great opportunity.',        'Day la co hoi tuyet voi.',            'B2', 1900],
    ['challenge',   'challenge',   '/ˈtʃælɪndʒ/',    '/ˈtʃælɪndʒ/',    ['noun','verb'],   'thu thach',           'a difficult task',           'The exam was a real challenge.',       'Ky thi la thu thach thuc su.',        'B1', 1600],
    ['research',    'research',    '/ˈriːsɜːrtʃ/',   '/rɪˈsɜːtʃ/',     ['noun','verb'],   'nghien cuu',          'systematic investigation',   'More research is needed.',            'Can them nghien cuu.',                'B2', 1100],
    ['technology',  'technology',  '/tekˈnɑːlədʒi/', '/tekˈnɒlədʒi/',  ['noun'],          'cong nghe',           'application of science',     'Technology is advancing rapidly.',     'Cong nghe dang tien bo nhanh.',       'A2', 800],
    ['develop',     'develop',     '/dɪˈveləp/',      '/dɪˈveləp/',     ['verb'],          'phat trien',          'to grow or cause to grow',   'We need to develop new skills.',       'Can phat trien ky nang moi.',         'B1', 900],
    ['essential',   'essential',   '/ɪˈsenʃəl/',     '/ɪˈsenʃəl/',     ['adjective'],     'thiet yeu',           'absolutely necessary',       'Water is essential for life.',         'Nuoc thiet yeu cho su song.',         'B2', 3100],
    ['strategy',    'strategy',    '/ˈstrætədʒi/',    '/ˈstrætədʒi/',   ['noun'],          'chien luoc',          'a plan of action',           'We need a new strategy.',             'Can chien luoc moi.',                 'B2', 3500],
    ['analyze',     'analyze',     '/ˈænəlaɪz/',     '/ˈænəlaɪz/',     ['verb'],          'phan tich',           'to examine in detail',       'Let me analyze the data.',            'De toi phan tich du lieu.',           'B2', 2700],
    ['collaborate', 'collaborate', '/kəˈlæbəreɪt/',  '/kəˈlæbəreɪt/',  ['verb'],          'hop tac',             'to work together',           'Teams collaborate on projects.',       'Cac nhom hop tac trong du an.',       'C1', 4200],
    ['annoyed',     'annoy',       '/əˈnɔɪd/',       '/əˈnɔɪd/',       ['adjective'],     'hoi buc, kho chiu',   'slightly angry',             'She was annoyed by the noise.',        'Co ay hoi buc vi tieng on.',          'B1', 5500],
    ['irritated',   'irritate',    '/ˈɪrɪteɪtɪd/',   '/ˈɪrɪteɪtɪd/',   ['adjective'],     'buc boi, cau',        'annoyed or angered',         'He felt irritated.',                  'Anh ay cam thay buc boi.',            'B2', 6200],
    ['furious',     'furious',     '/ˈfjʊriəs/',     '/ˈfjʊəriəs/',    ['adjective'],     'gian du, phan no',    'extremely angry',            'She was furious about the lie.',       'Co ay gian du vi loi noi doi.',       'B2', 7000],
    ['livid',       'livid',       '/ˈlɪvɪd/',       '/ˈlɪvɪd/',       ['adjective'],     'tuc dien',            'extremely angry',            'He was livid when he found out.',     'Anh ay tuc dien khi phat hien.',      'C1', 12000],
    ['enraged',     'enrage',      '/ɪnˈreɪdʒd/',    '/ɪnˈreɪdʒd/',    ['adjective'],     'noi con thinh no',    'filled with rage',           'The crowd was enraged.',              'Dam dong noi con thinh no.',          'C1', 11000],
  ];

  const entryIds: any[] = [];
  for (const [hw,lm,ipUs,ipUk,pos,vi,en,exEn,exVi,cefr,freq] of E as any[]) {
    const id = await ins(client,
      `INSERT INTO dictionary_entries (headword,lemma,ipa_us,ipa_uk,pos,meaning_vi,meaning_en,example_en,example_vi,cefr_level,frequency_rank,source,created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'manual',$12)
       ON CONFLICT(headword,lemma) DO UPDATE SET ipa_us=EXCLUDED.ipa_us, ipa_uk=EXCLUDED.ipa_uk, cefr_level=EXCLUDED.cefr_level RETURNING id`,
      [hw,lm,ipUs,ipUk,pos,vi,en,exEn,exVi,cefr,freq,editorId]);
    entryIds.push(id);
  }
  console.log('  [✓] 20 dictionary entries');

  // Entry-tag links
  const etMap: [number, string][] = [[0,'IELTS'],[0,'Business'],[1,'Daily'],[2,'IELTS'],[2,'Academic'],
    [3,'IELTS'],[3,'Science'],[4,'Academic'],[5,'Daily'],[5,'Business'],
    [6,'Business'],[7,'IELTS'],[8,'Academic'],[8,'Science'],[9,'Technology'],
    [10,'Business'],[11,'IELTS'],[12,'Business'],[13,'Academic'],[14,'Business']];
  for (const [ei,tag] of etMap)
    await client.query('INSERT INTO entry_tags VALUES ($1,$2) ON CONFLICT DO NOTHING', [entryIds[ei], tagIds[tag]]);
  console.log('  [✓] 20 entry-tag links');

  // Synonyms (bidirectional)
  for (const [a,b] of [[0,5],[2,10],[6,7],[8,13],[15,16],[17,19],[18,17]]) {
    await client.query('INSERT INTO entry_synonyms VALUES ($1,$2) ON CONFLICT DO NOTHING', [entryIds[a],entryIds[b]]);
    await client.query('INSERT INTO entry_synonyms VALUES ($1,$2) ON CONFLICT DO NOTHING', [entryIds[b],entryIds[a]]);
  }
  console.log('  [✓] 7 synonym pairs');

  // Antonyms (bidirectional)
  for (const [a,b] of [[4,15],[2,7]]) {
    await client.query('INSERT INTO entry_antonyms VALUES ($1,$2) ON CONFLICT DO NOTHING', [entryIds[a],entryIds[b]]);
    await client.query('INSERT INTO entry_antonyms VALUES ($1,$2) ON CONFLICT DO NOTHING', [entryIds[b],entryIds[a]]);
  }
  console.log('  [✓] 2 antonym pairs');

  // ═══════════════════════════════════════════════
  //  DICTIONARY PRO — word_forms, senses, idioms...
  // ═══════════════════════════════════════════════
  console.log('\n── Content: Dictionary Pro ──');

  // ── Word Forms (verbs: 0-organize, 1-discover, 2-achieve, 5-communicate, 10-develop, 13-analyze) ──
  const verbForms = [
    // [entryIndex, base, 3rd_person, past_simple, past_participle, present_participle]
    [0,  'organize',    'organizes',    'organized',    'organized',    'organizing'],
    [1,  'discover',    'discovers',    'discovered',   'discovered',   'discovering'],
    [2,  'achieve',     'achieves',     'achieved',     'achieved',     'achieving'],
    [5,  'communicate', 'communicates', 'communicated', 'communicated', 'communicating'],
    [7,  'challenge',   'challenges',   'challenged',   'challenged',   'challenging'],
    [8,  'research',    'researches',   'researched',   'researched',   'researching'],
    [10, 'develop',     'develops',     'developed',    'developed',    'developing'],
    [13, 'analyze',     'analyzes',     'analyzed',     'analyzed',     'analyzing'],
    [14, 'collaborate', 'collaborates', 'collaborated', 'collaborated', 'collaborating'],
  ];
  let wfCount = 0;
  for (const [ei, base, s3, ps, pp, pres] of verbForms as any[]) {
    const forms: [string, string][] = [
      ['base', base], ['third_person_singular', s3], ['past_simple', ps],
      ['past_participle', pp], ['present_participle', pres],
    ];
    for (const [ft, fv] of forms) {
      await client.query(
        'INSERT INTO word_forms (entry_id, form_type, form_value, sort_order) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
        [entryIds[ei], ft, fv, forms.indexOf([ft, fv])]
      );
      wfCount++;
    }
  }

  // Noun forms: 3-environment, 6-opportunity, 9-technology, 12-strategy
  for (const [ei, plural] of [[3,'environments'],[6,'opportunities'],[9,'technologies'],[12,'strategies']] as [number,string][]) {
    await client.query('INSERT INTO word_forms (entry_id, form_type, form_value) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
      [entryIds[ei], 'plural', plural]);
    wfCount++;
  }

  // Adjective forms: 4-significant, 11-essential, 17-furious
  for (const [ei, comp, sup] of [[4,'more significant','most significant'],[11,'more essential','most essential'],[17,'more furious','most furious']] as [number,string,string][]) {
    await client.query('INSERT INTO word_forms (entry_id, form_type, form_value) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
      [entryIds[ei], 'comparative', comp]);
    await client.query('INSERT INTO word_forms (entry_id, form_type, form_value) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
      [entryIds[ei], 'superlative', sup]);
    wfCount += 2;
  }
  console.log(`  [✓] ${wfCount} word forms`);


  // ── Entry Senses (multi-sense per entry) ──
  // organize: 2 senses | challenge: 2 senses (noun + verb) | research: 2 senses
  const sensesData = [
    // [entryIdx, pos, order, def_en, def_vi, register, domain, grammar_note]
    [0, 'verb', 0, 'to arrange or put things into a system or order', 'sap xep, to chuc theo he thong', null, null, '[+ object]'],
    [0, 'verb', 1, 'to plan or arrange an event or activity', 'to chuc (su kien, hoat dong)', null, null, '[+ object]'],
    [1, 'verb', 0, 'to find something or someone for the first time', 'kham pha, phat hien lan dau', null, null, '[+ object]'],
    [1, 'verb', 1, 'to learn or find out about something', 'nhan ra, phat hien ra', null, null, '[+ that clause]'],
    [3, 'noun', 0, 'the natural world around us', 'moi truong tu nhien', null, 'ecology', '[countable, uncountable]'],
    [3, 'noun', 1, 'the conditions and surroundings in which people live or work', 'moi truong (song, lam viec)', null, null, '[countable]'],
    [7, 'noun', 0, 'a new or difficult task that tests ability', 'thu thach, thach thuc', null, null, '[countable]'],
    [7, 'verb', 0, 'to question whether something is true or right', 'thach thuc, phan doi', null, null, '[+ object]'],
    [8, 'noun', 0, 'a careful study of a subject to discover new facts', 'nghien cuu (khoa hoc)', 'formal', 'academic', '[uncountable]'],
    [8, 'verb', 0, 'to study a subject carefully to discover new facts', 'nghien cuu', 'formal', 'academic', '[+ object / + into]'],
    [4, 'adjective', 0, 'large or important enough to have an effect', 'dang ke, co y nghia', null, null, null],
    [11, 'adjective', 0, 'completely necessary; extremely important', 'thiet yeu, can thiet', null, null, null],
  ];

  const senseIds: any[] = [];
  for (const [ei, pos, order, defEn, defVi, reg, dom, gram] of sensesData as any[]) {
    const sid = await ins(client,
      `INSERT INTO entry_senses (entry_id, pos, sense_order, definition_en, definition_vi, register, domain, grammar_note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (entry_id, pos, sense_order) DO NOTHING RETURNING id`,
      [entryIds[ei], pos, order, defEn, defVi, reg, dom, gram]);
    senseIds.push(sid);
  }
  console.log(`  [✓] ${senseIds.filter(Boolean).length} entry senses`);


  // ── Sense Examples ──
  const exData = [
    // [senseIdx, example_en, example_vi]
    [0, 'Please organize the files by date.',         'Hay sap xep cac tai lieu theo ngay.'],
    [0, 'She organized her desk before leaving.',     'Co ay sap xep ban lam viec truoc khi di.'],
    [1, 'Who is organizing the conference this year?', 'Ai to chuc hoi nghi nam nay?'],
    [2, 'Scientists discovered a new species.',       'Cac nha khoa hoc phat hien loai moi.'],
    [3, 'She discovered that he had lied.',           'Co ay phat hien ra anh ta da noi doi.'],
    [4, 'We must protect the environment.',           'Chung ta phai bao ve moi truong.'],
    [5, 'A good working environment is important.',   'Moi truong lam viec tot rat quan trong.'],
    [6, 'The exam was a real challenge.',              'Ky thi la thu thach thuc su.'],
    [7, 'She challenged the decision.',               'Co ay phan doi quyet dinh do.'],
    [8, 'More research is needed on this topic.',     'Can them nghien cuu ve chu de nay.'],
    [9, 'They researched the effects of climate change.', 'Ho nghien cuu tac dong cua bien doi khi hau.'],
    [10, 'There was a significant improvement.',       'Da co su cai thien dang ke.'],
    [11, 'Water is essential for life.',                'Nuoc thiet yeu cho su song.'],
  ];
  for (const [si, exEn, exVi] of exData as [number,string,string][]) {
    if (senseIds[si]) {
      await client.query(
        'INSERT INTO sense_examples (sense_id, example_en, example_vi, sort_order) VALUES ($1,$2,$3,0)',
        [senseIds[si], exEn, exVi]);
    }
  }
  console.log(`  [✓] ${exData.length} sense examples`);


  // ── Phrasal Verbs (for organize, discover, achieve, develop, research) ──
  const phrasalData = [
    // [entryIdx, phrasal, particle, separable, def_en, def_vi, ex_en, ex_vi]
    [0, 'organize around',  'around', false, 'to plan activities based on something', 'to chuc xoay quanh',    'We organized around the deadline.',       'Chung toi to chuc xoay quanh han chot.'],
    [2, 'achieve through',  'through', false, 'to accomplish by means of',            'dat duoc thong qua',    'Success is achieved through hard work.',  'Thanh cong dat duoc thong qua no luc.'],
    [10, 'develop into',    'into',   false, 'to gradually become something',         'phat trien thanh',       'The idea developed into a business.',    'Y tuong phat trien thanh doanh nghiep.'],
    [10, 'develop from',    'from',   false, 'to grow or change from something',      'phat trien tu',          'The app developed from a simple prototype.', 'Ung dung phat trien tu mot ban mau don gian.'],
    [8,  'research into',   'into',   false, 'to study a particular subject',         'nghien cuu ve',          'She researched into medieval history.',   'Co ay nghien cuu ve lich su trung co.'],
  ];
  for (const [ei, pv, part, sep, de, dv, ee, ev] of phrasalData as any[]) {
    await client.query(
      `INSERT INTO phrasal_verbs (entry_id, phrasal_verb, particle, is_separable, definition_en, definition_vi, example_en, example_vi)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [entryIds[ei], pv, part, sep, de, dv, ee, ev]);
  }
  console.log(`  [✓] ${phrasalData.length} phrasal verbs`);


  // ── Entry Idioms ──
  const idiomsData = [
    // [entryIdx, idiom, def_en, def_vi, ex_en, ex_vi]
    [7,  'rise to the challenge',  'to deal with a difficult situation successfully',     'vuot qua thu thach',      'She rose to the challenge magnificently.',  'Co ay vuot qua thu thach mot cach xuat sac.'],
    [8,  'do your research',       'to find out facts before making a decision',          'tim hieu ky truoc khi quyet dinh', 'Do your research before buying a car.', 'Tim hieu ky truoc khi mua xe.'],
    [6,  'a window of opportunity','a short time when conditions are good for doing something', 'co hoi ngan ngui',  'This is a window of opportunity for investors.', 'Day la co hoi ngan ngui cho nha dau tu.'],
    [3,  'a hostile environment',  'a place or situation that is difficult or dangerous',  'moi truong khac nghiet',   'The desert is a hostile environment.',       'Sa mac la moi truong khac nghiet.'],
    [2,  'achieve wonders',        'to accomplish amazing things',                         'lam nen dieu ky dieu',     'Teamwork can achieve wonders.',             'Lam viec nhom co the lam nen dieu ky dieu.'],
    [9,  'cutting-edge technology','the most advanced technology available',                'cong nghe tien tien nhat', 'They use cutting-edge technology.',          'Ho su dung cong nghe tien tien nhat.'],
  ];
  for (const [ei, idiom, de, dv, ee, ev] of idiomsData as any[]) {
    await client.query(
      `INSERT INTO entry_idioms (entry_id, idiom_text, definition_en, definition_vi, example_en, example_vi)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [entryIds[ei], idiom, de, dv, ee, ev]);
  }
  console.log(`  [✓] ${idiomsData.length} idioms`);


  // ── Collocations ──
  const collocData = [
    // [entryIdx, senseIdx|null, collocation, pattern, ex_en, ex_vi]
    [0, 0, 'organize a meeting',     'verb+noun', 'Can you organize a meeting for Monday?',    'Ban co the to chuc cuoc hop thu Hai khong?'],
    [0, 0, 'organize files',         'verb+noun', 'I need to organize my files.',              'Toi can sap xep cac tai lieu.'],
    [0, 1, 'organize an event',      'verb+noun', 'They organized a charity event.',           'Ho to chuc su kien tu thien.'],
    [8, null, 'conduct research',    'verb+noun', 'The team conducted extensive research.',     'Nhom da tien hanh nghien cuu rong rai.'],
    [8, null, 'research paper',      'noun+noun', 'She published a research paper.',            'Co ay xuat ban bai nghien cuu.'],
    [3, null, 'protect the environment', 'verb+noun', 'We must protect the environment.',       'Chung ta phai bao ve moi truong.'],
    [3, null, 'working environment', 'adj+noun',  'A positive working environment boosts productivity.', 'Moi truong lam viec tich cuc tang nang suat.'],
    [4, null, 'significant impact',  'adj+noun',  'The policy had a significant impact.',       'Chinh sach co tac dong dang ke.'],
    [4, null, 'significant difference', 'adj+noun','There is a significant difference.',        'Co su khac biet dang ke.'],
    [9, null, 'information technology', 'noun+noun', 'She works in information technology.',    'Co ay lam trong linh vuc cong nghe thong tin.'],
  ];
  for (const [ei, si, col, pat, ee, ev] of collocData as any[]) {
    await client.query(
      `INSERT INTO collocations (entry_id, sense_id, collocation, pattern, example_en, example_vi)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [entryIds[ei], si !== null ? senseIds[si] : null, col, pat, ee, ev]);
  }
  console.log(`  [✓] ${collocData.length} collocations`);


  // ── Sense Synonyms & Antonyms (per-sense) ──
  if (senseIds[0]) { // organize sense 0 (arrange)
    await client.query('INSERT INTO sense_synonyms (sense_id, synonym_text) VALUES ($1,$2) ON CONFLICT DO NOTHING', [senseIds[0], 'arrange']);
    await client.query('INSERT INTO sense_synonyms (sense_id, synonym_text) VALUES ($1,$2) ON CONFLICT DO NOTHING', [senseIds[0], 'sort']);
    await client.query('INSERT INTO sense_synonyms (sense_id, synonym_text) VALUES ($1,$2) ON CONFLICT DO NOTHING', [senseIds[0], 'categorize']);
    await client.query('INSERT INTO sense_antonyms (sense_id, antonym_text) VALUES ($1,$2) ON CONFLICT DO NOTHING', [senseIds[0], 'disorganize']);
    await client.query('INSERT INTO sense_antonyms (sense_id, antonym_text) VALUES ($1,$2) ON CONFLICT DO NOTHING', [senseIds[0], 'scatter']);
  }
  if (senseIds[10]) { // significant sense 0
    await client.query('INSERT INTO sense_synonyms (sense_id, synonym_text) VALUES ($1,$2) ON CONFLICT DO NOTHING', [senseIds[10], 'important']);
    await client.query('INSERT INTO sense_synonyms (sense_id, synonym_text) VALUES ($1,$2) ON CONFLICT DO NOTHING', [senseIds[10], 'considerable']);
    await client.query('INSERT INTO sense_antonyms (sense_id, antonym_text) VALUES ($1,$2) ON CONFLICT DO NOTHING', [senseIds[10], 'insignificant']);
    await client.query('INSERT INTO sense_antonyms (sense_id, antonym_text) VALUES ($1,$2) ON CONFLICT DO NOTHING', [senseIds[10], 'minor']);
  }
  if (senseIds[11]) { // essential sense 0
    await client.query('INSERT INTO sense_synonyms (sense_id, synonym_text) VALUES ($1,$2) ON CONFLICT DO NOTHING', [senseIds[11], 'vital']);
    await client.query('INSERT INTO sense_synonyms (sense_id, synonym_text) VALUES ($1,$2) ON CONFLICT DO NOTHING', [senseIds[11], 'crucial']);
    await client.query('INSERT INTO sense_antonyms (sense_id, antonym_text) VALUES ($1,$2) ON CONFLICT DO NOTHING', [senseIds[11], 'unnecessary']);
  }
  console.log('  [✓] sense synonyms & antonyms');

  return { tagIds, entryIds, entriesData: E };
}

// ═══════════════════════════════════════════════
//  APP SEED — Everything except dictionary content
// ═══════════════════════════════════════════════
async function seedApp(
  client: PoolClient,
  hash: string,
  adminId: string,
  editorId: string,
  tagIds: Record<string, any> | null,
  entryIds: any[] | null,
  entriesData: any[] | null,
) {
  // ── Users ──
  console.log('\n── App: Users ──');
  const userIds: any[] = [];
  for (const [email,name,level,streak,longest,la] of [
    ['an.nguyen@gmail.com','Nguyen Van An','beginner',12,15,hoursAgo(2)],
    ['binh.tran@gmail.com','Tran Minh Binh','intermediate',45,50,hoursAgo(1)],
    ['chi.le@gmail.com','Le Thi Chi','advanced',90,120,hoursAgo(5)],
    ['dung.pham@gmail.com','Pham Van Dung','beginner',3,5,hoursAgo(24)],
    ['em.hoang@gmail.com','Hoang Thi Em','intermediate',22,30,hoursAgo(10)],
  ] as any[]) {
    userIds.push(await ins(client,
      'INSERT INTO users (email,password_hash,full_name,level,streak_current,streak_longest,last_active_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(email) DO UPDATE SET full_name=EXCLUDED.full_name RETURNING id',
      [email,hash,name,level,streak,longest,la]));
  }
  console.log('  [✓] 5 users');

  // ── Lessons ──
  console.log('\n── App: Lessons ──');
  const l1 = await ins(client, 'INSERT INTO lessons (title,description,content_html,level,status,created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
    ['Business English Essentials','Tu vung thiet yeu cho giao tiep cong so','<p>Business vocabulary lesson.</p>','intermediate','published',editorId]);
  const l2 = await ins(client, 'INSERT INTO lessons (title,description,content_html,level,status,created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
    ['Academic Writing Words','Tu vung cho viet luan hoc thuat','<p>Academic vocabulary lesson.</p>','advanced','published',editorId]);

  if (entryIds && entryIds.length >= 15) {
    for (let i=0;i<8;i++) await client.query('INSERT INTO lesson_entries VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',[l1,entryIds[i],i]);
    for (let i=8;i<15;i++) await client.query('INSERT INTO lesson_entries VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',[l2,entryIds[i],i-8]);
  }
  if (tagIds) {
    if (tagIds['Business']) await client.query('INSERT INTO lesson_tags VALUES ($1,$2) ON CONFLICT DO NOTHING',[l1,tagIds['Business']]);
    if (tagIds['Academic']) await client.query('INSERT INTO lesson_tags VALUES ($1,$2) ON CONFLICT DO NOTHING',[l2,tagIds['Academic']]);
    if (tagIds['IELTS'])    await client.query('INSERT INTO lesson_tags VALUES ($1,$2) ON CONFLICT DO NOTHING',[l2,tagIds['IELTS']]);
  }
  await client.query('INSERT INTO user_lesson_progress (user_id,lesson_id,completed,progress,started_at) VALUES ($1,$2,false,0.6,$3) ON CONFLICT DO NOTHING',[userIds[1],l1,daysAgo(3)]);
  await client.query('INSERT INTO user_lesson_progress (user_id,lesson_id,completed,progress,started_at,completed_at) VALUES ($1,$2,true,1.0,$3,$4) ON CONFLICT DO NOTHING',[userIds[2],l2,daysAgo(7),daysAgo(5)]);
  console.log('  [✓] 2 lessons + tags + progress');

  // ── Decks & Cards ──
  console.log('\n── App: Decks & SRS ──');
  const d1 = await ins(client,'INSERT INTO decks (title,description,level,status,created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id',['IELTS Core Vocabulary','Tu vung cot loi','intermediate','published',editorId]);
  const d2 = await ins(client,'INSERT INTO decks (title,description,level,status,created_by) VALUES ($1,$2,$3,$4,$5) RETURNING id',['Daily English 500','500 tu giao tiep','beginner','published',editorId]);
  if (tagIds) {
    if (tagIds['IELTS'])  await client.query('INSERT INTO deck_tags VALUES ($1,$2) ON CONFLICT DO NOTHING',[d1,tagIds['IELTS']]);
    if (tagIds['Daily'])  await client.query('INSERT INTO deck_tags VALUES ($1,$2) ON CONFLICT DO NOTHING',[d2,tagIds['Daily']]);
  }

  const cardIds: any[] = [];
  if (entryIds && entryIds.length >= 10) {
    for (let i=0;i<10;i++) { const c=await ins(client,'INSERT INTO cards (deck_id,entry_id,sort_order) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id',[d1,entryIds[i],i]); if(c)cardIds.push(c); }
    for (let i=0;i<8;i++) { const c=await ins(client,'INSERT INTO cards (deck_id,entry_id,sort_order) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING RETURNING id',[d2,entryIds[i],i]); if(c)cardIds.push(c); }
  }
  console.log(`  [✓] 2 decks + ${cardIds.length} cards`);

  const intervals=[1,2,7,14,30];
  for (let i=0;i<Math.min(5,cardIds.length);i++) {
    await client.query('INSERT INTO user_card_progress (user_id,card_id,leitner_box,ease,review_interval,due_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',
      [userIds[1],cardIds[i],i+1,2.5+(i*0.1),intervals[i],daysLater(intervals[i])]);
    for (let r=0;r<2;r++) {
      const ok=Math.random()>0.3;
      await client.query('INSERT INTO reviews (user_id,card_id,rating,mode,time_ms,correct,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [userIds[1],cardIds[i],ok?3:1,'flashcard',1500+Math.floor(Math.random()*3000),ok,daysAgo(r+1)]);
    }
  }

  await client.query('INSERT INTO retrieval_sessions (user_id,target_words,target_entry_ids,sentences,fixes,all_passed,model_used,latency_ms,tokens_in,tokens_out,cost_usd) VALUES ($1,$2::varchar[],$3::uuid[],$4::text[],$5::text[],$6,$7,$8,$9,$10,$11)',
    [userIds[1],['organize','discover','achieve'], entryIds ? [entryIds[0],entryIds[1],entryIds[2]] : [],
     ['I organize my desk.','She discovered a restaurant.','He achieved his goal.'],
     ['I organize my desk.','She discovered a restaurant.','He achieved his goal.'],
     true,'gpt-4o',2340,450,380,0.0082]);
  console.log('  [✓] SRS + reviews + retrieval');

  // ── Ebook ──
  console.log('\n── App: Ebook ──');
  const b1=await ins(client,'INSERT INTO ebooks (title,author,description,epub_file_url,level,genre,total_chapters,total_words,required_plan,status,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id',
    ['The Little Prince','Antoine de Saint-Exupery','Cau chuyen co tich','/uploads/ebooks/little-prince.epub','beginner',['fiction'],5,15200,'free','published',editorId]);
  const b2=await ins(client,'INSERT INTO ebooks (title,author,description,epub_file_url,level,genre,total_chapters,total_words,required_plan,status,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id',
    ['Atomic Habits','James Clear','Thoi quen nguyen tu','/uploads/ebooks/atomic-habits.epub','intermediate',['non_fiction','self_help'],8,52000,'premium','published',editorId]);
  for (const [bid,names] of [[b1,['The Pilot','The Asteroid','The Rose','The Fox','The Journey Home']],[b2,['Fundamentals','How Habits Work','Make It Obvious','Make It Attractive','Make It Easy','Make It Satisfying','Advanced Tactics','Conclusion']]] as [string,string[]][])
    for (let i=0;i<names.length;i++) await client.query('INSERT INTO chapters (ebook_id,chapter_index,title,word_count) VALUES ($1,$2,$3,$4)',[bid,i+1,names[i],2500+Math.floor(Math.random()*3000)]);
  await client.query('INSERT INTO ebook_glossary (ebook_id,term_en,translation_vi,domain,occurrences) VALUES ($1,$2,$3,$4,$5)',[b1,'asteroid','tieu hanh tinh','astronomy',12]);
  await client.query('INSERT INTO ebook_glossary (ebook_id,term_en,translation_vi,domain,occurrences) VALUES ($1,$2,$3,$4,$5)',[b2,'habit loop','vong lap thoi quen','psychology',28]);
  await client.query('INSERT INTO user_reading_progress (user_id,ebook_id,current_chapter,progress,total_time_sec,words_looked_up,started_at,last_read_at) VALUES ($1,$2,3,0.6,5400,34,$3,$4) ON CONFLICT DO NOTHING',[userIds[1],b1,daysAgo(5),daysAgo(1)]);
  console.log('  [✓] 2 ebooks + chapters + glossary');

  // ── Games ──
  console.log('\n── App: Games ──');
  const levelIds: Record<string, any> = {};
  for (const [t,n,c] of [['lexisweep',1,{grid_size:6,directions:['horizontal','vertical'],time_limit:120}],['lexisweep',2,{grid_size:8,directions:['horizontal','vertical','diagonal'],time_limit:100}],['lexisweep',3,{grid_size:10,time_limit:90}],['anagram',1,{word_length_min:3,word_length_max:5,time_per_word:45}],['anagram',2,{word_length_min:5,word_length_max:8,time_per_word:30}],['anagram',3,{word_length_min:7,word_length_max:12,time_per_word:20}],['ladder',1,{words_per_set:4,time_limit:120}],['ladder',2,{words_per_set:6,time_limit:90}],['ladder',3,{words_per_set:8,time_limit:60}]] as [string,number,any][])
    levelIds[`${t}_${n}`]=await ins(client,'INSERT INTO game_levels (game_type,level_number,config_json) VALUES ($1,$2,$3) ON CONFLICT(game_type,level_number) DO UPDATE SET config_json=EXCLUDED.config_json RETURNING id',[t,n,JSON.stringify(c)]);
  const wl=await ins(client,`INSERT INTO game_word_lists (game_type,name,topic,level,created_by) VALUES ('lexisweep','Business Basics','Business','intermediate',$1) RETURNING id`,[editorId]);
  if (entryIds) for (let i=0;i<Math.min(10,entryIds.length);i++) await client.query('INSERT INTO game_word_list_items VALUES ($1,$2) ON CONFLICT DO NOTHING',[wl,entryIds[i]]);
  const ss=await ins(client,'INSERT INTO semantic_sets (name,scale_description,level,created_by) VALUES ($1,$2,$3,$4) RETURNING id',['Anger Intensity','Tu nhe den manh','advanced',editorId]);
  if (entryIds && entryIds.length>=20)
    for (const [eid,ord,hint] of [[entryIds[15],1,'hoi buc'],[entryIds[16],2,'buc boi'],[entryIds[17],3,'gian du'],[entryIds[19],4,'thinh no'],[entryIds[18],5,'tuc dien']] as [any,number,string][])
      await client.query('INSERT INTO semantic_set_items (set_id,entry_id,correct_order,hint_vi) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',[ss,eid,ord,hint]);
  await client.query('INSERT INTO game_runs (user_id,game_type,level_id,list_id,score,accuracy,time_sec,completed,details_json) VALUES ($1,$2,$3,$4,3400,0.85,95,true,$5)',[userIds[1],'lexisweep',levelIds['lexisweep_1'],wl,JSON.stringify({words_found:8})]);
  console.log('  [✓] 9 levels + word list + semantic set + game run');

  // ── Commerce ──
  console.log('\n── App: Commerce ──');
  const fp=await ins(client,`INSERT INTO subscription_plans (name,description,icon_color,price_monthly,price_yearly,sort_order,status) VALUES ('Free','Goi mien phi','#94A3B8',0,0,1,'active') RETURNING id`);
  const pp=await ins(client,`INSERT INTO subscription_plans (name,description,icon_color,price_monthly,price_yearly,trial_days,is_recommended,sort_order,status) VALUES ('Premium','Mo khoa toan bo','#2563EB',99000,899000,7,true,2,'active') RETURNING id`);
  const pro=await ins(client,`INSERT INTO subscription_plans (name,description,icon_color,price_monthly,price_yearly,sort_order,status) VALUES ('Pro','Trai nghiem cao cap','#F59E0B',199000,1790000,3,'active') RETURNING id`);
  for (const [p,k,v] of [
    [fp,'flashcard_max_decks','2'],[fp,'review_modes','swift_choice'],[fp,'ebook_max','3'],[fp,'ads','true'],[fp,'offline','limited'],
    [pp,'flashcard_max_decks','20'],[pp,'review_modes','swift_choice,cloze_craft,pair_link'],[pp,'ebook_max','50'],[pp,'ads','false'],[pp,'offline','full'],
    [pro,'flashcard_max_decks','unlimited'],[pro,'review_modes','swift_choice,cloze_craft,pair_link'],[pro,'ebook_max','unlimited'],[pro,'ads','false'],[pro,'offline','full']] as [string,string,string][])
    await client.query('INSERT INTO plan_features (plan_id,feature_key,feature_value) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',[p,k,v]);
  const s1=await ins(client,'INSERT INTO user_subscriptions (user_id,plan_id,billing_cycle,price_paid,status,current_period_start,current_period_end) VALUES ($1,$2,$3,99000,$4,$5,$6) RETURNING id',[userIds[1],pp,'monthly','active',daysAgo(15),daysLater(15)]);
  await client.query('INSERT INTO transactions (user_id,subscription_id,type,amount,payment_method,payment_ref,status) VALUES ($1,$2,$3,99000,$4,$5,$6)',[userIds[1],s1,'new','momo','MOMO_001','completed']);
  console.log('  [✓] 3 plans + 15 features + 1 sub + 1 txn');

  // ── AI & System ──
  console.log('\n── App: AI & System ──');
  await client.query('INSERT INTO prompt_templates (name,description,model,system_prompt,expected_schema,version,status,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    ['Retrieval Grader v1','Cham ngu phap','gpt-4o','You are an English grammar checker.',JSON.stringify({type:'object'}),1,'active',adminId]);
  for (const [en,vi,dom] of [['machine learning','hoc may','tech'],['database','co so du lieu','tech'],['spaced repetition','lap lai ngat quang','education']] as [string,string,string][])
    await client.query('INSERT INTO translation_glossary (term_en,translation_vi,domain,created_by) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',[en,vi,dom,editorId]);
  const batch=await ins(client,'INSERT INTO micro_delta_batches (seq,entries_count,batch_type,status,published_at,created_by) VALUES (1,5,$1,$2,NOW(),$3) RETURNING id',['manual','published',editorId]);
  if (entryIds && entriesData)
    for (let i=0;i<Math.min(5,entryIds.length);i++)
      await client.query('INSERT INTO batch_entries (batch_id,entry_id,action,entry_snapshot) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
        [batch,entryIds[i],'upsert',JSON.stringify({headword:entriesData[i][0],ipa_us:entriesData[i][2]})]);

  // Leitner intervals: DO NOTHING so production overrides are preserved
  await client.query(
    'INSERT INTO system_configs (config_key,config_value,description,updated_by) VALUES ($1,$2,$3,$4) ON CONFLICT(config_key) DO NOTHING',
    ['leitner_intervals', JSON.stringify([1,2,4,7,14]), 'Days between reviews per box (Box 1→5)', adminId]
  );
  await client.query(
    'INSERT INTO system_configs (config_key,config_value,description,updated_by) VALUES ($1,$2,$3,$4) ON CONFLICT(config_key) DO NOTHING',
    ['leitner_intervals_days', JSON.stringify([1,2,4,7,14]), 'Interval days for Box 1..5', adminId]
  );
  for (const [k,v,d] of [['cards_per_session',20,'Cards/session'],['gpt_active_model','gpt-4o','GPT model'],['tts_default_voice','en-US-Wavenet-D','TTS voice'],['maintenance_mode',{enabled:false},'Maintenance']] as [string,any,string][])
    await client.query('INSERT INTO system_configs (config_key,config_value,description,updated_by) VALUES ($1,$2,$3,$4) ON CONFLICT(config_key) DO UPDATE SET config_value=EXCLUDED.config_value',[k,JSON.stringify(v),d,adminId]);

  await client.query('INSERT INTO audit_logs (admin_id,action,module,target_type,target_label,details,ip_address) VALUES ($1,$2,$3,$4,$5,$6,$7)',[adminId,'LOGIN','auth','admin','admin@english-app.com',JSON.stringify({method:'password'}),'127.0.0.1']);
  await client.query('INSERT INTO notifications (admin_id,type,title,message,link_url) VALUES ($1,$2,$3,$4,$5)',[adminId,'system_alert','Welcome!','System initialized.','/dashboard']);

  for (const [uid,act,det,dur,at] of [
    [userIds[0],'flashcard_session',{deck:'Daily English'},720,hoursAgo(3)],
    [userIds[1],'review_session',{mode:'swift_choice'},600,hoursAgo(12)],
    [userIds[1],'ebook_read',{book:'The Little Prince'},1800,hoursAgo(24)],
    [userIds[2],'game_play',{game:'lexisweep'},240,hoursAgo(20)],
    [userIds[4],'lesson_view',{lesson:'Business English'},300,hoursAgo(36)]] as [any,string,any,number,Date][])
    await client.query('INSERT INTO user_activity_log (user_id,action,details,duration_sec,created_at) VALUES ($1,$2,$3,$4,$5)',[uid,act,JSON.stringify(det),dur,at]);
  console.log('  [✓] configs + audit + notifications + activity');
}

// ═══════════════════════════════════════════════
//  MAIN RUNNER
// ═══════════════════════════════════════════════
const seed = async () => {
  const mode = process.argv[2] || 'app'; // 'app', 'content', or 'all'
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('╔══════════════════════════════════════════════════╗');
    console.log(`║  DB Seed — mode: ${mode.toUpperCase().padEnd(30)}  ║`);
    console.log('╚══════════════════════════════════════════════════╝');

    const hash = await bcrypt.hash('123123', 10);

    // Admins always needed (both content and app reference them)
    console.log('\n── Admins ──');
    const adminId = await ins(client, 'INSERT INTO admin_accounts (email,password_hash,full_name,role) VALUES ($1,$2,$3,$4) ON CONFLICT(email) DO UPDATE SET full_name=EXCLUDED.full_name RETURNING id',
      ['admin@english-app.com',hash,'Super Admin','super_admin']);
    const editorId = await ins(client, 'INSERT INTO admin_accounts (email,password_hash,full_name,role) VALUES ($1,$2,$3,$4) ON CONFLICT(email) DO UPDATE SET full_name=EXCLUDED.full_name RETURNING id',
      ['editor@english-app.com',hash,'Nguyen Van Editor','content_editor']);
    await ins(client, 'INSERT INTO admin_accounts (email,password_hash,full_name,role) VALUES ($1,$2,$3,$4) ON CONFLICT(email) DO UPDATE SET full_name=EXCLUDED.full_name RETURNING id',
      ['mod@english-app.com',hash,'Tran Thi Moderator','moderator']);
    console.log('  [✓] 3 admins');

    let tagIds: Record<string, any> | null = null, entryIds: any[] | null = null, entriesData: any[] | null = null;

    // Seed content if needed
    if (mode === 'content' || mode === 'all') {
      const result = await seedContent(client, editorId);
      tagIds = result.tagIds;
      entryIds = result.entryIds;
      entriesData = result.entriesData;
    } else {
      // Load existing content IDs for app seed to reference
      const { rows: tags } = await client.query('SELECT id, name FROM tags');
      if (tags.length > 0) {
        const map: Record<string, any> = {};
        tags.forEach((t: any) => { map[t.name] = t.id; });
        tagIds = map;
      }
      const { rows: entries } = await client.query('SELECT id FROM dictionary_entries ORDER BY created_at LIMIT 20');
      if (entries.length > 0) entryIds = entries.map((e: any) => e.id);
    }

    // Seed app if needed
    if (mode === 'app' || mode === 'all') {
      await seedApp(client, hash, adminId, editorId, tagIds, entryIds, entriesData);
    }

    await client.query('COMMIT');

    console.log('\n══════════════════════════════════════════');
    console.log('✅ Seed complete!');
    console.log('══════════════════════════════════════════\n');
    console.log('  ACCOUNTS (password: 123123)');
    console.log('  admin@english-app.com  → super_admin');
    console.log('  editor@english-app.com → content_editor');
    console.log('  mod@english-app.com    → moderator\n');

  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('\n❌ Seed failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
};

seed();
