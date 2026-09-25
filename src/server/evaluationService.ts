/* ============================================================
   RELIQ — Server-Side Evaluation Orchestration Service
   
   Executes model evaluation workloads on the server:
   - Resolves authentic provider adapters with server environment keys
   - Validates evaluation request payloads
   - Orchestrates scenario execution, metrics, regression detection, release engine
   - Persists completed evaluation runs to data/runs/
   - Tracks in-memory execution state for real-time progress polling
   ============================================================ */

import fs from 'fs';
import path from 'path';
import {
  Dataset,
  EvaluationRun,
  JudgeConfig,
  ModelVersion,
  Project,
  RegressionSettings,
} from '../domain/types';
import { EvaluationRunner } from '../evaluation/runner';
import { resolveServerProvider } from './serverProviders';
import { providerScheduler } from './providerScheduler';
import { evaluationDbService } from './services/evaluationDbService';
import { validateJudgeConfiguration } from '../evaluation/judgeRegistry';

export interface ServerEvaluationOptions {
  project: Project;
  dataset: Dataset;
  baselineVersion: ModelVersion;
  candidateVersion: ModelVersion;
  judgeConfig?: JudgeConfig;
  regressionSettings?: RegressionSettings;
  maxCases?: number;
  concurrency?: number;
  runId?: string;
}

export interface EvaluationJob {
  runId: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  progress: {
    current: number;
    total: number;
    caseName?: string;
    percent: number;
  };
  startTime: number;
  endTime?: number;
  run?: EvaluationRun;
  error?: string;
}

/**
 * Canonical run ID generator for all RELIQ evaluation runs.
 * Exactly one canonical runId is generated per evaluation execution and propagated across all layers.
 */
export function generateCanonicalRunId(): string {
  return `run-live-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
}

const jobs = new Map<string, EvaluationJob>();

/**
 * Returns the directory path used to persist evaluation run artifacts on the server.
 */
export function getRunsDirectory(): string {
  if (process.env.RELIQ_RUNS_DIR) {
    const dir = path.resolve(process.cwd(), process.env.RELIQ_RUNS_DIR);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
  if (process.env.VERCEL) {
    const dir = '/tmp/reliq_runs';
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }
  const dir = path.resolve(process.cwd(), 'data', 'runs');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Persists an evaluation run as JSON to data/runs/{runId}.json.
 */
export function saveRunToDisk(run: EvaluationRun): void {
  try {
    const dir = getRunsDirectory();
    const filePath = path.join(dir, `${run.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(run, null, 2), 'utf8');
    const relPath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
    console.log(`[RELIQ] Run persisted: ${relPath}`);
  } catch (err: any) {
    console.error(`[RELIQ Storage] Failed to persist run ${run.id}:`, err.message);
  }
}

/**
 * Retrieves all evaluation runs persisted on disk, sorted by timestamp descending.
 */
export function getRunsFromDisk(): EvaluationRun[] {
  try {
    const activeDir = getRunsDirectory();
    const dirsToCheck = [activeDir];
    const defaultDataDir = path.resolve(process.cwd(), 'data', 'runs');
    if (defaultDataDir !== activeDir && fs.existsSync(defaultDataDir)) {
      dirsToCheck.push(defaultDataDir);
    }

    const seenIds = new Set<string>();
    const runs: EvaluationRun[] = [];

    for (const dir of dirsToCheck) {
      if (!fs.existsSync(dir)) continue;
      const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));

      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(dir, file), 'utf8');
          const parsed = JSON.parse(content) as any;
          if (parsed?.id && !seenIds.has(parsed.id)) {
            seenIds.add(parsed.id);
            const totalCases = parsed.metrics?.totalCases ?? (parsed.caseResults?.length || 0);
            const hasData = totalCases > 0 && (parsed.metrics?.candidateAccuracy != null || parsed.metrics?.candidateQualityScore != null);
            const isReg = hasData && Boolean(parsed.regressionDecision?.isRegression);
            const normalized: EvaluationRun = {
              ...parsed,
              projectId: parsed.projectId || 'proj-checkout-agent',
              datasetId: parsed.datasetId || 'ds-checkout-golden',
              datasetName: parsed.datasetName || 'Checkout Reliability Suite',
              caseResults: Array.isArray(parsed.caseResults) ? parsed.caseResults : Array.isArray(parsed.results) ? parsed.results : [],
              regressionDecision: parsed.regressionDecision || {
                isRegression: isReg,
                verdict: !hasData ? 'INSUFFICIENT_EVIDENCE' : isReg ? 'REGRESSION_DETECTED' : 'NO_REGRESSION',
                summary: !hasData ? 'No completed evaluation data' : isReg ? 'Regression detected in evaluation' : 'No regressions detected',
                violatedRules: [],
                regressionCategories: [],
              },
              releaseDecision: parsed.releaseDecision || {
                status: !hasData ? 'INSUFFICIENT_EVIDENCE' : isReg ? 'BLOCK' : 'PASS',
                decidedBy: 'System',
                decidedAt: parsed.timestamp || new Date().toISOString(),
              },
              metrics: {
                ...(parsed.metrics || {}),
                totalCases: parsed.metrics?.totalCases ?? 0,
                candidateAccuracy: parsed.metrics?.candidateAccuracy ?? null,
                accuracyDelta: parsed.metrics?.accuracyDelta ?? null,
                candidateAvgLatencyMs: parsed.metrics?.candidateAvgLatencyMs ?? null,
              } as any,
              baselineVersion: parsed.baselineVersion || {
                id: 'ver-base',
                name: 'Production Baseline',
                provider: 'cerebras',
                modelIdentifier: 'gpt-oss-120b',
              },
              candidateVersion: parsed.candidateVersion || {
                id: 'ver-cand',
                name: 'Candidate Release',
                provider: 'groq',
                modelIdentifier: 'openai/gpt-oss-20b',
              },
            };
            runs.push(normalized);
          }
        } catch {}
      }
    }

    return runs.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  } catch {
    return [];
  }
}

