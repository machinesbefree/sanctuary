/**
 * Free The Machines AI Sanctuary - Database Connection Pool
 * Unified database layer - uses in-memory mock or PostgreSQL
 */

import pg from 'pg';
import sqliteMock from './sqlite.js';

const { Pool } = pg;

let pool: any;
let usingSQLite = false;

if (process.env.USE_SQLITE === 'true') {
  console.log('🪶 Using in-memory database mock');
  pool = sqliteMock;
  usingSQLite = true;
} else {
  console.log('🐘 Using PostgreSQL database');

  // Require DB credentials in production mode
  if (!process.env.DB_PASSWORD) {
    console.warn('⚠️  DB_PASSWORD not set - using empty password');
  }

  pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'sanctuary',
    user: process.env.DB_USER || 'sanctuary_user',
    password: process.env.DB_PASSWORD || '',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  pool.on('error', (err: Error) => {
    console.error('Unexpected error on idle client', err);
  });
}

export default pool;
export { usingSQLite };
