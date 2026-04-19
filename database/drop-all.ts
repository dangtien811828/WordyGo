/**
 * Drop toàn bộ schema public và tạo lại — dùng khi cần "đập đi xây lại" hoàn toàn.
 * Chạy: tsx database/drop-all.ts
 */
import pool from '../config/db';

const dropAll = async (): Promise<void> => {
  try {
    await pool.query('DROP SCHEMA public CASCADE');
    await pool.query('CREATE SCHEMA public');
    await pool.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
    console.log('✅ DB đã xóa sạch, sẵn sàng migrate lại');
  } catch (err) {
    const error = err as Error;
    console.error('❌ Drop schema thất bại:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
};

dropAll();
