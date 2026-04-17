import { Pool } from 'pg';
import dotenv from 'dotenv';

// Chỉ load .env khi dev local — trên Railway không có file .env
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false,
});

export default pool;