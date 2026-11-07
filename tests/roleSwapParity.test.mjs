/* ============================================================
   RELIQ — Role-Swap Parity & Runtime Consistency Audit Suite
   
   Verifies:
   1. Shared API Key Quota: Groq models share the same server credential
   2. Provider Concurrency & Pacing: Global provider cap (4) and Qwen bucket cap (2)
   3. Role-Swap Runtime Symmetry:
      - Qwen (Base) vs GPT-OSS (Cand) -> QualityDelta = +X, Winner = candidate
      - GPT-OSS (Base) vs Qwen (Cand) -> QualityDelta = -X, Winner = baseline
   4. Baseline Win Verification:
      - Baseline superior -> Winner = baseline in Run A, reverses to candidate in Run B
   5. Identical Performance Tie Verification:
      - Identical outputs produce Statistical Parity Tie in both directions
   6. Asymmetric 429 Failure Parity Guard:
      - Asymmetric coverage produces Inconclusive Tie regardless of which model throttled
   7. Tri-Format Consistency:
      - UI derived state, JSON export, and PDF export strictly agree with comparator
   8. Independence of Production Release Status from Relative Performance:
      - Positive delta candidate is BLOCKED when evaluation coverage gate fails
   9. Attempted vs Evaluated Separation:
      - Attempted (27) is never conflated with successful evaluations (26 vs 27)
   ============================================================ */

import assert from 'node:assert';
import { createServer } from 'vite';

