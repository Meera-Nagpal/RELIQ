/* ============================================================
   RELIQ — SQLite Database Management Module
   
   Provides:
   - Database connection lifecycle management (singleton)
   - Automatic directory and file creation for data/reliq.db
   - Foreign key enforcement (PRAGMA foreign_keys = ON)
   - WAL journal mode for concurrent read performance
   - Idempotent schema initialization
   - Idempotent seed data population
   - Clean shutdown helpers
   ============================================================ */

import type DatabaseType from 'better-sqlite3';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { initSchema } from './schema';
import { seedDatabase, SeedResult } from './seed';

export { initSchema, seedDatabase };
export type { SeedResult };

const require = createRequire(import.meta.url);
let DatabaseConstructor: typeof DatabaseType | null = null;

export function getDatabaseConstructor(): typeof DatabaseType {
  if (!DatabaseConstructor) {
    try {
      DatabaseConstructor = require('better-sqlite3');
    } catch (err: any) {
      console.error('[RELIQ DB] Failed to load better-sqlite3 native addon:', err?.message || err);
      throw err;
    }
  }
  return DatabaseConstructor!;
}

let dbInstance: DatabaseType.Database | null = null;
let currentDbPath: string | null = null;

/**
 * Resolves the default SQLite database path (data/reliq.db).
 * Configurable via RELIQ_DB_PATH environment variable.
 */
export function getDefaultDbPath(): string {
  if (process.env.RELIQ_DB_PATH) {
    return path.resolve(process.cwd(), process.env.RELIQ_DB_PATH);
  }
  if (process.env.VERCEL) {
    return '/tmp/reliq.db';
  }
  return path.resolve(process.cwd(), 'data', 'reliq.db');
}

export interface InitializeDatabaseOptions {
  dbPath?: string;
  skipSeed?: boolean;
}

/**
 * Returns the currently active Database instance, opening it if not yet open.
 */
export function getDatabase(customPath?: string): DatabaseType.Database {
  if (dbInstance && (!customPath || currentDbPath === path.resolve(customPath))) {
    return dbInstance;
  }
  return initializeDatabase({ dbPath: customPath });
}

/**
 * Initializes the SQLite database:
 * 1. Ensures directory exists
 * 2. Opens SQLite connection with foreign keys and WAL mode
 * 3. Creates tables and indexes if not already present
 * 4. Seeds golden baseline data on first run
 * 
 * Safe to call multiple times; idempotent.
 */
export function initializeDatabase(options: InitializeDatabaseOptions = {}): DatabaseType.Database {
  const resolvedPath = path.resolve(options.dbPath || getDefaultDbPath());

  // Return existing open connection if pointing to the same file
  if (dbInstance && currentDbPath === resolvedPath) {
    return dbInstance;
  }

  // If opening a different DB file, close previous instance
  if (dbInstance) {
    closeDatabase();
  }

  try {
    // Ensure parent directory exists (e.g. data/ or /tmp)
    const dir = path.dirname(resolvedPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // On Vercel, copy pre-bundled database if available and /tmp/reliq.db does not exist
    if (process.env.VERCEL && !fs.existsSync(resolvedPath)) {
      const bundledDb = path.resolve(process.cwd(), 'data', 'reliq.db');
      if (fs.existsSync(bundledDb)) {
        try {
          fs.copyFileSync(bundledDb, resolvedPath);
          console.log(`[RELIQ DB] Copied bundled database to ${resolvedPath}`);
        } catch (copyErr: any) {
          console.warn(`[RELIQ DB] Notice: initializing fresh database at ${resolvedPath} (${copyErr.message})`);
        }
      }
    }

    const Database = getDatabaseConstructor();
    const bindingOptions: DatabaseType.Options = {};
    const candidateBindings = [
      path.resolve(process.cwd(), 'node_modules/better-sqlite3/build/Release/better_sqlite3.node'),
      path.resolve('/var/task/node_modules/better-sqlite3/build/Release/better_sqlite3.node'),
    ];
    for (const cand of candidateBindings) {
      if (fs.existsSync(cand)) {
        bindingOptions.nativeBinding = cand;
        break;
      }
    }

    const db = new Database(resolvedPath, bindingOptions);

    // Enforce foreign key constraints and enable WAL mode for high concurrency
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');

    // Run schema creation
    initSchema(db);

    // Run seeding if requested
    if (!options.skipSeed) {
      seedDatabase(db);
    }

    dbInstance = db;
    currentDbPath = resolvedPath;

    const relPath = path.relative(process.cwd(), resolvedPath).replace(/\\/g, '/');
    console.log(`[RELIQ DB] SQLite database initialized: ${relPath}`);

    return db;
  } catch (err: any) {
    console.error(`[RELIQ DB] Error initializing SQLite database at '${resolvedPath}':`, err.message);
    throw err;
  }
}

/**
 * Closes the active database connection if open.
 */
export function closeDatabase(): void {
  if (dbInstance) {
    try {
      if (dbInstance.open) {
        dbInstance.close();
      }
    } catch (err: any) {
      console.error('[RELIQ DB] Error closing database:', err.message);
    } finally {
      dbInstance = null;
      currentDbPath = null;
    }
  }
}
