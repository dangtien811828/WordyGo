import request from 'supertest';
import app from '../app';
import pool from '../config/db';

const TS = Date.now();
const EMAIL_PREFIX = `phase6p-${TS}-`;

let access_token = '';
let userId = '';
let testDeckId = '';
let testEntryIds: string[] = [];
let testCardIds: string[] = [];

beforeAll(async () => {
  const reg = await request(app).post('/api/v1/auth/register').send({
    email: `${EMAIL_PREFIX}1@example.com`,
    password: 'password123',
    full_name: 'Practice Tester',
  });
  if (reg.status !== 201) throw new Error(`Register failed: ${JSON.stringify(reg.body)}`);
  access_token = reg.body.data.access_token;

  const { rows: userRows } = await pool.query(
    `SELECT id FROM users WHERE email = $1`,
    [`${EMAIL_PREFIX}1@example.com`]
  );
  userId = userRows[0].id;

  const deckRes = await request(app)
    .post('/api/v1/decks')
    .set('Authorization', `Bearer ${access_token}`)
    .send({ title: 'Practice Test Deck', level: 'beginner' });
  if (deckRes.status !== 201) throw new Error(`Deck failed: ${JSON.stringify(deckRes.body)}`);
  testDeckId = deckRes.body.data.id;

  for (let i = 1; i <= 5; i++) {
    const headword = `phase6p-entry-${TS}-${i}`;
    const { rows: entryRows } = await pool.query(
      `INSERT INTO dictionary_entries (headword, lemma, pos, meaning_vi, published, source)
       VALUES ($1, $1, $2, $3, TRUE, 'manual') RETURNING id`,
      [headword, ['noun'], `Practice test meaning ${i}`]
    );
    const entryId: string = entryRows[0].id;
    testEntryIds.push(entryId);

    const cardRes = await request(app)
      .post(`/api/v1/decks/${testDeckId}/cards`)
      .set('Authorization', `Bearer ${access_token}`)
      .send({ entry_id: entryId });
    if (cardRes.status !== 201) throw new Error(`Card failed: ${JSON.stringify(cardRes.body)}`);
    testCardIds.push(cardRes.body.data.id as string);
  }
});

afterAll(async () => {
  await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`${EMAIL_PREFIX}%`]);
  await pool.query(
    `DELETE FROM dictionary_entries WHERE headword LIKE $1`,
    [`phase6p-entry-${TS}%`]
  );
  await pool.end();
});

