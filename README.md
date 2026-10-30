# RELIQ — AI Reliability & Model Regression Testing Platform
**Version 2.8.0 — Cloud-First Architecture**

RELIQ is a real-time AI reliability, regression detection, and model evaluation platform. It evaluates, compares, and monitors production AI models and agent systems using authentic provider APIs, deterministic reference evaluators, and qualitative LLM judging.

---

## 🚀 Live Deployments & Demos

- **Frontend (Vercel):** [https://reliq-id3mhh3q2-meera-nagpal.vercel.app](https://reliq-id3mhh3q2-meera-nagpal.vercel.app)
- **Production Backend (Render):** Configured via [`render.yaml`](./render.yaml) (`/api/health`)
- **Cloud Database (Supabase PostgreSQL):** [https://fvzdkyozonzpkrzlkzcl.supabase.co](https://fvzdkyozonzpkrzlkzcl.supabase.co)

---

## 🏛️ Cloud Architecture

```
┌────────────────────────────────────────────────────────┐
│                   Vercel (Frontend)                    │
│      React 18 + Vite SPA + Three.js / R3F Canvas       │
│         Auth Client (Supabase) + API Client            │
└──────────────────────────┬─────────────────────────────┘
                           │ HTTPS / REST (JWT Bearer)
                           ▼
┌────────────────────────────────────────────────────────┐
│                    Render (Backend)                    │
│          Node.js Standalone Evaluation Server          │
│       - Worker Pool Concurrency (1-20 workers)         │
│       - SHA-256 Evaluation Response Caching            │
│       - Provider Rate-Limit Scheduler & Token Bucket   │
│       - Auth Verification & Secret Protection          │
└──────────────┬──────────────────────────┬──────────────┘
               │                          │
               ▼                          ▼
┌──────────────────────────────┐  ┌──────────────────────┐
│     Supabase PostgreSQL      │  │ Real AI Provider APIs│
│   - Projects & Datasets      │  │ - Groq (Qwen/Llama)  │
│   - Test Cases & Versions    │  │ - Cerebras           │
│   - Evaluation Runs & Results│  │ - Google Gemini      │
│   - Row Level Security (RLS) │  │ - OpenAI             │
│   - Response Cache Table     │  │ - Anthropic Claude   │
└──────────────────────────────┘  └──────────────────────┘
```

---

## ⚡ Key Upgrades in Version 2.8.0

### 1. Cloud-First Persistence (Supabase PostgreSQL)
- **Migrated from ephemeral SQLite** to production-grade Supabase PostgreSQL.
- **Relational Integrity:** Foreign keys on all tables (`ON DELETE CASCADE`, `ON DELETE SET NULL`).
- **Row Level Security (RLS):** Service role bypass for backend engine; user-ownership scoping via `auth.users(id)`.
- **Dual-Engine Architecture:** Seamlessly falls back to local SQLite when offline or during test runs.

### 2. Upgraded Evaluation Engine
- **Deterministic Offline Evaluation:** Zero-API-cost evaluations for exact match, normalized text, behavioral safety, json validity, and cosine vector semantic similarity.
- **Cryptographic Response Caching:** SHA-256 cache keys over prompt, model, system prompt, temperature, and tokens. Instant 1ms cached replay for previously executed scenarios.
- **Worker Pool Parallelism:** Configurable concurrency (up to 20 parallel workers) with bounded backoff and rate-limit aware pacing.
- **Optional LLM-as-a-Judge:** AI judging is fully decoupled and optional. Missing or unavailable judge models safely fall back to deterministic scoring without masking provider errors.

### 3. Production Security & Secret Management
- **Zero Raw Secret Exposure:** API keys and database service role secrets are strictly backend-only. Never passed to client bundles or returned in `/api/versions` or `/api/health`.
- **Bearer Token Auth:** `/api/auth/me`, `/api/auth/signin`, `/api/auth/signup` delegated directly to Supabase Auth.

---

## 🗄️ Database Schema & Supabase Setup

The complete, idempotent PostgreSQL schema is located in:
[`supabase/migrations/20261031_initial_schema.sql`](./supabase/migrations/20261031_initial_schema.sql)

### Tables
1. `projects`: Evaluation workspaces and regression gate thresholds.
2. `datasets`: Uploaded or built-in test suites (JSON, JSONL, CSV, preference pairs).
3. `test_cases`: Test scenarios, expected behaviors, and evaluator criteria.
4. `model_versions`: Model identifiers, system prompts, hyperparameters.
5. `evaluation_runs`: Evaluation run lifecycle, pass rates, and release decisions.
6. `evaluation_results`: Granular per-case telemetry (latency, tokens, cost, failure classification).
7. `project_settings`: Configurable gating rules (min accuracy, max degradation, latency tolerance).
8. `release_decision_audit`: Immutable audit trail of supervisor release decisions.
9. `evaluation_cache`: SHA-256 cached model responses for fast replay.

### Applying Migrations to Supabase
1. Open the [Supabase Dashboard](https://supabase.com/dashboard/project/fvzdkyozonzpkrzlkzcl/sql).
2. Navigate to **SQL Editor** -> **New Query**.
3. Copy the contents of [`supabase/migrations/20261031_initial_schema.sql`](./supabase/migrations/20261031_initial_schema.sql) and click **Run**.
4. To sync all local SQLite data into Supabase, run:
   ```bash
   npm run migrate:supabase
   ```

---

## 🛠️ Local Development & Running

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local
# Add your real Supabase & AI provider keys to .env.local

# 3. Run automated test suite (382 tests)
npm test

# 4. Start local development server
npm run dev
```

---

## 🌐 Cloud Deployment Instructions

### Deploy Backend to Render
1. Connect your repository to Render.
2. Select **New Web Service** and choose **Blueprint** pointing to [`render.yaml`](./render.yaml).
3. In Render Dashboard Environment Variables, configure:
   - `SUPABASE_URL`: `https://fvzdkyozonzpkrzlkzcl.supabase.co`
   - `SUPABASE_SERVICE_ROLE_KEY`: `sb_secret_...`
   - `GROQ_API_KEY`: `gsk_...`
   - `CEREBRAS_API_KEY`: `csk-...`
   - `GEMINI_API_KEY`: `AQ....`
4. Health check URL is `/api/health`.

### Deploy Frontend to Vercel
1. Import repository into Vercel.
2. Framework Preset: **Vite**.
3. Output Directory: `dist`.
4. Build Command: `npm run build`.
5. Environment Variables:
   - `RENDER_EXTERNAL_URL`: URL of your deployed Render backend (e.g. `https://reliq-backend.onrender.com`).
   - `SUPABASE_URL`: `https://fvzdkyozonzpkrzlkzcl.supabase.co`
   - `SUPABASE_ANON_KEY`: `sb_publishable_...`

---

## 🧪 Verification & Automated Testing

RELIQ includes 382 unit, integration, and cloud migration tests covering:
- Unit Evaluators & Classification (1-202)
- SQLite & Supabase Persistence (DB-1 to DB-11, EVAL-PERSIST-1 to 38)
- REST API Integration (API-1 to 36)
- Frontend Repository Storage (REPO-1 to 27)
- Dataset-Driven Uploads & Preference JSONL (DDU-1 to 21)
- Cloud Migration & Caching Engine (CLOUD-1 to 8)

Run tests anytime:
```bash
npm test
```
Result: **382 passed, 0 failed**.
