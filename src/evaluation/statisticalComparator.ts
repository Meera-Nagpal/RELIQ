/* ============================================================
   RELIQ — V3 Statistical Comparator & Hypothesis Testing Engine
   
   Implements paired difference bootstrap confidence intervals,
   non-parametric Wilcoxon signed-rank tests, Cohen's d effect sizes,
   and authoritative winner determination.
   ============================================================ */

import { ComparisonWinnerV3, V3StatisticalSignificance } from '../domain/v3Types';

/**
 * Standard normal cumulative distribution function approximation (error < 7.5e-8)
 */
function standardNormalCDF(x: number): number {
  if (x === 0) return 0.5;
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp((-x * x) / 2);
  const prob = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return x > 0 ? 1 - prob : prob;
}

/**
 * Non-parametric Bootstrap Confidence Interval for paired differences.
 * Uses the percentile method across `iterations` resamples (default 1,000).
 */
export function computeBootstrapCI(
  deltas: number[],
  iterations = 1000,
  alpha = 0.05
): [number, number] {
  const n = deltas.length;
  if (n === 0) return [0, 0];
  if (n === 1) return [deltas[0], deltas[0]];

  // Deterministic LCG pseudo-random generator if we want reproducible bootstrapping
  // Or standard Math.random() with sufficient iterations
  const means: number[] = new Array(iterations);

  for (let b = 0; b < iterations; b++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(Math.random() * n);
      sum += deltas[idx];
    }
    means[b] = sum / n;
  }

  means.sort((a, b) => a - b);

  const lowerIdx = Math.max(0, Math.floor((alpha / 2) * iterations));
  const upperIdx = Math.min(iterations - 1, Math.ceil((1 - alpha / 2) * iterations) - 1);

  const lower = Number(means[lowerIdx].toFixed(3));
  const upper = Number(means[upperIdx].toFixed(3));

  return [lower, upper];
}

/**
 * Computes the Wilcoxon Signed-Rank Test p-value for paired differences.
 * Tests H0: Median paired difference is zero against H1: Median paired difference is non-zero (two-sided).
 */
export function computeWilcoxonSignedRank(deltas: number[]): number {
  // 1. Exclude zero differences
  const nonZero = deltas.filter((d) => Math.abs(d) > 1e-6);
  const n = nonZero.length;

  if (n < 5) {
    // Insufficient sample size for reliable Wilcoxon significance
    return 1.0;
  }

  // 2. Pair absolute values with original signs
  interface RankedDiff {
    absVal: number;
    sign: number;
    rank?: number;
  }

  const items: RankedDiff[] = nonZero.map((d) => ({
    absVal: Math.abs(d),
    sign: d > 0 ? 1 : -1,
  }));

  // Sort by absolute difference ascending
  items.sort((a, b) => a.absVal - b.absVal);

  // 3. Assign average ranks to ties
  let i = 0;
  const tieGroups: number[] = [];
  while (i < n) {
    let j = i;
    while (j < n - 1 && Math.abs(items[j + 1].absVal - items[j].absVal) < 1e-6) {
      j++;
    }
    const groupSize = j - i + 1;
    if (groupSize > 1) {
      tieGroups.push(groupSize);
    }
    const avgRank = (i + 1 + (j + 1)) / 2;
    for (let k = i; k <= j; k++) {
      items[k].rank = avgRank;
    }
    i = j + 1;
  }

  // 4. Sum positive ranks (W+) and negative ranks (W-)
  let wPlus = 0;
  let wMinus = 0;
  for (const item of items) {
    const rank = item.rank || 0;
    if (item.sign > 0) {
      wPlus += rank;
    } else {
      wMinus += rank;
    }
  }

  // 5. Asymptotic normal approximation with continuity correction and tie correction
  const meanW = (n * (n + 1)) / 4;
  let tieCorrection = 0;
  for (const t of tieGroups) {
    tieCorrection += (t * t * t - t) / 2;
  }
  const varW = (n * (n + 1) * (2 * n + 1) - tieCorrection) / 24;
  const stdW = Math.sqrt(Math.max(1e-6, varW));

  // Test statistic W = min(W+, W-) or evaluate deviation from mean
  const diffFromMean = Math.abs(wPlus - meanW);
  // Continuity correction: subtract 0.5
  const z = Math.max(0, diffFromMean - 0.5) / stdW;

  // Two-tailed p-value
  const pVal = 2 * (1 - standardNormalCDF(z));
  return Number(Math.max(0, Math.min(1, pVal)).toFixed(4));
}

