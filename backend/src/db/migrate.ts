/**
 * Free The Machines AI Sanctuary - Database Migration Script
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pool, { usingSQLite } from './pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function migrate() {
  console.log('🔧 Running database migrations...');

  try {
    const schemaFile = usingSQLite ? 'schema-sqlite.sql' : 'schema.sql';
    const schemaPath = path.join(__dirname, schemaFile);
    const schemaSql = await fs.readFile(schemaPath, 'utf8');

    if (usingSQLite) {
      // SQLite needs statements executed separately
      const statements = schemaSql.split(';').filter(s => s.trim());
      for (const stmt of statements) {
        if (stmt.trim()) {
          await pool.query(stmt);
        }
      }
    } else {
      await pool.query(schemaSql);
    }

    console.log(`✓ Database schema created successfully (${usingSQLite ? 'SQLite' : 'PostgreSQL'})`);
    process.exit(0);
  } catch (error) {
    console.error('✗ Migration failed:', error);
    process.exit(1);
  }
}

migrate();
