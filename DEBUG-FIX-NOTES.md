# RELIQ Evaluation 0% / Insufficient Evidence Fix

## Root cause
The SQLite `test_cases` table previously stored only `id`, `dataset_id`, `name`, `category`, `input`, and `expected_behavior`. Evaluator metadata (`evaluator_type`, `evaluator_config`, `tags`, `severity`, `metadata`) was therefore lost when datasets were loaded through the authoritative API repository.

`src/services/apiRepository.ts` correctly expects this metadata, but the backend could not return it, so cases fell back to `normalized_text`. JSON-validity and keyword-criteria cases were consequently evaluated with the wrong evaluator, producing misleading 0% pass rates in historical LIVE runs.

## Fix
- Added evaluator metadata columns to SQLite `test_cases`.
- Added backward-compatible schema migration for existing databases.
- Restored evaluator metadata for existing seeded cases during database initialization without overwriting already-populated custom metadata.
- Updated dataset create/update routes and service to persist evaluator metadata for newly created/edited cases.
- Existing API repository mapping now receives the authoritative metadata it already supports.
- Added a regression assertion for seeded evaluator metadata.

## Separate operational issue
The latest 27-case database run in the supplied project (`run-live-mu4de14d-5bxq`) has 27/27 candidate results classified as `PROVIDER_CREDITS_EXHAUSTED`, with null pass/quality/latency metrics. That is a real Groq quota/credits issue and is intentionally not changed by this fix.

## Historical screenshot
The 12/09 LIVE rows showing 0% are historical runs. Their 0% can be traced to quality/evaluator outcomes in those saved JSON runs, while `INSUFFICIENT EVIDENCE` is expected for runs below the configured minimum evaluated sample of 100.