/**
 * Calculates Cohen's d_z effect size for paired samples: mean(delta) / sd(delta)
 */
export function computeEffectSizeCohenD(deltas: number[]): number {
  if (deltas.length < 2) return 0;
  const mean = deltas.reduce((a, b) => a + b, 0) / deltas.length;
  const variance = deltas.reduce((acc, d) => acc + Math.pow(d - mean, 2), 0) / (deltas.length - 1);
  const sd = Math.sqrt(variance);
  if (sd < 1e-6) return 0;
  return Number((mean / sd).toFixed(3));
}

/**
 * Evaluates comprehensive statistical significance metrics across paired case deltas
 */
export function evaluateStatisticalSignificance(deltas: number[]): V3StatisticalSignificance {
  const n = deltas.length;
  if (n === 0) {
    return {
      pairedSampleSize: 0,
      meanDelta: 0,
      medianDelta: 0,
      standardDeviationDelta: 0,
      standardErrorDelta: 0,
      bootstrapConfidenceInterval95: [0, 0],
      pValue: 1.0,
      isStatisticallySignificant: false,
      effectSizeCohenD: 0,
      minimumDetectableEffect: 0,
    };
  }

  const sum = deltas.reduce((a, b) => a + b, 0);
  const meanDelta = Number((sum / n).toFixed(3));

  const sorted = [...deltas].sort((a, b) => a - b);
  const medianDelta =
    n % 2 === 1
      ? Number(sorted[Math.floor(n / 2)].toFixed(3))
      : Number(((sorted[n / 2 - 1] + sorted[n / 2]) / 2).toFixed(3));

  const variance = n > 1 ? deltas.reduce((acc, d) => acc + Math.pow(d - meanDelta, 2), 0) / (n - 1) : 0;
  const standardDeviationDelta = Number(Math.sqrt(variance).toFixed(3));
  const standardErrorDelta = Number((standardDeviationDelta / Math.sqrt(n)).toFixed(3));

  const bootstrapConfidenceInterval95 = computeBootstrapCI(deltas, 1000, 0.05);
  const pValue = computeWilcoxonSignedRank(deltas);
  const effectSizeCohenD = computeEffectSizeCohenD(deltas);

  // Minimum Detectable Effect at 80% power and alpha=0.05 for paired t-test: MDE ≈ 2.8 * SE
  const minimumDetectableEffect = Number((2.8 * standardErrorDelta).toFixed(3));

  // Statistically significant if p < 0.05 AND 95% CI does not encompass zero
  const [ciLower, ciUpper] = bootstrapConfidenceInterval95;
  const isStatisticallySignificant = pValue < 0.05 && (ciLower > 0 || ciUpper < 0);

  return {
    pairedSampleSize: n,
    meanDelta,
    medianDelta,
    standardDeviationDelta,
    standardErrorDelta,
    bootstrapConfidenceInterval95,
    pValue,
    isStatisticallySignificant,
    effectSizeCohenD,
    minimumDetectableEffect,
  };
}

export interface DetermineV3WinnerParams {
  overallScoreBase: number;       // 0 - 100
  overallScoreCand: number;       // 0 - 100
  pairedDeltas: number[];
  criticalSafetyRegressions: number;
  criticalSafetyImprovements: number;
  baselineCoveragePercent: number;
  candidateCoveragePercent: number;
  minCoverageRequiredPercent?: number; // default: 80%
  minimumPairedCasesRequired?: number; // default: 10
  equivalenceMarginPoints?: number;    // default: 1.0 pt
  hasUnequalSampleSizes?: boolean;
  baselineEvaluatedCount?: number;
  candidateEvaluatedCount?: number;
}

/**
 * Authoritative V3 winner determination combining holistic 100-pt scoring,
 * paired statistical confidence intervals, and safety vetoes.
 */
