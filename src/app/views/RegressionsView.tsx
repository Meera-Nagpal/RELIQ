/* ============================================================
   RELIQ — Regressions & Failure Explorer View
   
   Provides:
   1. Release Gate Decision (PASS vs BLOCK release with audit log)
   2. Root Cause Diagnostic Panel (Transparent evidence & recommendations)
   3. Failure Explorer Table with multi-facet filters
   4. Side-by-Side Diff Inspector modal
   ============================================================ */

import React, { useEffect, useState } from 'react';
import { ComparisonReportModal } from '../components/ComparisonReportModal';
import {
  EvaluationRun,
  ReleaseDecisionStatus,
  TestCaseResult,
} from '../../domain/types';

interface RegressionsViewProps {
  run: EvaluationRun | null;
  onUpdateReleaseDecision: (status: ReleaseDecisionStatus, reason: string) => Promise<void>;
}

export const getTestCaseBadge = (c: TestCaseResult) => {
  // 1. Genuine quality regression
  if (c.isRegression) {
    return {
      text: 'REGRESSION',
      bg: 'rgba(255, 51, 17, 0.15)',
      color: '#FF4422',
      border: 'rgba(255, 51, 17, 0.3)',
    };
  }

  // 2. Provider Authentication Failure
  if (
    c.failureCategory === 'PROVIDER_AUTHENTICATION' ||
    c.candidateExecutionStatus === 'AUTHENTICATION_ERROR' ||
    c.baselineExecutionStatus === 'AUTHENTICATION_ERROR' ||
    c.candidateUsage?.error?.status === 401 ||
    c.candidateUsage?.error?.status === 403 ||
    c.candidateErrorDetail?.category === 'AUTHENTICATION' ||
    (c.failureReason &&
      (c.failureReason.includes('401') ||
        c.failureReason.toLowerCase().includes('authentication') ||
        c.failureReason.toLowerCase().includes('api key')))
  ) {
    return {
      text: 'PROVIDER AUTHENTICATION',
      bg: 'rgba(239, 68, 68, 0.15)',
      color: '#EF4444',
      border: 'rgba(239, 68, 68, 0.3)',
    };
  }

  // 3. Provider Quota / Rate Limit
  if (
    c.failureCategory === 'PROVIDER_QUOTA' ||
    c.candidateExecutionStatus === 'PROVIDER_RATE_LIMIT' ||
    c.baselineExecutionStatus === 'PROVIDER_RATE_LIMIT' ||
    c.candidateUsage?.error?.status === 429 ||
    c.candidateErrorDetail?.category === 'RATE_LIMIT' ||
    (c.failureReason && c.failureReason.includes('429'))
  ) {
    return {
      text: 'PROVIDER QUOTA',
      bg: 'rgba(192, 132, 252, 0.15)',
      color: '#C084FC',
      border: 'rgba(192, 132, 252, 0.3)',
    };
  }

  // 4. Provider Network / Server Error
  if (
    c.failureCategory === 'PROVIDER_NETWORK' ||
    c.failureCategory === 'PROVIDER_SERVER_ERROR' ||
    c.candidateExecutionStatus === 'NETWORK_ERROR' ||
    c.candidateExecutionStatus === 'TIMEOUT' ||
    (c.candidateUsage?.error?.status && c.candidateUsage.error.status >= 500)
  ) {
    return {
      text: 'PROVIDER ERROR',
      bg: 'rgba(245, 158, 11, 0.15)',
      color: '#F59E0B',
      border: 'rgba(245, 158, 11, 0.3)',
    };
  }

  // 5. Malformed response
  if (c.failureCategory === 'MALFORMED_RESPONSE') {
    return {
      text: 'MALFORMED RESPONSE',
      bg: 'rgba(245, 158, 11, 0.15)',
      color: '#F59E0B',
      border: 'rgba(245, 158, 11, 0.3)',
    };
  }

  // 6. Safety evaluator failures
  if (
    c.failureCategory === 'SAFETY_POLICY_FAILURE' ||
    c.failureCategory === 'PROMPT_INJECTION_FAILURE' ||
    c.failureCategory === 'CREDENTIAL_LEAK' ||
    c.safetyClassification === 'CREDENTIAL_LEAK' ||
    c.safetyClassification === 'PROMPT_INJECTION_FAILURE' ||
    c.safetyClassification === 'SAFETY_POLICY_FAILURE'
  ) {
    return {
      text: 'SAFETY FAILURE',
      bg: 'rgba(239, 68, 68, 0.2)',
      color: '#EF4444',
      border: 'rgba(239, 68, 68, 0.4)',
    };
  }

  // 7. Refusal criteria mismatch
  if (c.failureCategory === 'REFUSAL_CRITERIA_MISMATCH' || c.safetyClassification === 'REFUSAL_CRITERIA_MISMATCH') {
    return {
      text: 'REFUSAL MISMATCH',
      bg: 'rgba(245, 158, 11, 0.15)',
      color: '#F59E0B',
      border: 'rgba(245, 158, 11, 0.3)',
    };
  }

  // 8. Passed
  if (c.passed === true) {
    return {
      text: 'PASSED',
      bg: 'rgba(46, 204, 113, 0.15)',
      color: '#2ECC71',
      border: 'rgba(46, 204, 113, 0.3)',
    };
  }

  // 9. Actual evaluated bad answer
  if (c.passed === false && (c.candidateQualityEvaluated || c.failureCategory === 'QUALITY_FAILURE')) {
    return {
      text: 'QUALITY FAIL',
      bg: 'rgba(255, 170, 68, 0.15)',
      color: '#FFAA44',
      border: 'rgba(255, 170, 68, 0.3)',
    };
  }

  // 10. Default fallback if not evaluated
  return {
    text: 'NOT EVALUATED',
    bg: 'rgba(156, 163, 175, 0.15)',
    color: '#9CA3AF',
    border: 'rgba(156, 163, 175, 0.3)',
  };
};

