-- ============================================================
-- RELIQ Migration: Add last_heartbeat_at to evaluation_runs
-- Migration Date: 2026-11-10
-- Resolves: Issue PERF-02 (Schema drift causing heartbeat retry latency)
-- ============================================================

ALTER TABLE public.evaluation_runs
ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_evaluation_runs_heartbeat
ON public.evaluation_runs(last_heartbeat_at);
