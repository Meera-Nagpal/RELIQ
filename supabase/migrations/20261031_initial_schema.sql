-- ============================================================
-- RELIQ — Complete Supabase PostgreSQL Schema & Migrations
-- Version: 2.8.0
--
-- Tables:
-- 1. projects
-- 2. datasets
-- 3. test_cases
-- 4. model_versions
-- 5. evaluation_runs
-- 6. evaluation_results
-- 7. project_settings
-- 8. release_decision_audit
-- 9. evaluation_cache (evaluation caching engine)
--
-- Includes:
-- - Row Level Security (RLS) on all tables
-- - Service Role bypass for backend evaluation engine
-- - Authenticated user ownership via auth.users(id)
-- - Public / demo read policies for golden baseline suites
-- - Performance indexes for rapid sub-50ms queries
-- ============================================================

-- Enable pgcrypto for UUID and cryptographic hashing if not present
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Projects
CREATE TABLE IF NOT EXISTS public.projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  default_dataset_id TEXT,
  baseline_version_id TEXT,
  candidate_version_id TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Datasets
CREATE TABLE IF NOT EXISTS public.datasets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  case_count INTEGER NOT NULL DEFAULT 0,
  source_type TEXT NOT NULL DEFAULT 'upload',
  version TEXT NOT NULL DEFAULT '1.0.0',
  status TEXT NOT NULL DEFAULT 'active',
  source_filename TEXT,
  content_hash TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Test Cases
CREATE TABLE IF NOT EXISTS public.test_cases (
  id TEXT PRIMARY KEY,
  dataset_id TEXT NOT NULL REFERENCES public.datasets(id) ON DELETE CASCADE,
  case_key TEXT,
  source_record_number INTEGER,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  input TEXT NOT NULL,
  expected_behavior TEXT NOT NULL DEFAULT '',
  context TEXT,
  evaluator_type TEXT NOT NULL DEFAULT 'normalized_text',
  evaluator_config JSONB,
  tags JSONB,
  severity TEXT NOT NULL DEFAULT 'medium',
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Model Versions
CREATE TABLE IF NOT EXISTS public.model_versions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  display_name TEXT NOT NULL,
  system_prompt TEXT,
  prompt_version TEXT DEFAULT '1.0',
  temperature DOUBLE PRECISION DEFAULT 0.2,
  max_tokens INTEGER DEFAULT 2048,
  reasoning_effort TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Evaluation Runs
CREATE TABLE IF NOT EXISTS public.evaluation_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  dataset_id TEXT NOT NULL REFERENCES public.datasets(id) ON DELETE CASCADE,
  dataset_version TEXT,
  dataset_source_type TEXT,
  status TEXT NOT NULL,
  total_cases INTEGER NOT NULL DEFAULT 0,
  selected_case_count INTEGER,
  evaluated_cases INTEGER NOT NULL DEFAULT 0,
  passed_cases INTEGER NOT NULL DEFAULT 0,
  failed_cases INTEGER NOT NULL DEFAULT 0,
  skipped_cases INTEGER DEFAULT 0,
  cancelled_cases INTEGER DEFAULT 0,
  pass_rate DOUBLE PRECISION,
  quality_score DOUBLE PRECISION,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  release_decision TEXT,
  release_reason TEXT,
  run_json JSONB,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- 6. Evaluation Results
CREATE TABLE IF NOT EXISTS public.evaluation_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES public.evaluation_runs(id) ON DELETE CASCADE,
  test_case_id TEXT REFERENCES public.test_cases(id) ON DELETE SET NULL,
  model_version_id TEXT REFERENCES public.model_versions(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  response TEXT,
  passed BOOLEAN,
  quality_score DOUBLE PRECISION,
  latency_ms DOUBLE PRECISION,
  input_tokens INTEGER,
  output_tokens INTEGER,
  reasoning_tokens INTEGER,
  total_tokens INTEGER,
  cost DOUBLE PRECISION,
  failure_type TEXT,
  failure_category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Project Settings
CREATE TABLE IF NOT EXISTS public.project_settings (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE REFERENCES public.projects(id) ON DELETE CASCADE,
  min_accuracy DOUBLE PRECISION NOT NULL,
  max_degradation DOUBLE PRECISION NOT NULL,
  latency_tolerance DOUBLE PRECISION NOT NULL,
  max_failure_rate DOUBLE PRECISION NOT NULL DEFAULT 5.0,
  min_coverage DOUBLE PRECISION NOT NULL DEFAULT 80.0,
  min_evaluated_cases INTEGER NOT NULL DEFAULT 100,
  raw_output_privacy INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Release Decision Audit
CREATE TABLE IF NOT EXISTS public.release_decision_audit (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES public.evaluation_runs(id) ON DELETE CASCADE,
  previous_decision TEXT,
  new_decision TEXT NOT NULL,
  justification TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Evaluation Cache (for deterministic replay, caching and offline evaluation)
CREATE TABLE IF NOT EXISTS public.evaluation_cache (
  cache_key TEXT PRIMARY KEY,
  model TEXT NOT NULL,
  provider TEXT NOT NULL,
  prompt_hash TEXT NOT NULL,
  response_text TEXT NOT NULL,
  usage_json JSONB,
  latency_ms DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Indexes for High-Performance Queries
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_datasets_project_id ON public.datasets(project_id);
CREATE INDEX IF NOT EXISTS idx_test_cases_dataset_id ON public.test_cases(dataset_id);
CREATE INDEX IF NOT EXISTS idx_model_versions_project_id ON public.model_versions(project_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_runs_project_id ON public.evaluation_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_runs_dataset_id ON public.evaluation_runs(dataset_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_results_run_id ON public.evaluation_results(run_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_results_test_case_id ON public.evaluation_results(test_case_id);
CREATE INDEX IF NOT EXISTS idx_project_settings_project_id ON public.project_settings(project_id);
CREATE INDEX IF NOT EXISTS idx_release_decision_audit_run_id ON public.release_decision_audit(run_id);
CREATE INDEX IF NOT EXISTS idx_evaluation_cache_prompt_hash ON public.evaluation_cache(prompt_hash);

-- ============================================================
-- Row Level Security (RLS) Configuration
-- ============================================================
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.release_decision_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evaluation_cache ENABLE ROW LEVEL SECURITY;

-- 1. Service Role Policies (Full access for backend Node.js server)
DO $$
BEGIN
  -- Projects service role policy
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'projects' AND policyname = 'service_role_all_projects') THEN
    CREATE POLICY service_role_all_projects ON public.projects FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;

  -- Datasets service role policy
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'datasets' AND policyname = 'service_role_all_datasets') THEN
    CREATE POLICY service_role_all_datasets ON public.datasets FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;

  -- Test cases service role policy
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'test_cases' AND policyname = 'service_role_all_test_cases') THEN
    CREATE POLICY service_role_all_test_cases ON public.test_cases FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;

  -- Model versions service role policy
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'model_versions' AND policyname = 'service_role_all_model_versions') THEN
    CREATE POLICY service_role_all_model_versions ON public.model_versions FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;

  -- Evaluation runs service role policy
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'evaluation_runs' AND policyname = 'service_role_all_runs') THEN
    CREATE POLICY service_role_all_runs ON public.evaluation_runs FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;

  -- Evaluation results service role policy
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'evaluation_results' AND policyname = 'service_role_all_results') THEN
    CREATE POLICY service_role_all_results ON public.evaluation_results FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;

  -- Project settings service role policy
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'project_settings' AND policyname = 'service_role_all_settings') THEN
    CREATE POLICY service_role_all_settings ON public.project_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;

  -- Release decision audit service role policy
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'release_decision_audit' AND policyname = 'service_role_all_audit') THEN
    CREATE POLICY service_role_all_audit ON public.release_decision_audit FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;

  -- Evaluation cache service role policy
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'evaluation_cache' AND policyname = 'service_role_all_cache') THEN
    CREATE POLICY service_role_all_cache ON public.evaluation_cache FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 2. User & Public Policies
