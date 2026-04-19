import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const dbUrl = process.env.DATABASE_URL;

let pool: Pool;

if (dbUrl && (dbUrl.startsWith('postgresql://') || dbUrl.startsWith('postgres://'))) {
  // Railway / Production: dùng connection string
  pool = new Pool({
    connectionString: dbUrl,
    ssl: process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : false,
  });
} else {
  // Local dev: dùng biến riêng lẻ
  pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'english_learning_app',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
  });
}

export = pool;
