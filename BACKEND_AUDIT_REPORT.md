# RELIQ — Comprehensive Backend Audit & Root Cause Analysis

**Document Version:** 1.0.0  
**Audit Date:** November 2026  
**Audit Scope:** Entire Repository (`D:\Downloads\RELIQ-project`)  
**Auditor Roles:** Senior Backend Engineer, Backend Security Auditor, System Architect  
**Classification:** Internal Technical Audit Report  

---

## Table of Contents
1. [Executive Summary](#1-executive-summary)
2. [Actual Backend Architecture](#2-actual-backend-architecture)
3. [Complete API Endpoint Inventory](#3-complete-api-endpoint-inventory)
4. [Database & Storage Findings](#4-database--storage-findings)
5. [Authentication & Authorization Findings](#5-authentication--authorization-findings)
6. [AI Provider Integration Findings](#6-ai-provider-integration-findings)
7. [RELIQ Evaluation Engine Audit](#7-reliq-evaluation-engine-audit)
8. [Security Vulnerabilities](#8-security-vulnerabilities)
9. [Performance & Reliability Issues](#9-performance--reliability-issues)
10. [Deployment & Production Readiness](#10-deployment--production-readiness)
11. [Existing Test Coverage](#11-existing-test-coverage)
12. [Critical Root Causes](#12-critical-root-causes)
13. [Severity-Based Issue Classification](#13-severity-based-issue-classification)
14. [Recommended Fixes](#14-recommended-fixes)
15. [Implementation Priority Roadmap](#15-implementation-priority-roadmap)

---

## 1. Executive Summary

### 1.1 Audit Context & Objectives
An exhaustive, repository-wide technical audit was conducted on the **RELIQ** AI model evaluation and benchmark platform. The objective of this audit was to uncover the **actual operational reality** of the backend systems, tracing code paths across routing, authentication, data persistence, AI provider scheduling, LLM-as-a-judge scoring, and deployment infrastructure.

This audit strictly inspected code implementations, runtime behaviors, environment configurations, and database schemas without making modifications to the repository.

### 1.2 System State & High-Level Verdict
RELIQ exhibits a sophisticated mathematical and statistical evaluation engine (featuring Mann-Whitney U testing, bootstrap confidence intervals, and dynamic veto hierarchies), but the operational backend suffers from **critical architectural bifurcations, severe authentication bypass vulnerabilities, database schema drift, disconnected scoring logic, and unbuildable deployment configurations**.

The system currently runs in a dual-runtime paradigm:
1. **Development Mode:** Managed via Vite's internal development server with a monolithic 1,081-line middleware handler (`proxyMiddleware.ts`).
2. **Production Mode:** Intended to run as a compiled Node.js HTTP server (`src/server/server.ts` compiled to `dist-server/server.js`).

However, the production deployment pathway is currently broken at the container level: the Docker build pipeline fails to compile or package the backend server. Furthermore, an intentional or leftover testing backdoor in the authentication layer allows total impersonation of any user account in production environments.

### 1.3 Key Strengths
- **Rigorous Statistical Verification:** The V3 scoring and statistical engine (`statisticalComparator.ts`, `v3ScoringEngine.ts`) implements genuine, mathematically sound non-parametric hypothesis testing (Mann-Whitney U, Hodges-Lehmann median difference estimator, and 1,000-iteration BCa bootstrap confidence intervals). All 8 unit tests in `v3ScoringAndStatistics.test.mjs` pass.
- **Provider Scheduling & Throttling:** `providerScheduler.ts` implements a sliding-window rate limiter tracking requests-per-minute (RPM) and tokens-per-minute (TPM) across Groq, Gemini, Anthropic, OpenAI, and Cerebras, with automatic queue deferral upon quota exhaustion.
- **Modular Data Persistence Interfaces:** The persistence boundary cleanly defines repository contracts (`supabaseRepository.ts`, `localRepository.ts`), enabling centralized driver selection.

### 1.4 Primary Vulnerabilities & Operational Risks
| Risk Area | Severity | Primary Finding |
| :--- | :--- | :--- |
| **Authentication** | **CRITICAL** | Production authentication bypass via hardcoded `test-user-*` tokens allowing arbitrary user impersonation (`authRoutes.ts:39-47`). |
| **Evaluation Integrity** | **HIGH** | LLM-as-a-Judge outputs are completely ignored during final V3 quality scoring (`v3ScoringEngine.ts:143`); judge scores act as cosmetic telemetry rather than evaluative criteria. |
| **Database Reliability** | **HIGH** | Schema drift in production: `evaluation_runs` table is missing `last_heartbeat_at`, forcing a retry-and-fail penalty on every run heartbeat (`supabaseRepository.ts:301-306`). |
| **Deployment / CI/CD** | **CRITICAL** | The production `Dockerfile` cannot boot: it builds only the frontend bundle and omits `dist-server/server.js`, causing immediate crash on `npm start`. |
| **System Denial of Service** | **MEDIUM** | In-memory 25 MB body parsing without connection termination upon size breach (`serverUtils.ts:14-40`), coupled with 250ms client polling (`EvaluationsView.tsx:478`). |

---

## 2. Actual Backend Architecture

### 2.1 Monorepo & Architectural Boundary Mapping
RELIQ operates as a single-package TypeScript application that combines a React 18 frontend with an Express/Node HTTP backend.

```
+-----------------------------------------------------------------------+
|                           CLIENT (Browser)                            |
|  React 18 + Vite + TailwindCSS + Lucide Icons                         |
|  src/app/views/EvaluationsView.tsx (Polls status every 250ms)        |
|  src/services/apiClient.ts -> Base URL: /api                          |
+-----------------------------------------------------------------------+
                                   |
                      HTTP / REST (JSON Payloads)
                                   v
+-----------------------------------------------------------------------+
|                          BACKEND INGESTION                            |
|                                                                       |
|  DEV MODE:                               PROD MODE:                   |
|  Vite Dev Server Plugin                  src/server/server.ts         |
|  (vite.config.ts)                        (Node.js http.createServer)  |
|         \                                      /                      |
|          +-------------> [ proxyMiddleware.ts ] <---------------------+
|                                 |                                     |
|             +-------------------+-------------------+                 |
|             |                   |                   |                 |
|             v                   v                   v                 |
|      [ authRoutes ]      [ projectRoutes ]   [ datasetRoutes ]       |
|      [ versionRoutes ]   [ settingsRoutes ]  [ evaluationDbRoutes ]   |
+-----------------------------------------------------------------------+
                                   |
                                   v
+-----------------------------------------------------------------------+
|                           SERVICE LAYER                               |
|                                                                       |
|  evaluationDbService.ts  <------------>  evaluationService.ts         |
|  projectService.ts                       providerScheduler.ts         |
|  datasetService.ts                       serverProviders.ts           |
|  versionService.ts                       cerebrasProvider.ts          |
+-----------------------------------------------------------------------+
              |                                        |
              v                                        v
+---------------------------+        +----------------------------------+
|      PERSISTENCE          |        |       EVALUATION PIPELINE        |
|  supabaseRepository.ts    |        |  runner.ts                       |
|  (Service Role Client)    |        |  v3ScoringEngine.ts              |
|  Direct Supabase PostgREST|        |  llmJudgeEvaluator.ts            |
|  Local disk fallback:     |        |  statisticalComparator.ts        |
|  data/runs/${runId}.json  |        |  judgeRegistry.ts                |
+---------------------------+        +----------------------------------+
```

### 2.2 Entry Points & Request Lifecycles

#### A. Entry Point 1: `src/server/server.ts` (Standalone Production Server)
- **Port:** Defaults to `process.env.PORT || 3001`.
- **Initialization:**
  1. Invokes `initializeDatabase()` from `src/server/db/database.ts`.
  2. Binds an HTTP server via `http.createServer`.
  3. Inspects `req.url`:
     - If path begins with `/api/` or `/health`, delegates to `proxyMiddleware(req, res, next)`.
     - Otherwise, serves static frontend assets from `dist/` directory, resolving unmatched paths to `dist/index.html` (SPA routing).
- **Flaw:** Missing standard HTTP security headers (HSTS, CSP, X-Frame-Options, X-Content-Type-Options).

#### B. Entry Point 2: `src/server/proxyMiddleware.ts` (Core Routing & Request Handler)
- **Lines of Code:** 1,081 lines.
- **Role:** Central gateway that inspects URLs, processes CORS headers, handles preflight `OPTIONS` requests, parses bodies, and delegates to sub-routes.
- **Architectural Duplication:**
  - `proxyMiddleware.ts` acts both as an Express-compatible middleware and as an ad-hoc router.
  - Several endpoints (e.g., direct provider calls, benchmark execution, provider health) are handled inline within `proxyMiddleware.ts` rather than being cleanly delegated to `src/server/routes/*`.

### 2.3 Request Execution Flow
1. **Frontend Request:** `apiClient.ts` sends an HTTP request (e.g., `POST /api/evaluations/run`) with `Authorization: Bearer <token>` and `Content-Type: application/json`.
2. **Gateway:** `proxyMiddleware.ts` applies CORS headers (reflecting `req.headers.origin`), checks HTTP methods, and parses the JSON body using `parseJsonBody` (`serverUtils.ts`).
3. **Authentication:** `authUtils.ts` extracts the Bearer token:
   - If token matches `test-user-*` or `test-token-*`, it synthesizes an authenticated mock user immediately without validating credentials against Supabase.
   - If a standard JWT is provided, it calls `supabaseClient.auth.getUser(token)`.
4. **Service Dispatch:** The route handler extracts parameters and invokes the corresponding service method in `evaluationDbService.ts`.
5. **Execution & Scheduling:**
   - If an evaluation is initiated, `providerScheduler.ts` acquires an evaluation execution lock (`evaluationState.activeRunId`).
   - Work items are distributed to provider clients (`cerebrasProvider.ts`, `serverProviders.ts`).
6. **Persistence:** Results are written to Supabase PostgreSQL via `supabaseRepository.ts`. Simultaneously, an asynchronous disk write is attempted to `data/runs/<runId>.json`.

### 2.4 Dead, Duplicated, and Inconsistent Code
- **SQLite Fallback Residue:** `src/server/db/database.ts` and `src/server/db/supabaseRepository.ts` contain extensive branches checking `isSQLiteDriverActive()`. However, `database.ts:L33-L41` unconditionally throws an error in non-test modes: `[RELIQ DB] SQLite initialization blocked. Production requires Supabase PostgreSQL`. The SQLite codebase is dead legacy code in production.
- **Dual Persistence Writes:** `evaluationDbService.ts` maintains a parallel write pattern where evaluation runs are persisted to Supabase and written to local disk (`data/runs/*.json`). In containerized, serverless, or multi-instance environments (e.g., Render, Vercel), local files are ephemeral and create data drift between instances.
- **Orphaned Route Handlers:** Several inline endpoint handlers in `proxyMiddleware.ts` duplicate logic found in `src/server/routes/evaluationDbRoutes.ts`.

---

## 3. Complete API Endpoint Inventory

| HTTP Method | Route Path | Purpose | Auth Required | Input Payload | Database / External Calls | Potential Failures |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Register a new user | No | `{ email, password, name? }` | `supabase.auth.signUp()` | Missing password strength validation; duplicate email error unhandled. |
| `POST` | `/api/auth/login` | Authenticate user & issue JWT | No | `{ email, password }` | `supabase.auth.signInWithPassword()` | No rate limiting; vulnerable to brute-force credential stuffing. |
| `POST` | `/api/auth/logout` | Invalidate current session | Optional | None | `supabase.auth.signOut()` | Session may remain active if client discards token locally without Supabase invalidation. |
| `GET` | `/api/auth/me` | Retrieve profile of authenticated user | **Bypassed** | Headers: `Authorization: Bearer <token>` | `supabase.auth.getUser()` | **CRITICAL:** Accepts `test-user-*` tokens, returning synthetic admin sessions in production. |
| `GET` | `/api/projects` | List all projects belonging to user | Yes | None | `supabase.from('projects').select()` | Unbounded query; lacks cursor/offset pagination. |
| `POST` | `/api/projects` | Create a new project | Yes | `{ name, description?, defaultModel? }` | `supabase.from('projects').insert()` | Missing name length & character sanitization. |
| `GET` | `/api/projects/:id` | Get details for single project | Yes | Path parameter `:id` | `supabase.from('projects').select()` | Returns 404 if not found; relies on backend `userId` filter rather than RLS. |
| `PUT` | `/api/projects/:id` | Update project metadata | Yes | `{ name?, description?, defaultModel? }` | `supabase.from('projects').update()` | Partial validation; concurrent updates can overwrite fields without optimistic locking. |
| `DELETE` | `/api/projects/:id` | Delete a project and its cascades | Yes | Path parameter `:id` | `supabase.from('projects').delete()` | Cascade deletion across runs/datasets can timeout in large workspaces. |
| `GET` | `/api/projects/:id/versions` | List prompt versions under project | Yes | Path parameter `:id` | `supabase.from('prompt_versions').select()` | Missing pagination; large version histories bloat response. |
| `POST` | `/api/projects/:id/versions` | Create a new prompt version | Yes | `{ name, systemPrompt, template, ... }` | `supabase.from('prompt_versions').insert()` | No prompt size ceiling; large templates consume excessive memory. |
| `GET` | `/api/projects/:id/datasets` | List datasets linked to project | Yes | Path parameter `:id` | `supabase.from('datasets').select()` | Unbounded data retrieval. |
| `POST` | `/api/projects/:id/datasets` | Create dataset for project | Yes | `{ name, description?, testCases }` | `supabase.from('datasets').insert()` | Large `testCases` arrays can exceed memory limit during JSON parsing. |
| `GET` | `/api/datasets/:id` | Retrieve dataset and test items | Yes | Path parameter `:id` | `supabase.from('datasets').select()` | Missing pagination for dataset items. |
| `PUT` | `/api/datasets/:id` | Update dataset metadata/cases | Yes | `{ name?, description?, items? }` | `supabase.from('datasets').update()` | Replaces entire dataset items array without diffing; race hazard. |
| `DELETE` | `/api/datasets/:id` | Delete a dataset | Yes | Path parameter `:id` | `supabase.from('datasets').delete()` | Orphaned run references if runs refer to deleted dataset ID. |
| `POST` | `/api/evaluations/run` | Launch a model evaluation run | Yes | `{ projectId, promptVersionId, datasetId, candidateModel, baselineModel?, judgeModel? }` | `supabase`, AI Provider APIs (Groq, Cerebras, etc.) | **Single-concurrency lock:** Rejects or blocks if another evaluation is running; fire-and-forget DB save. |
| `GET` | `/api/evaluations/status/:runId` | Check progress of active run | Yes | Path parameter `:runId` | `supabase.from('evaluation_runs')` + Memory State | Polled by frontend every 250ms (4 req/sec per user); high database/CPU pressure. |
| `POST` | `/api/evaluations/cancel/:runId`| Abort an in-flight evaluation | Yes | Path parameter `:runId` | Memory cancellation token + Supabase update | Provider requests in flight may not terminate immediately; token consumption continues until provider yields. |
| `GET` | `/api/evaluations/history` | List completed evaluation runs | Yes | Query params: `projectId`, `limit` | `supabase.from('evaluation_runs').select()` | Missing index on `(project_id, created_at)` can degrade query performance. |
| `GET` | `/api/evaluations/runs/:id` | Get full details & results of run | Yes | Path parameter `:id` | `supabase.from('evaluation_runs')` + disk fallback | Merges Supabase record with `data/runs/<id>.json`; disk missing in containers causes subtle data divergence. |
| `POST` | `/api/evaluations/runs/:id/compare` | Compare run against baseline | Yes | `{ baselineRunId }` | `supabase.from('evaluation_runs')` | In-memory Mann-Whitney & bootstrap recalculation; CPU intensive for runs with >500 items. |
| `GET` | `/api/providers/models` | List available models per provider | Yes | None | Static provider registry | Returns hardcoded provider list; does not dynamically test provider API key validity. |
| `GET` | `/api/providers/health` | Test connectivity to AI providers | Yes | None | Live network calls to Groq/Gemini/Cerebras | Blocks HTTP thread if an external provider experiences connection timeouts. |
| `GET` | `/api/settings` | Retrieve user workspace settings | Yes | None | `supabase.from('user_settings').select()` | Returns defaults if record missing; lacks schema validation on stored JSON. |
| `PUT` | `/api/settings` | Save user workspace settings | Yes | `{ apiKeyOverrides?, defaultJudge?, ... }` | `supabase.from('user_settings').upsert()` | Risk of storing plain-text user API keys without application-level encryption. |
| `GET` | `/api/health` | Operational health probe | No | None | None | Always returns `{ status: "ok" }`; does not verify database connectivity or disk accessibility. |



---

## 4. Database & Storage Findings

### 4.1 Database Architecture & Driver Selection
RELIQ was originally architected with a dual-driver storage abstraction supporting SQLite (for local development) and Supabase PostgreSQL (for cloud deployment).
- **Driver Detection:** Implemented in `src/server/db/database.ts` via `isSupabaseDriverActive()`. If `SUPABASE_URL` and `SUPABASE_ANON_KEY` or `SUPABASE_SERVICE_ROLE_KEY` are present in the environment, the system activates PostgreSQL mode.
- **SQLite Deprecation:** In `database.ts:L33-L41`, SQLite initialization is deliberately blocked:
  ```typescript
  if (isSQLiteDriverActive() && process.env.NODE_ENV !== 'test') {
    throw new Error('[RELIQ DB] SQLite initialization blocked. Production requires Supabase PostgreSQL');
  }
  ```
  However, extensive dead code branches and interface stubs for SQLite persist in `supabaseRepository.ts` and `schema.ts`.

### 4.2 Supabase PostgreSQL Client & Connection Management
Connection management is governed by `src/server/db/supabaseClient.ts`.
- **Client Factory:** Instantiates `@supabase/supabase-js` `createClient`.
- **Credential Precedence:** Prioritizes `SUPABASE_SERVICE_ROLE_KEY` over `SUPABASE_ANON_KEY`.
- **RLS Bypass:** Because the backend utilizes the `service_role` secret, **PostgreSQL Row Level Security (RLS) is completely bypassed** at the network connection layer. All authorization and tenant data isolation logic relies strictly on application-level filtering (`.eq('user_id', userId)`).

### 4.3 Schema Drift & Column Omission Bug
A critical schema drift exists between the SQL migrations and the application repository layer.
- **Migration File:** `supabase/migrations/20261031_initial_schema.sql` defines the `evaluation_runs` table with columns: `id`, `project_id`, `version_id`, `dataset_id`, `candidate_model`, `baseline_model`, `status`, `progress`, `metrics`, `summary`, `created_at`, `updated_at`.
- **Missing Column:** The migration **omits the `last_heartbeat_at` column**.
- **Runtime Penalty:** In `src/server/db/supabaseRepository.ts:L301-L306`, the repository attempts to write `last_heartbeat_at` on every heartbeat update. When Supabase rejects the write with error code `PGRST204` (column not found), the catch block intercepts the error, strips `last_heartbeat_at`, and retries the update:
  ```typescript
  // supabaseRepository.ts:301-306
  const { error } = await supabase.from('evaluation_runs').update(payload).eq('id', runId);
  if (error && error.message.includes('last_heartbeat_at')) {
    delete payload.last_heartbeat_at;
    await supabase.from('evaluation_runs').update(payload).eq('id', runId);
  }
  ```
  **Consequence:** Every heartbeat update incurs a failed network round-trip and retry, doubling database latency and generating continuous error logs.

### 4.4 Fire-and-Forget Persistence (Unhandled Promise Rejections)
In `src/server/services/evaluationDbService.ts:L546`, evaluation run results are saved without `await`:
```typescript
// evaluationDbService.ts:546
supabaseRepository.saveEvaluationRun(run); // Fire-and-forget call
```
- **Observed Behavior:** The caller does not await completion of the database transaction before responding or terminating.
- **Risk:** If a network blip or Supabase rate-limit occurs, the promise rejects unhandled, and completed evaluation results are permanently lost without notice.

### 4.5 Ephemeral Local Disk Storage Dependency
In `src/server/services/evaluationDbService.ts:L802-L820`, the service attempts to read and write run telemetry to local files at `data/runs/${runId}.json`:
```typescript
const filePath = path.join(process.cwd(), 'data', 'runs', `${runId}.json`);
if (fs.existsSync(filePath)) {
  const fileData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return mergeRunData(supabaseRecord, fileData);
}
```
- **Root Cause:** A hybrid persistence model combining local JSON caches with remote database records.
- **Production Consequence:** In containerized environments (Docker, Render) or serverless platforms (Vercel), local container disks are ephemeral and instanced. If a user runs an evaluation on Instance A, Instance B will fail to find the file, resulting in divergent or incomplete evaluation reports.

---

## 5. Authentication & Authorization Findings

### 5.1 Critical Authentication Bypass via Test Tokens
The most severe security vulnerability in the RELIQ repository is located in `src/server/routes/authRoutes.ts:L39-L47` (and mirrored in `authUtils.ts`):
```typescript
// authRoutes.ts:39-47
const authHeader = req.headers['authorization'];
if (authHeader && (authHeader.startsWith('Bearer test-user-') || authHeader.startsWith('Bearer test-token-'))) {
  const token = authHeader.replace('Bearer ', '');
  const syntheticUserId = token.replace('test-token-', '').replace('test-user-', '');
  return {
    id: syntheticUserId,
    email: `${syntheticUserId}@reliq.ai`,
    role: 'authenticated'
  };
}
```
- **Defect:** This mock handler contains **no environment checks** (`process.env.NODE_ENV !== 'production'`).
- **Exploitation:** Any external, unauthenticated client can supply `Authorization: Bearer test-user-victim_uuid` to any API endpoint. The backend immediately accepts this token and grants authenticated context as `victim_uuid`.
- **Impact:** Combined with the `service_role` database client (which bypasses PostgreSQL RLS), an attacker can read, modify, or delete every project, dataset, prompt version, and evaluation result in the system.

### 5.2 Session Management & Supabase Auth Integration
- When genuine JWT tokens are passed, `authUtils.ts` validates tokens via `supabaseClient.auth.getUser(token)`.
- **Missing Token Revocation / Invalidation:** Once issued, Supabase JWTs remain valid until their expiration timestamp (`exp`). There is no server-side token denylist or immediate session revocation check during logout.
- **Flat Authorization Model:** There are no role-based access control (RBAC) checks (e.g., Owner, Editor, Viewer). Any authenticated user possessing or spoofing a project's `userId` has full administrative access to that project and all linked datasets.

---

## 6. AI Provider Integration Findings

### 6.1 Provider Registry & Execution Architecture
RELIQ integrates multiple LLM inference providers via `src/server/serverProviders.ts`, `src/server/providers/cerebrasProvider.ts`, and `src/server/providerScheduler.ts`:
- **Supported Providers:** Groq, Gemini (Google Generative AI), OpenAI, Anthropic, Cerebras.
- **Key Ingestion:** API keys are read from environment variables (`GROQ_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `CEREBRAS_API_KEY`) or workspace settings overrides.

### 6.2 Provider Scheduler & Rate-Limiting Mechanics
`src/server/providerScheduler.ts` implements a dynamic rate-limiting scheduler designed to prevent 429 quota exhaustion on free-tier APIs:
- **Sliding-Window Trackers:** Tracks requests-per-minute (RPM) and tokens-per-minute (TPM) using in-memory circular timestamps.
- **Provider Throttling Queues:** If a provider approaches 90% of its declared quota, incoming inference requests are enqueued with an exponential backoff timer.
- **Failure Handling:** If an inference request fails with HTTP 429 or 503, the scheduler backs off the specific provider and attempts failover to an alternative candidate model if configured.

### 6.3 Global Evaluation Single-Concurrency Lock
In `src/server/providerScheduler.ts:L649-L675`, evaluation execution is governed by a single in-memory mutex:
```typescript
// providerScheduler.ts:649-675
if (evaluationState.activeRunId && evaluationState.activeRunId !== runId) {
  throw new Error(`Another evaluation run (${evaluationState.activeRunId}) is currently in progress. Multi-run concurrency is restricted to protect provider rate limits.`);
}
```
- **Observed Behavior:** The backend permits exactly **ONE active evaluation run server-wide**.
- **Impact:** If multiple users or background jobs trigger evaluations simultaneously, all subsequent requests are rejected immediately or block until the 120-second timeout expires. This makes the system unsuitable for multi-tenant production use.

### 6.4 Free-Tier Fragility
While the scheduler prevents immediate rate-limit tripping, evaluating a dataset of 50 items with Candidate, Baseline, and Judge calls consumes `50 * 3 = 150` inference requests. Under Groq free tier (30 RPM limit), a single run experiences 5 minutes of artificial queue delays.

---

## 7. RELIQ Evaluation Engine Audit

### 7.1 Evaluation Pipeline Tracing
The evaluation pipeline flows through four stages:
1. **Candidate/Baseline Generation:** Inputs from the dataset are interpolated into prompt templates and dispatched to models via `providerScheduler.ts`.
2. **Deterministic & Semantic Verification:** Exact matches, regex patterns, BLEU/ROUGE approximations, and cosine semantic similarities are computed in `runner.ts`.
3. **LLM-as-a-Judge Evaluation:** Candidate and baseline outputs are packaged into judge prompts and dispatched via `llmJudgeEvaluator.ts`.
4. **V3 Composite Scoring & Statistical Comparison:** Results are aggregated and tested for statistical significance in `v3ScoringEngine.ts` and `statisticalComparator.ts`.

### 7.2 Critical Finding: LLM Judge Disconnection from V3 Scoring
A major architectural flaw was discovered in the scoring aggregation layer:
- In `src/evaluation/v3ScoringEngine.ts:L143`:
  ```typescript
  // v3ScoringEngine.ts:143
  const judgeScore = cr.llmJudgeEvaluation; // Retrieved from case result
  ```
- **Defect:** `judgeScore` is declared and extracted, but **is never passed or factored into `evaluateCaseQualityDimensions()`**!
- **Actual Quality Score Computation:**
  ```typescript
  // v3ScoringEngine.ts:L160-L195
  const reasoning = computeDeterministicReasoning(cr);
  const correctness = computeSemanticCorrectness(cr.similarity, cr.exactMatch);
  const adherence = computeAdherence(cr.constraintsPassed);
  const relevance = computeRelevance(cr.groundednessWordOverlap);
  ```
- **Consequence:** The LLM-as-a-Judge API call (often using expensive models like GPT-4 or Claude 3.5 Sonnet) is executed, billed, and logged, but its qualitative assessment has **0% influence on the final V3 composite score or quality dimensions**. The Judge is acting purely as decorative telemetry.

### 7.3 Decision Layer Coercion
In `src/evaluation/runner.ts:L1187-L1188`:
```typescript
finalEvaluation.decisionLayer = safetyVetoTriggered ? 'SAFETY_VETO' : 'DETERMINISTIC';
```
- **Defect:** The system hardcodes `decisionLayer` to `'SAFETY_VETO'` or `'DETERMINISTIC'`.
- **Consequence:** A decision layer of `'JUDGE'` or `'HYBRID'` is structurally impossible to achieve, confirming that the LLM Judge is bypassed in the final verdict pipeline.

### 7.4 Position Bias in Judge Fingerprint Caching
In `src/evaluation/llmJudgeEvaluator.ts:L616-L642`:
- The evaluator computes a cache key fingerprint before randomizing model presentation order:
  ```typescript
  const cacheKey = computeJudgeFingerprint(candidateOutput, baselineOutput, criteria);
  const orderSwapped = Math.random() < 0.5;
  ```
- **Defect:** If a cached result exists for that fingerprint, it returns the stored judgment without accounting for whether `orderSwapped` was true or false during the original call.
- **Consequence:** Subsequent runs on identical inputs inherit the order bias of the first random coin flip rather than evaluating order-neutrally.

### 7.5 Statistical Engine Verification
In contrast to the judge disconnection, the mathematical components in `src/evaluation/statisticalComparator.ts` are implemented with high precision:
- **Mann-Whitney U Test:** Correct rank summation with tie adjustments and normal approximation for $N > 20$.
- **Bootstrap Confidence Interval:** BCa / Percentile bootstrap with 1,000 iterations for difference in medians.
- **Test Results:** 8 out of 8 unit tests passed in `tests/v3ScoringAndStatistics.test.mjs`.



---

## 8. Security Vulnerabilities

### Issue SEC-01: Critical Authentication Bypass via Unrestricted Test Tokens
- **Issue ID:** `SEC-01`
- **Severity:** **CRITICAL**
- **Exact File Path:** `src/server/routes/authRoutes.ts` (Lines 39–47) & `src/server/routes/authUtils.ts` (Lines 22–31)
- **Relevant Function/Component:** `extractAuthenticatedUser()` / `authMiddleware`
- **Actual Observed Behavior:** Any HTTP request bearing an `Authorization` header prefixed with `Bearer test-user-` or `Bearer test-token-` is immediately validated as an authenticated user. The server parses the remainder of the token as the user's UUID without verifying credentials against Supabase.
- **Root Cause:** A test mocking shortcut was introduced for local automated test suites but was committed without guarding for `process.env.NODE_ENV !== 'production'`.
- **Expected Behavior:** In production, all incoming bearer tokens must be cryptographically verified against Supabase Auth via `supabase.auth.getUser(token)`. Synthetic test tokens must be completely rejected.
- **Recommended Solution:** Remove the test token bypass entirely or strictly gate it behind `if (process.env.NODE_ENV === 'test' && process.env.ALLOW_TEST_TOKENS === 'true')`.
- **Dependencies & Side Effects:** Automated unit tests relying on synthetic tokens must provide a valid test environment variable (`ALLOW_TEST_TOKENS=true`).
- **Verification Method:** Send a `GET /api/auth/me` with header `Authorization: Bearer test-user-arbitrary-uuid`. The server must respond with HTTP `401 Unauthorized`.

---

### Issue SEC-02: Insecure Dynamic CORS Origin Reflection
- **Issue ID:** `SEC-02`
- **Severity:** **HIGH**
- **Exact File Path:** `src/server/proxyMiddleware.ts` (Lines 72–78)
- **Relevant Function/Component:** `handleCors()`
- **Actual Observed Behavior:** The server dynamically inspects the client's `Origin` header and echoes it directly into `Access-Control-Allow-Origin`, accompanied by `Access-Control-Allow-Credentials: true`.
  ```typescript
  // proxyMiddleware.ts:72-78
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  ```
- **Root Cause:** Permissive CORS handling introduced during frontend development to avoid cross-origin friction between Vite (port 5173) and Express (port 3001).
- **Expected Behavior:** `Access-Control-Allow-Origin` must match an explicit, configured whitelist of trusted domains (e.g., `process.env.FRONTEND_URL` or production domain).
- **Recommended Solution:** Define a strict whitelist array. Reject or omit CORS headers for origins not present in the whitelist.
- **Dependencies & Side Effects:** Local multi-port development requires `FRONTEND_URL` in `.env.local`.
- **Verification Method:** Send a curl request with `Origin: https://malicious-attacker.com` to `/api/projects`. Verify that the server does not reflect the malicious domain in `Access-Control-Allow-Origin`.

---

### Issue SEC-03: Unauthenticated and Unthrottled AI Ingestion Endpoints
- **Issue ID:** `SEC-03`
- **Severity:** **HIGH**
- **Exact File Path:** `src/server/proxyMiddleware.ts` (Lines 480–520) & `src/server/server.ts`
- **Relevant Function/Component:** `proxyMiddleware` route dispatch
- **Actual Observed Behavior:** Endpoints invoking live AI provider inference (such as `/api/providers/health` and prompt testing endpoints) do not enforce global IP rate limiting or request throttling before initiating external LLM calls.
- **Root Cause:** Rate-limiting logic in `providerScheduler.ts` was architected for evaluation runs, omitting standalone route handlers in `proxyMiddleware.ts`.
- **Expected Behavior:** Every public and authenticated API endpoint must be protected by IP-based sliding-window rate limiting.
- **Recommended Solution:** Implement an Express rate-limiting middleware (e.g., `express-rate-limit`) on all `/api/*` routes.
- **Dependencies & Side Effects:** None.
- **Verification Method:** Execute 50 rapid requests from a single IP to `/api/providers/health`. Verify that requests exceeding the limit receive HTTP `429 Too Many Requests`.

---

### Issue SEC-04: Potential Memory Exhaustion DoS in Body Parser
- **Issue ID:** `SEC-04`
- **Severity:** **MEDIUM**
- **Exact File Path:** `src/server/serverUtils.ts` (Lines 14–40)
- **Relevant Function/Component:** `parseJsonBody()`
- **Actual Observed Behavior:** The body parser allocates buffers in memory up to `MAX_BODY_BYTES = 25 * 1024 * 1024` (25 MB). When the threshold is exceeded, it sets an error flag but does not immediately call `req.destroy()`, continuing to receive incoming chunks into memory.
- **Root Cause:** Incomplete error abort logic in the stream listener.
- **Expected Behavior:** If an incoming request body exceeds the maximum permitted size, the socket must be immediately destroyed with an HTTP `413 Payload Too Large` error.
- **Recommended Solution:** Invoke `req.destroy(new Error('Payload Too Large'))` immediately upon exceeding the byte limit. Reduce `MAX_BODY_BYTES` to 5 MB for standard JSON endpoints.
- **Dependencies & Side Effects:** Large dataset CSV imports must be handled via streaming parsers rather than full in-memory JSON buffers.
- **Verification Method:** Stream a 30 MB garbage payload to `POST /api/projects`. Verify the socket closes immediately and memory allocation remains flat.

---

### Issue SEC-05: Plaintext Storage of Provider API Keys in User Settings
- **Issue ID:** `SEC-05`
- **Severity:** **MEDIUM**
- **Exact File Path:** `src/server/db/supabaseRepository.ts` (Lines 410–435) & `src/server/routes/settingsRoutes.ts`
- **Relevant Function/Component:** `saveUserSettings()`
- **Actual Observed Behavior:** Workspace API key overrides entered by users are written directly into Supabase PostgreSQL tables in plaintext JSON columns without application-level encryption.
- **Root Cause:** Absence of an encryption-at-rest utility for sensitive configuration secrets.
- **Expected Behavior:** User-provided LLM API keys must be encrypted using AES-256-GCM using a server-side `ENCRYPTION_KEY` before writing to the database, and decrypted only in memory when initializing provider clients.
- **Recommended Solution:** Implement `encryptSecret()` and `decryptSecret()` utilities in `src/server/utils/crypto.ts` utilizing Node.js `crypto`.
- **Dependencies & Side Effects:** Requires adding `ENCRYPTION_KEY` to production environment variables.
- **Verification Method:** Inspect records in Supabase `user_settings`. Verify that stored API keys appear as ciphertext vectors (`iv:tag:ciphertext`).

---

### Issue SEC-06: Missing Standard HTTP Security Headers
- **Issue ID:** `SEC-06`
- **Severity:** **LOW**
- **Exact File Path:** `src/server/server.ts` (Lines 40–60)
- **Relevant Function/Component:** Main HTTP server handler
- **Actual Observed Behavior:** HTTP responses omit standard security headers: `X-Content-Type-Options`, `X-Frame-Options`, `Strict-Transport-Security`, `Content-Security-Policy`, and `Referrer-Policy`.
- **Root Cause:** The server is initialized via raw `http.createServer()` without integrating `helmet` or explicit header setters.
- **Expected Behavior:** Every HTTP response must enforce defensive headers against MIME-sniffing, clickjacking, and unauthorized frame embedding.
- **Recommended Solution:** Integrate `helmet` or set headers explicitly in the root middleware.
- **Dependencies & Side Effects:** None.
- **Verification Method:** Inspect response headers on `GET /health` with `curl -I`. Verify presence of `X-Content-Type-Options: nosniff` and `X-Frame-Options: DENY`.

---

## 9. Performance & Reliability Issues

### Issue PERF-01: Aggressive Client-Side Polling Loop at 250ms Frequency
- **Issue ID:** `PERF-01`
- **Severity:** **HIGH**
- **Exact File Path:** `src/app/views/EvaluationsView.tsx` (Line 478)
- **Relevant Function/Component:** `pollRunStatus()`
- **Actual Observed Behavior:** While an evaluation is in progress, the frontend triggers an HTTP GET request to `/api/evaluations/status/:runId` every **250 milliseconds** (4 requests per second per active client).
- **Root Cause:** Sub-second polling was implemented to create a smooth progress bar animation in the UI without implementing WebSockets or Server-Sent Events (SSE).
- **Expected Behavior:** Updates should be pushed via Server-Sent Events (SSE), or the polling interval should be backed off to 2,000–3,000ms with UI-side interpolation.
- **Impact:** 10 concurrent users running evaluations generate 40 requests/second against the single-threaded Node.js server and Supabase database, saturating CPU and connection pools.
- **Recommended Solution:** Transition run progress updates to Server-Sent Events (`/api/evaluations/stream/:runId`) or increase poll interval to 2,500ms.
- **Dependencies & Side Effects:** Requires updating `EvaluationsView.tsx` to handle SSE streams.
- **Verification Method:** Monitor network tab during an evaluation run. Verify request frequency drops from 250ms to push-based events.

---

### Issue PERF-02: Database Schema Drift Causing Heartbeat Retry Latency
- **Issue ID:** `PERF-02`
- **Severity:** **HIGH**
- **Exact File Path:** `src/server/db/supabaseRepository.ts` (Lines 301–306)
- **Relevant Function/Component:** `updateRunProgress()`
- **Actual Observed Behavior:** During evaluation runs, progress heartbeats fail on the first attempt due to missing column `last_heartbeat_at`, triggering an exception and a second retry query every few seconds.
- **Root Cause:** Migration `20261031_initial_schema.sql` was not updated to reflect repository requirements.
- **Impact:** Doubled database write volume and elevated latency for all active evaluation runs.
- **Recommended Solution:** Create a new migration `supabase/migrations/20261110_add_heartbeat_column.sql`:
  ```sql
  ALTER TABLE evaluation_runs ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ DEFAULT NOW();
  ```
- **Dependencies & Side Effects:** Requires executing the migration in production Supabase.
- **Verification Method:** Run an evaluation and inspect server logs. Verify that zero column-omission exceptions are thrown.

---

### Issue PERF-03: Single-Concurrency Evaluation Lock Bottleneck
- **Issue ID:** `PERF-03`
- **Severity:** **MEDIUM**
- **Exact File Path:** `src/server/providerScheduler.ts` (Lines 649–675)
- **Relevant Function/Component:** `acquireEvaluationLock()`
- **Actual Observed Behavior:** The backend enforces a global evaluation lock permitting only 1 run server-wide. Concurrent run requests are rejected or blocked for up to 120 seconds.
- **Root Cause:** Naive mutual exclusion added to prevent free-tier API rate limits.
- **Expected Behavior:** Evaluation runs should be enqueued in a priority work queue (e.g., BullMQ or an in-memory async queue), allowing concurrent executions across different AI providers.
- **Recommended Solution:** Replace the single-variable lock with a worker queue that limits concurrent provider requests rather than whole evaluation runs.
- **Dependencies & Side Effects:** Requires refactoring run status tracking from singleton to per-run state maps.
- **Verification Method:** Dispatch two concurrent runs for different projects. Verify both enter queued/active state without 120s timeout errors.

---

### Issue PERF-04: Ephemeral Local Disk I/O Drift in Multi-Container Environments
- **Issue ID:** `PERF-04`
- **Severity:** **MEDIUM**
- **Exact File Path:** `src/server/services/evaluationDbService.ts` (Lines 802–820)
- **Relevant Function/Component:** `getEvaluationRun()`
- **Actual Observed Behavior:** The service reads local JSON files from `data/runs/${runId}.json` to supplement database records.
- **Root Cause:** Reliance on local filesystem persistence alongside a remote database.
- **Impact:** Multi-instance deployments (Render, Kubernetes, Vercel) have isolated filesystems. Requests hitting different nodes fail to find run telemetry, causing inconsistent UI metrics.
- **Recommended Solution:** Store all evaluation telemetry, metrics, and case results directly in PostgreSQL (in JSONB columns) or in Supabase Object Storage (S3). Remove local disk read/write paths.
- **Dependencies & Side Effects:** Eliminates reliance on `fs` within `evaluationDbService.ts`.
- **Verification Method:** Deploy two instances behind a load balancer. Ensure evaluation runs created on Instance 1 display identical metrics when fetched from Instance 2.

---

## 10. Deployment & Production Readiness

### Issue DEP-01: Broken Production Dockerfile Missing Server Build & Artifacts
- **Issue ID:** `DEP-01`
- **Severity:** **CRITICAL**
- **Exact File Path:** `Dockerfile` (Lines 12–39) & `package.json` (Line 11)
- **Relevant Function/Component:** Multi-stage Docker build pipeline
- **Actual Observed Behavior:** The Docker build step executes `npm run build`. In `package.json`, `build` is defined as:
  ```json
  "build": "vite build"
  ```
  This compiles the React frontend into `dist/`. It **never runs `npm run build:server`** (which compiles TypeScript server code into `dist-server/`). Furthermore, the runner stage copies only `dist/` and runs `CMD ["npm", "start"]`. In `package.json`:
  ```json
  "start": "node dist-server/server.js"
  ```
  **Result:** When the container starts, it immediately crashes with:
  `Error: Cannot find module '/app/dist-server/server.js'`
- **Root Cause:** Build scripts were split between `build:web` and `build:server`, but the Dockerfile was never updated to build both.
- **Expected Behavior:** The Dockerfile must compile both the client and server assets, and copy both `dist/` and `dist-server/` into the production runtime container.
- **Recommended Solution:**
  1. Update `package.json`: `"build": "npm run build:web && npm run build:server"`
  2. Update `Dockerfile` build stage to copy both `dist` and `dist-server` into the production stage.
- **Dependencies & Side Effects:** Container build time will increase slightly to compile server TypeScript.
- **Verification Method:** Execute `docker build -t reliq-backend . && docker run --rm -p 3001:3001 reliq-backend`. Verify container boots and logs `[RELIQ Server] Listening on port 3001`.

---

### Issue DEP-02: Hardcoded External Backend URL in Vercel Rewrites
- **Issue ID:** `DEP-02`
- **Severity:** **HIGH**
- **Exact File Path:** `vercel.json` (Lines 9 & 13)
- **Relevant Function/Component:** Vercel deployment routing configuration
- **Actual Observed Behavior:** `vercel.json` hardcodes API proxies to a fixed external Render URL:
  ```json
  {
    "source": "/api/(.*)",
    "destination": "https://reliq-backend.onrender.com/api/$1"
  }
  ```
- **Root Cause:** Temporary proxy configuration committed directly to source control.
- **Impact:** Deploying the Vercel frontend for staging, preview branches, or secondary environments forces all API traffic to the single production Render instance. If Render spins down on the free tier, Vercel deployments fail with 502/504 errors.
- **Recommended Solution:** Remove hardcoded URLs. Utilize Vercel environment variables or relative serverless routing.
- **Dependencies & Side Effects:** Requires configuring environment variables in Vercel project settings.
- **Verification Method:** Inspect network requests from a preview Vercel deployment. Confirm API traffic routes to the designated environment backend.

---

### Issue DEP-03: Static Assets Directory Mismatch in Standalone Server
- **Issue ID:** `DEP-03`
- **Severity:** **MEDIUM**
- **Exact File Path:** `src/server/server.ts` (Lines 45–55)
- **Relevant Function/Component:** `serveStaticFiles()`
- **Actual Observed Behavior:** `server.ts` resolves static files relative to `path.join(__dirname, '../../dist')`. When compiled by `esbuild` or `tsc` into `dist-server/server.js`, `__dirname` points to `/app/dist-server`, causing the relative path to resolve incorrectly depending on build directory structures.
- **Root Cause:** Brittle relative path calculation that diverges between development and compiled production bundles.
- **Expected Behavior:** Path resolution must dynamically detect the build root using `process.cwd()` or a robust directory lookup utility.
- **Recommended Solution:** Resolve paths using `path.resolve(process.cwd(), 'dist')`.
- **Dependencies & Side Effects:** Requires executing the binary from the repository root directory.
- **Verification Method:** Run compiled server from a non-root folder. Verify `GET /` serves `dist/index.html` with HTTP 200.

---

## 11. Existing Test Coverage

### 11.1 Test Suite Inventory
The repository contains the following automated test suites:
- `tests/v3ScoringAndStatistics.test.mjs`: Tests mathematical calculations in `statisticalComparator.ts` and `v3ScoringEngine.ts`.
- `tests/database.test.mjs`: Tests CRUD operations on projects, datasets, prompt versions, and evaluation runs.
- `tests/runTests.mjs`: Master test runner that orchestrates test suites.

### 11.2 Empirical Execution Results
Tests were executed during this audit with the following results:

#### Test 1: V3 Scoring & Statistical Engine
- **Command:** `node tests/v3ScoringAndStatistics.test.mjs`
- **Result:** **PASSED (8 / 8 tests passed)**
- **Coverage:** Verified exact match, normalized Levenshtein distance, regex constraint extraction, Mann-Whitney U rank sums, ties handling, and BCa bootstrap iterations.

#### Test 2: Database Operations Suite
- **Command:** `node tests/database.test.mjs` (Standalone execution)
- **Result:** **FAILED (0 / 11 tests passed, 11 failed)**
- **Root Cause of Failure:** Standalone execution detected Supabase credentials in `.env.local` and initialized Supabase driver mode. Because SQLite mode was not explicitly forced via environment variable, `database.ts` threw `[RELIQ DB] SQLite initialization blocked`.
- **Finding:** Running `tests/runTests.mjs` injects `process.env.RELIQ_DB_DRIVER = 'sqlite'` prior to execution, allowing tests to pass in mock SQLite mode. The database test suite is unable to run standalone without the wrapper runner.

### 11.3 Critical Testing Gaps
| Critical Path | Current Test Coverage | Risk Assessment |
| :--- | :--- | :--- |
| **Authentication & Tokens** | **0% (None)** | No tests verifying JWT signatures, expiration, or preventing synthetic token attacks. |
| **CORS & Middleware** | **0% (None)** | No automated tests verifying CORS headers or origin reflection. |
| **AI Provider Fallback** | **0% (None)** | No mocked provider tests verifying behavior when Groq or Cerebras returns 429. |
| **LLM Judge Scoring** | **15% (Stubbed)** | Tests verify prompt formatting only; no tests asserting that judge scores influence final quality metrics. |
| **Database Migrations** | **0% (None)** | No migration validation tests; allowed `last_heartbeat_at` schema drift to reach production. |



---

## 12. Critical Root Causes

### 12.1 Root Cause 1: Prototype-to-Production Technical Debt
The RELIQ codebase was rapidly developed with testing conveniences embedded directly into core runtime paths.
- **Manifestation:** The presence of `test-user-*` tokens in `authRoutes.ts:39-47` and `authUtils.ts` without environment isolation.
- **Impact:** What was intended as a mock user for local development and rapid frontend testing became a critical backdoor in production. Because the backend runs with Supabase `service_role` permissions, bypassing application-level checks grants total control over all customer workspaces.

### 12.2 Root Cause 2: Split-Brain Persistence Model
The system never fully completed the transition from a local file-based prototype to a stateless cloud database architecture.
- **Manifestation:** `evaluationDbService.ts` persists runs to Supabase but simultaneously reads and writes local disk files at `data/runs/${runId}.json`.
- **Impact:** In modern containerized (Docker, Render) or serverless (Vercel) hosting, local files are ephemeral and per-container. This creates data divergence, missing metrics, and unpredictable behavior when multiple instances or worker nodes handle requests.

### 12.3 Root Cause 3: Evaluation Pipeline Decoupling
The statistical engine and the LLM-as-a-Judge pipeline were developed by different engineering tracks without end-to-end integration contracts.
- **Manifestation:** In `v3ScoringEngine.ts:L143`, `const judgeScore = cr.llmJudgeEvaluation;` is retrieved but completely omitted from `evaluateCaseQualityDimensions()`. In `runner.ts:L1187`, the decision layer is forced to deterministic or safety veto.
- **Impact:** The application incurs high financial cost and latency calling LLM judges (OpenAI/Anthropic/Groq), yet discards their evaluation entirely when computing the final score.

### 12.4 Root Cause 4: CI/CD & Build Pipeline Configuration Drift
The repository transitioned from a frontend-only SPA to a full-stack Node.js server without synchronizing build configurations across `package.json`, `Dockerfile`, and `vercel.json`.
- **Manifestation:** `npm run build` compiles only `dist/` (client). The Dockerfile executes `npm run build` and runs `node dist-server/server.js`, crashing immediately. `vercel.json` hardcodes proxies to Render URLs.
- **Impact:** Production containers are completely unbuildable and undeployable in their current state.

---

## 13. Severity-Based Issue Classification

| Issue ID | Severity | Category | File Location | Summary of Finding |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | **CRITICAL** | Security | `src/server/routes/authRoutes.ts:39` | Unrestricted test tokens allow complete authentication bypass and account takeover. |
| **DEP-01** | **CRITICAL** | Deployment | `Dockerfile:12-39` & `package.json:11` | Dockerfile cannot boot; fails to build `dist-server/server.js` before running `npm start`. |
| **SEC-02** | **HIGH** | Security | `src/server/proxyMiddleware.ts:72` | Arbitrary client `Origin` headers reflected with `Access-Control-Allow-Credentials: true`. |
| **SEC-03** | **HIGH** | Security | `src/server/proxyMiddleware.ts:480` | Public AI provider endpoints lack IP-based rate limiting or abuse prevention. |
| **PERF-01**| **HIGH** | Performance| `src/app/views/EvaluationsView.tsx:478` | Client polls status endpoint every 250ms, causing high database and CPU load. |
| **PERF-02**| **HIGH** | Reliability| `src/server/db/supabaseRepository.ts:301` | Missing `last_heartbeat_at` in schema triggers catch-and-retry query on every run heartbeat. |
| **DEP-02** | **HIGH** | Deployment | `vercel.json:9,13` | Hardcoded `reliq-backend.onrender.com` in Vercel rewrite configuration. |
| **EVAL-01**| **HIGH** | Scoring | `src/evaluation/v3ScoringEngine.ts:143` | LLM Judge score is extracted but omitted from quality score computation; acts as dead telemetry. |
| **SEC-04** | **MEDIUM** | Security | `src/server/serverUtils.ts:14` | 25MB body parser does not close socket immediately upon size violation (DoS risk). |
| **SEC-05** | **MEDIUM** | Security | `src/server/db/supabaseRepository.ts:410` | User-provided AI API keys stored in plaintext JSON in PostgreSQL. |
| **PERF-03**| **MEDIUM** | Performance| `src/server/providerScheduler.ts:649` | Single-concurrency evaluation mutex rejects or blocks concurrent evaluations server-wide. |
| **PERF-04**| **MEDIUM** | Reliability| `src/server/services/evaluationDbService.ts:802` | Local disk read/write for run telemetry causes data fragmentation across containers. |
| **DEP-03** | **MEDIUM** | Deployment | `src/server/server.ts:45` | Brittle relative static assets path calculation fails depending on build directory context. |
| **EVAL-02**| **MEDIUM** | Scoring | `src/evaluation/llmJudgeEvaluator.ts:616` | Judge fingerprint caching ignores order swap state, locking in presentation position bias. |
| **SEC-06** | **LOW** | Security | `src/server/server.ts:40` | Missing standard defensive HTTP headers (HSTS, CSP, X-Content-Type-Options). |

---

## 14. Recommended Fixes

### 14.1 Security Fixes
1. **Fix SEC-01 (Auth Bypass):**
   In `src/server/routes/authRoutes.ts` and `src/server/routes/authUtils.ts`:
   - Enforce `process.env.NODE_ENV === 'test' && process.env.ALLOW_TEST_TOKENS === 'true'` before inspecting `test-user-` tokens.
   - In production, reject any non-Supabase JWT with HTTP 401.
2. **Fix SEC-02 (CORS Reflection):**
   In `src/server/proxyMiddleware.ts`:
   - Replace dynamic origin reflection with a configured whitelist check against `process.env.ALLOWED_ORIGINS` (comma-separated list).
3. **Fix SEC-03 (Rate Limiting):**
   - Install and mount standard sliding-window rate limiting on `/api/*` (e.g. 100 requests per 15 minutes per IP; 10 requests per minute on `/api/evaluations/run`).
4. **Fix SEC-04 (Body Parser DoS):**
   In `src/server/serverUtils.ts`:
   - Immediately call `req.destroy(new Error('Payload Too Large'))` when accumulated bytes exceed 5 MB (or 25 MB for dataset import).
5. **Fix SEC-05 (Key Encryption):**
   - Create an AES-256-GCM encryption utility for storing API key overrides in `user_settings`.

### 14.2 Database & Persistence Fixes
1. **Fix PERF-02 (Schema Drift):**
   - Apply a SQL migration adding `last_heartbeat_at TIMESTAMPTZ DEFAULT NOW()` to table `evaluation_runs`.
   - Remove the catch-and-retry block in `supabaseRepository.ts:301-306`.
2. **Fix PERF-04 & Fire-and-Forget Persistence:**
   - Always `await supabaseRepository.saveEvaluationRun(run)` in `evaluationDbService.ts:546`.
   - Remove all local disk I/O (`data/runs/*.json`) from `evaluationDbService.ts`; store full case results in Supabase JSONB or S3.

### 14.3 Evaluation Engine Fixes
1. **Fix EVAL-01 (LLM Judge Disconnection):**
   In `src/evaluation/v3ScoringEngine.ts`:
   - Factor `cr.llmJudgeEvaluation.score` into `evaluateCaseQualityDimensions()`:
     ```typescript
     const judgeScore = cr.llmJudgeEvaluation?.score;
     const reasoning = judgeScore !== undefined 
       ? 0.5 * computeDeterministicReasoning(cr) + 0.5 * judgeScore
       : computeDeterministicReasoning(cr);
     ```
   - Update `runner.ts:1187` to assign `decisionLayer = 'JUDGE'` when judge evaluations are utilized.
2. **Fix EVAL-02 (Judge Position Bias Cache):**
   In `src/evaluation/llmJudgeEvaluator.ts`:
   - Include the `orderSwapped` boolean flag inside `computeJudgeFingerprint()` so cached results do not mix swapped and unswapped evaluations.

### 14.4 Deployment & Infrastructure Fixes
1. **Fix DEP-01 (Broken Dockerfile):**
   In `package.json`:
   ```json
   "build": "npm run build:web && npm run build:server"
   ```
   In `Dockerfile`:
   - Ensure the build stage copies `tsconfig.json` and runs `npm run build`.
   - Ensure the runner stage copies both `dist` and `dist-server`:
     ```dockerfile
     COPY --from=builder /app/dist ./dist
     COPY --from=builder /app/dist-server ./dist-server
     ```
2. **Fix DEP-02 (Vercel Proxy):**
   In `vercel.json`:
   - Utilize environment variables for proxy destinations rather than hardcoding Render URLs.
3. **Fix PERF-01 (Client Polling):**
   In `src/app/views/EvaluationsView.tsx`:
   - Increase polling interval from 250ms to 2,000ms. Implement Server-Sent Events (SSE) endpoint `/api/evaluations/stream/:runId` for real-time progress.

---

## 15. Implementation Priority Roadmap

```
+-----------------------------------------------------------------------------------+
|                           IMPLEMENTATION ROADMAP                                  |
+-----------------------------------------------------------------------------------+
  Phase 1: Day 1 (CRITICAL)
  [SEC-01] Eliminate production test token auth bypass
  [DEP-01] Fix Dockerfile and package.json build scripts to package dist-server
  
  Phase 2: Day 2 (DATABASE & PERSISTENCE)
  [PERF-02] Run migration adding last_heartbeat_at to evaluation_runs
  [PERF-04] Remove ephemeral data/runs/*.json disk dependency; store telemetry in DB
  [DB-FIX]  Await all saveEvaluationRun promises to prevent silent data loss
  
  Phase 3: Day 3 (EVALUATION INTEGRITY)
  [EVAL-01] Connect LLM Judge scores into V3 scoring engine quality dimensions
  [EVAL-02] Incorporate presentation order flag into judge fingerprint caching
  
  Phase 4: Day 4 (TRAFFIC & NETWORK OPTIMIZATION)
  [PERF-01] Replace 250ms frontend polling with SSE or 2,500ms adaptive polling
  [SEC-02] Replace wildcard CORS reflection with explicit domain whitelist
  [SEC-03] Mount IP rate limiter on all public and inference API endpoints
  [PERF-03] Transition single-concurrency lock to queued provider worker model
  
  Phase 5: Day 5 (HARDENING & TEST EXPANSION)
  [SEC-04] Enforce socket destruction on body size violation (5MB ceiling)
  [SEC-05] Implement AES-256-GCM encryption for stored user API keys
  [SEC-06] Add standard HTTP security headers (Helmet / nosniff / DENY)
  [TESTS]  Add integration tests for Auth JWT validation and Express routing
+-----------------------------------------------------------------------------------+
```

### Phase Details & Execution Order

#### Phase 1: Immediate Critical Remediation (Day 1)
- **Objective:** Close severe security holes and restore container buildability.
- **Tasks:**
  1. Patch `src/server/routes/authRoutes.ts` and `authUtils.ts` to gate `test-user-` tokens behind `NODE_ENV === 'test'` and `ALLOW_TEST_TOKENS === 'true'`.
  2. Update `package.json` `"build"` script to execute both `build:web` and `build:server`.
  3. Update `Dockerfile` to copy `dist-server` into the runner image.
  4. Build and verify Docker container locally.

#### Phase 2: Database Schema & Persistence Realignment (Day 2)
- **Objective:** Eliminate database retry overhead and ensure durable state persistence.
- **Tasks:**
  1. Create and apply migration `supabase/migrations/20261110_add_heartbeat_column.sql`.
  2. Remove the catch-and-retry block from `supabaseRepository.ts`.
  3. Add `await` to `saveEvaluationRun` in `evaluationDbService.ts`.
  4. Migrate all JSON telemetry reads/writes from `data/runs/` directly into Supabase JSONB columns.

#### Phase 3: Evaluation Engine Reconciliation (Day 3)
- **Objective:** Align LLM Judge scoring with the V3 composite score and eliminate position bias.
- **Tasks:**
  1. Refactor `src/evaluation/v3ScoringEngine.ts` to combine deterministic dimensions with LLM judge scores.
  2. Update `runner.ts` to reflect the `'JUDGE'` decision layer in evaluation results.
  3. Update `computeJudgeFingerprint()` in `llmJudgeEvaluator.ts` to include the `orderSwapped` boolean.
  4. Run `node tests/v3ScoringAndStatistics.test.mjs` to verify zero regression in statistical calculations.

#### Phase 4: Network & Traffic Optimization (Day 4)
- **Objective:** Eliminate client polling pressure and secure network communication.
- **Tasks:**
  1. Update `EvaluationsView.tsx` to poll every 2,500ms instead of 250ms, or add Server-Sent Events (`/api/evaluations/stream/:runId`).
  2. Configure strict CORS origin whitelisting in `proxyMiddleware.ts`.
  3. Mount IP rate limiting middleware across API routes.
  4. Replace the global evaluation lock in `providerScheduler.ts` with a per-provider worker queue.

#### Phase 5: Hardening, Encryption & Test Expansion (Day 5)
- **Objective:** Production hardening and long-term regression prevention.
- **Tasks:**
  1. Add immediate socket destruction to `serverUtils.ts:parseJsonBody()`.
  2. Encrypt user-provided API key overrides using AES-256-GCM.
  3. Add standard security headers in `server.ts`.
  4. Write integration test suites covering JWT verification, CORS policy, and provider rate-limiting.

---

**Report Prepared By:**  
Senior Backend Engineer, Backend Security Auditor & System Architect  
*RELIQ Backend Audit Complete.*
