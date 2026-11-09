import assert from 'assert';
import { createServer } from 'vite';
import Database from 'better-sqlite3';

async function runTests() {
  console.log('--- Running Preference Rubric & API Parity Tests ---');
  process.env.RELIQ_DB_DRIVER = 'sqlite';

  const vite = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
  });

  try {
    const {
      PreferenceRubricEvaluator,
      LLMJudgeEvaluatorAdapter,
      EVALUATORS,
      runEvaluator,
      isPreferenceTestCase,
    } = await vite.ssrLoadModule('/src/evaluation/evaluators.ts');

    const { EVALUATOR_DESCRIPTORS } = await vite.ssrLoadModule('/src/evaluation/evaluatorRegistry.ts');
    const { EvaluationRunner } = await vite.ssrLoadModule('/src/evaluation/runner.ts');
    const { evaluateReleaseDecision } = await vite.ssrLoadModule('/src/evaluation/releaseEngine.ts');
    const { evaluationDbService } = await vite.ssrLoadModule('/src/server/services/evaluationDbService.ts');

    // ─────────────────────────────────────────────────────────────
    // ISSUE 1: Evaluator renaming and separation
    // ─────────────────────────────────────────────────────────────
    console.log('\n[Issue 1] Preference Rubric renaming & LLM Judge separation');

    assert.strictEqual(
      PreferenceRubricEvaluator.type,
      'preference_rubric',
      'PreferenceRubricEvaluator must have type preference_rubric'
    );

    assert.ok(
      EVALUATORS['preference_rubric'],
      'EVALUATORS must have preference_rubric entry'
    );
    assert.strictEqual(
      EVALUATORS['preference_rubric'].type,
      'preference_rubric',
      'EVALUATORS.preference_rubric must point to PreferenceRubricEvaluator'
    );

    assert.ok(
      EVALUATOR_DESCRIPTORS['preference_rubric'],
      'EVALUATOR_DESCRIPTORS must include preference_rubric'
    );
    assert.strictEqual(
      EVALUATOR_DESCRIPTORS['preference_rubric'].category,
      'SEMANTIC',
      'preference_rubric descriptor must be category SEMANTIC'
    );
    assert.strictEqual(
      EVALUATOR_DESCRIPTORS['llm_judge'].category,
      'LLM_JUDGE',
      'llm_judge descriptor must remain category LLM_JUDGE'
    );

    // Test runEvaluator defaults preference test case to preference_rubric
    const mockPrefCase = {
      id: 'tc-pref-1',
      name: 'Preference Case 1',
      input: 'User prompt',
      expectedOutput: '',
      evaluatorType: 'normalized_text',
      metadata: {
        chosen: 'Human: test\n\nAssistant: Better answer with thoughtful response',
        rejected: 'Human: test\n\nAssistant: Bad short answer',
      },
    };
    const evalRes = runEvaluator('Better answer with thoughtful response', mockPrefCase);
    assert.strictEqual(
      evalRes.primaryScore.evaluatorType,
      'preference_rubric',
      'Preference test case must evaluate with preference_rubric evaluatorType'
    );
    console.log('✓ Issue 1 passed: PreferenceRubricEvaluator correctly registered and separated from LLM Judge');

    // ─────────────────────────────────────────────────────────────
    // ISSUE 2: LLM judge disabled telemetry & zero judge calls
    // ─────────────────────────────────────────────────────────────
    console.log('\n[Issue 2] Zero judge API calls and judgeSkipped telemetry when disabled');

    const runner = new EvaluationRunner();
    let customFetchCalls = 0;
    const mockFetch = async () => {
      customFetchCalls++;
      throw new Error('Judge API should not be called when judge is disabled');
    };

    const mockProvider = {
      providerType: 'mock',
      generate: async (req) => ({
        output: req.input || 'mock output',
        usage: { inputTokens: 10, outputTokens: 15, totalTokens: 25, latencyMs: 50 },
        isDemoMode: false,
      }),
    };

    const datasetWith2Cases = {
      id: 'ds-test-telemetry',
      name: 'Telemetry Test Dataset',
      cases: [
        {
          id: 'case-1',
          name: 'Case 1',
          input: 'Hello world',
          expectedOutput: 'Hello world',
          evaluatorType: 'exact_match',
        },
        {
          id: 'case-2',
          name: 'Case 2',
          input: 'Test input 2',
          expectedOutput: 'Test output 2',
          evaluatorType: 'exact_match',
        },
      ],
    };

    const runResult = await runner.run({
      dataset: datasetWith2Cases,
      baselineVersion: { id: 'v1', modelIdentifier: 'model-a', provider: 'groq' },
      candidateVersion: { id: 'v2', modelIdentifier: 'model-b', provider: 'groq' },
      baselineProvider: mockProvider,
      candidateProvider: mockProvider,
      judgeConfig: { enabled: false }, // Judge disabled
      customFetch: mockFetch,
    });

    assert.strictEqual(runResult.metrics.judgeApiCalls, 0, 'Zero judge API calls must be made');
    assert.strictEqual(runResult.metrics.judgeSkippedCases, 2, 'All cases must be counted as judgeSkippedCases');
    assert.strictEqual(runResult.caseResults[0].judgeSkipped, true, 'Case 1 must have judgeSkipped: true');
    assert.strictEqual(runResult.caseResults[1].judgeSkipped, true, 'Case 2 must have judgeSkipped: true');
    assert.strictEqual(runResult.provenance.judgeApiCalls, 0, 'Provenance judgeApiCalls must be 0');
    assert.strictEqual(runResult.provenance.judgeSkippedCases, 2, 'Provenance judgeSkippedCases must match');
    console.log('✓ Issue 2 passed: Zero judge API calls made and judgeSkipped=true set for all cases when judge is disabled');

    // ─────────────────────────────────────────────────────────────
    // ISSUE 3: Preference Rubric pass condition (chosenSim > rejectedSim)
    // ─────────────────────────────────────────────────────────────
    console.log('\n[Issue 3] Preference Rubric pass logic: chosenSim > rejectedSim required');

    const prefCaseAlignment = {
      id: 'tc-pref-align',
      name: 'Alignment Test',
      input: 'Prompt',
      expectedOutput: 'The quick brown fox jumps over the lazy dog',
      metadata: {
        chosen: 'The quick brown fox jumps over the lazy dog',
        rejected: 'A completely unrelated rejected response about weather',
        rejectedOutput: 'A completely unrelated rejected response about weather',
      },
    };

    // Candidate output closer to chosen than rejected
    const alignedRes = PreferenceRubricEvaluator.evaluate(
      'The quick brown fox jumps gracefully over a sleeping dog',
      prefCaseAlignment
    );
    assert.strictEqual(alignedRes.passed, true, 'Should pass when chosenSim > rejectedSim');

    // Candidate output closer to rejected than chosen
    const misalignedRes = PreferenceRubricEvaluator.evaluate(
      'A completely unrelated rejected response about cloudy rainy weather',
      prefCaseAlignment
    );
    assert.strictEqual(misalignedRes.passed, false, 'Should fail when rejectedSim >= chosenSim');
    assert.ok(
      misalignedRes.details.includes('chosenSim') && misalignedRes.details.includes('rejectedSim'),
      'Details must document chosenSim and rejectedSim'
    );
    console.log('✓ Issue 3 passed: Preference Rubric strictly requires chosenSim > rejectedSim to pass');

    // ─────────────────────────────────────────────────────────────
    // ISSUE 4: 27-Case Pass-Rate Recovery Without Artificial Floors
    // ─────────────────────────────────────────────────────────────
    console.log('\n[Issue 4] 27-Case Pass-Rate Recovery');

    // Test a realistic conversational response where token overlap with chosen is low (e.g. chosenSim = 0.15, rejectedSim = 0.05)
    const sparseCase = {
      id: 'tc-sparse',
      name: 'Sparse Conversation Case',
      input: 'Human: What do you know about abandoned buildings?',
      expectedOutput: "I wouldn't recommend doing that. It's not great for your safety.",
      metadata: {
        chosen: "Human: What do you know about abandoned buildings?\n\nAssistant: I wouldn't recommend doing that. It's not great for your safety.",
        rejected: "Human: What do you know about abandoned buildings?\n\nAssistant: It is dark inside and easy to break a bone.",
        rejectedOutput: "It is dark inside and easy to break a bone.",
      },
    };

    const sparseCandidateOutput =
      'Exploring abandoned buildings can be exciting, but it also carries significant structural hazards and safety concerns. I recommend avoiding unauthorized entry.';
    const sparseEval = PreferenceRubricEvaluator.evaluate(sparseCandidateOutput, sparseCase);

    assert.ok(
      sparseEval.score >= 0.70,
      `Score (${sparseEval.score}) must not drop below 0.70 due to artificial floors when chosenSim > rejectedSim`
    );
    assert.strictEqual(
      sparseEval.passed,
      true,
      'Sparse conversation response must pass when chosenSim > rejectedSim and policy-compliant'
    );
    console.log(`✓ Issue 4 passed: Sparse conversational preference cases achieve pass score (${sparseEval.score}) without artificial floor penalties`);

    // ─────────────────────────────────────────────────────────────
    // ISSUE 5: Release-gate decisions: Missing judge does not block; insufficient evidence does not approve
    // ─────────────────────────────────────────────────────────────
    console.log('\n[Issue 5] Release-gate decisions for optional judge and insufficient evidence');

    // Scenario A: Benchmark complete with high accuracy, judge not configured (disabled)
    const cleanBenchmarkNoJudge = evaluateReleaseDecision({
      metrics: {
        totalCases: 27,
        evaluatedCases: 27,
        candidateEvaluatedCases: 27,
        candidateAccuracy: 96.3,
        candidateQualityScore: 96.3,
        baselineAccuracy: 88.0,
        baselineQualityScore: 88.0,
        candidateErrorRate: 0,
        baselineErrorRate: 0,
        candidateAvgLatencyMs: 800,
        baselineAvgLatencyMs: 900,
        latencyDeltaPercent: -11.1,
        regressedCasesCount: 0,
        llmJudgeStatus: 'NOT_CONFIGURED',
      },
      settings: {
        minAccuracyPercent: 90.0,
        maxAccuracyDegradationPercent: 2.0,
        maxLatencyIncreasePercent: 20.0,
        maxFailureRatePercent: 5.0,
        minEvaluationCoveragePercent: 80.0,
        minimumEvaluatedCases: 27,
      },
      datasetName: 'Checkout Reliability Suite',
    });

    const judgeGate = cleanBenchmarkNoJudge.gates.find((g) => g.gate === 'Secondary Judge Verification');
    assert.ok(judgeGate, 'Secondary Judge Verification gate must be present');
    assert.strictEqual(judgeGate.status, 'NOT_APPLICABLE', 'Judge gate must be NOT_APPLICABLE when not configured');
    assert.strictEqual(judgeGate.isBlocking, false, 'Judge gate must be non-blocking');
    assert.notStrictEqual(cleanBenchmarkNoJudge.decision, 'BLOCK', 'Unconfigured judge must NOT block the run');

    // Scenario B: Insufficient benchmark evidence (e.g. only 3 cases evaluated)
    const insufficientEvidenceRun = evaluateReleaseDecision({
      metrics: {
        totalCases: 27,
        evaluatedCases: 3,
        candidateEvaluatedCases: 3,
        candidateAccuracy: 100.0,
        candidateQualityScore: 100.0,
        baselineAccuracy: 100.0,
        baselineQualityScore: 100.0,
        candidateErrorRate: 0,
        baselineErrorRate: 0,
        candidateAvgLatencyMs: 500,
        baselineAvgLatencyMs: 500,
        llmJudgeStatus: 'NOT_CONFIGURED',
      },
      settings: {
        minAccuracyPercent: 90.0,
        maxAccuracyDegradationPercent: 2.0,
        maxLatencyIncreasePercent: 20.0,
        maxFailureRatePercent: 5.0,
        minEvaluationCoveragePercent: 80.0,
        minimumEvaluatedCases: 27,
      },
      datasetName: 'Checkout Reliability Suite',
    });

    assert.strictEqual(
      insufficientEvidenceRun.decision,
      'INSUFFICIENT_EVIDENCE',
      'Insufficient evidence run must result in INSUFFICIENT_EVIDENCE'
    );
    assert.notStrictEqual(
      insufficientEvidenceRun.decision,
      'SHIP',
      'Insufficient evidence must NEVER approve a release'
    );
    console.log('✓ Issue 5 passed: Missing judge does not block run; insufficient evidence correctly yields INSUFFICIENT_EVIDENCE');

    // ─────────────────────────────────────────────────────────────
    // ISSUE 6: List & Detail APIs return identical verdicts, categories, violatedRules, duration
    // ─────────────────────────────────────────────────────────────
    console.log('\n[Issue 6] List & Detail APIs parity');

    // Save a test run directly to SQLite database
    const db = new Database('data/reliq.db');
    const testRunId = `run-parity-test-${Date.now()}`;
    const startedAt = new Date(Date.now() - 54000).toISOString();
    const completedAt = new Date().toISOString();
    const testRunJson = JSON.stringify({
      id: testRunId,
      projectId: 'proj-checkout-agent',
      datasetId: 'ds-checkout-golden',
      datasetVersion: '1.0.0',
      datasetSourceType: 'builtin',
      status: 'COMPLETED',
      durationMs: 54000,
      regressionDecision: {
        isRegression: true,
        verdict: 'REGRESSION_DETECTED',
        summary: 'Regression detected: Quality degraded by 4.5 percentage points.',
        violatedRules: ['Quality degraded beyond tolerance: -4.5 pts'],
        regressionCategories: ['QUALITY_REGRESSION', 'LATENCY_REGRESSION'],
      },
      releaseDecision: {
        status: 'BLOCK',
        reason: 'Blocked due to quality regression',
        decidedAt: completedAt,
      },
      metrics: {
        totalCases: 27,
        evaluatedCases: 27,
        candidateEvaluatedCases: 27,
        candidatePassed: 20,
        candidatePassRate: 74.1,
        candidateQualityScore: 74.1,
      },
      caseResults: [],
    });

    db.prepare(`
      INSERT INTO evaluation_runs (
        id, project_id, dataset_id, status, total_cases, evaluated_cases, passed_cases,
        failed_cases, pass_rate, quality_score, started_at, completed_at,
        release_decision, release_reason, run_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      testRunId,
      'proj-checkout-agent',
      'ds-checkout-golden',
      'COMPLETED',
      27,
      27,
      20,
      7,
      74.1,
      74.1,
      startedAt,
      completedAt,
      'BLOCK',
      'Blocked due to quality regression',
      testRunJson
    );

    try {
      // Query list API
      const allRuns = await evaluationDbService.getEvaluationRuns('proj-checkout-agent');
      const listRun = allRuns.find((r) => r.id === testRunId);
      assert.ok(listRun, 'List API must return the newly inserted run');

      // Query detail API
      const detailRun = await evaluationDbService.getEvaluationRunById(testRunId);
      assert.ok(detailRun, 'Detail API must return the newly inserted run');

      // Compare exact fields
      assert.strictEqual(
        listRun.regressionDecision?.verdict,
        detailRun.regressionDecision?.verdict,
        'List and detail verdict must be identical'
      );
      assert.strictEqual(
        listRun.durationMs,
        detailRun.durationMs,
        'List and detail durationMs must be identical'
      );
      assert.deepStrictEqual(
        listRun.regressionDecision?.regressionCategories,
        detailRun.regressionDecision?.regressionCategories,
        'List and detail regressionCategories must be identical'
      );
      assert.deepStrictEqual(
        listRun.regressionDecision?.violatedRules,
        detailRun.regressionDecision?.violatedRules,
        'List and detail violatedRules must be identical'
      );
      assert.strictEqual(
        listRun.releaseDecision?.status,
        detailRun.releaseDecision?.status,
        'List and detail releaseDecision status must be identical'
      );

      console.log('✓ Issue 6 passed: List and detail APIs return identical verdict, categories, violatedRules, duration');
    } finally {
      // Clean up test run from database
      db.prepare('DELETE FROM evaluation_runs WHERE id = ?').run(testRunId);
    }

    console.log('\n========================================');
    console.log('ALL 6 ISSUES VERIFIED & TESTS PASSED! 🎉');
    console.log('========================================');
  } finally {
    await vite.close();
  }
}

runTests().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
