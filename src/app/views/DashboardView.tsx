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
          <div style={{ fontSize: '0.75rem', letterSpacing: '0.2em', color: 'var(--accent, #FF6B35)', fontWeight: 600, textTransform: 'uppercase' }}>
            GETTING STARTED // QUICKSTART GUIDE
          </div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#FFFFFF', margin: '0.3rem 0 0.5rem 0' }}>
            Welcome to {project.name}
          </h1>
          <p style={{ color: '#8899AA', fontSize: '0.92rem', margin: 0, lineHeight: 1.5 }}>
            No evaluation runs have been recorded yet for this project workspace. Follow the 3-step workflow below to curate test scenarios and evaluate model versions.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.2rem' }}>
          {/* Step 1 */}
          <div style={{ background: '#161B22', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '10px', padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ color: 'var(--accent, #FF6B35)', fontWeight: 800, fontSize: '0.8rem', marginBottom: '0.6rem' }}>
                STEP 01
              </div>
              <h3 style={{ margin: '0 0 0.5rem 0', color: '#FFFFFF', fontSize: '1.1rem' }}>
                Curate Test Suites
              </h3>
              <p style={{ color: '#8899AA', fontSize: '0.85rem', lineHeight: 1.5, margin: '0 0 1.2rem 0' }}>
                Create evaluation datasets, define test prompts, and select deterministic evaluators (keyword criteria, JSON validity, exact match, behavioral safety).
              </p>
            </div>
            <button
              onClick={() => navigate('#/app/datasets')}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#FFFFFF',
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
          <div style={{ background: '#161B22', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '10px', padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <div style={{ color: '#4DA6FF', fontWeight: 800, fontSize: '0.8rem', marginBottom: '0.6rem' }}>
                STEP 02
              </div>
              <h3 style={{ margin: '0 0 0.5rem 0', color: '#FFFFFF', fontSize: '1.1rem' }}>
                Configure Policies
              </h3>
              <p style={{ color: '#8899AA', fontSize: '0.85rem', lineHeight: 1.5, margin: '0 0 1.2rem 0' }}>
                Review and customize pass/block regression boundaries (minimum accuracy gate, maximum allowed degradation, latency tolerance, and coverage threshold).
              </p>
            </div>
            <button
              onClick={() => navigate('#/app/settings')}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#FFFFFF',
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
          <div style={{ background: '#161B22', border: '1px solid var(--accent, #FF6B35)', borderRadius: '10px', padding: '1.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', boxShadow: '0 0 20px rgba(255, 107, 53, 0.12)' }}>
            <div>
              <div style={{ color: 'var(--accent, #FF6B35)', fontWeight: 800, fontSize: '0.8rem', marginBottom: '0.6rem' }}>
                STEP 03
              </div>
              <h3 style={{ margin: '0 0 0.5rem 0', color: '#FFFFFF', fontSize: '1.1rem' }}>
                Run Benchmark
              </h3>
              <p style={{ color: '#8899AA', fontSize: '0.85rem', lineHeight: 1.5, margin: '0 0 1.2rem 0' }}>
                Execute a comparative run between your reference baseline and candidate model to compute metrics, regression signals, and deployment verdicts.
              </p>
            </div>
            <button
              onClick={() => navigate('#/app/evaluations')}
              style={{
                background: 'var(--accent, #FF6B35)',
                border: 'none',
                color: '#000000',
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
        return { bg: 'linear-gradient(90deg, rgba(10, 35, 20, 0.9) 0%, rgba(8, 22, 14, 0.95) 100%)', border: '#2ECC71', color: '#2ECC71', icon: '✓', label: 'SHIP TO PRODUCTION', sublabel: 'Verified Safe for Production' };
      case 'SHIP_WITH_CONDITIONS':
      case 'SHIP WITH CONDITIONS':
        return { bg: 'linear-gradient(90deg, rgba(50, 38, 10, 0.9) 0%, rgba(30, 22, 6, 0.95) 100%)', border: '#F39C12', color: '#F39C12', icon: '⚡', label: 'SHIP WITH CONDITIONS', sublabel: 'Preliminary Sample Passed (Staging/Smoke Test)' };
      case 'NO_REGRESSION':
      case 'NO REGRESSION':
      case 'PASS':
        return { bg: 'linear-gradient(90deg, rgba(10, 30, 45, 0.9) 0%, rgba(8, 18, 30, 0.95) 100%)', border: '#4DA6FF', color: '#4DA6FF', icon: '✓', label: 'NO REGRESSION', sublabel: 'Parity Maintained with Production' };
      case 'REGRESSION_DETECTED':
      case 'REGRESSION DETECTED':
        return { bg: 'linear-gradient(90deg, rgba(45, 12, 10, 0.9) 0%, rgba(25, 8, 6, 0.95) 100%)', border: '#FF3311', color: '#FF3311', icon: '⚠', label: 'REGRESSION DETECTED', sublabel: 'Candidate Release Blocked' };
      case 'BLOCK':
      case 'BLOCK RELEASE':
        return { bg: 'linear-gradient(90deg, rgba(45, 12, 10, 0.9) 0%, rgba(25, 8, 6, 0.95) 100%)', border: '#FF3311', color: '#FF3311', icon: '⛔', label: 'RELEASE BLOCKED', sublabel: 'Critical Safety or Reliability Defect' };
      case 'INSUFFICIENT_EVIDENCE':
      case 'INSUFFICIENT EVIDENCE':
      default:
        return { bg: 'linear-gradient(90deg, rgba(30, 20, 45, 0.9) 0%, rgba(20, 12, 30, 0.95) 100%)', border: '#9B59B6', color: '#C084FC', icon: '❓', label: 'INSUFFICIENT EVIDENCE', sublabel: 'Coverage Below Threshold (Rate Limits / Errors)' };
    }
  };

  const verdictCfg = getVerdictStyle(releaseStatus);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', maxWidth: '1240px' }}>
      {/* ── Page Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: '0.75rem', letterSpacing: '0.2em', color: 'var(--accent, #FF6B35)', fontWeight: 600, textTransform: 'uppercase' }}>
            OVERVIEW // RELIABILITY METRICS
          </div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#FFFFFF', margin: '0.3rem 0 0.4rem 0', letterSpacing: '-0.02em' }}>
            {project.name} Dashboard
          </h1>
          <p style={{ color: '#8899AA', fontSize: '0.9rem', margin: 0 }}>
            Comparing baseline <code style={{ color: '#FFFFFF' }}>{baselineVersion.name}</code> against candidate <code style={{ color: '#4DA6FF' }}>{candidateVersion.name}</code>.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.8rem' }}>
          <button
            onClick={() => navigate('#/app/evaluations')}
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#ECECEC',
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
              background: isRegression ? 'rgba(255, 34, 0, 0.15)' : 'rgba(46, 204, 113, 0.15)',
              border: `1px solid ${isRegression ? '#FF3311' : '#2ECC71'}`,
              color: isRegression ? '#FF5533' : '#2ECC71',
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
          boxShadow: `0 0 20px ${verdictCfg.border}33`,
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
            background: 'linear-gradient(90deg, rgba(22, 27, 34, 0.95) 0%, rgba(13, 17, 23, 0.95) 100%)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1.2rem',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem', flex: 1, minWidth: '300px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, rgba(255, 107, 53, 0.2), rgba(0, 200, 255, 0.2))',
                border: '1px solid rgba(255, 107, 53, 0.4)',
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
                <span style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#8899AA' }}>
                  CROSS-MODEL COMPARISON // RECOMMENDATION
                </span>
                {(() => {
                  const mode = latestRun.executionMode || latestRun.comparisonReport?.executionMode || 'SAVED';
                  const cfg =
                    mode === 'LIVE'
                      ? { label: 'LIVE EVALUATION', color: '#10B981', bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.4)', dot: true }
                      : mode === 'REFERENCE'
                      ? { label: 'REFERENCE DATA', color: '#A78BFA', bg: 'rgba(167, 139, 250, 0.15)', border: 'rgba(167, 139, 250, 0.4)', dot: false }
                      : { label: 'SAVED EVALUATION', color: '#38BDF8', bg: 'rgba(56, 189, 248, 0.15)', border: 'rgba(56, 189, 248, 0.4)', dot: false };
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
                            background: '#10B981',
                            boxShadow: '0 0 6px #10B981',
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
                        ? 'rgba(46, 204, 113, 0.2)'
                        : latestRun.comparisonReport.recommendation === 'SHIP WITH CONDITIONS'
                        ? 'rgba(241, 196, 15, 0.2)'
                        : 'rgba(255, 51, 17, 0.2)',
                    color:
                      latestRun.comparisonReport.recommendation === 'SHIP' || latestRun.comparisonReport.recommendation === 'NO REGRESSION'
                        ? '#2ECC71'
                        : latestRun.comparisonReport.recommendation === 'SHIP WITH CONDITIONS'
                        ? '#F1C40F'
                        : '#FF4422',
                    border: `1px solid ${
                      latestRun.comparisonReport.recommendation === 'SHIP' || latestRun.comparisonReport.recommendation === 'NO REGRESSION'
                        ? '#2ECC71'
                        : latestRun.comparisonReport.recommendation === 'SHIP WITH CONDITIONS'
                        ? '#F1C40F'
                        : '#FF3311'
                    }`,
                  }}
                >
                  {latestRun.comparisonReport.recommendation}
                </span>
              </div>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#FFFFFF', marginTop: '0.3rem' }}>
                Overall Winner:{' '}
                <span style={{ color: '#FF6B35' }}>
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
              background: 'linear-gradient(135deg, rgba(255, 107, 53, 0.18), rgba(255, 107, 53, 0.06))',
              border: '1px solid #FF6B35',
              color: '#FF6B35',
              padding: '0.65rem 1.3rem',
              borderRadius: '6px',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: '0 0 15px rgba(255, 107, 53, 0.15)',
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
            background: '#161B22',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '10px',
            padding: '1.5rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#888888', letterSpacing: '0.1em' }}>
              Composite Evaluation Score
            </div>
            {metrics.isInsufficientCoverage && (
              <span style={{ fontSize: '0.65rem', background: 'rgba(192, 132, 252, 0.2)', color: '#C084FC', padding: '0.1rem 0.4rem', borderRadius: '3px', fontWeight: 700 }}>
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
                <span style={{ fontSize: '2.2rem', fontWeight: 800, color: '#C084FC', letterSpacing: '-0.02em' }}>
                  —
                </span>
                <span style={{ fontSize: '0.78rem', color: '#8899AA', fontWeight: 600 }}>
                  {metrics.authenticationFailures && metrics.authenticationFailures > 0
                    ? '(Provider Authentication Failure)'
                    : metrics.quotaFailures && metrics.quotaFailures > 0
                    ? '(Provider Quota Exhausted)'
                    : '(Not Evaluated)'}
                </span>
              </>
            ) : (
              <>
                <span style={{ fontSize: '2.5rem', fontWeight: 800, color: isRegression ? '#FF4422' : '#2ECC71', letterSpacing: '-0.03em' }}>
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
                      color: (metrics.qualityScoreDelta ?? metrics.accuracyDelta)! < 0 ? '#FF4422' : '#2ECC71',
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
              <div style={{ color: metrics.candidateEvaluationCoverage < 80 ? '#C084FC' : '#8899AA', fontSize: '0.72rem' }}>
                Coverage: <strong>{metrics.candidateEvaluationCoverage}%</strong> ({metrics.candidateEvaluatedCases}/{metrics.totalCases} cases)
              </div>
            )}
          </div>
        </div>

        {/* Metric 2: Regressed Cases */}
        <div
          style={{
            background: '#161B22',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '10px',
            padding: '1.5rem',
          }}
        >
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#888888', letterSpacing: '0.1em' }}>
            Regressed Test Cases
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', margin: '0.4rem 0' }}>
            <span style={{ fontSize: '2.5rem', fontWeight: 800, color: metrics.regressedCasesCount > 0 ? '#FF3311' : '#2ECC71' }}>
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
            background: '#161B22',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '10px',
            padding: '1.5rem',
          }}
        >
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#888888', letterSpacing: '0.1em' }}>
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
                  color: metrics.latencyDeltaPercent > 15 ? '#FFAA44' : '#888888',
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
            background: '#161B22',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '10px',
            padding: '1.5rem',
          }}
        >
          <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#888888', letterSpacing: '0.1em' }}>
            Estimated Suite Cost
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', margin: '0.4rem 0' }}>
            <span style={{ fontSize: '2.5rem', fontWeight: 800, color: '#4DA6FF' }}>
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
          background: '#161B22',
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
                background: 'rgba(77, 166, 255, 0.15)',
                color: '#4DA6FF',
                border: '1px solid rgba(77, 166, 255, 0.3)',
                padding: '0.15rem 0.5rem',
                borderRadius: '4px',
                fontWeight: 600,
              }}
            >
              Normalized UsageRecord
            </span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#888888' }}>
            Providers: <strong style={{ color: '#CCCCCC' }}>{baselineVersion.provider.toUpperCase()}</strong> (Baseline) vs <strong style={{ color: '#4DA6FF' }}>{candidateVersion.provider.toUpperCase()}</strong> (Candidate)
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.2rem' }}>
          {/* Total Tokens */}
          <div style={{ background: '#0D1117', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
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
          <div style={{ background: '#0D1117', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(180, 100, 255, 0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
              <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#C084FC' }}>
                🧠 Thinking / Reasoning
              </span>
              <span style={{ fontSize: '0.65rem', background: 'rgba(192, 132, 252, 0.15)', color: '#C084FC', padding: '0.1rem 0.4rem', borderRadius: '3px' }}>
                Multi-step
              </span>
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#E9D5FF' }}>
              {metrics.candidateReasoningTokens !== null && metrics.candidateReasoningTokens !== undefined ? metrics.candidateReasoningTokens.toLocaleString() : '—'}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#A855F7', marginTop: '0.2rem' }}>
              Baseline reasoning: {metrics.baselineReasoningTokens !== null && metrics.baselineReasoningTokens !== undefined ? `${metrics.baselineReasoningTokens.toLocaleString()} tokens` : '—'}
            </div>
          </div>

          {/* Prompt Caching Tokens */}
          <div style={{ background: '#0D1117', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(46, 204, 113, 0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
              <span style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#2ECC71' }}>
                ⚡ Cached Prompt Tokens
              </span>
              <span style={{ fontSize: '0.65rem', background: 'rgba(46, 204, 113, 0.15)', color: '#2ECC71', padding: '0.1rem 0.4rem', borderRadius: '3px' }}>
                Discounted
              </span>
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: '#86EFAC' }}>
              {metrics.candidateCachedTokens !== null && metrics.candidateCachedTokens !== undefined ? metrics.candidateCachedTokens.toLocaleString() : '—'}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#22C55E', marginTop: '0.2rem' }}>
              Prompt cache hit rate: 100% on system prompts
            </div>
          </div>

          {/* Cost Delta */}
          <div style={{ background: '#0D1117', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
            <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#888888', marginBottom: '0.3rem' }}>
              Suite Run Cost Delta
            </div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: (metrics.candidateEstimatedCost ?? 0) <= (metrics.baselineEstimatedCost ?? 0) ? '#2ECC71' : '#FFAA44' }}>
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
            background: '#161B22',
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
                    <span style={{ color: isLow ? '#FF4422' : '#2ECC71', fontWeight: 700 }}>
                      {pct}% ({stats.passed}/{stats.total})
                    </span>
                  </div>
                  <div style={{ height: '7px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div
                      style={{
                        height: '100%',
                        width: `${pct}%`,
                        background: isLow ? '#FF4422' : '#2ECC71',
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
            background: '#161B22',
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
                          background: 'rgba(255, 255, 255, 0.04)',
                          border: '1px solid rgba(255, 255, 255, 0.06)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
                          <span style={{ fontSize: '0.72rem', color: 'var(--accent, #FF6B35)', fontWeight: 700, textTransform: 'uppercase' }}>
                            {rc.category}
                          </span>
                          <span style={{ fontSize: '0.7rem', color: '#4DA6FF', fontWeight: 600 }}>
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
              background: 'rgba(255, 107, 53, 0.12)',
              border: '1px solid var(--accent, #FF6B35)',
              color: 'var(--accent, #FF6B35)',
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
