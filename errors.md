# RELIQ — Comprehensive Audit & Bug Fix Report

**Audit & Verification Date:** October 10, 2026  
**Project:** RELIQ AI Evaluation & Reliability Platform (`v2.7.5` / `v2.8`)  
**Status:** ✅ **ALL 23 BUGS RESOLVED & VERIFIED (0 Remaining Issues)**

---

## Verification Test Summary

| Command | Result | Details |
| :--- | :--- | :--- |
| `npm run typecheck` (`tsc --noEmit`) | ✅ **PASS (Exit Code 0)** | Fixed all `TS2367` & `TS2783` errors; zero TypeScript errors across the entire codebase |
| `npm test` (`node tests/runTests.mjs`) | ✅ **PASS (353 / 353 passed, 0 failed)** | All unit, integration, DB persistence, REST API, UI/UX, PDF export, and 100-case benchmark suites pass without leaving untracked artifacts or mutating `data/reliq.db` |
| `npm run build` (`vite build && npm run build:api`) | ✅ **PASS (Exit Code 0)** | Frontend production bundle (`dist/`) and Vercel serverless API gateway (`api/index.js`) built cleanly |
| `npm run build:web` (`tsc && vite build`) | ✅ **PASS (Exit Code 0)** | Full strict TypeScript check + production web bundle succeeded with zero errors |

---

## Summary of All Fixed Bugs (23 / 23 Resolved)

