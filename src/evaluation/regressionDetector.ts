/* ============================================================
   RELIQ — Regression Detection Engine
   
   Evaluates aggregate metrics against configurable thresholds
   to determine whether a candidate release contains regressions.
   ============================================================ */

import { MetricSummary, RegressionDecision, RegressionSettings } from '../domain/types';
import { evaluateReleaseDecision } from './releaseEngine';

export const DEFAULT_REGRESSION_SETTINGS: RegressionSettings = {
  minAccuracyPercent: 95.0,
  maxAccuracyDegradationPercent: 2.0,
  maxLatencyIncreasePercent: 20.0,
  maxFailureRatePercent: 5.0,
  minEvaluationCoveragePercent: 80.0,
};

/**
 * Calculates whether an evaluation run constitutes a regression
 * based on canonical Engine V2 rules and thresholds.
 */
export function detectRegression(
  metrics: MetricSummary,
  settings: RegressionSettings = DEFAULT_REGRESSION_SETTINGS
): RegressionDecision {
  const outcome = evaluateReleaseDecision({ metrics, settings });

  let verdict: 'REGRESSION_DETECTED' | 'NO_REGRESSION' | 'INSUFFICIENT_EVIDENCE';
  if (outcome.decision === 'INSUFFICIENT_EVIDENCE') {
    verdict = 'INSUFFICIENT_EVIDENCE';
  } else if (outcome.decision === 'BLOCK') {
    verdict = outcome.isRegression ? 'REGRESSION_DETECTED' : 'INSUFFICIENT_EVIDENCE';
  } else if (outcome.decision === 'REGRESSION_DETECTED') {
    verdict = 'REGRESSION_DETECTED';
  } else {
    verdict = 'NO_REGRESSION';
  }

  return {
    isRegression: outcome.isRegression,
    verdict,
    summary: outcome.summary,
    violatedRules: outcome.violatedRules,
    regressionCategories: outcome.regressionCategories,
  };
}
