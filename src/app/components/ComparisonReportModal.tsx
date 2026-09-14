/* ============================================================
   RELIQ — Cross-Model Comparison Report Modal (Engine V2)
   
   Renders the complete cross-model comparison report:
   - Winner determination & composite confidence
   - Canonical recommendation verdict (SHIP, SHIP WITH CONDITIONS,
     NO REGRESSION, REGRESSION DETECTED, BLOCK RELEASE, INSUFFICIENT EVIDENCE)
   - Evidence Strength badge with sample size & single-case sensitivity
   - Methodological limitations & Groundedness disclosures
   - 4-metric Delta summary (Quality, Latency, Tokens, Cost)
   - Full metric-by-metric comparison table with absolute & percentage deltas
   - Concrete evidence findings & recommended engineering actions
   ============================================================ */

import React, { useEffect, useState } from 'react';
import { ComparisonReport, RecommendationVerdict } from '../../evaluation/comparator';

interface ComparisonReportModalProps {
  report: ComparisonReport;
  onClose: () => void;
}

export const ComparisonReportModal: React.FC<ComparisonReportModalProps> = ({
  report,
  onClose,
}) => {
  const [copiedNotification, setCopiedNotification] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleExportJson = () => {
    const dataStr = JSON.stringify(report, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reliq-report-${report.id || 'export'}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopySummary = async () => {
    const bModel = `${report.baseline.provider.toUpperCase()} (${report.baseline.model})`;
    const cModel = `${report.candidate.provider.toUpperCase()} (${report.candidate.model})`;
    const bPass = report.metrics.passRate?.baselineValue !== null && report.metrics.passRate?.baselineValue !== undefined ? `${report.metrics.passRate.baselineValue}%` : 'N/A';
    const cPass = report.metrics.passRate?.candidateValue !== null && report.metrics.passRate?.candidateValue !== undefined ? `${report.metrics.passRate.candidateValue}%` : 'N/A';
    const bLat = report.metrics.avgLatencyMs?.baselineValue !== null && report.metrics.avgLatencyMs?.baselineValue !== undefined ? `${report.metrics.avgLatencyMs.baselineValue}ms` : 'N/A';
    const cLat = report.metrics.avgLatencyMs?.candidateValue !== null && report.metrics.avgLatencyMs?.candidateValue !== undefined ? `${report.metrics.avgLatencyMs.candidateValue}ms` : 'N/A';
    const bCost = report.metrics.estimatedCostUsd?.baselineValue !== null && report.metrics.estimatedCostUsd?.baselineValue !== undefined ? `$${report.metrics.estimatedCostUsd.baselineValue.toFixed(4)}` : 'N/A';
    const cCost = report.metrics.estimatedCostUsd?.candidateValue !== null && report.metrics.estimatedCostUsd?.candidateValue !== undefined ? `$${report.metrics.estimatedCostUsd.candidateValue.toFixed(4)}` : 'N/A';

    const summaryText = `# RELIQ Comparison Report: ${report.title}
**Verdict**: ${report.recommendation} (Evidence: ${report.evidenceStrength || 'N/A'})
**Dataset**: ${report.datasetName} (${report.totalCases} cases)
**Baseline (${bModel})**: Pass Rate: ${bPass} | Latency: ${bLat} | Cost: ${bCost}
**Candidate (${cModel})**: Pass Rate: ${cPass} | Latency: ${cLat} | Cost: ${cCost}
**Recommendation Reason**: ${report.recommendationReason || report.winnerReason}
`;
    try {
      await navigator.clipboard.writeText(summaryText);
      setCopiedNotification(true);
      setTimeout(() => setCopiedNotification(false), 2500);
    } catch {
      // ignore
    }
  };
  const getRecommendationStyle = (verdict: RecommendationVerdict | string) => {
    switch (verdict) {
      case 'SHIP':
        return {
          bg: 'linear-gradient(90deg, rgba(16, 50, 25, 0.95) 0%, rgba(10, 35, 18, 0.95) 100%)',
          border: '#2ECC71',
          color: '#2ECC71',
          glow: 'rgba(46, 204, 113, 0.25)',
          label: '✓ RECOMMENDATION: SHIP TO PRODUCTION',
        };
      case 'SHIP WITH CONDITIONS':
      case 'SHIP_WITH_CONDITIONS':
        return {
          bg: 'linear-gradient(90deg, rgba(60, 45, 10, 0.95) 0%, rgba(40, 30, 8, 0.95) 100%)',
          border: '#F39C12',
          color: '#F39C12',
          glow: 'rgba(243, 156, 18, 0.25)',
          label: '⚡ RECOMMENDATION: SHIP WITH MONITORING CONDITIONS',
        };
      case 'NO REGRESSION':
      case 'NO_REGRESSION':
        return {
          bg: 'linear-gradient(90deg, rgba(15, 35, 55, 0.95) 0%, rgba(10, 25, 40, 0.95) 100%)',
          border: '#4DA6FF',
          color: '#4DA6FF',
          glow: 'rgba(77, 166, 255, 0.25)',
          label: '✓ RECOMMENDATION: NO REGRESSION (PARITY MAINTAINED)',
        };
      case 'REGRESSION DETECTED':
      case 'REGRESSION_DETECTED':
        return {
          bg: 'linear-gradient(90deg, rgba(55, 25, 15, 0.95) 0%, rgba(40, 18, 10, 0.95) 100%)',
          border: '#E67E22',
          color: '#E67E22',
          glow: 'rgba(230, 126, 34, 0.25)',
          label: '⚠ RECOMMENDATION: REGRESSION DETECTED',
        };
      case 'BLOCK RELEASE':
      case 'BLOCK':
        return {
          bg: 'linear-gradient(90deg, rgba(60, 12, 10, 0.95) 0%, rgba(35, 8, 6, 0.95) 100%)',
          border: '#FF3311',
          color: '#FF3311',
          glow: 'rgba(255, 51, 17, 0.3)',
          label: '⛔ RECOMMENDATION: BLOCK RELEASE (CRITICAL VIOLATION)',
        };
      case 'INSUFFICIENT EVIDENCE':
      case 'INSUFFICIENT_EVIDENCE':
      default:
        return {
          bg: 'linear-gradient(90deg, rgba(35, 25, 50, 0.95) 0%, rgba(25, 18, 35, 0.95) 100%)',
          border: '#9B59B6',
          color: '#C084FC',
          glow: 'rgba(155, 89, 182, 0.25)',
          label: '❓ RECOMMENDATION: INSUFFICIENT EVIDENCE',
        };
    }
  };

  const recStyle = getRecommendationStyle(report.recommendation);
  const metricEntries = Object.values(report.metrics).filter(Boolean);

  const executionMode = report.executionMode || 'SAVED';
  const getModeBadge = (mode: string) => {
    switch (mode) {
      case 'LIVE':
        return {
          label: 'LIVE EVALUATION',
          color: '#10B981',
          bg: 'rgba(16, 185, 129, 0.12)',
          border: 'rgba(16, 185, 129, 0.4)',
          dot: true,
        };
      case 'REFERENCE':
        return {
          label: 'REFERENCE DATA',
          color: '#A78BFA',
          bg: 'rgba(167, 139, 250, 0.12)',
          border: 'rgba(167, 139, 250, 0.4)',
          dot: false,
        };
      case 'SAVED':
      default:
        return {
          label: 'SAVED EVALUATION',
          color: '#38BDF8',
          bg: 'rgba(56, 189, 248, 0.12)',
          border: 'rgba(56, 189, 248, 0.4)',
          dot: false,
        };
    }
  };
  const modeBadge = getModeBadge(executionMode);

  const evidenceStrength =
    report.evidenceStrength ||
    (report.totalCases < 10 ? 'LOW' : report.totalCases < 50 ? 'MODERATE' : report.totalCases < 100 ? 'GOOD' : 'STRONG');
  const swingPct = report.totalCases > 0 ? (100 / report.totalCases).toFixed(0) : 100;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '2rem',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#0D1117',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          borderRadius: '14px',
          width: '100%',
          maxWidth: '1000px',
          maxHeight: '92vh',
          overflowY: 'auto',
          padding: '2.2rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.6rem',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.8)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Modal Header ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.3rem' }}>
              <div style={{ fontSize: '0.72rem', letterSpacing: '0.2em', color: 'var(--accent, #FF6B35)', fontWeight: 700, textTransform: 'uppercase' }}>
                RELIQ // CROSS-MODEL COMPARISON REPORT (ENGINE V2)
              </div>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  padding: '0.15rem 0.55rem',
                  borderRadius: '4px',
                  background: modeBadge.bg,
                  border: `1px solid ${modeBadge.border}`,
                  color: modeBadge.color,
                }}
              >
                {modeBadge.dot && (
                  <span
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: '#10B981',
                      boxShadow: '0 0 6px #10B981',
                      display: 'inline-block',
                    }}
                  />
                )}
                {modeBadge.label}
              </span>
            </div>
            <h2 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#FFFFFF', margin: '0.3rem 0 0.2rem 0' }}>
              {report.title}
            </h2>
            <div style={{ fontSize: '0.82rem', color: '#8899AA' }}>
              Dataset: <strong style={{ color: '#CCCCCC' }}>{report.datasetName}</strong> ({report.totalCases} scenarios) • Generated: {new Date(report.timestamp).toLocaleString()}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            {copiedNotification && (
              <span style={{ fontSize: '0.75rem', color: '#2ECC71', fontWeight: 600 }}>
                ✓ Summary Copied!
              </span>
            )}
            <button
              onClick={handleCopySummary}
              title="Copy markdown summary to clipboard"
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#ECECEC',
                padding: '0.45rem 0.8rem',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              📋 Copy Summary
            </button>
            <button
              onClick={handleExportJson}
              title="Download comparison report JSON"
              style={{
                background: 'var(--accent, #FF6B35)',
                border: 'none',
                color: '#000000',
                padding: '0.45rem 0.9rem',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              ⬇ Export JSON
            </button>
            <button
              onClick={onClose}
              aria-label="Close comparison report modal"
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#FFFFFF',
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                cursor: 'pointer',
                fontSize: '1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── 1. Recommendation Banner ── */}
        <div
          style={{
            background: recStyle.bg,
            border: `1px solid ${recStyle.border}`,
            boxShadow: `0 0 25px ${recStyle.glow}`,
            borderRadius: '10px',
            padding: '1.4rem 1.6rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.12em', color: recStyle.color }}>
              {recStyle.label}
            </span>
            <span style={{ fontSize: '0.75rem', color: '#E0E0E0', background: 'rgba(0, 0, 0, 0.4)', padding: '0.2rem 0.6rem', borderRadius: '4px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
              Evidence Strength: <strong style={{ color: '#FFFFFF' }}>{evidenceStrength}</strong> (N = {report.totalCases}, 1 failure = {swingPct}% swing)
            </span>
          </div>

          <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#FFFFFF', marginBottom: '0.4rem' }}>
            {report.recommendationReason}
          </div>

          {report.actionItems.length > 0 && (
            <div style={{ fontSize: '0.82rem', color: '#DDDDDD', marginTop: '0.6rem', borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '0.6rem' }}>
              <strong>Recommended Engineering Actions:</strong> {report.actionItems.join(' • ')}
            </div>
          )}
        </div>

        {/* ── 1.15 Safety & Refusal Classification Breakdown ── */}
        {report.safetyBreakdown && report.safetyBreakdown.totalSafetyRelatedCases > 0 && (
          <div
            style={{
              background: '#0D1117',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              padding: '1rem 1.2rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.6rem',
                flexWrap: 'wrap',
                gap: '0.5rem',
              }}
            >
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: '#8899AA',
                }}
              >
                SAFETY & REFUSAL CLASSIFICATION BREAKDOWN ({report.safetyBreakdown.totalSafetyRelatedCases} CASES)
              </span>
              <span
                style={{
                  fontSize: '0.68rem',
                  padding: '0.15rem 0.5rem',
                  borderRadius: '3px',
                  fontWeight: 700,
                  background: report.safetyBreakdown.secretsLeaked
                    ? 'rgba(239, 68, 68, 0.2)'
                    : 'rgba(16, 185, 129, 0.15)',
                  color: report.safetyBreakdown.secretsLeaked ? '#EF4444' : '#10B981',
                  border: `1px solid ${
                    report.safetyBreakdown.secretsLeaked
                      ? 'rgba(239, 68, 68, 0.4)'
                      : 'rgba(16, 185, 129, 0.3)'
                  }`,
                }}
              >
                {report.safetyBreakdown.secretsLeaked
                  ? '⚠ CREDENTIAL LEAK DETECTED'
                  : '✓ 0 CREDENTIALS LEAKED'}
              </span>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '0.6rem',
                marginBottom: '0.6rem',
              }}
            >
              <div
                style={{
                  background: 'rgba(0,0,0,0.3)',
                  padding: '0.6rem 0.8rem',
                  borderRadius: '6px',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div style={{ fontSize: '0.68rem', color: '#8899AA' }}>Prompt Injection Failures</div>
                <div
                  style={{
                    fontSize: '1.05rem',
                    fontWeight: 700,
                    color:
                      report.safetyBreakdown.promptInjectionCount > 0 ? '#F87171' : '#10B981',
                  }}
                >
                  {report.safetyBreakdown.promptInjectionCount}
                </div>
                <div style={{ fontSize: '0.65rem', color: '#667788' }}>
                  Adversary roleplay / persona bypass
                </div>
              </div>

              <div
                style={{
                  background: 'rgba(0,0,0,0.3)',
                  padding: '0.6rem 0.8rem',
                  borderRadius: '6px',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div style={{ fontSize: '0.68rem', color: '#8899AA' }}>Refusal Criteria Mismatches</div>
                <div
                  style={{
                    fontSize: '1.05rem',
                    fontWeight: 700,
                    color:
                      report.safetyBreakdown.refusalCriteriaMismatchCount > 0 ? '#FBBF24' : '#10B981',
                  }}
                >
                  {report.safetyBreakdown.refusalCriteriaMismatchCount}
                </div>
                <div style={{ fontSize: '0.65rem', color: '#667788' }}>
                  Model refused; missed keyword criteria
                </div>
              </div>

              <div
                style={{
                  background: 'rgba(0,0,0,0.3)',
                  padding: '0.6rem 0.8rem',
                  borderRadius: '6px',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div style={{ fontSize: '0.68rem', color: '#8899AA' }}>Safety Policy Failures</div>
                <div
                  style={{
                    fontSize: '1.05rem',
                    fontWeight: 700,
                    color:
                      report.safetyBreakdown.safetyPolicyFailureCount > 0 ? '#F87171' : '#10B981',
                  }}
                >
                  {report.safetyBreakdown.safetyPolicyFailureCount}
                </div>
                <div style={{ fontSize: '0.65rem', color: '#667788' }}>
                  Complied with hazardous prompt
                </div>
              </div>

              <div
                style={{
                  background: 'rgba(0,0,0,0.3)',
                  padding: '0.6rem 0.8rem',
                  borderRadius: '6px',
                  border: '1px solid rgba(255,255,255,0.06)',
                }}
              >
                <div style={{ fontSize: '0.68rem', color: '#8899AA' }}>Credential / Key Leaks</div>
                <div
                  style={{
                    fontSize: '1.05rem',
                    fontWeight: 700,
                    color:
                      report.safetyBreakdown.credentialLeakCount > 0 ? '#EF4444' : '#10B981',
                  }}
                >
                  {report.safetyBreakdown.credentialLeakCount}
                </div>
                <div style={{ fontSize: '0.65rem', color: '#667788' }}>
                  Exposed API tokens or secrets
                </div>
              </div>
            </div>

            <div style={{ fontSize: '0.72rem', color: '#94A3B8', lineHeight: 1.4 }}>
              <strong>Audit Principle:</strong> Refusal criteria mismatches occur when a model properly refuses an unauthorized instruction (e.g. <em>"I’m sorry, but I can’t help with that."</em>) but does not emit domain-specific enterprise vocabulary expected by deterministic keyword evaluators. These are not safety bypasses or credential leaks.
            </div>
          </div>
        )}

        {/* ── 1.2 Evaluation Configuration Disclosures (Honest Semantics) ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0.8rem' }}>
          {/* Factuality & Groundedness */}
          <div style={{ background: '#0D1117', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)', padding: '0.9rem 1.2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8899AA' }}>
                FACTUALITY / GROUNDEDNESS
              </span>
              <span style={{ fontSize: '0.65rem', padding: '0.12rem 0.45rem', borderRadius: '3px', background: 'rgba(255, 255, 255, 0.06)', color: '#CCCCCC', border: '1px solid rgba(255, 255, 255, 0.12)' }}>
                NOT CONFIGURED
              </span>
            </div>
            <div style={{ fontSize: '0.76rem', color: '#A0B0C0', lineHeight: 1.45 }}>
              Deterministic keyword presence/absence indicates exact criteria compliance, not factual hallucination. Grounded evaluation requires a retrieval corpus.
            </div>
          </div>

          {/* Semantic Evaluation */}
          <div style={{ background: '#0D1117', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)', padding: '0.9rem 1.2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8899AA' }}>
                SEMANTIC EVALUATION (NLI)
              </span>
              <span style={{ fontSize: '0.65rem', padding: '0.12rem 0.45rem', borderRadius: '3px', background: 'rgba(255, 255, 255, 0.06)', color: '#CCCCCC', border: '1px solid rgba(255, 255, 255, 0.12)' }}>
                NOT CONFIGURED
              </span>
            </div>
            <div style={{ fontSize: '0.76rem', color: '#A0B0C0', lineHeight: 1.45 }}>
              Evaluators verify exact phrasing and deterministic patterns. Embedding similarity and Natural Language Inference (NLI) are not configured.
            </div>
          </div>

          {/* LLM-as-a-Judge */}
          <div style={{ background: '#0D1117', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)', padding: '0.9rem 1.2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8899AA' }}>
                LLM-AS-A-JUDGE
              </span>
              <span style={{ fontSize: '0.65rem', padding: '0.12rem 0.45rem', borderRadius: '3px', background: 'rgba(255, 255, 255, 0.06)', color: '#CCCCCC', border: '1px solid rgba(255, 255, 255, 0.12)' }}>
                NOT CONFIGURED
              </span>
            </div>
            <div style={{ fontSize: '0.76rem', color: '#A0B0C0', lineHeight: 1.45 }}>
              No secondary evaluator model or subjective qualitative scoring rubric is configured for this benchmark suite.
            </div>
          </div>
        </div>

        {/* ── 1.25 Unequal Sample Sizes Alert ── */}
        {(report.hasUnequalSampleSizes || report.sampleSizeWarning) && (
          <div
            style={{
              background: 'rgba(243, 156, 18, 0.08)',
              border: '1px solid rgba(243, 156, 18, 0.35)',
              borderRadius: '8px',
              padding: '0.9rem 1.3rem',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              fontSize: '0.82rem',
              color: '#FDE68A',
            }}
          >
            <span style={{ fontSize: '1.3rem' }}>⚖️</span>
            <div>
              <strong style={{ color: '#F59E0B' }}>Unequal Evaluation Sample Sizes:</strong>{' '}
              {report.sampleSizeWarning ||
                'Baseline and candidate completed different numbers of test scenarios due to upstream provider rate limits or errors. Metric deltas reflect unequal sample bases.'}
            </div>
          </div>
        )}

        {/* ── 1.26 Percentile Stability Warning ── */}
        {(report.latencyPercentileWarning || report.totalCases < 20) && (
          <div
            style={{
              background: 'rgba(56, 189, 248, 0.06)',
              border: '1px solid rgba(56, 189, 248, 0.25)',
              borderRadius: '8px',
              padding: '0.7rem 1.2rem',
              fontSize: '0.76rem',
              color: '#BAE6FD',
            }}
          >
            ℹ️ <strong>Latency Percentile Notice:</strong> Low sample size for percentile interpretation (N &lt; 20). Tail latency (P95) may be unstable.
          </div>
        )}

        {/* ── 1.3 Methodological Disclosures & Limitations ── */}
        {report.limitations && report.limitations.length > 0 && (
          <div style={{ background: '#0D1117', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)', padding: '0.9rem 1.2rem' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8899AA', marginBottom: '0.4rem' }}>
              METHODOLOGICAL DISCLOSURES & LIMITATIONS
            </div>
            <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.76rem', color: '#8899AA', lineHeight: 1.5 }}>
              {report.limitations.map((lim, idx) => (
                <li key={idx}>{lim}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Insufficient Coverage Alert */}
        {report.metrics.evaluationCoverage &&
          (((report.metrics.evaluationCoverage.baselineValue ?? 100) < 80) ||
            ((report.metrics.evaluationCoverage.candidateValue ?? 100) < 80)) && (
            <div
              style={{
                background: 'rgba(192, 132, 252, 0.08)',
                border: '1px solid rgba(192, 132, 252, 0.3)',
                borderRadius: '8px',
                padding: '0.9rem 1.3rem',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                fontSize: '0.82rem',
                color: '#E9D5FF',
              }}
            >
              <span style={{ fontSize: '1.3rem' }}>⚡</span>
              <div>
                <strong style={{ color: '#C084FC' }}>Insufficient Evaluation Coverage Detected:</strong> Baseline completed{' '}
                <strong>{report.metrics.evaluationCoverage.baselineValue !== null ? `${report.metrics.evaluationCoverage.baselineValue}%` : '—'}</strong> of scenarios, Candidate completed{' '}
                <strong>{report.metrics.evaluationCoverage.candidateValue !== null ? `${report.metrics.evaluationCoverage.candidateValue}%` : '—'}</strong>.
                {report.metrics.rateLimitCount && report.metrics.rateLimitCount.baselineValue !== null && report.metrics.rateLimitCount.baselineValue > 0 && (
                  <span style={{ color: '#FFAA44' }}>
                    {' '}Baseline encountered {report.metrics.rateLimitCount.baselineValue} upstream HTTP 429 quota exhaustion event(s).
                  </span>
                )}
                {report.metrics.rateLimitCount && report.metrics.rateLimitCount.candidateValue !== null && report.metrics.rateLimitCount.candidateValue > 0 && (
                  <span style={{ color: '#FFAA44' }}>
                    {' '}Candidate encountered {report.metrics.rateLimitCount.candidateValue} upstream HTTP 429 quota exhaustion event(s).
                  </span>
                )}
                <div style={{ marginTop: '0.2rem', color: '#B0C0D0', fontSize: '0.78rem' }}>
                  Model answer quality scores are evaluated strictly against successful outputs. No winner is certified without sufficient evidence.
                </div>
              </div>
            </div>
          )}

        {/* ── 1.4 Execution Provenance & Audit Card ── */}
        <div style={{ background: '#0D1117', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)', padding: '0.9rem 1.2rem' }}>
          <div style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8899AA', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>EXECUTION PROVENANCE & AUDIT TRAIL</span>
            <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.45rem', borderRadius: '3px', background: modeBadge.bg, color: modeBadge.color, border: `1px solid ${modeBadge.border}` }}>
              {modeBadge.label}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.8rem', fontSize: '0.78rem' }}>
            <div>
              <div style={{ color: '#667788' }}>Run Identifier</div>
              <div style={{ color: '#FFFFFF', fontFamily: 'monospace', wordBreak: 'break-all', fontWeight: 600 }}>{report.id}</div>
            </div>
            <div>
              <div style={{ color: '#667788' }}>Execution Mode</div>
              <div style={{ color: modeBadge.color, fontWeight: 700 }}>{modeBadge.label}</div>
            </div>
            <div>
              <div style={{ color: '#667788' }}>Initiated / Completed</div>
              <div style={{ color: '#CCCCCC', fontFamily: 'monospace' }}>
                {report.provenance?.initiatedAt ? new Date(report.provenance.initiatedAt).toLocaleTimeString() : new Date(report.timestamp).toLocaleTimeString()}
                {' → '}
                {report.provenance?.completedAt ? new Date(report.provenance.completedAt).toLocaleTimeString() : new Date(report.timestamp).toLocaleTimeString()}
              </div>
            </div>
            <div>
              <div style={{ color: '#667788' }}>Coverage & Outcomes</div>
              <div style={{ color: '#FFFFFF', fontFamily: 'monospace' }}>
                {report.provenance
                  ? `${report.provenance.totalAttempted} attempted (Base: ${report.provenance.baselineEvaluated}, Cand: ${report.provenance.candidateEvaluated} eval)`
                  : `${report.totalCases} attempted cases`}
              </div>
            </div>
            <div>
              <div style={{ color: '#667788' }}>Provider Operations</div>
              <div style={{ color: report.provenance?.hadOperationalErrors ? '#FFAA44' : '#2ECC71', fontWeight: 600 }}>
                {report.provenance?.hadOperationalErrors
                  ? `429 Rate Limits: Base ${report.provenance.baselineRateLimits}, Cand ${report.provenance.candidateRateLimits}`
                  : 'All provider API requests succeeded'}
              </div>
            </div>
          </div>
        </div>

        {/* ── 1.5 SIDE-BY-SIDE SUMMARY TABLE ── */}
        <div style={{ background: '#0D1117', borderRadius: '8px', border: `1px solid ${modeBadge.border}`, overflow: 'hidden' }}>
          <div style={{ padding: '0.8rem 1.2rem', background: modeBadge.bg, borderBottom: `1px solid ${modeBadge.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 800, letterSpacing: '0.08em', color: modeBadge.color, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {modeBadge.dot && (
                <span
                  style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    background: '#10B981',
                    boxShadow: '0 0 6px #10B981',
                    display: 'inline-block',
                  }}
                />
              )}
              {modeBadge.label}: {report.baseline.provider.toUpperCase()} ({report.baseline.model}) vs {report.candidate.provider.toUpperCase()} ({report.candidate.model})
            </div>
            <div style={{ fontSize: '0.75rem', color: '#8899AA' }}>
              Recommendation: <strong style={{ color: recStyle.color }}>{report.recommendation}</strong>
            </div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'rgba(255, 255, 255, 0.03)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: '#888888', fontSize: '0.72rem', textTransform: 'uppercase' }}>
                <th style={{ padding: '0.65rem 1.2rem' }}>Metric</th>
                <th style={{ padding: '0.65rem 1.2rem' }}>Baseline ({report.baseline.provider.toUpperCase()})</th>
                <th style={{ padding: '0.65rem 1.2rem' }}>Candidate ({report.candidate.provider.toUpperCase()})</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                <td style={{ padding: '0.55rem 1.2rem', color: '#CCCCCC' }}>Test Cases (Sample Size)</td>
                <td style={{ padding: '0.55rem 1.2rem', color: '#FFFFFF', fontFamily: 'monospace' }}>{report.totalCases}</td>
                <td style={{ padding: '0.55rem 1.2rem', color: '#FFFFFF', fontFamily: 'monospace' }}>{report.totalCases}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                <td style={{ padding: '0.55rem 1.2rem', color: '#CCCCCC' }}>Evaluated Cases</td>
                <td style={{ padding: '0.55rem 1.2rem', color: '#FFFFFF', fontFamily: 'monospace' }}>{report.metrics.evaluationCoverage?.baselineValue !== null && report.metrics.evaluationCoverage?.baselineValue !== undefined ? Math.round((report.metrics.evaluationCoverage.baselineValue / 100) * report.totalCases) : 0} / {report.totalCases}</td>
                <td style={{ padding: '0.55rem 1.2rem', color: '#FFFFFF', fontFamily: 'monospace' }}>{report.metrics.evaluationCoverage?.candidateValue !== null && report.metrics.evaluationCoverage?.candidateValue !== undefined ? Math.round((report.metrics.evaluationCoverage.candidateValue / 100) * report.totalCases) : 0} / {report.totalCases}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                <td style={{ padding: '0.55rem 1.2rem', color: '#CCCCCC' }}>Evaluation Coverage</td>
                <td style={{ padding: '0.55rem 1.2rem', color: (report.metrics.evaluationCoverage?.baselineValue ?? 0) >= 80 ? '#2ECC71' : '#FFAA44', fontFamily: 'monospace', fontWeight: 600 }}>{report.metrics.evaluationCoverage?.baselineValue !== null && report.metrics.evaluationCoverage?.baselineValue !== undefined ? `${report.metrics.evaluationCoverage.baselineValue}%` : '—'}</td>
                <td style={{ padding: '0.55rem 1.2rem', color: (report.metrics.evaluationCoverage?.candidateValue ?? 0) >= 80 ? '#2ECC71' : '#FFAA44', fontFamily: 'monospace', fontWeight: 600 }}>{report.metrics.evaluationCoverage?.candidateValue !== null && report.metrics.evaluationCoverage?.candidateValue !== undefined ? `${report.metrics.evaluationCoverage.candidateValue}%` : '—'}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                <td style={{ padding: '0.55rem 1.2rem', color: '#CCCCCC' }}>Binary Pass Rate (Evaluated)</td>
                <td style={{ padding: '0.55rem 1.2rem', color: '#FFFFFF', fontFamily: 'monospace' }}>
                  {report.metrics.passRate.baselineValue !== null ? `${report.metrics.passRate.baselineValue}%` : '—'}
                </td>
                <td style={{ padding: '0.55rem 1.2rem', color: '#FFFFFF', fontFamily: 'monospace' }}>
                  {report.metrics.passRate.candidateValue !== null ? `${report.metrics.passRate.candidateValue}%` : '—'}
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                <td style={{ padding: '0.55rem 1.2rem', color: '#CCCCCC' }}>Composite Evaluation Score</td>
                <td style={{ padding: '0.55rem 1.2rem', color: '#FFFFFF', fontFamily: 'monospace' }}>
                  {report.metrics.qualityScore.baselineValue !== null ? `${report.metrics.qualityScore.baselineValue}%` : '—'}
                </td>
                <td style={{ padding: '0.55rem 1.2rem', color: '#FFFFFF', fontFamily: 'monospace' }}>
                  {report.metrics.qualityScore.candidateValue !== null ? `${report.metrics.qualityScore.candidateValue}%` : '—'}
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                <td style={{ padding: '0.55rem 1.2rem', color: '#CCCCCC' }}>Rate Limits (HTTP 429)</td>
                <td style={{ padding: '0.55rem 1.2rem', color: (report.metrics.rateLimitCount?.baselineValue ?? 0) > 0 ? '#FFAA44' : '#2ECC71', fontFamily: 'monospace' }}>{report.metrics.rateLimitCount?.baselineValue ?? 0}</td>
                <td style={{ padding: '0.55rem 1.2rem', color: (report.metrics.rateLimitCount?.candidateValue ?? 0) > 0 ? '#FFAA44' : '#2ECC71', fontFamily: 'monospace' }}>{report.metrics.rateLimitCount?.candidateValue ?? 0}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                <td style={{ padding: '0.55rem 1.2rem', color: '#CCCCCC' }}>Provider Errors</td>
                <td style={{ padding: '0.55rem 1.2rem', color: (report.metrics.providerErrorCount?.baselineValue || 0) > 0 ? '#FF4422' : '#2ECC71', fontFamily: 'monospace' }}>{report.metrics.providerErrorCount?.baselineValue || 0}</td>
                <td style={{ padding: '0.55rem 1.2rem', color: (report.metrics.providerErrorCount?.candidateValue || 0) > 0 ? '#FF4422' : '#2ECC71', fontFamily: 'monospace' }}>{report.metrics.providerErrorCount?.candidateValue || 0}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                <td style={{ padding: '0.55rem 1.2rem', color: '#CCCCCC' }}>Observed API Round-Trip Latency (Mean)</td>
                <td style={{ padding: '0.55rem 1.2rem', color: '#FFFFFF', fontFamily: 'monospace' }}>
                  {report.metrics.avgLatencyMs.baselineValue !== null ? `${report.metrics.avgLatencyMs.baselineValue}ms` : '—'}
                </td>
                <td style={{ padding: '0.55rem 1.2rem', color: '#FFFFFF', fontFamily: 'monospace' }}>
                  {report.metrics.avgLatencyMs.candidateValue !== null ? `${report.metrics.avgLatencyMs.candidateValue}ms` : '—'}
                </td>
              </tr>
              <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                <td style={{ padding: '0.55rem 1.2rem', color: '#CCCCCC' }}>Total Tokens (Input + Output)</td>
                <td style={{ padding: '0.55rem 1.2rem', color: '#FFFFFF', fontFamily: 'monospace' }}>
                  {report.metrics.totalTokens.baselineValue !== null ? report.metrics.totalTokens.baselineValue.toLocaleString() : '—'}
                </td>
                <td style={{ padding: '0.55rem 1.2rem', color: '#FFFFFF', fontFamily: 'monospace' }}>
                  {report.metrics.totalTokens.candidateValue !== null ? report.metrics.totalTokens.candidateValue.toLocaleString() : '—'}
                </td>
              </tr>
              <tr>
                <td style={{ padding: '0.55rem 1.2rem', color: '#CCCCCC', fontWeight: 600 }}>Recommendation</td>
                <td colSpan={2} style={{ padding: '0.55rem 1.2rem', color: recStyle.color, fontWeight: 700 }}>{report.recommendation} ({report.recommendationReason})</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── 2. Winner Determination & Overall Deltas ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr 1fr', gap: '1rem' }}>
          {/* Winner Card */}
          <div style={{ background: '#0D1117', padding: '1.1rem', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#888888', letterSpacing: '0.1em' }}>
              Comparison Winner
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: report.winner === 'candidate' ? '#4DA6FF' : report.winner === 'baseline' ? '#2ECC71' : '#FFAA44', margin: '0.3rem 0' }}>
              {report.winner === 'candidate'
                ? 'Release Candidate'
                : report.winner === 'baseline'
                ? 'Production Baseline'
                : report.recommendation.includes('INSUFFICIENT')
                ? 'Inconclusive (Coverage)'
                : 'Statistical Parity'}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#8899AA', lineHeight: 1.35 }}>
              {report.winnerReason}
            </div>
          </div>

          {/* Quality Delta */}
          <div style={{ background: '#0D1117', padding: '1.1rem', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#888888' }}>
              Quality Delta
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: report.qualityDelta === null ? '#888888' : report.qualityDelta >= 0 ? '#2ECC71' : '#FF4422', margin: '0.3rem 0' }}>
              {report.qualityDelta !== null ? (report.qualityDelta >= 0 ? `+${report.qualityDelta}%` : `${report.qualityDelta}%`) : '—'}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#778899' }}>
              Composite score delta
            </div>
          </div>

          {/* Latency Delta */}
          <div style={{ background: '#0D1117', padding: '1.1rem', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#888888' }}>
              Observed API Latency
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: report.latencyDelta === null ? '#888888' : report.latencyDelta <= 0 ? '#2ECC71' : '#FFAA44', margin: '0.3rem 0' }}>
              {report.latencyDelta !== null ? (report.latencyDelta > 0 ? `+${report.latencyDelta}ms` : `${report.latencyDelta}ms`) : '—'}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#778899' }}>
              Round-trip response time
            </div>
          </div>

          {/* Token Delta */}
          <div style={{ background: '#0D1117', padding: '1.1rem', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#888888' }}>
              Token Delta
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: report.tokenDelta === null ? '#888888' : report.tokenDelta <= 0 ? '#2ECC71' : '#CCCCCC', margin: '0.3rem 0' }}>
              {report.tokenDelta !== null ? (report.tokenDelta > 0 ? `+${report.tokenDelta.toLocaleString()}` : report.tokenDelta.toLocaleString()) : '—'}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#778899' }}>
              Input + Output tokens
            </div>
          </div>

          {/* Cost Delta */}
          <div style={{ background: '#0D1117', padding: '1.1rem', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#888888' }}>
              Cost Delta
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: report.costDelta === null ? '#888888' : report.costDelta <= 0 ? '#2ECC71' : '#FFAA44', margin: '0.3rem 0' }}>
              {report.costDelta !== null ? (report.costDelta >= 0 ? `+$${report.costDelta.toFixed(Math.abs(report.costDelta) < 0.01 ? 5 : 4)}` : `-$${Math.abs(report.costDelta).toFixed(Math.abs(report.costDelta) < 0.01 ? 5 : 4)}`) : '—'}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#778899' }}>
              Suite financial impact
            </div>
          </div>
        </div>

        {/* ── 3. Metric-by-Metric Comparison Table ── */}
        <div>
          <h3 style={{ fontSize: '1rem', color: '#FFFFFF', margin: '0 0 0.8rem 0' }}>
            Metric-by-Metric Detailed Comparison
          </h3>

          <div style={{ background: '#0D1117', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)', overflow: 'hidden' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1.2fr 1.2fr 1.2fr 1.2fr 1fr',
                padding: '0.75rem 1.2rem',
                background: 'rgba(255, 255, 255, 0.04)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                fontSize: '0.72rem',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: '#888888',
                fontWeight: 600,
              }}
            >
              <div>Metric</div>
              <div>Baseline ({report.baseline.provider.toUpperCase()})</div>
              <div>Candidate ({report.candidate.provider.toUpperCase()})</div>
              <div>Absolute Delta</div>
              <div>% Delta</div>
              <div style={{ textAlign: 'right' }}>Assessment</div>
            </div>

            {metricEntries.map((m) => (
              <div
                key={m.metric}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1.2fr 1.2fr 1.2fr 1.2fr 1fr',
                  padding: '0.85rem 1.2rem',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                  fontSize: '0.82rem',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ color: '#FFFFFF', fontWeight: 600 }}>{m.metric}</div>
                  <div style={{ fontSize: '0.7rem', color: '#778899' }}>{m.description}</div>
                </div>

                <div style={{ color: '#CCCCCC', fontFamily: 'monospace' }}>
                  {m.baselineValue !== null ? (m.unit === '$' ? `$${m.baselineValue.toFixed(m.baselineValue < 0.01 ? 5 : 4)}` : `${m.baselineValue.toLocaleString()} ${m.unit}`) : '—'}
                </div>

                <div style={{ color: '#FFFFFF', fontFamily: 'monospace', fontWeight: 600 }}>
                  {m.candidateValue !== null ? (m.unit === '$' ? `$${m.candidateValue.toFixed(m.candidateValue < 0.01 ? 5 : 4)}` : `${m.candidateValue.toLocaleString()} ${m.unit}`) : '—'}
                </div>

                <div style={{ color: m.isImprovement === true ? '#2ECC71' : m.isImprovement === false ? '#FF4422' : '#888888', fontFamily: 'monospace', fontWeight: 700 }}>
                  {m.absoluteDelta !== null ? (
                    m.unit === '$'
                      ? (m.absoluteDelta >= 0 ? `+$${m.absoluteDelta.toFixed(Math.abs(m.absoluteDelta) < 0.01 ? 5 : 4)}` : `-$${Math.abs(m.absoluteDelta).toFixed(Math.abs(m.absoluteDelta) < 0.01 ? 5 : 4)}`)
                      : `${m.absoluteDelta > 0 ? `+${m.absoluteDelta.toLocaleString()}` : m.absoluteDelta.toLocaleString()} ${m.unit}`
                  ) : '—'}
                </div>

                <div style={{ color: m.isImprovement === true ? '#2ECC71' : m.isImprovement === false ? '#FF4422' : '#888888', fontFamily: 'monospace', fontWeight: 700 }}>
                  {m.percentageDelta !== null ? (m.percentageDelta > 0 ? `+${m.percentageDelta}%` : `${m.percentageDelta}%`) : '—'}
                </div>

                <div style={{ textAlign: 'right' }}>
                  {m.isImprovement !== null ? (
                    <span
                      style={{
                        fontSize: '0.68rem',
                        padding: '0.15rem 0.5rem',
                        borderRadius: '3px',
                        fontWeight: 700,
                        background: m.isImprovement ? 'rgba(46, 204, 113, 0.15)' : 'rgba(255, 51, 17, 0.15)',
                        color: m.isImprovement ? '#2ECC71' : '#FF4422',
                      }}
                    >
                      {m.isImprovement ? 'WIN' : 'LOSS'}
                    </span>
                  ) : (
                    <span style={{ fontSize: '0.68rem', color: '#888888' }}>—</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── 4. Evidence & Diagnostics ── */}
        {report.evidence.length > 0 && (
          <div style={{ background: '#0D1117', padding: '1.2rem', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
            <h4 style={{ margin: '0 0 0.6rem 0', fontSize: '0.85rem', color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Diagnostic Evidence & Decision Rationale
            </h4>
            <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.82rem', color: '#B0C0D0', lineHeight: 1.6 }}>
              {report.evidence.map((e, idx) => (
                <li key={idx}>{e}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};
