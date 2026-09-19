/* ============================================================
   RELIQ — Evaluation Run & Release Decision Database Service
   
   Business logic and SQLite persistence for Evaluation Runs:
   - Atomic release decision updates with audit log insertion
   - Database-backed reads for evaluation runs, results, and failures
   - Transparent fallback to data/runs/*.json for un-migrated disk runs
   ============================================================ */

import { getDatabase } from '../db/database';
import { getRunFromDisk, getRunsFromDisk, saveRunToDisk } from '../evaluationService';

export const ALLOWED_RELEASE_DECISIONS = new Set([
  'PASS',
  'BLOCK',
  'PENDING',
  'SHIP',
  'SHIP_WITH_CONDITIONS',
  'INSUFFICIENT_EVIDENCE',
  'NO_REGRESSION',
  'REGRESSION_DETECTED',
]);

export interface ReleaseDecisionAuditRecord {
  id: string;
  run_id: string;
  previous_decision: string | null;
  new_decision: string;
  justification: string;
  created_at: string;
}

/**
 * Maps an evaluation_results database row to the TypeScript TestCaseResult domain model,
 * preserving both camelCase domain properties and original snake_case fields for full compatibility.
 */
export function mapDbResultToDomain(row: any): any {
  if (!row) return null;
  const isPass = row.passed === null ? null : Boolean(row.passed);
  const isOperationalError = Boolean(
    (row.failure_category && row.failure_category.startsWith('PROVIDER_')) ||
    (row.failure_type && [
      'AUTHENTICATION_ERROR',
      'PROVIDER_FORBIDDEN',
      'PROVIDER_RATE_LIMIT',
      'PROVIDER_SERVER_ERROR',
      'PROVIDER_TIMEOUT',
      'TIMEOUT',
      'PROVIDER_NETWORK_ERROR',
      'NETWORK_ERROR',
      'PROVIDER_CREDITS_EXHAUSTED',
      'PAYMENT_REQUIRED',
    ].includes(row.failure_type))
  );

  return {
    ...row,
    id: row.id,
    runId: row.run_id,
    testCaseId: row.test_case_id,
    testCaseName: row.test_case_id,
    modelVersionId: row.model_version_id,
    provider: row.provider,
    model: row.model,
    response: row.response,
    candidateOutput: row.response,
    baselineOutput: null,
    passed: row.passed,
    isPassed: isPass,
    qualityScore: row.quality_score,
    candidateScore: row.quality_score,
    baselineScore: null,
    latencyMs: row.latency_ms,
    candidateLatencyMs: row.latency_ms,
    baselineLatencyMs: null,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    reasoningTokens: row.reasoning_tokens,
    totalTokens: row.total_tokens,
    cost: row.cost,
    failureType: row.failure_type,
    failureReason: row.failure_type || undefined,
    failureCategory: row.failure_category,
    candidateExecutionStatus: row.failure_type || (isPass === true ? 'PASS' : isPass === false ? 'QUALITY_FAILURE' : undefined),
    executionStatus: row.failure_type || (isPass === true ? 'PASS' : isPass === false ? 'QUALITY_FAILURE' : undefined),
    candidateQualityEvaluated: row.quality_score !== null,
    candidateTransportSuccess: !isOperationalError,
    candidateEvaluationEligible: !isOperationalError,
    candidateUsage: {
      provider: row.provider,
      model: row.model,
      inputTokens: row.input_tokens ?? 0,
      outputTokens: row.output_tokens ?? 0,
      reasoningTokens: row.reasoning_tokens ?? 0,
      totalTokens: row.total_tokens ?? 0,
      latencyMs: row.latency_ms ?? 0,
      estimatedCostUsd: row.cost ?? 0,
    },
    createdAt: row.created_at,
  };
}