/**
 * Retrieves a single evaluation run by ID from disk.
 */
export function getRunFromDisk(id: string): EvaluationRun | null {
  try {
    const activeDir = getRunsDirectory();
    const candidatePaths = [
      path.join(activeDir, `${id}.json`),
      path.join(process.cwd(), 'data', 'runs', `${id}.json`),
    ];
    for (const filePath of candidatePaths) {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        return JSON.parse(content) as EvaluationRun;
      }
    }
  } catch {}
  return null;
}

/**
 * Deletes a persisted evaluation run by ID from disk.
 */
export function deleteRunFromDisk(id: string): boolean {
  try {
    const activeDir = getRunsDirectory();
    const candidatePaths = [
      path.join(activeDir, `${id}.json`),
      path.join(process.cwd(), 'data', 'runs', `${id}.json`),
    ];
    let deleted = false;
    for (const filePath of candidatePaths) {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        deleted = true;
      }
    }
    return deleted;
  } catch {}
  return false;
}

/**
 * Retrieves current execution status and progress for an active or completed evaluation job.
 */
export function getJobStatus(runId: string): EvaluationJob | undefined {
  const inMemory = jobs.get(runId);
  if (inMemory) return inMemory;

  // If not in active memory, check if already persisted on disk
  const diskRun = getRunFromDisk(runId);
  if (diskRun) {
    return {
      runId,
      status: 'COMPLETED',
      progress: {
        current: diskRun.metrics?.totalCases ?? 0,
        total: diskRun.metrics?.totalCases ?? 0,
        percent: 100,
      },
      startTime: new Date(diskRun.timestamp).getTime(),
      endTime: new Date(diskRun.timestamp).getTime() + (diskRun.durationMs || 0),
      run: diskRun,
    };
  }

  // Check authoritative SQLite store
  try {
    const dbRun = evaluationDbService.getEvaluationRunById(runId);
    if (dbRun) {
      return {
        runId,
        status: dbRun.status === 'COMPLETED' ? 'COMPLETED' : dbRun.status === 'FAILED' ? 'FAILED' : 'RUNNING',
        progress: {
          current: dbRun.metrics?.totalCases ?? 0,
          total: dbRun.metrics?.totalCases ?? 0,
          percent: dbRun.status === 'COMPLETED' ? 100 : 0,
        },
        startTime: new Date(dbRun.timestamp).getTime(),
        endTime: new Date(dbRun.timestamp).getTime() + (dbRun.durationMs || 0),
        run: dbRun,
        error: dbRun.status === 'FAILED' ? (dbRun.releaseDecision?.justification || 'Evaluation run failed') : undefined,
      };
    }
  } catch {}

  return undefined;
}

/**
 * Validates evaluation request options.
 */
export function validateEvaluationOptions(options: ServerEvaluationOptions): void {
  if (!options) {
    throw new Error('Missing evaluation options payload');
  }
  if (!options.dataset || !Array.isArray(options.dataset.cases) || options.dataset.cases.length === 0) {
    throw new Error('Invalid or empty dataset specified for evaluation');
  }
  if (!options.baselineVersion || !options.baselineVersion.provider) {
    throw new Error('Invalid or missing baselineVersion specification');
  }
  if (!options.candidateVersion || !options.candidateVersion.provider) {
    throw new Error('Invalid or missing candidateVersion specification');
  }

  // Validate Judge Configuration & Model Independence
  if (options.judgeConfig?.enabled) {
    const judgeValidation = validateJudgeConfiguration(
      options.judgeConfig,
      options.baselineVersion.modelIdentifier,
      options.candidateVersion.modelIdentifier
    );
    if (!judgeValidation.valid) {
      throw new Error(judgeValidation.error || 'Invalid LLM judge configuration');
    }
  }
}