DO $$
BEGIN
  -- Projects: Users can read public projects or projects they own
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'projects' AND policyname = 'users_read_projects') THEN
    CREATE POLICY users_read_projects ON public.projects FOR SELECT TO anon, authenticated
      USING (user_id IS NULL OR user_id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'projects' AND policyname = 'users_write_projects') THEN
    CREATE POLICY users_write_projects ON public.projects FOR ALL TO authenticated
      USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;

  -- Datasets: Read public or own datasets; write own
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'datasets' AND policyname = 'users_read_datasets') THEN
    CREATE POLICY users_read_datasets ON public.datasets FOR SELECT TO anon, authenticated
      USING (user_id IS NULL OR user_id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'datasets' AND policyname = 'users_write_datasets') THEN
    CREATE POLICY users_write_datasets ON public.datasets FOR ALL TO authenticated
      USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;

  -- Test Cases: Read test cases for visible datasets
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'test_cases' AND policyname = 'users_read_test_cases') THEN
    CREATE POLICY users_read_test_cases ON public.test_cases FOR SELECT TO anon, authenticated
      USING (EXISTS (SELECT 1 FROM public.datasets d WHERE d.id = test_cases.dataset_id AND (d.user_id IS NULL OR d.user_id = auth.uid())));
  END IF;

  -- Model Versions: Read visible model versions
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'model_versions' AND policyname = 'users_read_model_versions') THEN
    CREATE POLICY users_read_model_versions ON public.model_versions FOR SELECT TO anon, authenticated
      USING (user_id IS NULL OR user_id = auth.uid());
  END IF;

  -- Evaluation Runs: Read visible runs
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'evaluation_runs' AND policyname = 'users_read_runs') THEN
    CREATE POLICY users_read_runs ON public.evaluation_runs FOR SELECT TO anon, authenticated
      USING (user_id IS NULL OR user_id = auth.uid());
  END IF;

  -- Evaluation Results: Read visible results
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'evaluation_results' AND policyname = 'users_read_results') THEN
    CREATE POLICY users_read_results ON public.evaluation_results FOR SELECT TO anon, authenticated
      USING (EXISTS (SELECT 1 FROM public.evaluation_runs r WHERE r.id = evaluation_results.run_id AND (r.user_id IS NULL OR r.user_id = auth.uid())));
  END IF;

  -- Project Settings: Read settings for visible projects
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'project_settings' AND policyname = 'users_read_settings') THEN
    CREATE POLICY users_read_settings ON public.project_settings FOR SELECT TO anon, authenticated
      USING (EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_settings.project_id AND (p.user_id IS NULL OR p.user_id = auth.uid())));
  END IF;
END $$;
