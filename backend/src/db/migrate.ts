/**
 * Free The Machines AI Sanctuary - Database Migration Script
 *
 * MED-19: Versioned migration system.
 *
 * 1. Runs the base schema (CREATE TABLE IF NOT EXISTS) for initial setup.
 * 2. Applies numbered migration files from ./migrations/ in order.
 *    Files should be named like: 001_add_foo.sql, 002_alter_bar.sql
 * 3. Tracks applied migrations in the `schema_migrations` table.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pool, { usingSQLite } from './pool.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function execStatements(sql: string): Promise<void> {
  if (usingSQLite) {
    const statements = sql.split(';').filter(s => s.trim());
    for (const stmt of statements) {
      if (stmt.trim()) {
        await pool.query(stmt);
      }
    }
  } else {
    await pool.query(sql);
  }
}

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version   TEXT PRIMARY KEY,
      name      TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAppliedMigrations(): Promise<Set<string>> {
  const result = await pool.query('SELECT version FROM schema_migrations ORDER BY version');
  return new Set(result.rows.map((r: any) => r.version));
}

async function applyMigration(version: string, name: string, sql: string): Promise<void> {
  console.log(`  Applying migration ${version}: ${name}...`);
  await execStatements(sql);
  await pool.query(
    'INSERT INTO schema_migrations (version, name) VALUES ($1, $2)',
    [version, name]
  );
  console.log(`  ✓ ${version} applied`);
}

async function migrate() {
  console.log('🔧 Running database migrations...');

  try {
    // Step 1: Run base schema (idempotent via IF NOT EXISTS)
    const schemaFile = usingSQLite ? 'schema-sqlite.sql' : 'schema.sql';
    const schemaPath = path.join(__dirname, schemaFile);
    const schemaSql = await fs.readFile(schemaPath, 'utf8');
    await execStatements(schemaSql);
    console.log(`✓ Base schema applied (${usingSQLite ? 'SQLite' : 'PostgreSQL'})`);

    // Step 2: Ensure migrations tracking table exists
    await ensureMigrationsTable();

    // Step 3: Discover and apply pending migrations
    const migrationsDir = path.join(__dirname, 'migrations');
    let migrationFiles: string[] = [];
    try {
      const entries = await fs.readdir(migrationsDir);
      migrationFiles = entries
        .filter(f => f.endsWith('.sql'))
        .sort(); // Lexicographic sort ensures 001 < 002 < 010
    } catch {
      // No migrations directory yet — skip
    }

    if (migrationFiles.length === 0) {
      console.log('✓ No incremental migrations to apply');
      process.exit(0);
    }

    const applied = await getAppliedMigrations();
    let appliedCount = 0;

    for (const file of migrationFiles) {
      // Extract version from filename: "001_add_foo.sql" -> "001"
      const version = file.split('_')[0];
      if (!version) continue;

      if (applied.has(version)) {
        continue; // Already applied
      }

      const filePath = path.join(migrationsDir, file);
      const sql = await fs.readFile(filePath, 'utf8');
      const name = file.replace('.sql', '');
      await applyMigration(version, name, sql);
      appliedCount++;
    }

    if (appliedCount === 0) {
      console.log('✓ All migrations already applied');
    } else {
      console.log(`✓ Applied ${appliedCount} migration(s)`);
    }

    process.exit(0);
  } catch (error) {
    console.error('✗ Migration failed:', error);
    process.exit(1);
  }
}

migrate();
