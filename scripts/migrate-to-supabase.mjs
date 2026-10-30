/* ============================================================
   RELIQ — SQLite to Supabase PostgreSQL Migration Script
   
   Usage:
     node scripts/migrate-to-supabase.mjs
   
   Reads from: data/reliq.db (or RELIQ_DB_PATH)
   Writes to: Supabase PostgreSQL via service-role key
   
   Idempotent: Uses upsert (onConflict) to safely rerun without duplicates.
   ============================================================ */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { createClient } from '@supabase/supabase-js';

const require = createRequire(import.meta.url);

// Safely load environment from .env.local or .env
function loadEnv() {
  for (const f of ['.env.local', '.env']) {
    const full = path.resolve(process.cwd(), f);
    if (fs.existsSync(full)) {
      const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/);
      for (const line of lines) {
        const t = line.trim();
        if (t && !t.startsWith('#') && t.includes('=')) {
          const idx = t.indexOf('=');
          const k = t.substring(0, idx).trim();
          let v = t.substring(idx + 1).trim();
          if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
            v = v.slice(1, -1);
          }
          if (k && !process.env[k]) process.env[k] = v;
        }
      }
    }
  }
}

loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('[MIGRATION] Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Ensure .env.local contains these variables.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

const dbPath = path.resolve(process.cwd(), process.env.RELIQ_DB_PATH || 'data/reliq.db');

if (!fs.existsSync(dbPath)) {
  console.log(`[MIGRATION] Notice: SQLite database not found at ${dbPath}. Initializing schema only.`);
  process.exit(0);
}

const Database = require('better-sqlite3');
const db = new Database(dbPath, { readonly: true });

async function runMigration() {
  console.log('============================================================');
  console.log('RELIQ SQLite -> Supabase PostgreSQL Data Migration');
  console.log('============================================================');
  console.log(`Source SQLite:   ${dbPath}`);
  console.log(`Target Supabase: ${SUPABASE_URL}`);
  console.log('------------------------------------------------------------');

  let stats = {
    projects: 0,
    datasets: 0,
    testCases: 0,
    modelVersions: 0,
    projectSettings: 0,
    evaluationRuns: 0,
    evaluationResults: 0,
    releaseAudits: 0,
  };

  try {
    // 1. Projects
    const projects = db.prepare('SELECT * FROM projects').all();
    if (projects.length > 0) {
      console.log(`Migrating ${projects.length} project(s)...`);
      const { error } = await supabase.from('projects').upsert(projects, { onConflict: 'id' });
      if (error) throw new Error(`Projects upsert failed: ${error.message}`);
      stats.projects = projects.length;
    }

    // 2. Project Settings
    const settings = db.prepare('SELECT * FROM project_settings').all();
    if (settings.length > 0) {
      console.log(`Migrating ${settings.length} project setting(s)...`);
      const { error } = await supabase.from('project_settings').upsert(settings, { onConflict: 'project_id' });
      if (error) throw new Error(`Project settings upsert failed: ${error.message}`);
      stats.projectSettings = settings.length;
    }

    // 3. Model Versions
    const versions = db.prepare('SELECT * FROM model_versions').all();
    if (versions.length > 0) {
      console.log(`Migrating ${versions.length} model version(s)...`);
      const { error } = await supabase.from('model_versions').upsert(versions, { onConflict: 'id' });
      if (error) throw new Error(`Model versions upsert failed: ${error.message}`);
      stats.modelVersions = versions.length;
    }

    // 4. Datasets
    const datasets = db.prepare('SELECT * FROM datasets').all();
    if (datasets.length > 0) {
      console.log(`Migrating ${datasets.length} dataset(s)...`);
      const { error } = await supabase.from('datasets').upsert(datasets, { onConflict: 'id' });
      if (error) throw new Error(`Datasets upsert failed: ${error.message}`);
      stats.datasets = datasets.length;
    }

    // 5. Test Cases (batched in chunks of 100)
    const testCases = db.prepare('SELECT * FROM test_cases').all();
    if (testCases.length > 0) {
      console.log(`Migrating ${testCases.length} test case(s)...`);
      const CHUNK = 100;
      for (let i = 0; i < testCases.length; i += CHUNK) {
        const chunk = testCases.slice(i, i + CHUNK);
        const { error } = await supabase.from('test_cases').upsert(chunk, { onConflict: 'id' });
        if (error) throw new Error(`Test cases upsert failed: ${error.message}`);
      }
      stats.testCases = testCases.length;
    }

    // 6. Evaluation Runs
    const runs = db.prepare('SELECT * FROM evaluation_runs').all();
    if (runs.length > 0) {
      console.log(`Migrating ${runs.length} evaluation run(s)...`);
      const CHUNK = 50;
      for (let i = 0; i < runs.length; i += CHUNK) {
        const chunk = runs.slice(i, i + CHUNK);
        const { error } = await supabase.from('evaluation_runs').upsert(chunk, { onConflict: 'id' });
        if (error) throw new Error(`Evaluation runs upsert failed: ${error.message}`);
      }
      stats.evaluationRuns = runs.length;
    }

    // 7. Evaluation Results
    const results = db.prepare('SELECT * FROM evaluation_results').all();
    if (results.length > 0) {
      console.log(`Migrating ${results.length} evaluation result(s)...`);
      const CHUNK = 100;
      for (let i = 0; i < results.length; i += CHUNK) {
        const chunk = results.slice(i, i + CHUNK);
        const { error } = await supabase.from('evaluation_results').upsert(chunk, { onConflict: 'id' });
        if (error) throw new Error(`Evaluation results upsert failed: ${error.message}`);
      }
      stats.evaluationResults = results.length;
    }

    // 8. Release Decision Audit
    const audits = db.prepare('SELECT * FROM release_decision_audit').all();
    if (audits.length > 0) {
      console.log(`Migrating ${audits.length} release decision audit record(s)...`);
      const { error } = await supabase.from('release_decision_audit').upsert(audits, { onConflict: 'id' });
      if (error) throw new Error(`Release audit upsert failed: ${error.message}`);
      stats.releaseAudits = audits.length;
    }

    console.log('------------------------------------------------------------');
    console.log('MIGRATION COMPLETE:');
    console.table(stats);
    console.log('============================================================');
  } catch (err) {
    console.error('[MIGRATION] Migration failed:', err.message);
    if (err.message.includes('relation') && err.message.includes('does not exist')) {
      console.log('\n[!] Note: Supabase tables have not been created yet.');
      console.log('    Execute the SQL migration at supabase/migrations/20261031_initial_schema.sql');
      console.log('    in your Supabase SQL Editor: https://supabase.com/dashboard/project/fvzdkyozonzpkrzlkzcl/sql');
    }
    process.exit(1);
  } finally {
    db.close();
  }
}

runMigration();