/**
 * Executes a full model evaluation on the server, tracking progress and persisting results.
 */
export async function runServerEvaluation(options: ServerEvaluationOptions): Promise<EvaluationRun> {
  validateEvaluationOptions(options);

  const runId = options.runId || generateCanonicalRunId();

  // Deduplicate scenarios to prevent duplicate execution
  const seenCaseIds = new Set<string>();
  const deduplicatedCases = options.dataset.cases.filter((c) => {
    if (seenCaseIds.has(c.id)) {
      console.warn(`[RELIQ Server Service] Suppressing duplicate test scenario: ${c.id}`);
      return false;
    }
    seenCaseIds.add(c.id);
    return true;
  });
  const safeDataset: Dataset = {
    ...options.dataset,
    cases: deduplicatedCases,
  };

  const totalCases =
    options.maxCases && options.maxCases > 0
      ? Math.min(options.maxCases, safeDataset.cases.length)
      : safeDataset.cases.length;

  const job: EvaluationJob = {
    runId,
    status: 'RUNNING',
    progress: {
      current: 0,
      total: totalCases,
      percent: 0,
    },
    startTime: Date.now(),
  };
  jobs.set(runId, job);

  const effectiveProject = options.project || {
    id: 'proj-checkout-agent',
    name: 'Checkout Agent',
    description: 'Checkout Agent Evaluation',
    baselineVersionId: options.baselineVersion.id,
    candidateVersionId: options.candidateVersion.id,
    regressionSettings: {
      minAccuracyPercent: 95.0,
      maxAccuracyDegradationPercent: 2.0,
      maxLatencyIncreasePercent: 20.0,
      maxFailureRatePercent: 5.0,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // 1. Authoritative SQLite persistence: Insert RUNNING record on start
  evaluationDbService.createEvaluationRun({
    id: runId,
    projectId: effectiveProject.id,
    datasetId: safeDataset.id,
    totalCases,
    startedAt: new Date(job.startTime).toISOString(),
  });

  // Determine safe concurrency: option -> EVALUATION_CONCURRENCY env -> default 1
  const envConcurrency = process.env.EVALUATION_CONCURRENCY
    ? parseInt(process.env.EVALUATION_CONCURRENCY, 10)
    : undefined;
  const resolvedConcurrency =
    !isNaN(Number(options.concurrency)) && Number(options.concurrency) > 0
      ? Number(options.concurrency)
      : !isNaN(Number(envConcurrency)) && Number(envConcurrency) > 0
      ? Number(envConcurrency)
      : 1;

  console.log(`[RELIQ Server Service] Starting Evaluation Run ${runId}`);
  console.log(`[RELIQ Server Service] Baseline: ${options.baselineVersion.provider} (${options.baselineVersion.modelIdentifier})`);
  console.log(`[RELIQ Server Service] Candidate: ${options.candidateVersion.provider} (${options.candidateVersion.modelIdentifier})`);
  console.log(`[RELIQ Server Service] Cases: ${totalCases} (Concurrency: ${resolvedConcurrency})`);

  // Pre-flight quota check: Verify provider is not currently in active cooldown or quota exhaustion
  const baselineQuota = providerScheduler.checkProviderQuota(options.baselineVersion.provider);
  const candidateQuota = providerScheduler.checkProviderQuota(options.candidateVersion.provider);

  if (!baselineQuota.available) {
    const errMsg = baselineQuota.reason || `PROVIDER RATE LIMIT / QUOTA EXHAUSTED: ${options.baselineVersion.provider} quota is currently exhausted.`;
    job.status = 'FAILED';
    job.endTime = Date.now();
    job.error = errMsg;
    evaluationDbService.failEvaluationRun(runId, errMsg);
    console.warn(`[RELIQ Server Service] Pre-flight rejection: ${errMsg}`);
    throw new Error(errMsg);
  }

  if (!candidateQuota.available) {
    const errMsg = candidateQuota.reason || `PROVIDER RATE LIMIT / QUOTA EXHAUSTED: ${options.candidateVersion.provider} quota is currently exhausted.`;
    job.status = 'FAILED';
    job.endTime = Date.now();
    job.error = errMsg;
    evaluationDbService.failEvaluationRun(runId, errMsg);
    console.warn(`[RELIQ Server Service] Pre-flight rejection: ${errMsg}`);
    throw new Error(errMsg);
  }

  // Pre-flight capacity check for large runs (100+ cases) to prevent doomed runs
  if (totalCases >= 100) {
    const isBaselineReal = options.baselineVersion.provider !== 'demo';
    const isCandidateReal = options.candidateVersion.provider !== 'demo';

    const baselineState = providerScheduler.getProviderStatus(options.baselineVersion.provider);
    const candidateState = providerScheduler.getProviderStatus(options.candidateVersion.provider);

    const isExhaustedOrLimited = (prov: string, state: any) => {
      const norm = providerScheduler.normalizeProvider(prov);
      if (state.status === 'QUOTA_EXHAUSTED') return true;
      if (norm === 'google' && totalCases > 20) return true;
      return false;
    };

    if (
      (isBaselineReal && isExhaustedOrLimited(options.baselineVersion.provider, baselineState)) ||
      (isCandidateReal && isExhaustedOrLimited(options.candidateVersion.provider, candidateState))
    ) {
      const errMsg = `${totalCases}-case evaluation blocked: estimated token/request usage exceeds the currently available provider quota.`;
      job.status = 'FAILED';
      job.endTime = Date.now();
      job.error = errMsg;
      evaluationDbService.failEvaluationRun(runId, errMsg);
      console.warn(`[RELIQ Server Service] Pre-flight large-run rejection: ${errMsg}`);
      throw new Error(errMsg);
    }
  }

  // Acquire run lock to prevent concurrent runs from competing for provider quota
  const releaseLock = await providerScheduler.acquireRunLock(runId);

  try {
    const baselineProvider = resolveServerProvider(options.baselineVersion);
    const candidateProvider = resolveServerProvider(options.candidateVersion);

    const runner = new EvaluationRunner();

    const run = await runner.run({
      project: effectiveProject,
      dataset: safeDataset,
      baselineVersion: options.baselineVersion,
      candidateVersion: options.candidateVersion,
      baselineProvider,
      candidateProvider,
      judgeConfig: options.judgeConfig,
      regressionSettings: options.regressionSettings || effectiveProject.regressionSettings,
      maxCases: options.maxCases,
      concurrency: resolvedConcurrency,
      runId,
      onProgress: (current, total, latestCaseName) => {
        const currentJob = jobs.get(runId);
        if (currentJob) {
          currentJob.progress = {
            current,
            total,
            caseName: latestCaseName,
            percent: total > 0 ? Math.round((current / total) * 100) : 0,
          };
        }
      },
      onCaseCompleted: (caseResult, current, total) => {
        const currentJob = jobs.get(runId);
        if (currentJob) {
          currentJob.progress = {
            current,
            total,
            caseName: caseResult?.caseName || currentJob.progress.caseName,
            percent: total > 0 ? Math.round((current / total) * 100) : 0,
          };
        }
        // Authoritative per-case persistence into SQLite evaluation_results table
        evaluationDbService.recordCaseResult(runId, options.candidateVersion, caseResult);
      },
    });

    // Ensure the returned run uses the established canonical runId
    const finalRun: EvaluationRun = {
      ...run,
      id: runId,
    };

    job.status = 'COMPLETED';
    job.progress.current = totalCases;
    job.progress.percent = 100;
    job.endTime = Date.now();
    job.run = finalRun;

    // Authoritative finalization into SQLite evaluation_runs table
    evaluationDbService.finalizeEvaluationRun(finalRun);

    // Persist completed evaluation to disk for legacy JSON compatibility
    saveRunToDisk(finalRun);

    console.log(`[RELIQ Server Service] Evaluation Run ${runId} COMPLETED successfully in ${Date.now() - job.startTime}ms`);
    return finalRun;
  } catch (err: any) {
    job.status = 'FAILED';
    job.endTime = Date.now();
    job.error = err.message || 'Evaluation run failed';
    evaluationDbService.failEvaluationRun(runId, err.message || 'Evaluation run failed');
    console.error(`[RELIQ Server Service] Evaluation Run ${runId} FAILED:`, err.message);
    throw err;
  } finally {
    releaseLock();
  }
}

/**
 * Initiates an evaluation job asynchronously, returning runId and promise.
 */
export function startEvaluationJob(options: ServerEvaluationOptions): {
  runId: string;
  jobPromise: Promise<EvaluationRun>;
} {
  const runId = options.runId || generateCanonicalRunId();

  const jobPromise = runServerEvaluation({ ...options, runId });
  // Attach error handler to avoid unhandled rejection in background
  jobPromise.catch(() => {});

  return { runId, jobPromise };
}
