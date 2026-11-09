# RELIQ — Server & Evaluation Engine Documentation

The complete, authoritative backend README has been compiled and is maintained at the root of the repository:

👉 **[BACKEND_README.md](../../BACKEND_README.md)**

Please refer to that document for:
1. Executive Overview & System Architecture
2. Server Runtime & Entrypoints (`server.ts`, `proxyMiddleware.ts`)
3. Provider Request Scheduler & Rate-Limiting (`providerScheduler.ts`)
4. Evaluation Pipeline & Worker Orchestration (`evaluationService.ts`, `runner.ts`)
5. Hybrid Multi-Tier Evaluator Subsystem (`evaluators.ts`, `llmJudgeEvaluator.ts`)
6. V3 100-Point Scoring & Statistical Comparator (`v3ScoringEngine.ts`, `statisticalComparator.ts`)
7. Full REST API Endpoint Reference
8. Database Schema & Persistence Architecture (`schema.ts`, Supabase PostgreSQL / SQLite)
9. Configuration & Environment Variables
10. Testing, Development & Production Commands