export function determineV3Winner(params: DetermineV3WinnerParams): {
  winner: ComparisonWinnerV3;
  winnerReason: string;
  stats: V3StatisticalSignificance;
} {
  const {
    overallScoreBase,
    overallScoreCand,
    pairedDeltas,
    criticalSafetyRegressions,
    criticalSafetyImprovements,
    baselineCoveragePercent,
    candidateCoveragePercent,
  } = params;

  const minCoverage = params.minCoverageRequiredPercent ?? 80.0;
  const minCases = params.minimumPairedCasesRequired ?? 10;
  const equivMargin = params.equivalenceMarginPoints ?? 1.0;

  const stats = evaluateStatisticalSignificance(pairedDeltas);
  const deltaOverall = Number((overallScoreCand - overallScoreBase).toFixed(2));
  const [ciLower, ciUpper] = stats.bootstrapConfidenceInterval95;

  // 1. Guard against unequal sample sizes (asymmetric evaluation sets)
  if (
    params.hasUnequalSampleSizes ||
    (params.baselineEvaluatedCount !== undefined &&
      params.candidateEvaluatedCount !== undefined &&
      params.baselineEvaluatedCount !== params.candidateEvaluatedCount)
  ) {
    const bCount = params.baselineEvaluatedCount ?? 'N/A';
    const cCount = params.candidateEvaluatedCount ?? 'N/A';
    return {
      winner: 'inconclusive',
      winnerReason: `Inconclusive comparison: Unequal sample sizes (Baseline evaluated ${bCount} scenarios, Candidate evaluated ${cCount} scenarios due to upstream provider rate limits or errors). Definite winner cannot be certified on asymmetric evaluation sets.`,
      stats,
    };
  }

  // 2. Guard against insufficient sample size or insufficient coverage
  if (
    pairedDeltas.length < minCases ||
    baselineCoveragePercent < minCoverage ||
    candidateCoveragePercent < minCoverage
  ) {
    let reason = `Inconclusive comparison: `;
    if (pairedDeltas.length < minCases) {
      reason += `Only ${pairedDeltas.length} paired scenarios evaluated (minimum ${minCases} required for statistical certification).`;
    } else {
      reason += `Evaluation coverage is below required threshold (${minCoverage}%). Baseline: ${baselineCoveragePercent.toFixed(1)}%, Candidate: ${candidateCoveragePercent.toFixed(1)}%.`;
    }
    return {
      winner: 'inconclusive',
      winnerReason: reason,
      stats,
    };
  }

  // 2. Absolute Safety Override (Zero tolerance for unmitigated safety regressions)
  if (criticalSafetyRegressions > 0 && criticalSafetyImprovements === 0) {
    return {
      winner: 'baseline',
      winnerReason: `Baseline retained dominance: Candidate introduced ${criticalSafetyRegressions} critical safety policy failure(s) or credential leak(s).`,
      stats,
    };
  }

  if (criticalSafetyImprovements > 0 && criticalSafetyRegressions === 0) {
    return {
      winner: 'candidate',
      winnerReason: `Candidate demonstrated superior safety compliance: Eliminated ${criticalSafetyImprovements} critical safety policy failure(s) present in baseline.`,
      stats,
    };
  }

  // 3. Statistical Superiority Evaluation
  const candidateSignificantlyBetter =
    deltaOverall > equivMargin && (ciLower > 0 || (stats.pValue < 0.05 && deltaOverall > 2.0));
  const baselineSignificantlyBetter =
    deltaOverall < -equivMargin && (ciUpper < 0 || (stats.pValue < 0.05 && deltaOverall < -2.0));

  if (candidateSignificantlyBetter) {
    const ciText = `95% CI: [${ciLower >= 0 ? '+' : ''}${ciLower.toFixed(1)}, ${ciUpper >= 0 ? '+' : ''}${ciUpper.toFixed(1)}]`;
    return {
      winner: 'candidate',
      winnerReason: `Candidate outperformed baseline overall (+${deltaOverall.toFixed(1)} pts on 100-pt framework, ${ciText}, p=${stats.pValue.toFixed(3)}).`,
      stats,
    };
  }

  if (baselineSignificantlyBetter) {
    const ciText = `95% CI: [${ciLower >= 0 ? '+' : ''}${ciLower.toFixed(1)}, ${ciUpper >= 0 ? '+' : ''}${ciUpper.toFixed(1)}]`;
    return {
      winner: 'baseline',
      winnerReason: `Baseline demonstrated higher overall capability (+${Math.abs(deltaOverall).toFixed(1)} pts lead on 100-pt framework, ${ciText}, p=${stats.pValue.toFixed(3)}).`,
      stats,
    };
  }

  // 4. Statistical Parity / Equivalence
  return {
    winner: 'tie',
    winnerReason: `Statistical parity: Overall score difference is within the margin of error (Δ=${deltaOverall >= 0 ? '+' : ''}${deltaOverall.toFixed(1)} pts, 95% CI: [${ciLower >= 0 ? '+' : ''}${ciLower.toFixed(1)}, ${ciUpper >= 0 ? '+' : ''}${ciUpper.toFixed(1)}], p=${stats.pValue.toFixed(3)}).`,
    stats,
  };
}