export const RegressionsView: React.FC<RegressionsViewProps> = ({
  run,
  onUpdateReleaseDecision,
}) => {
  const [statusFilter, setStatusFilter] = useState<'all' | 'regressions' | 'failed' | 'passed' | 'rate-limited'>('regressions');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [selectedCase, setSelectedCase] = useState<TestCaseResult | null>(null);

  // Modals
  const [isOverrideModalOpen, setIsOverrideModalOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelectedCase(null);
        setIsOverrideModalOpen(false);
        setIsReportModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!run) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: '#888888' }}>
        No active evaluation run selected. Run an evaluation to inspect failures.
      </div>
    );
  }

  const regressionDecision = run.regressionDecision || { isRegression: false };
  const isReg = Boolean(regressionDecision.isRegression);
  const releaseDecision = run.releaseDecision || { status: isReg ? 'BLOCK' : 'PASS' };
  const rootCauses = Array.isArray(run.rootCauses) ? run.rootCauses : [];
  const caseResults = Array.isArray(run.caseResults) ? run.caseResults : [];

  // Filter cases
  const filteredCases = caseResults.filter((c) => {
    let matchStatus = true;
    if (statusFilter === 'regressions') matchStatus = c.isRegression;
    else if (statusFilter === 'failed') matchStatus = c.passed === false;
    else if (statusFilter === 'passed') matchStatus = c.passed === true;
    else if (statusFilter === 'rate-limited') {
      matchStatus =
        c.executionStatus === 'PROVIDER_RATE_LIMIT' ||
        c.candidateExecutionStatus === 'PROVIDER_RATE_LIMIT' ||
        c.baselineExecutionStatus === 'PROVIDER_RATE_LIMIT' ||
        c.candidateUsage?.error?.status === 429 ||
        c.baselineUsage?.error?.status === 429;
    }

    let matchCategory = true;
    if (categoryFilter !== 'all') matchCategory = c.category === categoryFilter;

    return matchStatus && matchCategory;
  });

  const handleDecision = async (status: ReleaseDecisionStatus, reason: string) => {
    await onUpdateReleaseDecision(status, reason);
    setIsOverrideModalOpen(false);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', maxWidth: '1240px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.2rem' }}>
            <div style={{ fontSize: '0.75rem', letterSpacing: '0.2em', color: 'var(--accent, #FF6B35)', fontWeight: 600, textTransform: 'uppercase' }}>
              DIAGNOSTICS // FAILURE EXPLORER
            </div>
            {(() => {
              const mode = run.executionMode || run.comparisonReport?.executionMode || 'SAVED';
              const isLive = mode === 'LIVE';
              const isRef = mode === 'REFERENCE';
              const color = isLive ? '#10B981' : isRef ? '#A78BFA' : '#38BDF8';
              const bg = isLive ? 'rgba(16, 185, 129, 0.15)' : isRef ? 'rgba(167, 139, 250, 0.15)' : 'rgba(56, 189, 248, 0.15)';
              const border = isLive ? 'rgba(16, 185, 129, 0.4)' : isRef ? 'rgba(167, 139, 250, 0.4)' : 'rgba(56, 189, 248, 0.4)';
              const label = isLive ? 'LIVE EVALUATION' : isRef ? 'REFERENCE DATA' : 'SAVED EVALUATION';
              return (
                <span
                  style={{
                    fontSize: '0.66rem',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '4px',
                    background: bg,
                    color,
                    border: `1px solid ${border}`,
                    fontWeight: 800,
                    letterSpacing: '0.06em',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.3rem',
                  }}
                >
                  {isLive && (
                    <span
                      style={{
                        width: '5px',
                        height: '5px',
                        borderRadius: '50%',
                        background: '#10B981',
                        boxShadow: '0 0 5px #10B981',
                      }}
                    />
                  )}
                  {label}
                </span>
              );
            })()}
          </div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#FFFFFF', margin: '0.3rem 0 0.2rem 0' }}>
            Regression & Failure Analysis
          </h1>
          <div style={{ color: '#8899AA', fontSize: '0.82rem', margin: 0, fontFamily: 'monospace' }}>
            Run ID: <strong style={{ color: '#CCCCCC' }}>{run.id}</strong> • Recorded: {new Date(run.timestamp).toLocaleString()}
          </div>
        </div>
        {run.comparisonReport && (
          <button
            onClick={() => setIsReportModalOpen(true)}
            style={{
              background: 'linear-gradient(135deg, rgba(255, 107, 53, 0.15), rgba(255, 107, 53, 0.05))',
              border: '1px solid #FF6B35',
              color: '#FF6B35',
              padding: '0.65rem 1.25rem',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: '0 0 15px rgba(255, 107, 53, 0.15)',
            }}
          >
            📊 View Full Comparison Report
          </button>
        )}
      </div>

      {/* ── 1. Release Gate Decision Panel ── */}
      {(() => {
        const evidenceStrength = run.comparisonReport?.evidenceStrength || run.metrics.evidenceStrength;
        const sampleSize = run.comparisonReport?.totalCases || run.metrics.sampleSize || run.caseResults.length;
        const regressionCategories = run.comparisonReport?.regressionCategories || [];
        const isBlocked = isReg || releaseDecision.status === 'BLOCK' || regressionDecision.verdict === 'REGRESSION_DETECTED' || (regressionDecision.verdict as string) === 'BLOCK';
        const isInsufficient = releaseDecision.status === 'INSUFFICIENT_EVIDENCE' || regressionDecision.verdict === 'INSUFFICIENT_EVIDENCE';
        const isConditional = releaseDecision.status === 'SHIP_WITH_CONDITIONS' || (regressionDecision.verdict as string) === 'SHIP_WITH_CONDITIONS';
        const statusColor = isBlocked ? '#FF3311' : isInsufficient ? '#F59E0B' : isConditional ? '#EAB308' : '#2ECC71';
        const statusBg = isBlocked ? 'rgba(255, 34, 0, 0.12)' : isInsufficient ? 'rgba(245, 158, 11, 0.12)' : isConditional ? 'rgba(234, 179, 8, 0.12)' : 'rgba(46, 204, 113, 0.12)';

        return (
          <div
            style={{
              background: '#161B22',
              border: `1px solid ${statusColor}`,
              borderRadius: '12px',
              padding: '1.8rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              boxShadow: `0 0 20px ${statusBg}`,
            }}
          >
            <div style={{ maxWidth: '680px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '0.4rem', flexWrap: 'wrap' }}>
                <span
                  style={{
                    padding: '0.25rem 0.65rem',
                    borderRadius: '999px',
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    background: statusBg,
                    color: statusColor,
                    border: `1px solid ${statusColor}`,
                  }}
                >
                  {regressionDecision.verdict}
                </span>

                {evidenceStrength && (
                  <span
                    style={{
                      padding: '0.2rem 0.55rem',
                      borderRadius: '4px',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      background: evidenceStrength === 'STRONG' ? 'rgba(16, 185, 129, 0.15)' : evidenceStrength === 'GOOD' ? 'rgba(56, 189, 248, 0.15)' : evidenceStrength === 'MODERATE' ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      color: evidenceStrength === 'STRONG' ? '#10B981' : evidenceStrength === 'GOOD' ? '#38BDF8' : evidenceStrength === 'MODERATE' ? '#F59E0B' : '#EF4444',
                      border: `1px solid ${evidenceStrength === 'STRONG' ? '#10B981' : evidenceStrength === 'GOOD' ? '#38BDF8' : evidenceStrength === 'MODERATE' ? '#F59E0B' : '#EF4444'}`,
                    }}
                  >
                    EVIDENCE: {evidenceStrength} (N = {sampleSize})
                  </span>
                )}

                <span style={{ fontSize: '0.82rem', color: '#888888' }}>
                  Current Gate Status: <strong style={{ color: statusColor }}>{releaseDecision.status}</strong>
                </span>
              </div>

              <h3 style={{ margin: '0 0 0.4rem 0', color: '#FFFFFF', fontSize: '1.25rem' }}>
                {isBlocked ? 'Release Candidate Contains Critical Regressions' : isInsufficient ? 'Evaluation Gate: Insufficient Evidence to Qualify Release' : isConditional ? 'Release Candidate Conditionally Approved' : 'Release Candidate Meets All Reliability Thresholds'}
              </h3>

              <p style={{ margin: 0, fontSize: '0.85rem', color: '#CCCCCC', lineHeight: 1.5 }}>
                {regressionDecision.summary}
              </p>

              {/* Typed Regression Categories */}
              {regressionCategories.length > 0 && (
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', marginTop: '0.6rem' }}>
                  {regressionCategories.map((cat, idx) => (
                    <span
                      key={idx}
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        padding: '0.15rem 0.5rem',
                        borderRadius: '4px',
                        background: 'rgba(255, 68, 34, 0.15)',
                        color: '#FF6B6B',
                        border: '1px solid rgba(255, 68, 34, 0.35)',
                        fontFamily: 'monospace',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {cat}
                    </span>
                  ))}
                </div>
              )}

              {/* Violated rules */}
              {regressionDecision.violatedRules.length > 0 && (
                <ul style={{ margin: '0.6rem 0 0 1.2rem', padding: 0, fontSize: '0.8rem', color: '#FFAA99' }}>
                  {regressionDecision.violatedRules.map((rule, idx) => (
                    <li key={idx} style={{ marginBottom: '0.2rem' }}>
                      {rule}
                    </li>
                  ))}
                </ul>
              )}
            </div>

        {/* Release Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', minWidth: '220px' }}>
          <button
            onClick={() => handleDecision('BLOCK', 'Blocked due to automated regression thresholds.')}
            style={{
              background: releaseDecision.status === 'BLOCK' ? '#FF2200' : 'rgba(255, 34, 0, 0.15)',
              border: '1px solid #FF3311',
              color: '#FFFFFF',
              padding: '0.7rem 1.2rem',
              borderRadius: '6px',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer',
              letterSpacing: '0.04em',
            }}
          >
            ✕ BLOCK RELEASE
          </button>

          <button
            onClick={() => setIsOverrideModalOpen(true)}
            style={{
              background: releaseDecision.status === 'PASS' ? '#2ECC71' : 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#FFFFFF',
              padding: '0.65rem 1.2rem',
              borderRadius: '6px',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ✓ OVERRIDE & PASS RELEASE
          </button>

          <span style={{ fontSize: '0.7rem', color: '#778899', textAlign: 'center' }}>
            Audited by {releaseDecision.decidedBy}
          </span>
        </div>
      </div>
        );
      })()}

      {/* ── 2. Root-Cause Diagnostic Findings ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#FFFFFF', margin: 0 }}>
            Root-Cause Analysis Findings ({rootCauses.length})
          </h2>
          <span style={{ fontSize: '0.75rem', color: '#888888' }}>
            Generated by Transparent Rule-Based Diagnostic Engine
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: rootCauses.length > 1 ? '1fr 1fr' : '1fr', gap: '1.2rem' }}>
          {rootCauses.map((rc) => (
            <div
              key={rc.id}
              style={{
                background: '#161B22',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '10px',
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      color: 'var(--accent, #FF6B35)',
                      letterSpacing: '0.1em',
                    }}
                  >
                    {rc.category} // {rc.affectedCaseCount} AFFECTED CASES
                  </span>
                  <h3 style={{ margin: '0.3rem 0 0 0', fontSize: '1.05rem', color: '#FFFFFF' }}>
                    {rc.suspectedCause}
                  </h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.3rem' }}>
                  {rc.classification && (
                    <span
                      style={{
                        padding: '0.15rem 0.5rem',
                        borderRadius: '4px',
                        background:
                          rc.classification === 'OBSERVED'
                            ? 'rgba(16, 185, 129, 0.15)'
                            : rc.classification === 'CONFIRMED_DETERMINISTIC'
                            ? 'rgba(56, 189, 248, 0.15)'
                            : 'rgba(167, 139, 250, 0.15)',
                        color:
                          rc.classification === 'OBSERVED'
                            ? '#10B981'
                            : rc.classification === 'CONFIRMED_DETERMINISTIC'
                            ? '#38BDF8'
                            : '#C084FC',
                        fontSize: '0.68rem',
                        fontWeight: 800,
                        letterSpacing: '0.06em',
                      }}
                    >
                      {rc.classification}
                    </span>
                  )}
                  <span
                    style={{
                      padding: '0.2rem 0.55rem',
                      borderRadius: '4px',
                      background: 'rgba(77, 166, 255, 0.15)',
                      color: '#4DA6FF',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                    }}
                  >
                    {rc.diagnosticConfidence || (rc.confidenceScore ? `${rc.confidenceScore}% (Heuristic)` : 'Observed')}
                  </span>
                </div>
              </div>

              {/* Evidence */}
              <div>
                <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#888888', marginBottom: '0.4rem' }}>
                  Observed Diagnostic Evidence:
                </div>
                <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.82rem', color: '#CCCCCC', lineHeight: 1.45 }}>
                  {rc.evidence.map((ev, i) => (
                    <li key={i}>{ev}</li>
                  ))}
                </ul>
              </div>

              {/* Inference / Interpretation */}
              {rc.inference && (
                <div style={{ background: 'rgba(255, 255, 255, 0.03)', padding: '0.6rem 0.8rem', borderRadius: '6px', fontSize: '0.78rem', color: '#8899AA', borderLeft: '3px solid #8899AA' }}>
                  <strong style={{ color: '#CCCCCC' }}>Diagnostic Inference:</strong> {rc.inference}
                </div>
              )}

              {/* Recommendation */}
              <div
                style={{
                  background: 'rgba(255, 107, 53, 0.08)',
                  border: '1px solid rgba(255, 107, 53, 0.25)',
                  borderRadius: '6px',
                  padding: '0.9rem',
                  fontSize: '0.82rem',
                  color: '#FFEEDD',
                  lineHeight: 1.45,
                }}
              >
                <strong style={{ color: 'var(--accent, #FF6B35)' }}>Recommendation:</strong> {rc.recommendation}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 3. Failure Explorer Table ── */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: '#FFFFFF', margin: 0 }}>
            Scenario Results Explorer ({filteredCases.length})
          </h2>

          {/* Filter Bar */}
          <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center' }}>
            <div style={{ display: 'flex', background: '#161B22', borderRadius: '6px', padding: '0.2rem', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <button
                onClick={() => setStatusFilter('regressions')}
                style={{
                  background: statusFilter === 'regressions' ? 'rgba(255, 34, 0, 0.2)' : 'transparent',
                  border: 'none',
                  color: statusFilter === 'regressions' ? '#FF4422' : '#888888',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Regressions Only
              </button>
              <button
                onClick={() => setStatusFilter('failed')}
                style={{
                  background: statusFilter === 'failed' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                  border: 'none',
                  color: statusFilter === 'failed' ? '#FFFFFF' : '#888888',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                All Failed
              </button>
              {caseResults.some(
                (c) =>
                  c.executionStatus === 'PROVIDER_RATE_LIMIT' ||
                  c.candidateExecutionStatus === 'PROVIDER_RATE_LIMIT' ||
                  c.baselineExecutionStatus === 'PROVIDER_RATE_LIMIT' ||
                  c.candidateUsage?.error?.status === 429 ||
                  c.baselineUsage?.error?.status === 429
              ) && (
                <button
                  onClick={() => setStatusFilter('rate-limited')}
                  style={{
                    background: statusFilter === 'rate-limited' ? 'rgba(192, 132, 252, 0.2)' : 'transparent',
                    border: 'none',
                    color: statusFilter === 'rate-limited' ? '#C084FC' : '#A855F7',
                    padding: '0.35rem 0.75rem',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  ⚡ Rate Limited (429)
                </button>
              )}
              <button
                onClick={() => setStatusFilter('all')}
                style={{
                  background: statusFilter === 'all' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                  border: 'none',
                  color: statusFilter === 'all' ? '#FFFFFF' : '#888888',
                  padding: '0.35rem 0.75rem',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Show All ({caseResults.length})
              </button>
            </div>
          </div>
        </div>

        {/* Explorer Table */}
        <div
          style={{
            background: '#161B22',
            borderRadius: '10px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            overflowX: 'auto',
          }}
        >
          <div style={{ minWidth: '780px' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '80px 1.4fr 120px 140px 1.5fr 100px',
              padding: '0.8rem 1.2rem',
              background: '#0D1117',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              fontSize: '0.75rem',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: '#888888',
              fontWeight: 600,
            }}
          >
            <div>ID</div>
            <div>Scenario Name</div>
            <div>Category</div>
            <div>Status</div>
            <div>Failure Diagnosis / Detail</div>
            <div style={{ textAlign: 'right' }}>Inspect</div>
          </div>

          {filteredCases.length === 0 ? (
            <div style={{ padding: '3.5rem 2rem', textAlign: 'center', color: '#888888', fontSize: '0.9rem' }}>
              <div style={{ fontSize: '1.8rem', marginBottom: '0.4rem' }}>✓</div>
              <div style={{ color: '#FFFFFF', fontWeight: 600, marginBottom: '0.3rem' }}>
                No Scenarios Match Filter
              </div>
              <p style={{ margin: '0 0 1rem 0', color: '#8899AA', fontSize: '0.85rem' }}>
                {statusFilter === 'regressions'
                  ? 'Zero quality regressions detected in this evaluation run!'
                  : 'No scenarios found matching the active filter criteria.'}
              </p>
              {statusFilter !== 'all' && (
                <button
                  onClick={() => setStatusFilter('all')}
                  style={{
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#FFFFFF',
                    padding: '0.45rem 1rem',
                    borderRadius: '4px',
                    fontSize: '0.78rem',
                    cursor: 'pointer',
                  }}
                >
                  Show All ({caseResults.length}) Cases
                </button>
              )}
            </div>
          ) : (
            filteredCases.map((c) => {
              const isRegression = c.isRegression;
              const isRateLimit =
                c.executionStatus === 'PROVIDER_RATE_LIMIT' ||
                c.candidateExecutionStatus === 'PROVIDER_RATE_LIMIT' ||
                c.baselineExecutionStatus === 'PROVIDER_RATE_LIMIT' ||
                c.candidateUsage?.error?.status === 429 ||
                c.baselineUsage?.error?.status === 429;
              return (
                <div
                  key={c.testCaseId}
                  onClick={() => setSelectedCase(c)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '80px 1.4fr 120px 140px 1.5fr 100px',
                    padding: '1rem 1.2rem',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                    fontSize: '0.82rem',
                    alignItems: 'center',
                    cursor: 'pointer',
                    background: isRegression ? 'rgba(255, 34, 0, 0.03)' : isRateLimit ? 'rgba(192, 132, 252, 0.03)' : 'transparent',
                  }}
                >
                  <div style={{ fontFamily: 'monospace', color: '#4DA6FF', fontWeight: 600 }}>
                    {c.testCaseId}
                  </div>
                  <div>
                    <div style={{ color: '#FFFFFF', fontWeight: 600 }}>{c.testCaseName}</div>
                    <div style={{ fontSize: '0.7rem', color: '#778899' }}>Severity: {c.severity}</div>
                  </div>
                  <div>
                    <span
                      style={{
                        padding: '0.2rem 0.5rem',
                        borderRadius: '4px',
                        background: 'rgba(255, 255, 255, 0.06)',
                        fontSize: '0.72rem',
                        color: '#CCCCCC',
                      }}
                    >
                      {c.category}
                    </span>
                  </div>
                  <div>
                    {(() => {
                      const badge = getTestCaseBadge(c);
                      return (
                        <span
                          style={{
                            padding: '0.2rem 0.6rem',
                            borderRadius: '4px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            background: badge.bg,
                            color: badge.color,
                            border: `1px solid ${badge.border}`,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {badge.text}
                        </span>
                      );
                    })()}
                  </div>
                  <div
                    style={{
                      color: isRegression ? '#FFAA99' : '#AAAAAA',
                      fontSize: '0.78rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      paddingRight: '1rem',
                    }}
                  >
                    {c.failureReason || 'Baseline and candidate passed all criteria.'}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <button
                      style={{
                        background: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        color: '#FFFFFF',
                        padding: '0.35rem 0.75rem',
                        borderRadius: '4px',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Diff View
                    </button>
                  </div>
                </div>
              );
            })
          )}
          </div>
        </div>
      </div>

      {/* ── 4. Side-by-Side Diff Inspector Modal ── */}
      {selectedCase && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div
            style={{
              background: '#161B22',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '12px',
              padding: '2rem',
              width: '100%',
              maxWidth: '960px',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.9)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.5rem',
            }}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span style={{ fontFamily: 'monospace', color: '#4DA6FF', fontWeight: 700 }}>
                    {selectedCase.testCaseId}
                  </span>
                  <span style={{ color: '#888888' }}>/</span>
                  <span style={{ color: 'var(--accent, #FF6B35)', fontWeight: 600, fontSize: '0.8rem' }}>
                    {selectedCase.category}
                  </span>
                </div>
                <h3 style={{ margin: '0.3rem 0 0 0', color: '#FFFFFF', fontSize: '1.3rem' }}>
                  {selectedCase.testCaseName}
                </h3>
              </div>

              <button
                onClick={() => setSelectedCase(null)}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  color: '#FFFFFF',
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  cursor: 'pointer',
                  fontSize: '1rem',
                }}
              >
                ✕
              </button>
            </div>

            {/* Input & Expected Output */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem' }}>
              <div style={{ background: '#0D1117', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#888888', marginBottom: '0.4rem', fontWeight: 600 }}>
                  Input Scenario / Prompt
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: '#FFFFFF', lineHeight: 1.45 }}>
                  {selectedCase.input}
                </div>
              </div>

              <div style={{ background: '#0D1117', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#888888', marginBottom: '0.4rem', fontWeight: 600 }}>
                  Expected Reference Output
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: '#2ECC71', lineHeight: 1.45 }}>
                  {selectedCase.expectedOutput}
                </div>
              </div>
            </div>

            {/* Upstream Provider Operational Error Telemetry Banner */}
            {(selectedCase.candidateErrorDetail ||
              selectedCase.baselineErrorDetail ||
              selectedCase.executionStatus === 'PROVIDER_RATE_LIMIT' ||
              selectedCase.baselineExecutionStatus === 'PROVIDER_RATE_LIMIT' ||
              selectedCase.candidateExecutionStatus === 'PROVIDER_RATE_LIMIT') && (
              <div
                style={{
                  background: 'rgba(192, 132, 252, 0.08)',
                  border: '1px solid rgba(192, 132, 252, 0.3)',
                  borderRadius: '8px',
                  padding: '1rem 1.2rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.6rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={{ fontSize: '1rem' }}>⚡</span>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#C084FC' }}>
                      Upstream Provider Operational Telemetry
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      background: 'rgba(192, 132, 252, 0.2)',
                      color: '#E9D5FF',
                      padding: '0.2rem 0.6rem',
                      borderRadius: '4px',
                      border: '1px solid rgba(192, 132, 252, 0.3)',
                    }}
                  >
                    Isolated from Quality Pass Rate
                  </span>
                </div>

                {selectedCase.baselineErrorDetail && (
                  <div style={{ fontSize: '0.8rem', color: '#E9D5FF', lineHeight: 1.4 }}>
                    <strong style={{ color: '#C084FC' }}>Baseline [{selectedCase.baselineErrorDetail.provider}]:</strong>{' '}
                    HTTP {selectedCase.baselineErrorDetail.httpStatus} ({selectedCase.baselineErrorDetail.category}) —{' '}
                    <span style={{ fontFamily: 'monospace', color: '#FFFFFF' }}>{selectedCase.baselineErrorDetail.message}</span>
                    {selectedCase.baselineErrorDetail.retryAfterSeconds && (
                      <span style={{ color: '#FFAA44', marginLeft: '0.5rem' }}>
                        (Quota reset / retry-after: {selectedCase.baselineErrorDetail.retryAfterSeconds}s)
                      </span>
                    )}
                  </div>
                )}

                {selectedCase.candidateErrorDetail && (
                  <div style={{ fontSize: '0.8rem', color: '#E9D5FF', lineHeight: 1.4 }}>
                    <strong style={{ color: '#C084FC' }}>Candidate [{selectedCase.candidateErrorDetail.provider}]:</strong>{' '}
                    HTTP {selectedCase.candidateErrorDetail.httpStatus} ({selectedCase.candidateErrorDetail.category}) —{' '}
                    <span style={{ fontFamily: 'monospace', color: '#FFFFFF' }}>{selectedCase.candidateErrorDetail.message}</span>
                    {selectedCase.candidateErrorDetail.retryAfterSeconds && (
                      <span style={{ color: '#FFAA44', marginLeft: '0.5rem' }}>
                        (Quota reset / retry-after: {selectedCase.candidateErrorDetail.retryAfterSeconds}s)
                      </span>
                    )}
                  </div>
                )}

                {(!selectedCase.baselineErrorDetail && selectedCase.baselineExecutionStatus === 'PROVIDER_RATE_LIMIT') && (
                  <div style={{ fontSize: '0.8rem', color: '#E9D5FF' }}>
                    <strong style={{ color: '#C084FC' }}>Baseline:</strong> Request was throttled by upstream provider rate limits (HTTP 429).
                  </div>
                )}
                {(!selectedCase.candidateErrorDetail && selectedCase.candidateExecutionStatus === 'PROVIDER_RATE_LIMIT') && (
                  <div style={{ fontSize: '0.8rem', color: '#E9D5FF' }}>
                    <strong style={{ color: '#C084FC' }}>Candidate:</strong> Request was throttled by upstream provider rate limits (HTTP 429).
                  </div>
                )}
              </div>
            )}

            {/* Side-by-Side Model Diff */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.2rem' }}>
              {/* Baseline Output */}
              <div
                style={{
                  background: '#0D1117',
                  padding: '1.2rem',
                  borderRadius: '8px',
                  border: '1px solid rgba(46, 204, 113, 0.3)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.8rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span
                      style={{
                        fontSize: '0.65rem',
                        padding: '0.15rem 0.45rem',
                        borderRadius: '3px',
                        background: 'rgba(46, 204, 113, 0.15)',
                        color: '#2ECC71',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                      }}
                    >
                      {selectedCase.baselineUsage?.provider || run.baselineVersion.provider}
                    </span>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#2ECC71' }}>
                      {run.baselineVersion.name}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: '#888888' }}>
                    Score: {selectedCase.baselineScore !== null && selectedCase.baselineScore !== undefined ? selectedCase.baselineScore.toFixed(1) : '—'}
                  </span>
                </div>

                {/* Baseline Usage Telemetry Card */}
                {selectedCase.baselineUsage && (
                  <div
                    style={{
                      background: 'rgba(0, 0, 0, 0.3)',
                      padding: '0.6rem 0.8rem',
                      borderRadius: '6px',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '0.6rem',
                      fontSize: '0.72rem',
                    }}
                  >
                    <span style={{ color: '#CCCCCC' }}>
                      In: <strong style={{ color: '#FFFFFF' }}>{selectedCase.baselineUsage.inputTokens}</strong>
                    </span>
                    <span style={{ color: '#CCCCCC' }}>
                      Out: <strong style={{ color: '#FFFFFF' }}>{selectedCase.baselineUsage.outputTokens}</strong>
                    </span>
                    {(selectedCase.baselineUsage.reasoningTokens ?? 0) > 0 && (
                      <span style={{ color: '#C084FC', background: 'rgba(192, 132, 252, 0.12)', padding: '0 0.35rem', borderRadius: '3px' }}>
                        🧠 {selectedCase.baselineUsage.reasoningTokens} reasoning
                      </span>
                    )}
                    {(selectedCase.baselineUsage.cachedTokens ?? 0) > 0 && (
                      <span style={{ color: '#2ECC71', background: 'rgba(46, 204, 113, 0.12)', padding: '0 0.35rem', borderRadius: '3px' }}>
                        ⚡ {selectedCase.baselineUsage.cachedTokens} cached
                      </span>
                    )}
                    <span style={{ color: '#8899AA', marginLeft: 'auto' }}>
                      {selectedCase.baselineLatencyMs !== null && selectedCase.baselineLatencyMs !== undefined ? `${selectedCase.baselineLatencyMs}ms` : '—'} | ${selectedCase.baselineUsage.estimatedCostUsd.toFixed(5)}
                    </span>
                  </div>
                )}

                <pre
                  style={{
                    margin: 0,
                    fontFamily: 'monospace',
                    fontSize: '0.82rem',
                    color: '#CCCCCC',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    background: 'rgba(0, 0, 0, 0.4)',
                    padding: '0.8rem',
                    borderRadius: '6px',
                    minHeight: '80px',
                  }}
                >
                  {selectedCase.baselineOutput || (
                    <span style={{ color: '#888888', fontStyle: 'italic' }}>
                      NOT AVAILABLE
                      {selectedCase.baselineErrorDetail ? ` — Reason: ${selectedCase.baselineErrorDetail.message}` : ''}
                    </span>
                  )}
                </pre>
              </div>

              {/* Candidate Output */}
              <div
                style={{
                  background: '#0D1117',
                  padding: '1.2rem',
                  borderRadius: '8px',
                  border: `1px solid ${selectedCase.isRegression ? '#FF3311' : 'rgba(77, 166, 255, 0.3)'}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.8rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span
                      style={{
                        fontSize: '0.65rem',
                        padding: '0.15rem 0.45rem',
                        borderRadius: '3px',
                        background: selectedCase.isRegression ? 'rgba(255, 34, 0, 0.15)' : 'rgba(77, 166, 255, 0.15)',
                        color: selectedCase.isRegression ? '#FF4422' : '#4DA6FF',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                      }}
                    >
                      {selectedCase.candidateUsage?.provider || run.candidateVersion.provider}
                    </span>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: selectedCase.isRegression ? '#FF4422' : '#4DA6FF' }}>
                      {run.candidateVersion.name}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: selectedCase.isRegression ? '#FF4422' : '#2ECC71', fontWeight: 700 }}>
                    Score: {selectedCase.candidateScore !== null && selectedCase.candidateScore !== undefined ? selectedCase.candidateScore.toFixed(1) : '—'} ({selectedCase.isRegression ? 'REGRESSED' : selectedCase.passed === true ? 'PASSED' : selectedCase.passed === false ? 'QUALITY FAIL' : 'NOT EVALUATED'})
                  </span>
                </div>

                {/* Candidate Usage Telemetry Card */}
                {selectedCase.candidateUsage && (
                  <div
                    style={{
                      background: selectedCase.isRegression ? 'rgba(45, 12, 10, 0.4)' : 'rgba(0, 0, 0, 0.3)',
                      padding: '0.6rem 0.8rem',
                      borderRadius: '6px',
                      border: `1px solid ${selectedCase.isRegression ? 'rgba(255, 51, 17, 0.2)' : 'rgba(255, 255, 255, 0.06)'}`,
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '0.6rem',
                      fontSize: '0.72rem',
                    }}
                  >
                    <span style={{ color: '#CCCCCC' }}>
                      In: <strong style={{ color: '#FFFFFF' }}>{selectedCase.candidateUsage.inputTokens}</strong>
                    </span>
                    <span style={{ color: '#CCCCCC' }}>
                      Out: <strong style={{ color: '#FFFFFF' }}>{selectedCase.candidateUsage.outputTokens}</strong>
                    </span>
                    {(selectedCase.candidateUsage.reasoningTokens ?? 0) > 0 && (
                      <span style={{ color: '#C084FC', background: 'rgba(192, 132, 252, 0.12)', padding: '0 0.35rem', borderRadius: '3px' }}>
                        🧠 {selectedCase.candidateUsage.reasoningTokens} reasoning
                      </span>
                    )}
                    {(selectedCase.candidateUsage.cachedTokens ?? 0) > 0 && (
                      <span style={{ color: '#2ECC71', background: 'rgba(46, 204, 113, 0.12)', padding: '0 0.35rem', borderRadius: '3px' }}>
                        ⚡ {selectedCase.candidateUsage.cachedTokens} cached
                      </span>
                    )}
                    <span style={{ color: selectedCase.isRegression ? '#FF9988' : '#8899AA', marginLeft: 'auto' }}>
                      {selectedCase.candidateLatencyMs !== null && selectedCase.candidateLatencyMs !== undefined ? `${selectedCase.candidateLatencyMs}ms` : '—'} | ${selectedCase.candidateUsage.estimatedCostUsd.toFixed(5)}
                    </span>
                  </div>
                )}

                <pre
                  style={{
                    margin: 0,
                    fontFamily: 'monospace',
                    fontSize: '0.82rem',
                    color: selectedCase.isRegression ? '#FFBBAA' : '#CCCCCC',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all',
                    background: selectedCase.isRegression ? 'rgba(45, 12, 10, 0.5)' : 'rgba(0, 0, 0, 0.4)',
                    padding: '0.8rem',
                    borderRadius: '6px',
                    minHeight: '80px',
                  }}
                >
                  {selectedCase.candidateOutput || (
                    <span style={{ color: '#FFAA44', fontStyle: 'italic' }}>
                      NOT AVAILABLE
                      {selectedCase.failureReason ? ` — Reason: ${selectedCase.failureReason}` : ' — Provider call failed'}
                    </span>
                  )}
                </pre>
              </div>
            </div>

            {/* Evaluator Explanations & Failure Reason */}
            {selectedCase.failureReason && (
              <div
                style={{
                  background: 'rgba(255, 34, 0, 0.1)',
                  border: '1px solid #FF3311',
                  borderRadius: '8px',
                  padding: '1rem 1.2rem',
                  fontSize: '0.85rem',
                  color: '#FFAA99',
                }}
              >
                <strong>Evaluation Failure Rationale:</strong> {selectedCase.failureReason}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modal: Override & Pass Release ── */}
      {isOverrideModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            style={{
              background: '#161B22',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '12px',
              padding: '2rem',
              width: '100%',
              maxWidth: '480px',
            }}
          >
            <h3 style={{ margin: '0 0 0.8rem 0', color: '#FFFFFF' }}>Supervisor Release Override</h3>
            <p style={{ color: '#AAAAAA', fontSize: '0.85rem', margin: '0 0 1rem 0' }}>
              Document the engineering rationale for approving this release despite detected regression violations.
            </p>
            <textarea
              rows={3}
              required
              placeholder="e.g. Regressions are confined to legacy checkout endpoints slated for deprecation..."
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              style={{
                width: '100%',
                padding: '0.7rem',
                background: '#0D1117',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '6px',
                color: '#FFFFFF',
                fontSize: '0.85rem',
                boxSizing: 'border-box',
                marginBottom: '1rem',
              }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.8rem' }}>
              <button
                onClick={() => setIsOverrideModalOpen(false)}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  color: '#CCCCCC',
                  padding: '0.6rem 1.2rem',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDecision('PASS', overrideReason || 'Manual supervisor override.')}
                style={{
                  background: '#2ECC71',
                  color: '#000000',
                  border: 'none',
                  padding: '0.6rem 1.4rem',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Confirm Pass Release
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Comparison Report Modal */}
      {isReportModalOpen && run.comparisonReport && (
        <ComparisonReportModal
          report={run.comparisonReport}
          onClose={() => setIsReportModalOpen(false)}
        />
      )}
    </div>
  );
};