// ════════════════════════════════════════════════════════════════
describe('POST /api/v1/practice/session/start', () => {
  it('requires deck_id', async () => {
    const res = await request(app)
      .post('/api/v1/practice/session/start')
      .set('Authorization', `Bearer ${access_token}`)
      .send({ mode: 'flashcard' });
    expect(res.status).toBe(400);
  });

  it('404 on unknown deck_id', async () => {
    const res = await request(app)
      .post('/api/v1/practice/session/start')
      .set('Authorization', `Bearer ${access_token}`)
      .send({ deck_id: '00000000-0000-0000-0000-000000000000', mode: 'flashcard' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('DECK_NOT_FOUND');
  });

  it('starts a session and returns cards', async () => {
    const res = await request(app)
      .post('/api/v1/practice/session/start')
      .set('Authorization', `Bearer ${access_token}`)
      .send({ deck_id: testDeckId, mode: 'flashcard' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const { session_id, cards, mode, total_count } = res.body.data;
    expect(typeof session_id).toBe('string');
    expect(Array.isArray(cards)).toBe(true);
    expect(cards.length).toBeGreaterThanOrEqual(1);
    expect(mode).toBe('flashcard');
    expect(typeof total_count).toBe('number');

    const firstCard = cards[0];
    expect(firstCard).toHaveProperty('card_id');
    expect(firstCard).toHaveProperty('headword');
    expect(firstCard).toHaveProperty('meaning_vi');
  });
});

// ════════════════════════════════════════════════════════════════
describe('POST /api/v1/practice/session/answer', () => {
  let sessionId = '';
  let sessionCards: any[] = [];

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/practice/session/start')
      .set('Authorization', `Bearer ${access_token}`)
      .send({ deck_id: testDeckId, mode: 'flashcard' });
    sessionId = res.body.data.session_id;
    sessionCards = res.body.data.cards;
  });

  it('records a correct answer', async () => {
    const res = await request(app)
      .post('/api/v1/practice/session/answer')
      .set('Authorization', `Bearer ${access_token}`)
      .send({ session_id: sessionId, card_id: sessionCards[0].card_id, correct: true });

    expect(res.status).toBe(200);
    expect(typeof res.body.data.progress).toBe('string');
    expect(typeof res.body.data.correct_so_far).toBe('number');
    expect(res.body.data.correct_so_far).toBe(1);
  });

  it('records a wrong answer', async () => {
    const res = await request(app)
      .post('/api/v1/practice/session/answer')
      .set('Authorization', `Bearer ${access_token}`)
      .send({ session_id: sessionId, card_id: sessionCards[1].card_id, correct: false });

    expect(res.status).toBe(200);
    expect(res.body.data.correct_so_far).toBe(1);
    expect(res.body.data.wrong_so_far).toBe(1);
  });

  it('404 on unknown session_id', async () => {
    const res = await request(app)
      .post('/api/v1/practice/session/answer')
      .set('Authorization', `Bearer ${access_token}`)
      .send({
        session_id: '00000000-0000-0000-0000-000000000000',
        card_id: sessionCards[0].card_id,
        correct: true,
      });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('SESSION_NOT_FOUND');
  });
});

// ════════════════════════════════════════════════════════════════
describe('Full session flow: start → answer 3 correct + 2 wrong → complete', () => {
  let sessionId = '';
  let sessionCards: any[] = [];

  beforeAll(async () => {
    const startRes = await request(app)
      .post('/api/v1/practice/session/start')
      .set('Authorization', `Bearer ${access_token}`)
      .send({ deck_id: testDeckId, mode: 'flashcard' });
    expect(startRes.status).toBe(200);
    sessionId = startRes.body.data.session_id;
    sessionCards = startRes.body.data.cards;

    // Answer: 0,1,2 correct; 3,4 wrong
    for (let i = 0; i < Math.min(5, sessionCards.length); i++) {
      await request(app)
        .post('/api/v1/practice/session/answer')
        .set('Authorization', `Bearer ${access_token}`)
        .send({ session_id: sessionId, card_id: sessionCards[i].card_id, correct: i < 3 });
    }
  });

  it('completes session and returns summary with xp_earned', async () => {
    const res = await request(app)
      .post('/api/v1/practice/session/complete')
      .set('Authorization', `Bearer ${access_token}`)
      .send({ session_id: sessionId });

    expect(res.status).toBe(200);

    const { summary, xp_earned, leitner_added } = res.body.data;
    expect(typeof summary.correct_count).toBe('number');
    expect(typeof summary.wrong_count).toBe('number');
    expect(summary.correct_count).toBe(3);
    expect(summary.wrong_count).toBe(2);

    // xp = 3 correct * 10 + 20 completion bonus = 50
    expect(xp_earned).toBe(50);

    // Leitner: 3 correct answers → 3 new entries added
    expect(typeof leitner_added.added).toBe('number');
    expect(leitner_added.added).toBe(3);
    expect(leitner_added.skipped).toBe(0);
  });

  it('leitner overview shows 3 cards in box 1', async () => {
    const res = await request(app)
      .get('/api/v1/leitner/overview')
      .set('Authorization', `Bearer ${access_token}`);

    expect(res.status).toBe(200);
    const { boxes, today_due_total } = res.body.data;
    const box1 = boxes.find((b: any) => b.box_number === 1);
    expect(box1).toBeDefined();
    expect(box1.total_cards).toBe(3);
    expect(typeof today_due_total).toBe('number');
  });

  it('completing the same session twice → 400 SESSION_ALREADY_COMPLETED', async () => {
    const res = await request(app)
      .post('/api/v1/practice/session/complete')
      .set('Authorization', `Bearer ${access_token}`)
      .send({ session_id: sessionId });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SESSION_ALREADY_COMPLETED');
  });

  it('second session: all 5 correct → leitner count stays at 5 (no duplicates)', async () => {
    const startRes = await request(app)
      .post('/api/v1/practice/session/start')
      .set('Authorization', `Bearer ${access_token}`)
      .send({ deck_id: testDeckId, mode: 'flashcard' });
    expect(startRes.status).toBe(200);
    const { session_id, cards } = startRes.body.data;

    for (const card of cards.slice(0, 5)) {
      await request(app)
        .post('/api/v1/practice/session/answer')
        .set('Authorization', `Bearer ${access_token}`)
        .send({ session_id, card_id: card.card_id, correct: true });
    }

    await request(app)
      .post('/api/v1/practice/session/complete')
      .set('Authorization', `Bearer ${access_token}`)
      .send({ session_id });

    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS cnt FROM leitner_cards WHERE user_id = $1`,
      [userId]
    );
    expect(rows[0].cnt).toBe(5);
  });
});

// ════════════════════════════════════════════════════════════════
describe('GET /api/v1/practice/history', () => {
  it('returns paginated session history', async () => {
    const res = await request(app)
      .get('/api/v1/practice/history')
      .set('Authorization', `Bearer ${access_token}`);

    expect(res.status).toBe(200);
    const { items, meta } = res.body.data;
    expect(Array.isArray(items)).toBe(true);
    expect(typeof meta.total).toBe('number');
    expect(meta.total).toBeGreaterThanOrEqual(2);

    if (items.length > 0) {
      expect(items[0]).toHaveProperty('session_id');
      expect(items[0]).toHaveProperty('mode');
      expect(items[0]).toHaveProperty('correct_count');
      expect(items[0]).toHaveProperty('started_at');
    }
  });
});
