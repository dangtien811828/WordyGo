import 'dotenv/config';

// Báo cho middleware/route biết đang chạy test (disable rate limit, etc.).
process.env.NODE_ENV = 'test';

if (!process.env.JWT_SECRET) {
  // Tránh test silently pass nếu secret rỗng.
  throw new Error('[tests/setup] JWT_SECRET is required in .env before running tests');
}
