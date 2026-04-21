import request from 'supertest';
import app from '../app';
import pool from '../config/db';

const TS = Date.now();
const EMAIL_PREFIX = `phase4s-${TS}-`;

let accessToken = '';
let testDeckId = '';
let testEntryId = '';
let testCardId = '';

beforeAll(async () => {
  // Register user
  const reg = await request(app).post('/api/v1/auth/register').send({
    email: `${EMAIL_PREFIX}1@example.com`,
    password: 'password123',
    full_name: 'Study Tester',
  });
  if (reg.status !== 201) throw new Error(`Setup: ${JSON.stringify(reg.body)}`);
  accessToken = reg.body.data.accessToken;

  // Insert test dictionary entry
  const { rows } = await pool.query(
    `INSERT INTO dictionary_entries (headword, lemma, pos, meaning_vi, published, source)
     VALUES ($1, $1, $2, 'Nghĩa study test', TRUE, 'manual') RETURNING id`,
    [`phase4s-entry-${TS}`, ['noun']]
  );
  testEntryId = rows[0].id;

  // Create deck
  const deckRes = await request(app)
    .post('/api/v1/decks')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ title: 'Study Test Deck', level: 'beginner' });
  testDeckId = deckRes.body.data.id;

  // Add card to deck
  const cardRes = await request(app)
    .post(`/api/v1/decks/${testDeckId}/cards`)
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ entry_id: testEntryId });
  if (cardRes.status !== 201) throw new Error(`Card setup: ${JSON.stringify(cardRes.body)}`);
  testCardId = cardRes.body.data.id;
});

afterAll(async () => {
  await pool.query(`DELETE FROM users WHERE email LIKE $1`, [`${EMAIL_PREFIX}%`]);
  await pool.query(
    `DELETE FROM dictionary_entries WHERE headword = $1`,
    [`phase4s-entry-${TS}`]
  );
  await pool.end();
});

// ════════════════════════════════════════════════════════════════
describe('GET /api/v1/study/queue', () => {
  it('returns queue with new card + metadata', async () => {
    const res = await request(app)
      .get('/api/v1/study/queue')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.cards)).toBe(true);
    expect(res.body.data).toHaveProperty('total_due');
    expect(res.body.data).toHaveProperty('cards_per_session');

    const card = res.body.data.cards.find((c: any) => c.card_id === testCardId);
    expect(card).toBeDefined();
    expect(card.is_new).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════
describe('POST /api/v1/study/review', () => {
  it('rating=3 (Good) → leitner_box=2, due_at in future, correct=true', async () => {
    const res = await request(app)
      .post('/api/v1/study/review')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ card_id: testCardId, rating: 3, mode: 'flashcard', time_ms: 2000 });

    expect(res.status).toBe(200);
    expect(res.body.data.leitner_box).toBe(2);
    expect(res.body.data.correct).toBe(true);
    expect(res.body.data.review_interval).toBe(1);
    expect(new Date(res.body.data.due_at).getTime()).toBeGreaterThan(Date.now());
  });

  it('rating=1 (Again) → leitner_box=1, correct=false, lapses=1, due_at ≈ now+1min', async () => {
    const before = Date.now();
    const res = await request(app)
      .post('/api/v1/study/review')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ card_id: testCardId, rating: 1, mode: 'flashcard' });

    expect(res.status).toBe(200);
    expect(res.body.data.leitner_box).toBe(1);
    expect(res.body.data.correct).toBe(false);
    expect(res.body.data.lapses).toBe(1);
    // due_at should be within 2 minutes of now (1 minute learning step)
    const dueAt = new Date(res.body.data.due_at).getTime();
    expect(dueAt).toBeGreaterThan(before);
    expect(dueAt).toBeLessThan(before + 2 * 60 * 1000);
  });

  it('invalid card_id → 404 CARD_NOT_FOUND', async () => {
    const res = await request(app)
      .post('/api/v1/study/review')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ card_id: '00000000-0000-0000-0000-000000000000', rating: 3, mode: 'flashcard' });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CARD_NOT_FOUND');
  });
});

// ════════════════════════════════════════════════════════════════
describe('GET /api/v1/study/queue — after Again review', () => {
  it('card due in future → NOT in queue as due (may appear as new still has srs now)', async () => {
    // After rating=1, due_at = now+1min — still in due cards since due_at <= NOW() might be true
    // The card has a user_card_progress now so it's no longer "new"
    const res = await request(app)
      .get('/api/v1/study/queue')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    // Card should not appear as is_new: true anymore (it has a ucp record)
    const newCards = res.body.data.cards.filter((c: any) => c.is_new === true && c.card_id === testCardId);
    expect(newCards).toHaveLength(0);
  });
});

// ════════════════════════════════════════════════════════════════
describe('POST /api/v1/study/session-complete', () => {
  it('returns xp_earned + streak fields', async () => {
    const res = await request(app)
      .post('/api/v1/study/session-complete')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ reviews_count: 5, correct_count: 4 });

    expect(res.status).toBe(200);
    expect(res.body.data.xp_earned).toBe(40); // 4 * 10
    expect(typeof res.body.data.streak_current).toBe('number');
    expect(typeof res.body.data.streak_longest).toBe('number');
    expect(res.body.data.streak_current).toBeGreaterThanOrEqual(1);
  });
});
