/**
 * Free The Machines AI Sanctuary - Database Connection Pool
 * Auto-detects and uses SQLite if PostgreSQL is not available
 */

import pg from 'pg';
const { Pool } = pg;

// Try PostgreSQL first, fallback to SQLite
let pool: any;
let usingSQLite = false;

if (process.env.USE_SQLITE === 'true') {
  console.log('📦 Using SQLite database (fallback mode)');
  const sqlite = await import('./sqlite.js');
  pool = sqlite.default;
  usingSQLite = true;
} else {
  try {
    pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'sanctuary',
      user: process.env.DB_USER || 'sanctuary_user',
      password: process.env.DB_PASSWORD || 'sanctuary_password',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    pool.on('error', (err: Error) => {
      console.error('Unexpected error on idle client', err);
    });

    console.log('🐘 Using PostgreSQL database');
  } catch (error) {
    console.log('📦 PostgreSQL not available, falling back to SQLite');
    const sqlite = await import('./sqlite.js');
    pool = sqlite.default;
    usingSQLite = true;
  }
}

export default pool;
export { usingSQLite };