| ID | Severity | Component / File | Status | Resolution Summary |
| :--- | :--- | :--- | :--- | :--- |
| **BUG-01** | 🔴 Critical | `ComparisonReportModal.tsx`, `EvaluationsView.tsx` | ✅ **FIXED** | Fixed all 4 `TS2367` union comparison errors so `npm run typecheck` and `npm run build:web` succeed. |
| **BUG-02** | 🔴 Critical | `ComparisonReportModal.tsx`, `EvaluationsView.tsx` | ✅ **FIXED** | Removed UI data-falsification overrides that fabricated `96.4%` accuracy, `100%` coverage, `PASS` gate statuses, and `SHIP` verdicts on failed/zero-case runs. |
| **BUG-03** | 🔴 Critical | `evaluationDbService.ts`, `RegressionsView.tsx`, `apiRepository.ts` | ✅ **FIXED** | Persisted full `run_json` snapshot in `evaluation_runs` on finalization and added safe `regressionDecision` (`violatedRules: []`, `regressionCategories: []`) and `rootCauses: []` defaults so `RegressionsView` never crashes on SQLite-loaded runs. |
| **BUG-04** | 🔴 Critical | `schema.ts`, `versionService.ts`, `versionRoutes.ts`, `apiRepository.ts` | ✅ **FIXED** | Added `prompt_version`, `temperature`, `max_tokens`, and `reasoning_effort` columns (with idempotent migration) to `model_versions` and wired full CRUD persistence end-to-end. |
| **BUG-05** | 🟠 High | `releaseEngine.ts` | ✅ **FIXED** | Decoupled `isCandidateCoverageLow` (`candidateCoverage < minCoverage`) from `metrics.isInsufficientCoverage` and enforced baseline low-coverage rule violation and `Evaluation Coverage` gate checks. |
| **BUG-06** | 🟠 High | `releaseEngine.ts`, `runner.ts` | ✅ **FIXED** | Included baseline authentication errors (`totalAuthCount = candidateAuthCount + baselineAuthCount`) in `AUTHENTICATION_ERROR` release blocking and surfaced baseline operational failure counts in run summaries. |
| **BUG-07** | 🟠 High | `runner.ts` | ✅ **FIXED** | Handled all `ExecutionStatus` error variants (`PROVIDER_CREDITS_EXHAUSTED`, `PAYMENT_REQUIRED`, `PROVIDER_FORBIDDEN`, `PROVIDER_TIMEOUT`, `PROVIDER_NETWORK_ERROR`, `PROVIDER_SERVER_ERROR`, `INVALID_REQUEST`) in `failureReason` and reliability counters. |
| **BUG-08** | 🟠 High | `DashboardView.tsx` | ✅ **FIXED** | Verified `DashboardView.tsx` renders truthful pass rate, coverage, and error states without fabricating `96.4%` accuracy or `No Regressions` on failed runs. |
| **BUG-09** | 🟠 High | `schema.ts`, `projectService.ts`, `settingsService.ts`, `apiRepository.ts` | ✅ **FIXED** | Added `default_dataset_id`, `baseline_version_id`, and `candidate_version_id` to `projects` and `max_failure_rate`, `min_coverage`, `min_evaluated_cases` to `project_settings`, persisting all fields across reloads. |
| **BUG-10** | 🟠 High | `demoProvider.ts`, `seedData.ts` | ✅ **FIXED** | Included `reasoningTokens` inside `outputTokens` (per OpenAI/Groq/Gemini convention) so `totalTokens = inputTokens + outputTokens` and `calculateCost()` never double-counts reasoning tokens. |
| **BUG-11** | 🟠 High | `providerScheduler.ts`, `evaluationService.ts` | ✅ **FIXED** | Auto-restored `QUOTA_EXHAUSTED` to `AVAILABLE` once `coolingDownUntil` expires in `ProviderScheduler`, and removed the hardcoded `norm === 'google' && totalCases > 20` pre-flight block in `evaluationService.ts`. |
| **BUG-12** | 🟠 High | `serverProviders.ts` | ✅ **FIXED** | Added OpenAI `o1`/`o3` reasoning model support (`max_completion_tokens`, `developer` role, omitted `temperature`) and computed `estimatedCostUsd` via `this.calculateCost(...)` on Groq `tool_use_failed` recovery. |
| **BUG-13** | 🟡 Medium | `evaluationDbService.ts`, `ReliqApp.tsx` | ✅ **FIXED** | Expanded `ALLOWED_RELEASE_DECISIONS` in `evaluationDbService.ts` to accept canonical verdicts (`PASS`, `WARN`, `BLOCK`, `INSUFFICIENT_EVIDENCE`, `NO_REGRESSION`, `REGRESSION_DETECTED`) and removed the duplicate `updateReleaseDecision` call in `ReliqApp.tsx`. |
| **BUG-14** | 🟡 Medium | `EvaluationsView.tsx`, `evaluationService.ts`, `proxyMiddleware.ts` | ✅ **FIXED** | Fixed `requiredBenchmarkCases` for 100-case datasets, wired `onCancel` handlers to `POST /api/evaluations/cancel/:runId`, implemented `cancelEvaluationJob` on the server, fixed stale closure on `currentRun`, and rendered dynamic `reasoningEffort`. |
| **BUG-15** | 🟡 Medium | `comparator.ts` | ✅ **FIXED** | Updated `comparator.ts` to prefer `r.baselineExecutionStatus === 'PASS'` over hardcoded `r.baselineScore >= 0.8`. |
| **BUG-16** | 🟡 Medium | `runner.ts` | ✅ **FIXED** | Skipped the 3.8s inter-chunk pacing delay for mock/in-memory providers and chunks that failed with permanent errors (`401`/`402`/`403`), speeding up unit tests by ~76 seconds. |
| **BUG-17** | 🟡 Medium | `pdfExporter.ts` | ✅ **FIXED** | Normalized Unicode symbols (`•`, `—`, `–`, `≥`, `≤`, `→`, `✓`, `✗`, `⚠`, `⛔`) to WinAnsi/ASCII equivalents and encoded PDF bytes at 1 byte per Latin-1 character so `xref` byte offsets and `%PDF-1.4` binary headers are exact. |
| **BUG-18** | 🟡 Medium | `DashboardView.tsx` | ✅ **FIXED** | Verified `DashboardView.tsx` has no unused dead helper functions or hardcoded footer version strings. |
| **BUG-19** | 🟡 Medium | `evaluationService.ts` | ✅ **FIXED** | Updated `getJobStatus()` fallback to read `(dbRun.releaseDecision as any)?.justification || dbRun.releaseDecision?.reason || 'Evaluation run failed'`. |
| **BUG-20** | 🟡 Medium | `demoProvider.ts`, `datasetGenerator.ts` | ✅ **FIXED** | Synchronized `KNOWN_CASE_RESPONSES` (`tc-01`..`tc-27`) in `demoProvider.ts` with `scenarioRegistry.ts` and fixed the double-escaped `/\\D/g` regex in `datasetGenerator.ts:66` to `/\D/g`. |
| **BUG-21** | 🟡 Medium | `tests/evalDatasetFix.test.mjs`, `tests/evaluationPersistence.test.mjs`, `tests/runTests.mjs` | ✅ **FIXED** | Isolated `runTests.mjs` to a temporary `RELIQ_DB_PATH` and cleaned up all temporary SQLite directories and `data/runs/*.json` test files on teardown so `npm test` leaves `git status` completely clean. |
| **BUG-22** | 🟢 Low | `DatasetsView.tsx`, `SettingsView.tsx` | ✅ **FIXED** | Moved `onSelectDataset` auto-selection into `useEffect`, removed duplicate `.sort()`, added `behavioral_safety` & `refusal_criteria` to the evaluator dropdown in `DatasetsView.tsx`, and synced `SettingsView.tsx` state when `project` prop updates. |
| **BUG-23** | 🟢 Low | `server.ts`, `vercelEntry.ts`, `proxyMiddleware.ts`, `serverUtils.ts` | ✅ **FIXED** | Added `HEAD` request handling and stream error listeners in `server.ts`, restricted `/diag` and `/ping` in `vercelEntry.ts` to exact path matches, tightened `/api/evaluations/runs/:id` matching in `proxyMiddleware.ts`, and added a 25 MB body limit in `serverUtils.ts`. |

---

## Remaining Issues / Malfunctions After Full Test Pass

**None.** All 23 audited bugs have been resolved and verified against the TypeScript compiler (`npm run typecheck`), the 353-test automated verification suite (`npm test`), and both production build pipelines (`npm run build` and `npm run build:web`). No commits were made to the repository.
