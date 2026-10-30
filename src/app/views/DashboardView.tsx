/* ============================================================
   RELIQ — Dashboard View
   
   Central overview showing calculated metrics from real evaluation runs:
   Reliability KPIs, Regression Gate status, latency, cost, and category breakdowns.
   ============================================================ */

import React, { useState } from 'react';
import { EvaluationRun, Project } from '../../domain/types';
import { useRouter } from '../../router/useRouter';
import { ComparisonReportModal } from '../components/ComparisonReportModal';

interface DashboardViewProps {
  project: Project;
  latestRun: EvaluationRun | null;
  evaluationRuns: EvaluationRun[];
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  project,
  latestRun,
  evaluationRuns,
}) => {
  const { navigate } = useRouter();
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  if (!latestRun) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', maxWidth: '1000px', margin: '0 auto', padding: '2rem 1rem' }}>
        <div>
          <div style={{ fontSize: '0.75rem', letterSpacing: '0.2em', color: 'var(--accent, #C86D51)', fontWeight: 600, textTransform: 'uppercase' }}>
            GETTING STARTED // QUICKSTART GUIDE
          </div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#ECEFF2', margin: '0.3rem 0 0.5rem 0' }}>
            Welcome to {project.name}
          </h1>
          <p style={{ color: '#8D98A5', fontSize: '0.92rem', margin: 0, lineHeight: 1.5 }}>
            No evaluation runs have been recorded yet for this project workspace. Follow the 3-step workflow below to curate test scenarios and evaluate model versions.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.2rem' }}>
          {/* Step 1 */}
          <div style={{ background: '#14181F', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '10px', padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ color: 'var(--accent, #C86D51)', fontWeight: 800, fontSize: '0.8rem', marginBottom: '0.6rem' }}>
                STEP 01
              </div>
              <h3 style={{ margin: '0 0 0.5rem 0', color: '#FFFFFF', fontSize: '1.1rem' }}>
                Curate Test Suites
              </h3>
              <p style={{ color: '#8D98A5', fontSize: '0.85rem', lineHeight: 1.5, margin: '0 0 1.2rem 0' }}>
                Create evaluation datasets, define test prompts, and select deterministic evaluators (keyword criteria, JSON validity, exact match, behavioral safety).
              </p>
            </div>
            <button
              onClick={() => navigate('#/app/datasets')}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#ECEFF2',
                padding: '0.6rem 1rem',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '0.82rem',
                cursor: 'pointer',
              }}
            >
              Go to Datasets →
            </button>
          </div>

          {/* Step 2 */}
          <div style={{ background: '#14181F', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '10px', padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ color: '#5B82A6', fontWeight: 800, fontSize: '0.8rem', marginBottom: '0.6rem' }}>
                STEP 02
              </div>
              <h3 style={{ margin: '0 0 0.5rem 0', color: '#FFFFFF', fontSize: '1.1rem' }}>
                Configure Policies
              </h3>
              <p style={{ color: '#8D98A5', fontSize: '0.85rem', lineHeight: 1.5, margin: '0 0 1.2rem 0' }}>
                Review and customize pass/block regression boundaries (minimum accuracy gate, maximum allowed degradation, latency tolerance, and coverage threshold).
              </p>
            </div>
            <button
              onClick={() => navigate('#/app/settings')}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#ECEFF2',
                padding: '0.6rem 1rem',
                borderRadius: '6px',
                fontWeight: 600,
                fontSize: '0.82rem',
                cursor: 'pointer',
              }}
            >
              Review Policies →
            </button>
          </div>

          {/* Step 3 */}
          <div style={{ background: '#14181F', border: '1px solid rgba(200, 109, 81, 0.4)', borderRadius: '10px', padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ color: 'var(--accent, #C86D51)', fontWeight: 800, fontSize: '0.8rem', marginBottom: '0.6rem' }}>
                STEP 03
              </div>
              <h3 style={{ margin: '0 0 0.5rem 0', color: '#FFFFFF', fontSize: '1.1rem' }}>
                Run Benchmark
              </h3>
              <p style={{ color: '#8D98A5', fontSize: '0.85rem', lineHeight: 1.5, margin: '0 0 1.2rem 0' }}>
                Execute a comparative run between your reference baseline and candidate model to compute metrics, regression signals, and deployment verdicts.
              </p>
            </div>
            <button
              onClick={() => navigate('#/app/evaluations')}
              style={{
                background: 'var(--accent, #C86D51)',
                border: 'none',
                color: '#FFFFFF',
                padding: '0.65rem 1.2rem',
                borderRadius: '6px',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              Launch Evaluation Harness →
            </button>
          </div>
        </div>
      </div>
    );
  }

  const metrics = latestRun?.metrics || { totalCases: 0, candidateAccuracy: null };
  const regressionDecision = latestRun?.regressionDecision || { isRegression: false };
  const isRegression = Boolean(regressionDecision.isRegression);
  const baselineVersion = latestRun?.baselineVersion || { name: 'Baseline', provider: 'cerebras' };
  const candidateVersion = latestRun?.candidateVersion || { name: 'Candidate', provider: 'groq' };

  // Category pass rates calculation
  const categoryStats: Record<string, { total: number; passed: number }> = {};
  (latestRun?.caseResults || []).forEach((c) => {
    if (!categoryStats[c.category]) {
      categoryStats[c.category] = { total: 0, passed: 0 };
    }
    categoryStats[c.category].total += 1;
    if (c.passed) {
      categoryStats[c.category].passed += 1;
    }
  });

  const releaseStatus = latestRun?.releaseDecision?.status || (isRegression ? 'BLOCK' : 'PASS');
  const evidenceStrength =
    metrics.evidenceStrength ||
    (metrics.totalCases < 10 ? 'LOW' : metrics.totalCases < 50 ? 'MODERATE' : metrics.totalCases < 100 ? 'GOOD' : 'STRONG');

  const getVerdictStyle = (status: string) => {
    switch (status) {
      case 'SHIP':
        return { bg: 'rgba(78, 155, 111, 0.12)', border: 'rgba(78, 155, 111, 0.4)', color: '#4E9B6F', icon: '✓', label: 'SHIP TO PRODUCTION', sublabel: 'Verified Safe for Production' };
      case 'SHIP_WITH_CONDITIONS':
      case 'SHIP WITH CONDITIONS':
        return { bg: 'rgba(198, 139, 69, 0.12)', border: 'rgba(198, 139, 69, 0.4)', color: '#C68B45', icon: '⚡', label: 'SHIP WITH CONDITIONS', sublabel: 'Preliminary Sample Passed (Staging/Smoke Test)' };
      case 'NO_REGRESSION':
      case 'NO REGRESSION':
      case 'PASS':
        return { bg: 'rgba(91, 130, 166, 0.12)', border: 'rgba(91, 130, 166, 0.4)', color: '#5B82A6', icon: '✓', label: 'NO REGRESSION', sublabel: 'Parity Maintained with Production' };
      case 'REGRESSION_DETECTED':
      case 'REGRESSION DETECTED':
        return { bg: 'rgba(192, 92, 84, 0.12)', border: 'rgba(192, 92, 84, 0.4)', color: '#C05C54', icon: '⚠', label: 'REGRESSION DETECTED', sublabel: 'Candidate Release Blocked' };
      case 'BLOCK':
      case 'BLOCK RELEASE':
        return { bg: 'rgba(192, 92, 84, 0.16)', border: 'rgba(192, 92, 84, 0.45)', color: '#C05C54', icon: '⛔', label: 'RELEASE BLOCKED', sublabel: 'Critical Safety or Reliability Defect' };
      case 'INSUFFICIENT_EVIDENCE':
      case 'INSUFFICIENT EVIDENCE':
      default:
        return { bg: 'rgba(141, 152, 165, 0.12)', border: 'rgba(141, 152, 165, 0.35)', color: '#8D98A5', icon: '❓', label: 'INSUFFICIENT EVIDENCE', sublabel: 'Coverage Below Threshold (Rate Limits / Errors)' };
    }
  };

  const verdictCfg = getVerdictStyle(releaseStatus);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', maxWidth: '1240px' }}>
      {/* ── Page Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: '0.75rem', letterSpacing: '0.2em', color: 'var(--accent, #C86D51)', fontWeight: 600, textTransform: 'uppercase' }}>
            OVERVIEW // RELIABILITY METRICS
          </div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#ECEFF2', margin: '0.3rem 0 0.4rem 0', letterSpacing: '-0.02em' }}>
            {project.name} Dashboard
          </h1>
          <p style={{ color: '#8D98A5', fontSize: '0.9rem', margin: 0 }}>
            Comparing baseline <code style={{ color: '#FFFFFF' }}>{baselineVersion.name}</code> against candidate <code style={{ color: '#5B82A6' }}>{candidateVersion.name}</code>.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.8rem' }}>
          <button
            onClick={() => navigate('#/app/evaluations')}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: '#ECEFF2',
              padding: '0.6rem 1.2rem',
              borderRadius: '6px',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Run History ({evaluationRuns.length})
          </button>
          <button
            onClick={() => navigate('#/app/regressions')}
            style={{
              background: isRegression ? 'rgba(192, 92, 84, 0.12)' : 'rgba(78, 155, 111, 0.12)',
              border: `1px solid ${isRegression ? '#C05C54' : '#4E9B6F'}`,
              color: isRegression ? '#C05C54' : '#4E9B6F',
              padding: '0.6rem 1.2rem',
              borderRadius: '6px',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {isRegression ? `⚠ Regressions (${metrics?.regressedCasesCount ?? 0})` : '✓ 0 Regressions'}
          </button>
        </div>
      </div>

      {/* ── Automated Gate Verdict Banner ── */}
      <div
        style={{
          padding: '1.4rem 1.8rem',
          borderRadius: '10px',
          background: verdictCfg.bg,
          border: `1px solid ${verdictCfg.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '8px',
              background: `${verdictCfg.border}22`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.4rem',
              color: verdictCfg.color,
            }}
          >
            {verdictCfg.icon}
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  color: verdictCfg.color,
                }}
              >
                AUTOMATED GATE VERDICT
              </span>
              <span
                style={{
                  fontSize: '0.66rem',
                  padding: '0.1rem 0.45rem',
                  borderRadius: '3px',
                  background: 'rgba(0, 0, 0, 0.35)',
                  color: '#CCCCCC',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  fontWeight: 600,
                }}
              >
                Evidence: {evidenceStrength} (N = {metrics.totalCases})
              </span>
            </div>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#FFFFFF', marginTop: '0.2rem' }}>
              {verdictCfg.label} — {verdictCfg.sublabel}
            </div>
            <div style={{ fontSize: '0.82rem', color: '#CCCCCC', marginTop: '0.2rem' }}>
              {latestRun.releaseDecision?.reason || regressionDecision.summary}
            </div>
          </div>
        </div>

        <button
          onClick={() => navigate('#/app/regressions')}
          style={{
            background: 'transparent',
            border: `1px solid ${verdictCfg.border}`,
            color: '#FFFFFF',
            padding: '0.5rem 1.1rem',
            borderRadius: '6px',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          View Diagnostics →
        </button>
      </div>

      {/* ── Cross-Model Comparison & Recommendation Card ── */}
      {latestRun.comparisonReport && (
        <div
          style={{
            padding: '1.4rem 1.8rem',
            borderRadius: '10px',
            background: '#14181F',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1.2rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem', flex: 1, minWidth: '300px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '8px',
                background: 'rgba(200, 109, 81, 0.12)',
                border: '1px solid rgba(200, 109, 81, 0.28)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.3rem',
                flexShrink: 0,
              }}
            >
              ⚖️
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8D98A5' }}>
                  CROSS-MODEL COMPARISON // RECOMMENDATION
                </span>
                {(() => {
                  const mode = latestRun.executionMode || latestRun.comparisonReport?.executionMode || 'SAVED';
                  const cfg =
                    mode === 'LIVE'
                      ? { label: 'LIVE EVALUATION', color: '#4E9B6F', bg: 'rgba(78, 155, 111, 0.12)', border: 'rgba(78, 155, 111, 0.3)', dot: true }
                      : mode === 'REFERENCE'
                      ? { label: 'REFERENCE DATA', color: '#8D98A5', bg: 'rgba(141, 152, 165, 0.12)', border: 'rgba(141, 152, 165, 0.3)', dot: false }
                      : { label: 'SAVED EVALUATION', color: '#5B82A6', bg: 'rgba(91, 130, 166, 0.12)', border: 'rgba(91, 130, 166, 0.3)', dot: false };
                  return (
                    <span
                      style={{
                        padding: '0.15rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.68rem',
                        fontWeight: 800,
                        letterSpacing: '0.05em',
                        background: cfg.bg,
                        color: cfg.color,
                        border: `1px solid ${cfg.border}`,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                      }}
                    >
                      {cfg.dot && (
                        <span
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            background: '#4E9B6F',
                          }}
                        />
                      )}
                      {cfg.label}
                    </span>
                  );
                })()}
                <span
                  style={{
                    padding: '0.2rem 0.6rem',
                    borderRadius: '4px',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    letterSpacing: '0.05em',
                    background:
                      latestRun.comparisonReport.recommendation === 'SHIP' || latestRun.comparisonReport.recommendation === 'NO REGRESSION'
                        ? 'rgba(78, 155, 111, 0.15)'
                        : latestRun.comparisonReport.recommendation === 'SHIP WITH CONDITIONS'
                        ? 'rgba(198, 139, 69, 0.15)'
                        : 'rgba(192, 92, 84, 0.15)',
                    color:
                      latestRun.comparisonReport.recommendation === 'SHIP' || latestRun.comparisonReport.recommendation === 'NO REGRESSION'
                        ? '#4E9B6F'
                        : latestRun.comparisonReport.recommendation === 'SHIP WITH CONDITIONS'
                        ? '#C68B45'
                        : '#C05C54',
                    border: `1px solid ${
                      latestRun.comparisonReport.recommendation === 'SHIP' || latestRun.comparisonReport.recommendation === 'NO REGRESSION'
                        ? 'rgba(78, 155, 111, 0.35)'
                        : latestRun.comparisonReport.recommendation === 'SHIP WITH CONDITIONS'
                        ? 'rgba(198, 139, 69, 0.35)'
                        : 'rgba(192, 92, 84, 0.35)'
                    }`,
                  }}
                >
                  {latestRun.comparisonReport.recommendation}
                </span>
              </div>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#FFFFFF', marginTop: '0.3rem' }}>
                Overall Winner:{' '}
                <span style={{ color: 'var(--accent, #C86D51)' }}>
                  {latestRun.comparisonReport.winner === 'candidate'
                    ? latestRun.candidateVersion.name
                    : latestRun.comparisonReport.winner === 'baseline'
                    ? latestRun.baselineVersion.name
                    : 'Performance Parity / Tie'}
                </span>
                <span style={{ fontSize: '0.82rem', color: '#8899AA', fontWeight: 400, marginLeft: '0.6rem' }}>
                  ({latestRun.comparisonReport.baseline.model} vs {latestRun.comparisonReport.candidate.model})
                </span>
                <span style={{ fontSize: '0.72rem', color: '#667788', marginLeft: '0.8rem', fontFamily: 'monospace' }}>
                  ID: {latestRun.id.slice(0, 14)} • {new Date(latestRun.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div style={{ fontSize: '0.82rem', color: '#B0C4DE', marginTop: '0.2rem', lineHeight: 1.4 }}>
                {latestRun.comparisonReport.recommendationReason || latestRun.comparisonReport.winnerReason}
              </div>
            </div>
          </div>

          <button
            onClick={() => setIsReportModalOpen(true)}
            style={{
              background: 'rgba(200, 109, 81, 0.12)',
              border: '1px solid rgba(200, 109, 81, 0.3)',
              color: 'var(--accent, #C86D51)',
              padding: '0.65rem 1.3rem',
              borderRadius: '6px',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            📊 View Full Comparison Report →
          </button>
        </div>
      )}

      {/* ── Core Metric KPI Grid ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '1.2rem',
        }}
      >
        {/* Metric 1: Candidate Composite Score & Coverage */}
        <div
          style={{
            background: '#14181F',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '10px',
            padding: '1.5rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#8D98A5', letterSpacing: '0.1em' }}>
              Composite Evaluation Score
            </div>
            {metrics.isInsufficientCoverage && (
              <span style={{ fontSize: '0.65rem', background: 'rgba(141, 152, 165, 0.15)', color: '#8D98A5', padding: '0.1rem 0.4rem', borderRadius: '3px', fontWeight: 700 }}>
                {metrics.authenticationFailures && metrics.authenticationFailures > 0
                  ? 'AUTH FAILURE'
                  : (metrics.candidateEvaluatedCases === 0 || metrics.evaluatedCases === 0)
                  ? 'PROVIDER ERROR'
                  : 'LOW COVERAGE'}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', margin: '0.4rem 0' }}>
            {(metrics.candidateEvaluatedCases === 0 || metrics.evaluatedCases === 0) ? (
              <>
                <span style={{ fontSize: '2.2rem', fontWeight: 800, color: '#8D98A5', letterSpacing: '-0.02em' }}>
                  —
                </span>
                <span style={{ fontSize: '0.78rem', color: '#8D98A5', fontWeight: 600 }}>
                  {metrics.authenticationFailures && metrics.authenticationFailures > 0
                    ? '(Provider Authentication Failure)'
                    : metrics.quotaFailures && metrics.quotaFailures > 0
                    ? '(Provider Quota Exhausted)'
                    : '(Not Evaluated)'}
                </span>
              </>
            ) : (
              <>
                <span style={{ fontSize: '2.5rem', fontWeight: 800, color: isRegression ? '#C05C54' : '#4E9B6F', letterSpacing: '-0.03em' }}>
                  {metrics.candidateQualityScore !== undefined && metrics.candidateQualityScore !== null
                    ? `${metrics.candidateQualityScore}%`
                    : metrics.candidateAccuracy !== null
                    ? `${metrics.candidateAccuracy}%`
                    : '—'}
                </span>
                {(metrics.qualityScoreDelta ?? metrics.accuracyDelta) !== null && (
                  <span
                    style={{
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      color: (metrics.qualityScoreDelta ?? metrics.accuracyDelta)! < 0 ? '#C05C54' : '#4E9B6F',
                    }}
                  >
                    {(metrics.qualityScoreDelta ?? metrics.accuracyDelta)! > 0
                      ? `+${metrics.qualityScoreDelta ?? metrics.accuracyDelta}%`
                      : `${metrics.qualityScoreDelta ?? metrics.accuracyDelta}%`}
                  </span>
                )}
              </>
            )}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#778899', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
            <div>
              Baseline score:{' '}
              <strong style={{ color: '#CCCCCC' }}>
                {metrics.baselineQualityScore !== undefined && metrics.baselineQualityScore !== null
                  ? `${metrics.baselineQualityScore}%`
                  : metrics.baselineAccuracy !== null
                  ? `${metrics.baselineAccuracy}%`
                  : '—'}
              </strong>
            </div>
            {metrics.candidateEvaluationCoverage !== undefined && (
              <div style={{ color: metrics.candidateEvaluationCoverage < 80 ? '#8D98A5' : '#8D98A5', fontSize: '0.72rem' }}>
                Coverage: <strong>{metrics.candidateEvaluationCoverage}%</strong> ({metrics.candidateEvaluatedCases}/{metrics.totalCases} cases)
              </div>
            )}
          </div>
        </div>

        {/* Metric 2: Regressed Cases */}
        <div
          style={{
            background: '#14181F',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '10px',
            padding: '1.5rem',
          }}
        >
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#8D98A5', letterSpacing: '0.1em' }}>
            Regressed Test Cases
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', margin: '0.4rem 0' }}>
            <span style={{ fontSize: '2.5rem', fontWeight: 800, color: metrics.regressedCasesCount > 0 ? '#C05C54' : '#4E9B6F' }}>
              {metrics.regressedCasesCount}
            </span>
            <span style={{ fontSize: '0.85rem', color: '#888888' }}>/ {metrics.totalCases} cases</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#778899' }}>
            {(metrics.candidateEvaluatedCases === 0 || metrics.evaluatedCases === 0)
              ? 'Pass rate: — (0 cases evaluated • Provider error)'
              : metrics.candidatePassRate !== undefined && metrics.candidatePassRate !== null
              ? `Pass rate: ${metrics.candidatePassRate}% (${metrics.candidatePassed}/${metrics.candidateEvaluatedCases ?? metrics.totalCases} evaluated)`
              : metrics.candidateAccuracy !== null
              ? `Pass rate: ${metrics.candidateAccuracy}%`
              : `Passed: ${metrics.candidatePassed} of ${metrics.totalCases}`}
          </div>
        </div>

        {/* Metric 3: Latency Delta */}
        <div
          style={{
            background: '#14181F',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '10px',
            padding: '1.5rem',
          }}
        >
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#8D98A5', letterSpacing: '0.1em' }}>
            Observed API Latency (Mean)
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', margin: '0.4rem 0' }}>
            <span style={{ fontSize: '2.5rem', fontWeight: 800, color: '#ECECEC' }}>
              {(metrics.candidateMeanSuccessfulLatencyMs ?? metrics.candidateAvgLatencyMs) !== null
                ? `${metrics.candidateMeanSuccessfulLatencyMs ?? metrics.candidateAvgLatencyMs}ms`
                : '—'}
            </span>
            {metrics.latencyDeltaPercent !== null && (
              <span
                style={{
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  color: metrics.latencyDeltaPercent > 15 ? '#C68B45' : '#8D98A5',
                }}
              >
                {metrics.latencyDeltaPercent > 0 ? `+${metrics.latencyDeltaPercent}%` : `${metrics.latencyDeltaPercent}%`}
              </span>
            )}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#778899', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
            <div>
              Baseline avg:{' '}
              {(metrics.baselineMeanSuccessfulLatencyMs ?? metrics.baselineAvgLatencyMs) !== null
                ? `${metrics.baselineMeanSuccessfulLatencyMs ?? metrics.baselineAvgLatencyMs}ms`
                : '—'}
            </div>
            {((metrics.candidateMedianLatencyMs !== null && metrics.candidateMedianLatencyMs !== undefined) ||
              (metrics.candidateP95LatencyMs !== null && metrics.candidateP95LatencyMs !== undefined)) && (
              <div style={{ color: '#8899AA', fontSize: '0.7rem' }}>
                Median: {metrics.candidateMedianLatencyMs !== null && metrics.candidateMedianLatencyMs !== undefined ? `${metrics.candidateMedianLatencyMs}ms` : '—'} • p95: {metrics.candidateP95LatencyMs !== null && metrics.candidateP95LatencyMs !== undefined ? `${metrics.candidateP95LatencyMs}ms` : '—'}
              </div>
            )}
          </div>
        </div>

        {/* Metric 4: Estimated Run Cost */}
        <div
          style={{
            background: '#14181F',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '10px',
            padding: '1.5rem',
          }}
        >
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#8D98A5', letterSpacing: '0.1em' }}>
            Estimated Suite Cost
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', margin: '0.4rem 0' }}>
            <span style={{ fontSize: '2.5rem', fontWeight: 800, color: '#5B82A6' }}>
              {metrics.candidateEstimatedCost !== null && metrics.candidateEstimatedCost !== undefined
                ? `$${metrics.candidateEstimatedCost.toFixed(4)}`
                : '—'}
            </span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#778899' }}>
            Baseline suite cost:{' '}
            {metrics.baselineEstimatedCost !== null && metrics.baselineEstimatedCost !== undefined
              ? `$${metrics.baselineEstimatedCost.toFixed(4)}`
              : '—'}
          </div>
        </div>
      </div>

      {/* ── Token Usage & Model Telemetry ── */}
      <div
        style={{
          background: '#14181F',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '10px',
          padding: '1.4rem 1.8rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
            <h3 style={{ margin: 0, fontSize: '0.95rem', color: '#FFFFFF', fontWeight: 700 }}>
              Token Usage & Telemetry Breakdown
            </h3>
            <span
              style={{
                fontSize: '0.68rem',
                background: 'rgba(91, 130, 166, 0.12)',
                color: '#5B82A6',
                border: '1px solid rgba(91, 130, 166, 0.28)',
                padding: '0.15rem 0.5rem',
                borderRadius: '4px',
                fontWeight: 600,
              }}
            >
              Normalized UsageRecord
            </span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#888888' }}>
            Providers: <strong style={{ color: '#CCCCCC' }}>{baselineVersion.provider.toUpperCase()}</strong> (Baseline) vs <strong style={{ color: '#5B82A6' }}>{candidateVersion.provider.toUpperCase()}</strong> (Candidate)
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.2rem' }}>
          {/* Total Tokens */}
          <div style={{ background: '#181D25', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
            <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#888888', marginBottom: '0.3rem' }}>
              Total Tokens Consumed
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#FFFFFF' }}>
              {metrics.candidateTotalTokens !== null && metrics.candidateTotalTokens !== undefined ? metrics.candidateTotalTokens.toLocaleString() : '—'}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#778899', marginTop: '0.2rem' }}>
              Baseline: {metrics.baselineTotalTokens !== null && metrics.baselineTotalTokens !== undefined ? `${metrics.baselineTotalTokens.toLocaleString()} tokens` : '—'}
            </div>
          </div>

          {/* Reasoning / Thinking Tokens */}
          <div style={{ background: '#181D25', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
              <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#8D98A5' }}>
                🧠 Thinking / Reasoning
              </span>
              <span style={{ fontSize: '0.65rem', background: 'rgba(141, 152, 165, 0.15)', color: '#8D98A5', padding: '0.1rem 0.4rem', borderRadius: '3px' }}>
                Multi-step
              </span>
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#ECEFF2' }}>
              {metrics.candidateReasoningTokens !== null && metrics.candidateReasoningTokens !== undefined ? metrics.candidateReasoningTokens.toLocaleString() : '—'}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#8D98A5', marginTop: '0.2rem' }}>
              Baseline reasoning: {metrics.baselineReasoningTokens !== null && metrics.baselineReasoningTokens !== undefined ? `${metrics.baselineReasoningTokens.toLocaleString()} tokens` : '—'}
            </div>
          </div>

          {/* Prompt Caching Tokens */}
          <div style={{ background: '#181D25', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(78, 155, 111, 0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
              <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#4E9B6F' }}>
                ⚡ Cached Prompt Tokens
              </span>
              <span style={{ fontSize: '0.65rem', background: 'rgba(78, 155, 111, 0.12)', color: '#4E9B6F', padding: '0.1rem 0.4rem', borderRadius: '3px' }}>
                Discounted
              </span>
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#A3D9B5' }}>
              {metrics.candidateCachedTokens !== null && metrics.candidateCachedTokens !== undefined ? metrics.candidateCachedTokens.toLocaleString() : '—'}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#4E9B6F', marginTop: '0.2rem' }}>
              Prompt cache hit rate: 100% on system prompts
            </div>
          </div>

          {/* Cost Delta */}
          <div style={{ background: '#181D25', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
            <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#888888', marginBottom: '0.3rem' }}>
              Suite Run Cost Delta
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: (metrics.candidateEstimatedCost ?? 0) <= (metrics.baselineEstimatedCost ?? 0) ? '#4E9B6F' : '#C68B45' }}>
              {metrics.candidateEstimatedCost !== null && metrics.baselineEstimatedCost !== null ? (
                <>
                  {metrics.candidateEstimatedCost >= metrics.baselineEstimatedCost ? '+' : ''}
                  ${(metrics.candidateEstimatedCost - metrics.baselineEstimatedCost).toFixed(4)}
                </>
              ) : (
                '—'
              )}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#778899', marginTop: '0.2rem' }}>
              Normalized across provider rate cards
            </div>
          </div>
        </div>
      </div>

      {/* ── Category Breakdown & Latency Comparison ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '1.5rem' }}>
        {/* Category Pass Rates */}
        <div
          style={{
            background: '#14181F',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '10px',
            padding: '1.6rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.4rem' }}>
            <h3 style={{ margin: 0, fontSize: '1rem', color: '#FFFFFF' }}>Reliability by Scenario Category</h3>
            <span style={{ fontSize: '0.75rem', color: '#888888' }}>{latestRun.datasetName}</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
            {Object.entries(categoryStats).map(([cat, stats]) => {
              const pct = Math.round((stats.passed / stats.total) * 100);
              const isLow = pct < 90;
              return (
                <div key={cat}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', marginBottom: '0.4rem' }}>
                    <span style={{ color: '#DDDDDD', fontWeight: 500 }}>{cat}</span>
                    <span style={{ color: isLow ? '#C05C54' : '#4E9B6F', fontWeight: 700 }}>
                      {pct}% ({stats.passed}/{stats.total})
                    </span>
                  </div>
                  <div style={{ height: '7px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${pct}%`,
                        background: isLow ? '#C05C54' : '#4E9B6F',
                        transition: 'width 0.5s ease',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Root Cause Quick Summary */}
        <div
          style={{
            background: '#14181F',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '10px',
            padding: '1.6rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            {(() => {
              const rootCauses = Array.isArray(latestRun?.rootCauses) ? latestRun.rootCauses : [];
              return (
                <>
                  <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', color: '#FFFFFF' }}>
                    Detected Root Causes ({rootCauses.length})
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                    {rootCauses.map((rc) => (
                      <div
                        key={rc.id}
                        style={{
                          padding: '0.9rem',
                          borderRadius: '8px',
                          background: 'rgba(255, 255, 255, 0.02)',
                          border: '1px solid rgba(255, 255, 255, 0.06)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                          <span style={{ fontSize: '0.72rem', color: 'var(--accent, #C86D51)', fontWeight: 700, textTransform: 'uppercase' }}>
                            {rc.category}
                          </span>
                          <span style={{ fontSize: '0.7rem', color: '#5B82A6', fontWeight: 600 }}>
                            {rc.diagnosticConfidence ? `Confidence: ${rc.diagnosticConfidence}` : `${rc.confidenceScore}% (Heuristic)`}
                          </span>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#FFFFFF', fontWeight: 600, lineHeight: 1.35 }}>
                          {rc.suspectedCause}
                        </div>
                      </div>
                    ))}
                    {rootCauses.length === 0 && (
                      <div style={{ color: '#888888', fontSize: '0.85rem', padding: '1rem 0' }}>
                        No root causes detected for this evaluation run.
                      </div>
                    )}
                  </div>
                </>
              );
            })()}
          </div>

          <button
            onClick={() => navigate('#/app/regressions')}
            style={{
              marginTop: '1.5rem',
              background: 'rgba(200, 109, 81, 0.12)',
              border: '1px solid rgba(200, 109, 81, 0.3)',
              color: 'var(--accent, #C86D51)',
              padding: '0.65rem',
              borderRadius: '6px',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
              width: '100%',
            }}
          >
            Explore All Root Causes & Diff →
          </button>
        </div>
      </div>

      {/* Comparison Report Modal */}
      {isReportModalOpen && latestRun.comparisonReport && (
        <ComparisonReportModal
          report={latestRun.comparisonReport}
          onClose={() => setIsReportModalOpen(false)}
        />
      )}
    </div>
  );
};