export class EvaluationDbService {
  /**
   * Inserts an initial evaluation run record with RUNNING status.
   * Ensures parent project and dataset exist to satisfy foreign key constraints.
   */
  createEvaluationRun(data: {
    id: string;
    projectId: string;
    datasetId: string;
    totalCases: number;
    startedAt?: string;
  }): void {
    const db = getDatabase();
    const now = data.startedAt || new Date().toISOString();

    // Ensure referenced project exists
    const proj = db.prepare('SELECT id FROM projects WHERE id = ?').get(data.projectId);
    if (!proj) {
      db.prepare(`
        INSERT OR IGNORE INTO projects (id, name, description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(data.projectId, data.projectId, 'Auto-created project for evaluation run', now, now);
    }

    // Ensure referenced dataset exists
    const ds = db.prepare('SELECT id FROM datasets WHERE id = ?').get(data.datasetId);
    if (!ds) {
      db.prepare(`
        INSERT OR IGNORE INTO datasets (id, project_id, name, description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(data.datasetId, data.projectId, data.datasetId, 'Auto-created dataset for evaluation run', now, now);
    }

    db.prepare(`
      INSERT OR REPLACE INTO evaluation_runs (
        id, project_id, dataset_id, status, total_cases, evaluated_cases,
        passed_cases, failed_cases, pass_rate, quality_score, started_at,
        completed_at, release_decision, release_reason
      ) VALUES (?, ?, ?, 'RUNNING', ?, 0, 0, 0, NULL, NULL, ?, NULL, NULL, NULL)
    `).run(data.id, data.projectId, data.datasetId, data.totalCases, now);
  }

  /**
   * Persists an individual test case result to evaluation_results table.
   * Telemetry and quality scores are strictly NULL if not evaluable or if operational errors occurred.
   */
  recordCaseResult(
    runId: string,
    candidateVersion: any,
    caseResult: any
  ): void {
    const db = getDatabase();
    const now = new Date().toISOString();
    const resultId = `res_${runId}_${caseResult.testCaseId || Math.random().toString(36).substring(2, 8)}`;

    const passedVal = caseResult.passed === null || caseResult.passed === undefined
      ? null
      : caseResult.passed ? 1 : 0;

    // Quality score is strictly NULL if quality was not evaluated (e.g. provider error)
    const qualityScoreVal =
      caseResult.candidateQualityEvaluated === false
        ? null
        : caseResult.candidateScore !== null && caseResult.candidateScore !== undefined
        ? caseResult.candidateScore
        : null;

    // Latency is strictly NULL if transport failed or not evaluation eligible
    const latencyVal =
      caseResult.candidateTransportSuccess === false || caseResult.candidateEvaluationEligible === false
        ? null
        : caseResult.candidateLatencyMs !== null && caseResult.candidateLatencyMs !== undefined
        ? caseResult.candidateLatencyMs
        : null;

    const usage = caseResult.candidateUsage;
    const inputTokens = usage?.inputTokens !== undefined && caseResult.candidateTransportSuccess !== false ? usage.inputTokens : null;
    const outputTokens = usage?.outputTokens !== undefined && caseResult.candidateTransportSuccess !== false ? usage.outputTokens : null;
    const reasoningTokens = usage?.reasoningTokens !== undefined && caseResult.candidateTransportSuccess !== false ? usage.reasoningTokens : null;
    const totalTokens = usage?.totalTokens !== undefined && caseResult.candidateTransportSuccess !== false ? usage.totalTokens : null;
    const cost = usage?.estimatedCostUsd !== undefined && caseResult.candidateTransportSuccess !== false && usage.estimatedCostUsd !== null
      ? usage.estimatedCostUsd
      : null;

    let failureType = caseResult.candidateExecutionStatus || caseResult.executionStatus;
    if (failureType === 'PASS') {
      failureType = undefined;
    }
    const failureCategory = caseResult.failureCategory || (failureType === 'QUALITY_FAILURE' ? 'QUALITY_FAILURE' : undefined);

    // Ensure test_case_id exists if referenced
    if (caseResult.testCaseId) {
      const tc = db.prepare('SELECT id FROM test_cases WHERE id = ?').get(caseResult.testCaseId);
      if (!tc) {
        const runRow = db.prepare('SELECT dataset_id FROM evaluation_runs WHERE id = ?').get(runId) as any;
        const dsId = runRow?.dataset_id || 'ds-checkout-golden';
        db.prepare(`
          INSERT OR IGNORE INTO test_cases (id, dataset_id, name, category, input, expected_behavior, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          caseResult.testCaseId,
          dsId,
          caseResult.testCaseName || caseResult.testCaseId,
          caseResult.category || 'General',
          caseResult.input || '',
          caseResult.expectedOutput || caseResult.expectedBehavior || '',
          now,
          now
        );
      }
    }

    // Ensure model_version_id exists if referenced
    if (candidateVersion?.id) {
      const mv = db.prepare('SELECT id FROM model_versions WHERE id = ?').get(candidateVersion.id);
      if (!mv) {
        const runRow = db.prepare('SELECT project_id FROM evaluation_runs WHERE id = ?').get(runId) as any;
        const pId = runRow?.project_id || 'proj-checkout-agent';
        db.prepare(`
          INSERT OR IGNORE INTO model_versions (id, project_id, provider, model, display_name, system_prompt, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          candidateVersion.id,
          pId,
          candidateVersion.provider || 'cerebras',
          candidateVersion.modelIdentifier || 'gpt-oss-120b',
          candidateVersion.name || candidateVersion.id,
          candidateVersion.systemPrompt || '',
          now,
          now
        );
      }
    }

    db.prepare(`
      INSERT OR REPLACE INTO evaluation_results (
        id, run_id, test_case_id, model_version_id, provider, model,
        response, passed, quality_score, latency_ms, input_tokens,
        output_tokens, reasoning_tokens, total_tokens, cost,
        failure_type, failure_category, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      resultId,
      runId,
      caseResult.testCaseId || null,
      candidateVersion?.id || null,
      candidateVersion?.provider || 'unknown',
      candidateVersion?.modelIdentifier || 'unknown',
      caseResult.candidateOutput || '',
      passedVal,
      qualityScoreVal,
      latencyVal,
      inputTokens,
      outputTokens,
      reasoningTokens,
      totalTokens,
      cost,
      failureType || null,
      failureCategory || null,
      now
    );
  }

  /**
   * Finalizes an evaluation run with completed metrics and release decision.
   */
  finalizeEvaluationRun(finalRun: any): void {
    const db = getDatabase();
    const runId = finalRun.id;
    const now = finalRun.timestamp || new Date().toISOString();

    const evaluatedCases = finalRun.metrics?.evaluatedCases ?? finalRun.metrics?.candidateEvaluatedCases ?? 0;
    const passedCases = finalRun.metrics?.candidatePassed ?? 0;
    const failedCases = Math.max(0, evaluatedCases - passedCases);
    const passRate = evaluatedCases > 0 ? (finalRun.metrics?.candidatePassRate ?? null) : null;
    const qualityScore = evaluatedCases > 0 ? (finalRun.metrics?.candidateQualityScore ?? null) : null;
    const releaseDecision = finalRun.releaseDecision?.status || null;
    const releaseReason = finalRun.releaseDecision?.reason || null;

    db.prepare(`
      UPDATE evaluation_runs
      SET status = 'COMPLETED',
          total_cases = ?,
          evaluated_cases = ?,
          passed_cases = ?,
          failed_cases = ?,
          pass_rate = ?,
          quality_score = ?,
          completed_at = ?,
          release_decision = ?,
          release_reason = ?
      WHERE id = ?
    `).run(
      finalRun.metrics?.totalCases ?? finalRun.caseResults?.length ?? 0,
      evaluatedCases,
      passedCases,
      failedCases,
      passRate,
      qualityScore,
      now,
      releaseDecision,
      releaseReason,
      runId
    );
  }

  /**
   * Marks an evaluation run as failed.
   */
  failEvaluationRun(runId: string, errorMessage: string): void {
    const db = getDatabase();
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE evaluation_runs
      SET status = 'FAILED',
          completed_at = ?,
          release_reason = ?
      WHERE id = ?
    `).run(now, errorMessage, runId);
  }

  /**
   * Retrieves all evaluation runs. Merges SQLite runs with disk runs, avoiding duplicates.
   */
  getEvaluationRuns(): any[] {
    const db = getDatabase();
    const dbRuns = db
      .prepare('SELECT * FROM evaluation_runs ORDER BY started_at DESC')
      .all() as any[];

    const diskRuns = getRunsFromDisk();
    const runMap = new Map<string, any>();

    // Add disk runs first
    for (const dRun of diskRuns) {
      runMap.set(dRun.id, dRun);
    }

    // Override/supplement with SQLite runs
    for (const sRun of dbRuns) {
      const existing = runMap.get(sRun.id);
      if (existing) {
        runMap.set(sRun.id, {
          ...existing,
          status: sRun.status,
          metrics: {
            ...existing.metrics,
            totalCases: sRun.total_cases,
            evaluatedCases: sRun.evaluated_cases,
            candidateEvaluatedCases: sRun.evaluated_cases,
            candidatePassed: sRun.passed_cases,
            candidatePassRate: sRun.pass_rate,
            candidateQualityScore: sRun.quality_score,
          },
          releaseDecision: {
            ...existing.releaseDecision,
            status: sRun.release_decision || existing.releaseDecision?.status,
            reason: sRun.release_reason || existing.releaseDecision?.reason,
          },
        });
      } else {
        runMap.set(sRun.id, {
          id: sRun.id,
          projectId: sRun.project_id,
          datasetId: sRun.dataset_id,
          status: sRun.status,
          timestamp: sRun.started_at,
          durationMs: sRun.completed_at
            ? new Date(sRun.completed_at).getTime() - new Date(sRun.started_at).getTime()
            : 0,
          metrics: {
            totalCases: sRun.total_cases,
            evaluatedCases: sRun.evaluated_cases,
            candidateEvaluatedCases: sRun.evaluated_cases,
            candidatePassed: sRun.passed_cases,
            candidatePassRate: sRun.pass_rate,
            candidateQualityScore: sRun.quality_score,
          },
          releaseDecision: {
            status: sRun.release_decision,
            reason: sRun.release_reason,
            decidedAt: sRun.completed_at || sRun.started_at,
          },
        });
      }
    }

    const merged = Array.from(runMap.values());
    return merged.sort(
      (a, b) =>
        new Date(b.timestamp || b.started_at).getTime() -
        new Date(a.timestamp || a.started_at).getTime()
    );
  }

  /**
   * Retrieves a single evaluation run by ID from SQLite or disk.
   */
  getEvaluationRunById(id: string): any | null {
    const db = getDatabase();
    const sRun = db.prepare('SELECT * FROM evaluation_runs WHERE id = ?').get(id) as any;
    const dRun = getRunFromDisk(id);

    if (sRun && dRun) {
      const results = this.getRunResults(id);
      return {
        ...dRun,
        status: sRun.status,
        metrics: {
          ...dRun.metrics,
          totalCases: sRun.total_cases,
          evaluatedCases: sRun.evaluated_cases,
          candidateEvaluatedCases: sRun.evaluated_cases,
          candidatePassed: sRun.passed_cases,
          candidatePassRate: sRun.pass_rate,
          candidateQualityScore: sRun.quality_score,
        },
        releaseDecision: {
          ...dRun.releaseDecision,
          status: sRun.release_decision || dRun.releaseDecision?.status,
          reason: sRun.release_reason || dRun.releaseDecision?.reason,
        },
        caseResults:
          dRun.caseResults &&
          dRun.caseResults.length > 0 &&
          (dRun.caseResults[0].evaluatorScores !== undefined || dRun.caseResults[0].baselineOutput !== undefined)
            ? dRun.caseResults
            : results.length > 0
            ? results
            : dRun.caseResults,
      };
    }

    if (sRun) {
      const results = this.getRunResults(id);
      return {
        id: sRun.id,
        projectId: sRun.project_id,
        datasetId: sRun.dataset_id,
        status: sRun.status,
        timestamp: sRun.started_at,
        durationMs: sRun.completed_at
          ? new Date(sRun.completed_at).getTime() - new Date(sRun.started_at).getTime()
          : 0,
        metrics: {
          totalCases: sRun.total_cases,
          evaluatedCases: sRun.evaluated_cases,
          candidateEvaluatedCases: sRun.evaluated_cases,
          candidatePassed: sRun.passed_cases,
          candidatePassRate: sRun.pass_rate,
          candidateQualityScore: sRun.quality_score,
        },
        releaseDecision: {
          status: sRun.release_decision,
          reason: sRun.release_reason,
          decidedAt: sRun.completed_at || sRun.started_at,
        },
        caseResults: results,
        results,
        ...sRun,
      };
    }

    return dRun || null;
  }

  /**
   * Retrieves evaluation results for a given run ID.
   */
  getRunResults(runId: string): any[] {
    const db = getDatabase();
    const rows = db
      .prepare('SELECT * FROM evaluation_results WHERE run_id = ? ORDER BY created_at ASC')
      .all(runId);

    if (rows && rows.length > 0) {
      return rows.map(mapDbResultToDomain);
    }

    // Fallback: extract caseResults from disk run
    const diskRun = getRunFromDisk(runId);
    if (diskRun && Array.isArray(diskRun.caseResults)) {
      return diskRun.caseResults.map((c, i) => ({
        ...c,
        id: `res-${runId}-${c.testCaseId || i}`,
        run_id: runId,
        runId,
        test_case_id: c.testCaseId,
        testCaseName: c.testCaseName || c.testCaseId,
        model_version_id: diskRun.candidateVersion?.id,
        modelVersionId: diskRun.candidateVersion?.id,
        provider: diskRun.candidateVersion?.provider,
        model: diskRun.candidateVersion?.modelIdentifier,
        response: c.candidateOutput,
        passed: c.passed === null || c.passed === undefined ? null : (c.passed ? 1 : 0),
        quality_score: c.candidateScore,
        qualityScore: c.candidateScore,
        latency_ms: c.candidateLatencyMs,
        input_tokens: c.candidateUsage?.inputTokens ?? 0,
        output_tokens: c.candidateUsage?.outputTokens ?? 0,
        reasoning_tokens: c.candidateUsage?.reasoningTokens ?? 0,
        total_tokens: c.candidateUsage?.totalTokens ?? 0,
        cost: c.candidateUsage?.estimatedCostUsd ?? 0,
        failure_type: c.executionStatus,
        failure_category: c.failureCategory,
        created_at: diskRun.timestamp,
      }));
    }

    return [];
  }

  /**
   * Retrieves only failed evaluation results for a given run ID.
   */
  getRunFailures(runId: string): any[] {
    const all = this.getRunResults(runId);
    return all.filter((r) => {
      const isFailed = r.passed === 0 || r.passed === false;
      const hasFailureType = Boolean(r.failure_type || r.failureType);
      const hasFailureCat = Boolean(r.failure_category || r.failureCategory);
      return isFailed || hasFailureType || hasFailureCat;
    });
  }

  /**
   * Atomically updates release decision and creates an audit record.
   * Rollback complete transaction if any step fails.
   */
  updateReleaseDecision(
    runId: string,
    decision: string,
    justification: string
  ): { runId: string; decision: string; previousDecision: string | null; audit: ReleaseDecisionAuditRecord } {
    if (!ALLOWED_RELEASE_DECISIONS.has(decision)) {
      const err = new Error(
        `Invalid release decision '${decision}'. Allowed decisions: ${Array.from(ALLOWED_RELEASE_DECISIONS).join(', ')}`
      );
      (err as any).code = 'INVALID_RELEASE_DECISION';
      throw err;
    }

    const db = getDatabase();
    const existingRun = this.getEvaluationRunById(runId);
    if (!existingRun) {
      const err = new Error(`Evaluation run with ID '${runId}' not found`);
      (err as any).code = 'RUN_NOT_FOUND';
      throw err;
    }

    const previousDecision =
      existingRun.releaseDecision?.status ||
      existingRun.release_decision ||
      null;

    const now = new Date().toISOString();
    const auditId = `audit-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const reasonText = justification.trim();

    // Execute atomic SQLite transaction
    const auditRecord = db.transaction(() => {
      // Ensure run exists in SQLite evaluation_runs table
      const inDb = db.prepare('SELECT id FROM evaluation_runs WHERE id = ?').get(runId);

      if (inDb) {
        db.prepare(`
          UPDATE evaluation_runs
          SET release_decision = ?, release_reason = ?
          WHERE id = ?
        `).run(decision, reasonText, runId);
      } else {
        // First sync to evaluation_runs if was only on disk
        const pId = existingRun.projectId || 'proj-checkout-agent';
        const dId = existingRun.datasetId || 'ds-checkout-golden';

        const proj = db.prepare('SELECT id FROM projects WHERE id = ?').get(pId);
        if (!proj) {
          db.prepare(`
            INSERT OR IGNORE INTO projects (id, name, description, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
          `).run(pId, pId, 'Auto-created project for evaluation run', now, now);
        }

        const ds = db.prepare('SELECT id FROM datasets WHERE id = ?').get(dId);
        if (!ds) {
          db.prepare(`
            INSERT OR IGNORE INTO datasets (id, project_id, name, description, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(dId, pId, dId, 'Auto-created dataset for evaluation run', now, now);
        }

        db.prepare(`
          INSERT INTO evaluation_runs (
            id, project_id, dataset_id, status, total_cases, evaluated_cases,
            passed_cases, failed_cases, pass_rate, quality_score, started_at,
            completed_at, release_decision, release_reason
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          runId,
          pId,
          dId,
          existingRun.status || 'COMPLETED',
          existingRun.metrics?.totalCases ?? 0,
          existingRun.metrics?.evaluatedCases ?? existingRun.metrics?.candidateEvaluatedCases ?? 0,
          existingRun.metrics?.candidatePassed ?? 0,
          existingRun.metrics?.regressedCasesCount ?? 0,
          existingRun.metrics?.candidatePassRate ?? 0,
          existingRun.metrics?.candidateQualityScore ?? 0,
          existingRun.timestamp || now,
          now,
          decision,
          reasonText
        );
      }

      // Insert audit record
      db.prepare(`
        INSERT INTO release_decision_audit (
          id, run_id, previous_decision, new_decision, justification, created_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `).run(auditId, runId, previousDecision, decision, reasonText, now);

      return {
        id: auditId,
        run_id: runId,
        previous_decision: previousDecision,
        new_decision: decision,
        justification: reasonText,
        created_at: now,
      };
    })();

    // Also update disk JSON file if present to keep disk representation in sync
    const diskRun = getRunFromDisk(runId);
    if (diskRun) {
      diskRun.releaseDecision = {
        status: decision as any,
        decidedBy: 'Supervisor / Release Engineer',
        decidedAt: now,
        reason: reasonText,
      };
      saveRunToDisk(diskRun);
    }

    return {
      runId,
      decision,
      previousDecision,
      audit: auditRecord,
    };
  }
}

export const evaluationDbService = new EvaluationDbService();