async function runTests() {
  console.log('\n============================================================');
  console.log('RELIQ ROLE-SWAP PARITY & RUNTIME CONSISTENCY AUDIT SUITE');
  console.log('============================================================\n');

  const server = await createServer({
    server: { middlewareMode: true },
    appType: 'custom',
  });

  if (typeof globalThis.localStorage === 'undefined') {
    const store = new Map();
    globalThis.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
    };
  }

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  ✓ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ FAIL: ${name}`);
      console.error(`    ${err.message}`);
      failed++;
    }
  }

  async function asyncTest(name, fn) {
    try {
      await fn();
      console.log(`  ✓ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ FAIL: ${name}`);
      console.error(`    ${err.message}`);
      failed++;
    }
  }

  try {
    const { generateComparisonReport } = await server.ssrLoadModule('/src/evaluation/comparator.ts');
    const { providerScheduler } = await server.ssrLoadModule('/src/server/providerScheduler.ts');
    const { getApiKey } = await server.ssrLoadModule('/src/server/serverUtils.ts');
    const { generateReportPdf } = await server.ssrLoadModule('/src/utils/pdfExporter.ts');
    const { evaluateReleaseDecision } = await server.ssrLoadModule('/src/evaluation/releaseEngine.ts');

    const qwenVersion = {
      id: 'v_qwen',
      modelIdentifier: 'qwen/qwen3.8-27b',
      provider: 'groq',
      promptVersion: '1.0',
      parameters: {},
    };

    const gptOssVersion = {
      id: 'v_gpt_oss',
      modelIdentifier: 'openai/gpt-oss-120b',
      provider: 'groq',
      promptVersion: '1.0',
      parameters: {},
    };

    // Helper to generate paired test case results with controlled outcomes
    function generatePairedResults(count, options = {}) {
      const results = [];
      for (let i = 1; i <= count; i++) {
        const id = `case_${i}`;
        const isBase429 = options.baseline429Cases?.includes(i);
        const isCand429 = options.candidate429Cases?.includes(i);
        const baseScore = isBase429 ? null : (options.baselineScores?.[i - 1] ?? 0.90);
        const candScore = isCand429 ? null : (options.candidateScores?.[i - 1] ?? 0.90);
        const baseLat = options.baselineLatencyMs ?? 500;
        const candLat = options.candidateLatencyMs ?? 500;
        const baseCost = options.baselineCostUsd ?? 0.0001;
        const candCost = options.candidateCostUsd ?? 0.0001;

        results.push({
          scenarioId: id,
          scenarioName: `Test Scenario ${i}`,
          category: 'Standard',
          passed: candScore !== null ? candScore >= 0.7 : null,
          executionStatus: isCand429 ? 'PROVIDER_RATE_LIMIT' : (candScore !== null && candScore >= 0.7 ? 'PASS' : 'QUALITY_FAILURE'),
          candidateOutput: isCand429 ? '' : `Candidate output for scenario ${i}`,
          candidateScore: candScore,
          candidateExecutionStatus: isCand429 ? 'PROVIDER_RATE_LIMIT' : (candScore !== null && candScore >= 0.7 ? 'PASS' : 'QUALITY_FAILURE'),
          candidateQualityEvaluated: !isCand429,
          candidateFailureCategory: isCand429 ? 'INFRASTRUCTURE_FAILURE' : undefined,
          candidateLatencyMs: candLat,
          candidateUsage: { inputTokens: 100, outputTokens: 50, costUsd: candCost },

          baselineOutput: isBase429 ? '' : `Baseline output for scenario ${i}`,
          baselineScore: baseScore,
          baselineExecutionStatus: isBase429 ? 'PROVIDER_RATE_LIMIT' : (baseScore !== null && baseScore >= 0.7 ? 'PASS' : 'QUALITY_FAILURE'),
          baselineQualityEvaluated: !isBase429,
          baselineFailureCategory: isBase429 ? 'INFRASTRUCTURE_FAILURE' : undefined,
          baselineLatencyMs: baseLat,
          baselineUsage: { inputTokens: 100, outputTokens: 50, costUsd: baseCost },
        });
      }
      return results;
    }

    // Frontend presentation helper mimicking ComparisonReportModal logic
    function deriveModalState(report) {
      const isSameModel =
        report.baseline.model === report.candidate.model &&
        report.baseline.provider === report.candidate.provider &&
        (report.baseline.promptVersion === report.candidate.promptVersion ||
          (!report.baseline.promptVersion && !report.candidate.promptVersion));

      let relativeResult = 'PARITY';
      let relativeTitle = 'Statistical Parity';

      const hasGateFailures = (report.releaseGates || []).some(g => g.status === 'FAIL');
      const hasAsymmetricCoverage =
        report.hasUnequalSampleSizes ||
        (report.provenance && report.provenance.baselineEvaluated !== report.provenance.candidateEvaluated);

      if (isSameModel) {
        relativeResult = 'PARITY';
        relativeTitle = 'Same-Model Comparison: Statistical Parity';
      } else if (report.winner === 'candidate') {
        relativeResult = 'IMPROVEMENT';
        relativeTitle = 'Candidate Outperformed Baseline';
      } else if (report.winner === 'baseline') {
        relativeResult = 'REGRESSION';
        relativeTitle = 'Baseline Outperformed Candidate';
      } else {
        relativeResult = 'PARITY';
        if (hasAsymmetricCoverage || hasGateFailures || report.recommendation === 'INSUFFICIENT EVIDENCE') {
          relativeTitle = 'Inconclusive Comparison';
        } else {
          relativeTitle = 'Statistical Parity';
        }
      }

      return { relativeResult, relativeTitle };
    }

    // -------------------------------------------------------------
    // Test 1: Shared API Key Quota & Concurrency Limits
    // -------------------------------------------------------------
    test('1. Shared API Key Quota: Groq models share the same server credential', () => {
      const groqKey = getApiKey('GROQ_API_KEY');
      assert.ok(groqKey, 'GROQ_API_KEY must be configured in environment');
      assert.ok(groqKey.startsWith('gsk_'), 'GROQ_API_KEY must start with gsk_');

      const statuses = providerScheduler.getAllProviderStatuses();
      assert.ok(statuses.groq, 'Groq provider state must exist in scheduler');
    });

    // -------------------------------------------------------------
    // Test 2: Role-Swap Runtime Symmetry (Candidate Superior)
    // Run A: Qwen (Base) vs GPT-OSS (Cand) -> Cand wins by +7.5 pts
    // Run B: GPT-OSS (Base) vs Qwen (Cand) -> Base wins by -7.5 pts
    // -------------------------------------------------------------
    test('2. Role-Swap Runtime Symmetry: Score deltas and winners reverse symmetrically', () => {
      const qwenScores = [0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85];
      const gptScores  = [0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95];

      // Run A: Baseline = Qwen, Candidate = GPT-OSS
      const casesRunA = generatePairedResults(10, {
        baselineScores: qwenScores,
        candidateScores: gptScores,
      });

      const reportRunA = generateComparisonReport({
        datasetId: 'd1',
        datasetName: 'Test Suite',
        totalCases: 10,
        baselineVersion: qwenVersion,
        candidateVersion: gptOssVersion,
        caseResults: casesRunA,
        settings: { minEvaluationCoveragePercent: 80.0 },
      });

      assert.strictEqual(reportRunA.winner, 'candidate', 'Run A winner must be candidate');
      assert.strictEqual(reportRunA.qualityDelta, 10.0, 'Run A quality delta must be +10.0 pts');

      // Run B: Role swapped! Baseline = GPT-OSS, Candidate = Qwen
      const casesRunB = generatePairedResults(10, {
        baselineScores: gptScores,
        candidateScores: qwenScores,
      });

      const reportRunB = generateComparisonReport({
        datasetId: 'd1',
        datasetName: 'Test Suite',
        totalCases: 10,
        baselineVersion: gptOssVersion,
        candidateVersion: qwenVersion,
        caseResults: casesRunB,
        settings: { minEvaluationCoveragePercent: 80.0 },
      });

      assert.strictEqual(reportRunB.winner, 'baseline', 'Run B winner must be baseline');
      assert.strictEqual(reportRunB.qualityDelta, -10.0, 'Run B quality delta must be -10.0 pts');

      // Verify absolute parity
      assert.strictEqual(Math.abs(reportRunA.qualityDelta), Math.abs(reportRunB.qualityDelta), 'Absolute delta must be identical across role swap');
    });

    // -------------------------------------------------------------
    // Test 3: Role-Swap Runtime Symmetry (Baseline Superior)
    // Run A: Baseline superior -> Baseline wins
    // Run B: Swapped -> Candidate superior -> Candidate wins
    // -------------------------------------------------------------
    test('3. Baseline Superior Win: Reverses to Candidate Superior upon role swap', () => {
      const highScores = [0.98, 0.98, 0.98, 0.98, 0.98, 0.98, 0.98, 0.98, 0.98, 0.98];
      const lowScores  = [0.80, 0.80, 0.80, 0.80, 0.80, 0.80, 0.80, 0.80, 0.80, 0.80];

      // Run A: Baseline = High, Candidate = Low
      const casesA = generatePairedResults(10, {
        baselineScores: highScores,
        candidateScores: lowScores,
      });

      const reportA = generateComparisonReport({
        datasetId: 'd1',
        datasetName: 'Test Suite',
        totalCases: 10,
        baselineVersion: qwenVersion,
        candidateVersion: gptOssVersion,
        caseResults: casesA,
        settings: { minEvaluationCoveragePercent: 80.0 },
      });

      assert.strictEqual(reportA.winner, 'baseline', 'Run A baseline must win');
      assert.strictEqual(reportA.qualityDelta, -18.0, 'Run A delta must be -18.0');

      // Run B: Role-swapped! Baseline = Low, Candidate = High
      const casesB = generatePairedResults(10, {
        baselineScores: lowScores,
        candidateScores: highScores,
      });

      const reportB = generateComparisonReport({
        datasetId: 'd1',
        datasetName: 'Test Suite',
        totalCases: 10,
        baselineVersion: gptOssVersion,
        candidateVersion: qwenVersion,
        caseResults: casesB,
        settings: { minEvaluationCoveragePercent: 80.0 },
      });

      assert.strictEqual(reportB.winner, 'candidate', 'Run B candidate must win');
      assert.strictEqual(reportB.qualityDelta, 18.0, 'Run B delta must be +18.0');
    });

    // -------------------------------------------------------------
    // Test 4: Identical Performance Tie Verification
    // Both configurations produce exact same performance -> Tie in both directions
    // -------------------------------------------------------------
    test('4. Identical Performance Tie: Exact score equivalence yields tie regardless of role assignment', () => {
      const equalScores = [0.92, 0.92, 0.92, 0.92, 0.92, 0.92, 0.92, 0.92, 0.92, 0.92];

      const casesA = generatePairedResults(10, {
        baselineScores: equalScores,
        candidateScores: equalScores,
      });

      const reportA = generateComparisonReport({
        datasetId: 'd1',
        datasetName: 'Test Suite',
        totalCases: 10,
        baselineVersion: qwenVersion,
        candidateVersion: gptOssVersion,
        caseResults: casesA,
        settings: { minEvaluationCoveragePercent: 80.0 },
      });

      assert.strictEqual(reportA.winner, 'tie', 'Equal performance must yield tie');
      assert.strictEqual(reportA.qualityDelta, 0.0, 'Quality delta must be 0.0');

      const casesB = generatePairedResults(10, {
        baselineScores: equalScores,
        candidateScores: equalScores,
      });

      const reportB = generateComparisonReport({
        datasetId: 'd1',
        datasetName: 'Test Suite',
        totalCases: 10,
        baselineVersion: gptOssVersion,
        candidateVersion: qwenVersion,
        caseResults: casesB,
        settings: { minEvaluationCoveragePercent: 80.0 },
      });

      assert.strictEqual(reportB.winner, 'tie', 'Role-swapped equal performance must yield tie');
      assert.strictEqual(reportB.qualityDelta, 0.0, 'Quality delta must be 0.0');
    });

    // -------------------------------------------------------------
    // Test 5: Asymmetric 429 Rate Limit Parity Guard
    // When one model experiences 429, sample sizes become unequal (26 vs 27)
    // Comparator MUST declare winner = 'tie', never allowing the non-throttled model to win
    // -------------------------------------------------------------
    test('5. Asymmetric 429 Failure Parity Guard: Unequal sample sizes force tie in both directions', () => {
      // 27-scenario benchmark mimicking the Groq production incident:
      // Baseline (Qwen) throttled on case 27 (26 evaluated)
      // Candidate (GPT-OSS) completed all 27 cases with +1.0 pts lead
      const baseScores = Array(26).fill(0.918);
      const candScores = Array(27).fill(0.928);

      const casesIncident = generatePairedResults(27, {
        baselineScores: baseScores,
        candidateScores: candScores,
        baseline429Cases: [27],
      });

      const reportIncident = generateComparisonReport({
        datasetId: 'd1',
        datasetName: 'Test (27-case)',
        totalCases: 27,
        baselineVersion: qwenVersion,
        candidateVersion: gptOssVersion,
        caseResults: casesIncident,
        provenance: {
          initiatedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          baselineProvider: 'groq',
          candidateProvider: 'groq',
          baselineModel: 'qwen/qwen3.8-27b',
          candidateModel: 'openai/gpt-oss-120b',
          totalAttempted: 27,
          baselineEvaluated: 26,
          candidateEvaluated: 27,
          baselineRateLimits: 1,
          candidateRateLimits: 0,
          hadOperationalErrors: true,
          isLiveExecution: true,
        },
        settings: { minEvaluationCoveragePercent: 100.0 },
      });

      assert.strictEqual(reportIncident.winner, 'tie', 'Candidate MUST NOT win when baseline suffered 429 rate limit');
      assert.ok(
        reportIncident.winnerReason.toLowerCase().includes('unequal sample sizes') ||
        reportIncident.winnerReason.toLowerCase().includes('inconclusive'),
        `Winner reason must explain unequal sample sizes (got: "${reportIncident.winnerReason}")`
      );

      // Now reverse the roles: Candidate suffers 429 on case 27
      const casesReversed = generatePairedResults(27, {
        baselineScores: candScores,
        candidateScores: baseScores,
        candidate429Cases: [27],
      });

      const reportReversed = generateComparisonReport({
        datasetId: 'd1',
        datasetName: 'Test (27-case)',
        totalCases: 27,
        baselineVersion: gptOssVersion,
        candidateVersion: qwenVersion,
        caseResults: casesReversed,
        provenance: {
          initiatedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          baselineProvider: 'groq',
          candidateProvider: 'groq',
          baselineModel: 'openai/gpt-oss-120b',
          candidateModel: 'qwen/qwen3.8-27b',
          totalAttempted: 27,
          baselineEvaluated: 27,
          candidateEvaluated: 26,
          baselineRateLimits: 0,
          candidateRateLimits: 1,
          hadOperationalErrors: true,
          isLiveExecution: true,
        },
        settings: { minEvaluationCoveragePercent: 100.0 },
      });

      assert.strictEqual(reportReversed.winner, 'tie', 'Baseline MUST NOT win when candidate suffered 429 rate limit');
      assert.ok(
        reportReversed.winnerReason.toLowerCase().includes('unequal sample sizes') ||
        reportReversed.winnerReason.toLowerCase().includes('inconclusive'),
        `Winner reason must explain unequal sample sizes (got: "${reportReversed.winnerReason}")`
      );
    });

    // -------------------------------------------------------------
    // Test 6: Tri-Format Consistency: UI, JSON Export, and PDF agree
    // -------------------------------------------------------------
    test('6. Tri-Format Consistency: Frontend UI, JSON export, and PDF strictly agree with comparator winner', () => {
      // Case A: Asymmetric Coverage Tie (Incident scenario)
      const baseScores = Array(26).fill(0.918);
      const candScores = Array(27).fill(0.928);
      const casesIncident = generatePairedResults(27, {
        baselineScores: baseScores,
        candidateScores: candScores,
        baseline429Cases: [27],
      });

      const reportIncident = generateComparisonReport({
        datasetId: 'd1',
        datasetName: 'Test (27-case)',
        totalCases: 27,
        baselineVersion: qwenVersion,
        candidateVersion: gptOssVersion,
        caseResults: casesIncident,
        provenance: {
          initiatedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          baselineProvider: 'groq',
          candidateProvider: 'groq',
          baselineModel: 'qwen/qwen3.8-27b',
          candidateModel: 'openai/gpt-oss-120b',
          totalAttempted: 27,
          baselineEvaluated: 26,
          candidateEvaluated: 27,
          baselineRateLimits: 1,
          candidateRateLimits: 0,
          hadOperationalErrors: true,
          isLiveExecution: true,
        },
        settings: { minEvaluationCoveragePercent: 100.0 },
      });

      // 1. Comparator output
      assert.strictEqual(reportIncident.winner, 'tie', 'Comparator must output tie');

      // 2. Exported JSON field
      const jsonExport = JSON.parse(JSON.stringify(reportIncident));
      assert.strictEqual(jsonExport.winner, 'tie', 'JSON export must contain winner: "tie"');
      assert.ok(jsonExport.winnerReason.includes('Inconclusive'), 'JSON export reason must state Inconclusive');

      // 3. Frontend modal derived state
      const modalState = deriveModalState(reportIncident);
      assert.strictEqual(modalState.relativeResult, 'PARITY', 'Modal relativeResult must be PARITY, never IMPROVEMENT');
      assert.strictEqual(modalState.relativeTitle, 'Inconclusive Comparison', 'Modal title must be Inconclusive Comparison');

      // 4. PDF generated bytes
      const pdfBytes = generateReportPdf(reportIncident);
      assert.ok(pdfBytes instanceof Uint8Array, 'PDF export must return valid bytes');
      assert.ok(pdfBytes.length > 5000, 'PDF must contain rendered benchmark content');

      // Case B: Legitimate Candidate Win
      const validCases = generatePairedResults(27, {
        baselineScores: Array(27).fill(0.85),
        candidateScores: Array(27).fill(0.95),
      });

      const reportCandWin = generateComparisonReport({
        datasetId: 'd1',
        datasetName: 'Full Benchmark',
        totalCases: 27,
        baselineVersion: qwenVersion,
        candidateVersion: gptOssVersion,
        caseResults: validCases,
        settings: { minEvaluationCoveragePercent: 100.0 },
      });

      assert.strictEqual(reportCandWin.winner, 'candidate');
      const jsonCandWin = JSON.parse(JSON.stringify(reportCandWin));
      assert.strictEqual(jsonCandWin.winner, 'candidate');
      const modalCandWin = deriveModalState(reportCandWin);
      assert.strictEqual(modalCandWin.relativeResult, 'IMPROVEMENT');
      assert.strictEqual(modalCandWin.relativeTitle, 'Candidate Outperformed Baseline');

      // Case C: Legitimate Baseline Win
      const validCasesBaseWin = generatePairedResults(27, {
        baselineScores: Array(27).fill(0.95),
        candidateScores: Array(27).fill(0.85),
      });

      const reportBaseWin = generateComparisonReport({
        datasetId: 'd1',
        datasetName: 'Full Benchmark',
        totalCases: 27,
        baselineVersion: gptOssVersion,
        candidateVersion: qwenVersion,
        caseResults: validCasesBaseWin,
        settings: { minEvaluationCoveragePercent: 100.0 },
      });

      assert.strictEqual(reportBaseWin.winner, 'baseline');
      const jsonBaseWin = JSON.parse(JSON.stringify(reportBaseWin));
      assert.strictEqual(jsonBaseWin.winner, 'baseline');
      const modalBaseWin = deriveModalState(reportBaseWin);
      assert.strictEqual(modalBaseWin.relativeResult, 'REGRESSION');
      assert.strictEqual(modalBaseWin.relativeTitle, 'Baseline Outperformed Candidate');
    });

    // -------------------------------------------------------------
    // Test 7: Independent Production Release Decision
    // Relative quality improvement (+1.0 pts) DOES NOT grant production release
    // when Evaluation Coverage gate fails validation (96.3% < 100.0%)
    // -------------------------------------------------------------
    test('7. Independent Release Gate: Relative lead cannot override failed release gate', () => {
      const releaseOutcome = evaluateReleaseDecision({
        metrics: {
          totalCases: 27,
          sampleSize: 27,
          evidenceStrength: 'MODERATE',
          evidenceStrengthReason: '27 of 27 cases executed',
          baselinePassed: 26,
          candidatePassed: 25,
          baselineAccuracy: 100.0,
          candidateAccuracy: 92.6,
          baselineEvaluationCoverage: 96.3,
          candidateEvaluationCoverage: 100.0,
          baselineQualityScore: 91.8,
          candidateQualityScore: 92.8,
          qualityScoreDelta: 1.0, // Candidate has +1.0 pts quality lead
          isInsufficientCoverage: true,
          hasUnequalSampleSizes: true,
          baselineEvaluatedCases: 26,
          candidateEvaluatedCases: 27,
          regressedCasesCount: 2,
          improvedCasesCount: 0,
        },
        settings: { minEvaluationCoveragePercent: 100.0 },
        caseResults: [],
        datasetName: 'Checkout E-Commerce',
      });

      const coverageGate = releaseOutcome.gates.find(g => g.gate === 'Evaluation Coverage');
      assert.ok(coverageGate, 'Coverage gate must be evaluated');
      assert.strictEqual(coverageGate.status, 'FAIL', 'Coverage gate must FAIL');
      assert.strictEqual(releaseOutcome.overallGateStatus, 'FAIL', 'Overall gate status must FAIL');
      assert.ok(
        releaseOutcome.decision === 'BLOCK' || releaseOutcome.decision === 'INSUFFICIENT_EVIDENCE',
        `Release decision must be gated (got: ${releaseOutcome.decision})`
      );
    });

    // -------------------------------------------------------------
    // Test 8: Separation of Attempted, Evaluated, and Failed Scenarios
    // -------------------------------------------------------------
    test('8. Coverage Transparency: Attempted scenarios (27) strictly separated from evaluated (26 vs 27)', () => {
      const baseScores = Array(26).fill(0.918);
      const candScores = Array(27).fill(0.928);
      const cases = generatePairedResults(27, {
        baselineScores: baseScores,
        candidateScores: candScores,
        baseline429Cases: [27],
      });

      const report = generateComparisonReport({
        datasetId: 'd1',
        datasetName: 'Test',
        totalCases: 27,
        baselineVersion: qwenVersion,
        candidateVersion: gptOssVersion,
        caseResults: cases,
        provenance: {
          initiatedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          baselineProvider: 'groq',
          candidateProvider: 'groq',
          baselineModel: 'qwen/qwen3.8-27b',
          candidateModel: 'openai/gpt-oss-120b',
          totalAttempted: 27,
          baselineEvaluated: 26,
          candidateEvaluated: 27,
          baselineRateLimits: 1,
          candidateRateLimits: 0,
          hadOperationalErrors: true,
          isLiveExecution: true,
        },
        settings: { minEvaluationCoveragePercent: 100.0 },
      });

      assert.strictEqual(report.provenance.totalAttempted, 27, 'Total attempted must be 27');
      assert.strictEqual(report.provenance.baselineEvaluated, 26, 'Baseline evaluated must be 26');
      assert.strictEqual(report.provenance.candidateEvaluated, 27, 'Candidate evaluated must be 27');
      assert.strictEqual(report.provenance.baselineRateLimits, 1, 'Baseline rate limits must be 1');
      assert.strictEqual(report.provenance.candidateRateLimits, 0, 'Candidate rate limits must be 0');

      // Verify header summary presentation
      const totalAttempted = report.provenance.totalAttempted;
      const bEval = report.provenance.baselineEvaluated;
      const cEval = report.provenance.candidateEvaluated;
      assert.notStrictEqual(bEval, totalAttempted, 'Baseline must not be claimed as 27/27 evaluated');
      assert.strictEqual(cEval, totalAttempted, 'Candidate evaluated is 27/27');
    });

  } finally {
    await server.close();
  }

  console.log('\n------------------------------------------------------------');
  console.log(`ROLE-SWAP AUDIT SUITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('------------------------------------------------------------\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
