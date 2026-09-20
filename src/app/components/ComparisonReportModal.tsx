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
import { downloadReportPdf } from '../../utils/pdfExporter';

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

  const handleExportPdf = () => {
    downloadReportPdf(report);
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
          label: report.totalCases < 27
            ? `⚡ PRELIMINARY SUBSET (N = ${report.totalCases}/27 SCENARIOS — REQUIRES 27 CASES FOR PRODUCTION RELEASE)`
            : '⚡ RECOMMENDATION: SHIP WITH MONITORING CONDITIONS',
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

  // ── Authoritative Relative & Release Gate Comparison Logic ──
  const baselineQuality = report.metrics.qualityScore?.baselineValue ?? null;
  const candidateQuality = report.metrics.qualityScore?.candidateValue ?? null;
  const qualityDelta = report.qualityDelta;
  const latencyDelta = report.latencyDelta;
  const costDelta = report.costDelta;
  const tokenDelta = report.tokenDelta;

  const failedGates = (report.releaseGates || []).filter((g) => g.status === 'FAIL');
  const warningGates = (report.releaseGates || []).filter((g) => g.status === 'WARNING');
  const hasGateFailures = failedGates.length > 0 || report.overallGateStatus === 'FAIL';
  const isPreliminary = Boolean(
    report.isPreliminary ||
    report.benchmarkCompletion?.status === 'PRELIMINARY_SUBSET' ||
    (report.totalCases < 27 && (report.datasetName || '').toLowerCase().includes('checkout'))
  );

  // Relative outcome strictly based on quality delta & existing comparison
  let relativeResult: 'IMPROVEMENT' | 'REGRESSION' | 'PARITY' | 'INCONCLUSIVE' = 'PARITY';
  let relativeTitle = 'Statistical Parity';
  let relativeBadgeColor = '#8899AA';
  let relativeBadgeBg = 'rgba(255, 255, 255, 0.08)';
  let relativeBorderColor = 'rgba(255, 255, 255, 0.15)';

  if (
    report.metrics.evaluationCoverage &&
    (((report.metrics.evaluationCoverage.baselineValue ?? 100) < 80) ||
      ((report.metrics.evaluationCoverage.candidateValue ?? 100) < 80))
  ) {
    relativeResult = 'INCONCLUSIVE';
    relativeTitle = 'Inconclusive (Coverage)';
    relativeBadgeColor = '#C084FC';
    relativeBadgeBg = 'rgba(192, 132, 252, 0.15)';
    relativeBorderColor = 'rgba(192, 132, 252, 0.35)';
  } else if (isPreliminary) {
    relativeResult = 'INCONCLUSIVE';
    relativeTitle = 'Preliminary Benchmark (N < 27)';
    relativeBadgeColor = '#F59E0B';
    relativeBadgeBg = 'rgba(245, 158, 11, 0.15)';
    relativeBorderColor = 'rgba(245, 158, 11, 0.35)';
  } else if (qualityDelta !== null && qualityDelta > 0) {
    relativeResult = 'IMPROVEMENT';
    relativeTitle = 'Candidate Outperformed Baseline';
    relativeBadgeColor = '#2ECC71';
    relativeBadgeBg = 'rgba(46, 204, 113, 0.15)';
    relativeBorderColor = 'rgba(46, 204, 113, 0.35)';
  } else if (qualityDelta !== null && qualityDelta < 0) {
    relativeResult = 'REGRESSION';
    relativeTitle = 'Candidate Quality Regression';
    relativeBadgeColor = '#EF4444';
    relativeBadgeBg = 'rgba(239, 68, 68, 0.15)';
    relativeBorderColor = 'rgba(239, 68, 68, 0.35)';
  } else {
    relativeResult = 'PARITY';
    relativeTitle = 'Statistical Parity';
    relativeBadgeColor = '#8899AA';
    relativeBadgeBg = 'rgba(255, 255, 255, 0.08)';
    relativeBorderColor = 'rgba(255, 255, 255, 0.15)';
  }

  // Concise 1-2 line comment generated from real metrics
  const getConciseInterpretation = (): string => {
    if (relativeResult === 'INCONCLUSIVE') {
      return report.winnerReason || 'Evaluation coverage or sample size is insufficient to certify relative difference.';
    }
    if (qualityDelta !== null && qualityDelta > 0) {
      const latWorse = latencyDelta !== null && latencyDelta > 0;
      const cstWorse = costDelta !== null && costDelta > 0;
      const tokReduced = tokenDelta !== null && tokenDelta < 0;
      if (latWorse || cstWorse) {
        if (tokReduced && (latWorse || cstWorse)) {
          return `Candidate improved quality and reduced output tokens, but introduced higher latency (+${latencyDelta}ms) and evaluation cost.`;
        }
        return `Candidate achieved higher quality than baseline (+${qualityDelta.toFixed(1)} quality points), but introduced higher latency (+${latencyDelta}ms).`;
      }
      return `Candidate achieved higher quality and correctness than the baseline, with +${qualityDelta.toFixed(1)} quality points.`;
    }
    if (qualityDelta !== null && qualityDelta < 0) {
      return 'Baseline achieved higher quality under the configured evaluation criteria.';
    }
    if (qualityDelta === 0) {
      return 'Both models produced equivalent results under the configured comparison metrics.';
    }
    return report.winnerReason || 'Benchmark evaluation complete.';
  };

  const conciseInterpretation = getConciseInterpretation();

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
              onClick={handleExportPdf}
              title="Download cross-model comparison report as real vector PDF"
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.18)',
                color: '#FFFFFF',
                padding: '0.45rem 0.9rem',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <span>📄</span> Export PDF
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

        {/* ── TOP PROMINENT WINNER / COMPARISON RESULT SECTION ── */}
        <div
          style={{
            background: 'linear-gradient(180deg, rgba(22, 27, 36, 0.95) 0%, rgba(13, 17, 23, 0.98) 100%)',
            border: `1px solid ${hasGateFailures ? 'rgba(239, 68, 68, 0.4)' : relativeBorderColor}`,
            boxShadow: hasGateFailures
              ? '0 0 25px rgba(239, 68, 68, 0.15)'
              : relativeResult === 'IMPROVEMENT'
              ? '0 0 25px rgba(46, 204, 113, 0.15)'
              : '0 0 20px rgba(0, 0, 0, 0.5)',
            borderRadius: '12px',
            padding: '1.5rem 1.8rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.2rem',
          }}
        >
          {/* Top Tier: RELATIVE COMPARISON */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', flexWrap: 'wrap', gap: '0.6rem' }}>
              <div style={{ fontSize: '0.72rem', letterSpacing: '0.15em', fontWeight: 800, textTransform: 'uppercase', color: '#8899AA' }}>
                RELATIVE COMPARISON
              </div>
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  padding: '0.2rem 0.6rem',
                  borderRadius: '4px',
                  background: relativeBadgeBg,
                  color: relativeBadgeColor,
                  border: `1px solid ${relativeBorderColor}`,
                }}
              >
                {relativeResult}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem', flexWrap: 'wrap', margin: '0.2rem 0' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: relativeBadgeColor, margin: 0 }}>
                {relativeResult === 'IMPROVEMENT'
                  ? `🏆 ${report.candidate.model || 'RELEASE CANDIDATE'}`
                  : relativeResult === 'REGRESSION'
                  ? `🛡️ ${report.baseline.model || 'PRODUCTION BASELINE'}`
                  : relativeTitle}
              </h2>
              {baselineQuality !== null && candidateQuality !== null && (
                <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#E0E0E0', fontFamily: 'monospace' }}>
                  Quality: <span style={{ color: '#AAAAAA' }}>{baselineQuality}%</span> → <span style={{ color: relativeBadgeColor }}>{candidateQuality}%</span>
                  {qualityDelta !== null && (
                    <span style={{ fontSize: '0.9rem', color: qualityDelta >= 0 ? '#2ECC71' : '#EF4444', marginLeft: '0.4rem' }}>
                      ({qualityDelta >= 0 ? `+${qualityDelta.toFixed(1)}` : qualityDelta.toFixed(1)} pts)
                    </span>
                  )}
                </div>
              )}
            </div>

            <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.88rem', color: '#B0C0D0', lineHeight: 1.5 }}>
              {conciseInterpretation}
            </p>
          </div>

          {/* Bottom Tier: PRODUCTION RELEASE STATUS (Strictly Separated) */}
          <div
            style={{
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              paddingTop: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.4rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem' }}>
              <div style={{ fontSize: '0.72rem', letterSpacing: '0.15em', fontWeight: 800, textTransform: 'uppercase', color: '#8899AA' }}>
                PRODUCTION RELEASE STATUS
              </div>
              <span
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  padding: '0.2rem 0.65rem',
                  borderRadius: '4px',
                  background: hasGateFailures ? 'rgba(239, 68, 68, 0.18)' : recStyle.bg,
                  color: hasGateFailures ? '#FF4422' : recStyle.color,
                  border: `1px solid ${hasGateFailures ? 'rgba(239, 68, 68, 0.4)' : recStyle.border}`,
                }}
              >
                {hasGateFailures ? `⛔ BLOCK / FAIL (${failedGates.length} GATES FAILED)` : report.recommendation}
              </span>
            </div>

            <div style={{ fontSize: '0.82rem', color: hasGateFailures ? '#FFAA88' : '#CCCCCC', lineHeight: 1.45 }}>
              {hasGateFailures ? (
                <div>
                  <strong>Attention Required:</strong> {failedGates.map((g) => g.gate).join(', ')} failed validation.
                  <span style={{ color: '#8899AA', display: 'block', fontSize: '0.75rem', marginTop: '0.2rem' }}>
                    Note: Although the candidate demonstrates relative quality improvement, production deployment remains gated until all release criteria pass.
                  </span>
                </div>
              ) : isPreliminary ? (
                <div>
                  <strong>Preliminary Benchmark:</strong> Evaluated {report.totalCases}/27 scenarios. Full 27-scenario test suite required for production release certification.
                </div>
              ) : (
                <div>
                  ✓ All configured production release gates passed verification. Safe for production promotion.
                </div>
              )}
            </div>
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
              <span
                style={{
                  fontSize: '0.65rem',
                  padding: '0.12rem 0.45rem',
                  borderRadius: '3px',
                  fontWeight: 700,
                  background:
                    report.factualityGroundednessStatus === 'EXECUTED'
                      ? 'rgba(46, 204, 113, 0.15)'
                      : report.factualityGroundednessStatus === 'CONFIGURED'
                      ? 'rgba(77, 166, 255, 0.15)'
                      : report.factualityGroundednessStatus === 'NOT_APPLICABLE'
                      ? 'rgba(255, 255, 255, 0.08)'
                      : report.factualityGroundednessStatus === 'FAILED'
                      ? 'rgba(255, 51, 17, 0.15)'
                      : 'rgba(255, 255, 255, 0.06)',
                  color:
                    report.factualityGroundednessStatus === 'EXECUTED'
                      ? '#2ECC71'
                      : report.factualityGroundednessStatus === 'CONFIGURED'
                      ? '#4DA6FF'
                      : report.factualityGroundednessStatus === 'NOT_APPLICABLE'
                      ? '#A0AEC0'
                      : report.factualityGroundednessStatus === 'FAILED'
                      ? '#FF4422'
                      : '#CCCCCC',
                  border: `1px solid ${
                    report.factualityGroundednessStatus === 'EXECUTED'
                      ? 'rgba(46, 204, 113, 0.3)'
                      : report.factualityGroundednessStatus === 'CONFIGURED'
                      ? 'rgba(77, 166, 255, 0.3)'
                      : report.factualityGroundednessStatus === 'FAILED'
                      ? 'rgba(255, 51, 17, 0.3)'
                      : 'rgba(255, 255, 255, 0.12)'
                  }`,
                }}
              >
                {report.factualityGroundednessStatus === 'EXECUTED'
                  ? 'EXECUTED'
                  : report.factualityGroundednessStatus === 'NOT_APPLICABLE'
                  ? 'N/A'
                  : report.factualityGroundednessStatus || 'NOT CONFIGURED'}
              </span>
            </div>
            <div style={{ fontSize: '0.76rem', color: '#A0B0C0', lineHeight: 1.45 }}>
              {report.factualityGroundednessStatus === 'EXECUTED' ? (
                <div>
                  <div>Active. Verifies responses against explicit benchmark evidence (numbers, currencies, order IDs, discount codes, dates, and checkout policies). Non-applicable cases are explicitly marked N/A.</div>
                  <div style={{ marginTop: '0.35rem', display: 'flex', gap: '0.8rem', fontSize: '0.72rem', color: '#38BDF8', flexWrap: 'wrap' }}>
                    <span>Applicable: <strong style={{ color: '#FFFFFF' }}>{report.groundednessApplicableCases || 0}</strong></span>
                    <span>Evaluated: <strong style={{ color: '#FFFFFF' }}>{report.groundednessEvaluatedCases || 0}</strong></span>
                    <span>Not Applicable: <strong style={{ color: '#FFFFFF' }}>{Math.max(0, (report.totalCases || 0) - (report.groundednessApplicableCases || 0))}</strong></span>
                    <span>Inconsistencies: <strong style={{ color: (report.groundednessFailedCases || 0) > 0 ? '#EF4444' : '#10B981' }}>{report.groundednessFailedCases || 0}</strong></span>
                    {report.groundednessAvgScore !== null && report.groundednessAvgScore !== undefined && (
                      <span>Avg Score: <strong style={{ color: '#FFFFFF' }}>{(report.groundednessAvgScore * 100).toFixed(1)}%</strong></span>
                    )}
                  </div>
                </div>
              ) : report.factualityGroundednessStatus === 'NOT_APPLICABLE' ? (
                'Test scenarios in this suite do not contain explicit grounding facts or reference constraints to verify (marked N/A, not failed).'
              ) : report.factualityGroundednessStatus === 'CONFIGURED' ? (
                'Local factual consistency engine configured to check candidate outputs against benchmark reference evidence.'
              ) : (
                'Deterministic keyword presence/absence indicates exact criteria compliance, not factual hallucination. Grounded evaluation requires explicit evidence.'
              )}
            </div>
          </div>

          {/* Semantic Evaluation (Local Lexical / Semantic Similarity) */}
          <div style={{ background: '#0D1117', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)', padding: '0.9rem 1.2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8899AA' }}>
                LOCAL LEXICAL / SEMANTIC SIMILARITY
              </span>
              <span
                style={{
                  fontSize: '0.65rem',
                  padding: '0.12rem 0.45rem',
                  borderRadius: '3px',
                  fontWeight: 700,
                  background:
                    report.semanticEvaluationStatus === 'EXECUTED'
                      ? 'rgba(46, 204, 113, 0.15)'
                      : report.semanticEvaluationStatus === 'CONFIGURED'
                      ? 'rgba(77, 166, 255, 0.15)'
                      : report.semanticEvaluationStatus === 'FAILED'
                      ? 'rgba(255, 51, 17, 0.15)'
                      : 'rgba(255, 255, 255, 0.06)',
                  color:
                    report.semanticEvaluationStatus === 'EXECUTED'
                      ? '#2ECC71'
                      : report.semanticEvaluationStatus === 'CONFIGURED'
                      ? '#4DA6FF'
                      : report.semanticEvaluationStatus === 'FAILED'
                      ? '#FF4422'
                      : '#CCCCCC',
                  border: `1px solid ${
                    report.semanticEvaluationStatus === 'EXECUTED'
                      ? 'rgba(46, 204, 113, 0.3)'
                      : report.semanticEvaluationStatus === 'CONFIGURED'
                      ? 'rgba(77, 166, 255, 0.3)'
                      : report.semanticEvaluationStatus === 'FAILED'
                      ? 'rgba(255, 51, 17, 0.3)'
                      : 'rgba(255, 255, 255, 0.12)'
                  }`,
                }}
              >
                {report.semanticEvaluationStatus || 'NOT CONFIGURED'}
              </span>
            </div>
            <div style={{ fontSize: '0.76rem', color: '#A0B0C0', lineHeight: 1.45 }}>
              {report.semanticEvaluationStatus === 'EXECUTED'
                ? 'Active. Local 3-gram character and token cosine similarity vectors evaluated locally. 100% deterministic local computation, zero external API dependencies (not neural NLI).'
                : report.semanticEvaluationStatus === 'CONFIGURED'
                ? 'Configured. Local lexical/semantic similarity analyzer ready for scenario execution.'
                : report.semanticEvaluationStatus === 'FAILED'
                ? 'Semantic similarity evaluation encountered an execution failure.'
                : 'Evaluators verify exact phrasing and deterministic patterns. Embedding similarity and external neural Natural Language Inference (NLI) are not configured.'}
            </div>
          </div>

          {/* LLM-as-a-Judge */}
          <div style={{ background: '#0D1117', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.08)', padding: '0.9rem 1.2rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#8899AA' }}>
                LLM-AS-A-JUDGE
              </span>
              <span
                style={{
                  fontSize: '0.65rem',
                  padding: '0.12rem 0.45rem',
                  borderRadius: '3px',
                  fontWeight: 700,
                  background:
                    report.llmJudgeStatus === 'EXECUTED'
                      ? 'rgba(46, 204, 113, 0.15)'
                      : report.llmJudgeStatus === 'CONFIGURED'
                      ? 'rgba(77, 166, 255, 0.15)'
                      : report.llmJudgeStatus === 'FAILED'
                      ? 'rgba(255, 51, 17, 0.15)'
                      : 'rgba(255, 255, 255, 0.06)',
                  color:
                    report.llmJudgeStatus === 'EXECUTED'
                      ? '#2ECC71'
                      : report.llmJudgeStatus === 'CONFIGURED'
                      ? '#4DA6FF'
                      : report.llmJudgeStatus === 'FAILED'
                      ? '#FF4422'
                      : '#CCCCCC',
                  border: `1px solid ${
                    report.llmJudgeStatus === 'EXECUTED'
                      ? 'rgba(46, 204, 113, 0.3)'
                      : report.llmJudgeStatus === 'CONFIGURED'
                      ? 'rgba(77, 166, 255, 0.3)'
                      : report.llmJudgeStatus === 'FAILED'
                      ? 'rgba(255, 51, 17, 0.3)'
                      : 'rgba(255, 255, 255, 0.12)'
                  }`,
                }}
              >
                {report.llmJudgeStatus || 'NOT CONFIGURED'}
              </span>
            </div>
            <div style={{ fontSize: '0.76rem', color: '#A0B0C0', lineHeight: 1.45 }}>
              {report.llmJudgeStatus === 'EXECUTED' ? (
                <div>
                  <div>Active ({report.judgeModel || 'Independent Groq Model'}). Qualitative evaluation executed across correctness, adherence, relevance, completeness, and safety.</div>
                  <div style={{ marginTop: '0.35rem', display: 'flex', gap: '0.8rem', fontSize: '0.72rem', color: '#4DA6FF' }}>
                    <span>Cases Evaluated: <strong style={{ color: '#FFFFFF' }}>{report.judgeEvaluatedCases || 0}</strong></span>
                    {report.judgeCostUsd !== null && report.judgeCostUsd !== undefined && (
                      <span>Judge Cost: <strong style={{ color: '#FFFFFF' }}>${report.judgeCostUsd.toFixed(4)}</strong></span>
                    )}
                  </div>
                </div>
              ) : report.llmJudgeStatus === 'CONFIGURED' ? (
                `Configured with model ${report.judgeModel || 'Groq'}. Awaiting test scenarios for qualitative judging.`
              ) : report.llmJudgeStatus === 'FAILED' ? (
                `Judge evaluation failed for model ${report.judgeModel || 'Groq'}. Execution safely fell back to deterministic scoring without masking provider errors.`
              ) : (
                'No independent secondary judge model is configured for qualitative scoring.'
              )}
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
              {report.isPreliminary || report.benchmarkCompletion?.status === 'PRELIMINARY_SUBSET' || (report.totalCases < 27 && (report.datasetName || '').toLowerCase().includes('checkout'))
                ? 'Evaluation Status'
                : (report.releaseGates && report.releaseGates.some((g: any) => g.status === 'FAIL')) || report.recommendation.includes('CONDITIONS') || report.recommendation.includes('BLOCK')
                ? 'Relative Comparison'
                : 'Comparison Winner'}
            </div>
            <div
              style={{
                fontSize: '1.25rem',
                fontWeight: 800,
                color:
                  report.isPreliminary || report.benchmarkCompletion?.status === 'PRELIMINARY_SUBSET' || (report.totalCases < 27 && (report.datasetName || '').toLowerCase().includes('checkout'))
                    ? '#F59E0B'
                    : ((report.releaseGates && report.releaseGates.some((g: any) => g.status === 'FAIL')) || report.recommendation.includes('CONDITIONS') || report.recommendation.includes('BLOCK'))
                    ? (report.qualityDelta !== null && report.qualityDelta > 0 ? '#4DA6FF' : report.qualityDelta !== null && report.qualityDelta < 0 ? '#EF4444' : '#FFAA44')
                    : report.winner === 'candidate'
                    ? '#4DA6FF'
                    : report.winner === 'baseline'
                    ? '#2ECC71'
                    : '#FFAA44',
                margin: '0.3rem 0',
              }}
            >
              {report.isPreliminary || report.benchmarkCompletion?.status === 'PRELIMINARY_SUBSET' || (report.totalCases < 27 && (report.datasetName || '').toLowerCase().includes('checkout'))
                ? 'PRELIMINARY RESULT'
                : ((report.releaseGates && report.releaseGates.some((g: any) => g.status === 'FAIL')) || report.recommendation.includes('CONDITIONS') || report.recommendation.includes('BLOCK'))
                ? (report.qualityDelta !== null && report.qualityDelta > 0 ? 'Relative Quality: Improvement' : report.qualityDelta !== null && report.qualityDelta < 0 ? 'Relative Quality: Regression' : 'Relative Quality: Parity')
                : report.winner === 'candidate'
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

        {/* ── Dimensional Tradeoffs (Decoupled Audit) ── */}
        {report.dimensions && (
          <div
            style={{
              background: '#0D1117',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '8px',
              padding: '1rem 1.2rem',
            }}
          >
            <div
              style={{
                fontSize: '0.72rem',
                fontWeight: 800,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: '#8899AA',
                marginBottom: '0.7rem',
              }}
            >
              DIMENSIONAL TRADEOFFS (STRICTLY DECOUPLED AUDIT)
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '0.8rem',
              }}
            >
              {/* Quality Dimension */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '6px',
                  padding: '0.75rem 0.9rem',
                }}
              >
                <div style={{ fontSize: '0.68rem', color: '#8899AA', textTransform: 'uppercase' }}>Quality Dimension</div>
                <div style={{ margin: '0.3rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      padding: '0.15rem 0.5rem',
                      borderRadius: '4px',
                      background:
                        report.dimensions.quality === 'IMPROVEMENT'
                          ? 'rgba(46, 204, 113, 0.15)'
                          : report.dimensions.quality === 'REGRESSION'
                          ? 'rgba(255, 51, 17, 0.15)'
                          : 'rgba(255, 255, 255, 0.08)',
                      color:
                        report.dimensions.quality === 'IMPROVEMENT'
                          ? '#2ECC71'
                          : report.dimensions.quality === 'REGRESSION'
                          ? '#FF4422'
                          : '#8899AA',
                    }}
                  >
                    {report.dimensions.quality}
                  </span>
                </div>
                <div style={{ fontSize: '0.7rem', color: '#667788' }}>
                  Net criteria accuracy & benchmark answer quality
                </div>
              </div>

              {/* Latency Dimension */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '6px',
                  padding: '0.75rem 0.9rem',
                }}
              >
                <div style={{ fontSize: '0.68rem', color: '#8899AA', textTransform: 'uppercase' }}>Latency Dimension</div>
                <div style={{ margin: '0.3rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      padding: '0.15rem 0.5rem',
                      borderRadius: '4px',
                      background:
                        report.dimensions.latency === 'IMPROVEMENT'
                          ? 'rgba(46, 204, 113, 0.15)'
                          : report.dimensions.latency === 'REGRESSION'
                          ? 'rgba(243, 156, 18, 0.15)'
                          : 'rgba(255, 255, 255, 0.08)',
                      color:
                        report.dimensions.latency === 'IMPROVEMENT'
                          ? '#2ECC71'
                          : report.dimensions.latency === 'REGRESSION'
                          ? '#F39C12'
                          : '#8899AA',
                    }}
                  >
                    {report.dimensions.latency}
                  </span>
                </div>
                <div style={{ fontSize: '0.7rem', color: '#667788' }}>
                  Round-trip API response times (successful calls only)
                </div>
              </div>

              {/* Cost Dimension */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '6px',
                  padding: '0.75rem 0.9rem',
                }}
              >
                <div style={{ fontSize: '0.68rem', color: '#8899AA', textTransform: 'uppercase' }}>Cost Dimension</div>
                <div style={{ margin: '0.3rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      padding: '0.15rem 0.5rem',
                      borderRadius: '4px',
                      background:
                        report.dimensions.cost === 'IMPROVEMENT'
                          ? 'rgba(46, 204, 113, 0.15)'
                          : report.dimensions.cost === 'REGRESSION'
                          ? 'rgba(243, 156, 18, 0.15)'
                          : 'rgba(255, 255, 255, 0.08)',
                      color:
                        report.dimensions.cost === 'IMPROVEMENT'
                          ? '#2ECC71'
                          : report.dimensions.cost === 'REGRESSION'
                          ? '#F39C12'
                          : '#8899AA',
                    }}
                  >
                    {report.dimensions.cost}
                  </span>
                </div>
                <div style={{ fontSize: '0.7rem', color: '#667788' }}>
                  Model token usage & normalized inference pricing
                </div>
              </div>

              {/* Reliability Dimension */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '6px',
                  padding: '0.75rem 0.9rem',
                }}
              >
                <div style={{ fontSize: '0.68rem', color: '#8899AA', textTransform: 'uppercase' }}>Reliability Dimension</div>
                <div style={{ margin: '0.3rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      padding: '0.15rem 0.5rem',
                      borderRadius: '4px',
                      background:
                        report.dimensions.reliability === 'IMPROVEMENT'
                          ? 'rgba(46, 204, 113, 0.15)'
                          : report.dimensions.reliability === 'REGRESSION'
                          ? 'rgba(255, 51, 17, 0.15)'
                          : 'rgba(255, 255, 255, 0.08)',
                      color:
                        report.dimensions.reliability === 'IMPROVEMENT'
                          ? '#2ECC71'
                          : report.dimensions.reliability === 'REGRESSION'
                          ? '#FF4422'
                          : '#8899AA',
                    }}
                  >
                    {report.dimensions.reliability}
                  </span>
                </div>
                <div style={{ fontSize: '0.7rem', color: '#667788' }}>
                  Transport success, timeouts, rate limits, and network errors
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── 12 Release Gates Checklist ── */}
        {report.releaseGates && report.releaseGates.length > 0 && (
          <div
            style={{
              background: '#0D1117',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '8px',
              padding: '1.1rem 1.3rem',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.8rem',
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
                PRODUCTION RELEASE GATES AUDIT ({report.releaseGates.filter((g) => g.status === 'PASS').length}/{report.releaseGates.length} PASSING)
              </span>
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  padding: '0.15rem 0.55rem',
                  borderRadius: '4px',
                  background:
                    report.overallGateStatus === 'PASS'
                      ? 'rgba(46, 204, 113, 0.2)'
                      : report.overallGateStatus === 'FAIL'
                      ? 'rgba(255, 51, 17, 0.2)'
                      : 'rgba(243, 156, 18, 0.2)',
                  color:
                    report.overallGateStatus === 'PASS'
                      ? '#2ECC71'
                      : report.overallGateStatus === 'FAIL'
                      ? '#FF4422'
                      : '#F39C12',
                  border: `1px solid ${
                    report.overallGateStatus === 'PASS'
                      ? 'rgba(46, 204, 113, 0.4)'
                      : report.overallGateStatus === 'FAIL'
                      ? 'rgba(255, 51, 17, 0.4)'
                      : 'rgba(243, 156, 18, 0.4)'
                  }`,
                }}
              >
                OVERALL GATE STATUS: {report.overallGateStatus || 'INCONCLUSIVE'}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              {report.releaseGates.map((gate, idx) => {
                const isPass = gate.status === 'PASS';
                const isFail = gate.status === 'FAIL';
                const isWarn = gate.status === 'WARNING';
                const statusColor = isPass ? '#2ECC71' : isFail ? '#FF4422' : isWarn ? '#F39C12' : '#C084FC';
                const statusBg = isPass
                  ? 'rgba(46, 204, 113, 0.12)'
                  : isFail
                  ? 'rgba(255, 51, 17, 0.12)'
                  : isWarn
                  ? 'rgba(243, 156, 18, 0.12)'
                  : 'rgba(192, 132, 252, 0.12)';

                return (
                  <div
                    key={idx}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '120px 220px 180px 1fr',
                      alignItems: 'center',
                      padding: '0.55rem 0.8rem',
                      background: 'rgba(255, 255, 255, 0.02)',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                      borderRadius: '5px',
                      fontSize: '0.78rem',
                      gap: '0.8rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <span
                        style={{
                          fontSize: '0.65rem',
                          fontWeight: 800,
                          padding: '0.12rem 0.45rem',
                          borderRadius: '3px',
                          background: statusBg,
                          color: statusColor,
                          border: `1px solid ${statusColor}40`,
                          display: 'inline-block',
                          textAlign: 'center',
                          minWidth: '55px',
                        }}
                      >
                        {gate.status}
                      </span>
                      {gate.isBlocking && (
                        <span style={{ fontSize: '0.62rem', color: '#FF6B6B', fontWeight: 700 }} title="Blocking release gate">
                          [BLOCK]
                        </span>
                      )}
                    </div>

                    <div>
                      <span style={{ color: '#FFFFFF', fontWeight: 600 }}>{gate.gate}</span>
                      <span style={{ display: 'block', fontSize: '0.66rem', color: '#778899' }}>{gate.category}</span>
                    </div>

                    <div style={{ fontFamily: 'monospace', fontSize: '0.74rem' }}>
                      <span style={{ color: '#E0E0E0' }}>{gate.observed}</span>
                      {gate.threshold && (
                        <span style={{ color: '#8899AA', display: 'block', fontSize: '0.68rem' }}>
                          Target: {gate.threshold}
                        </span>
                      )}
                    </div>

                    <div style={{ fontSize: '0.72rem', color: '#94A3B8', lineHeight: 1.35 }}>
                      {gate.details}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Separate Infrastructure & Judge Cost Breakdown ── */}
        {report.judgeCostUsd !== undefined && report.judgeCostUsd !== null && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '0.8rem',
              marginBottom: '1.5rem',
              padding: '0.85rem 1.1rem',
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              borderRadius: '8px',
              fontSize: '0.8rem',
            }}
          >
            <div>
              <span style={{ color: '#888888', display: 'block', fontSize: '0.7rem', textTransform: 'uppercase' }}>Benchmark Model Cost</span>
              <span style={{ color: '#FFFFFF', fontWeight: 700 }}>
                {report.benchmarkCostUsd !== null && report.benchmarkCostUsd !== undefined ? `$${report.benchmarkCostUsd.toFixed(4)}` : '—'}
              </span>
            </div>
            <div>
              <span style={{ color: '#888888', display: 'block', fontSize: '0.7rem', textTransform: 'uppercase' }}>
                Judge Cost ({report.judgeModel || 'Groq Judge'})
              </span>
              <span style={{ color: '#4E95FF', fontWeight: 700 }}>
                ${report.judgeCostUsd.toFixed(4)}
              </span>
            </div>
            <div>
              <span style={{ color: '#888888', display: 'block', fontSize: '0.7rem', textTransform: 'uppercase' }}>Total Evaluation Infrastructure Cost</span>
              <span style={{ color: '#2ECC71', fontWeight: 700 }}>
                {report.totalInfrastructureCostUsd !== null && report.totalInfrastructureCostUsd !== undefined ? `$${report.totalInfrastructureCostUsd.toFixed(4)}` : '—'}
              </span>
            </div>
          </div>
        )}

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

                <div style={{ color: (m.assessment === 'IMPROVEMENT' || (m.isImprovement === true && m.absoluteDelta !== 0)) ? '#2ECC71' : (m.assessment === 'REGRESSION' || (m.isImprovement === false && m.absoluteDelta !== 0)) ? '#FF4422' : '#888888', fontFamily: 'monospace', fontWeight: 700 }}>
                  {m.absoluteDelta !== null ? (
                    m.unit === '$'
                      ? (m.absoluteDelta >= 0 ? `+$${m.absoluteDelta.toFixed(Math.abs(m.absoluteDelta) < 0.01 ? 5 : 4)}` : `-$${Math.abs(m.absoluteDelta).toFixed(Math.abs(m.absoluteDelta) < 0.01 ? 5 : 4)}`)
                      : `${m.absoluteDelta > 0 ? `+${m.absoluteDelta.toLocaleString()}` : m.absoluteDelta.toLocaleString()} ${m.unit}`
                  ) : '—'}
                </div>

                <div style={{ color: (m.assessment === 'IMPROVEMENT' || (m.isImprovement === true && m.absoluteDelta !== 0)) ? '#2ECC71' : (m.assessment === 'REGRESSION' || (m.isImprovement === false && m.absoluteDelta !== 0)) ? '#FF4422' : '#888888', fontFamily: 'monospace', fontWeight: 700 }}>
                  {m.percentageDelta !== null ? (m.percentageDelta > 0 ? `+${m.percentageDelta}%` : `${m.percentageDelta}%`) : '—'}
                </div>

                <div style={{ textAlign: 'right' }}>
                  {m.assessment === 'IMPROVEMENT' || (m.isImprovement === true && m.absoluteDelta !== 0) ? (
                    <span
                      style={{
                        fontSize: '0.68rem',
                        padding: '0.15rem 0.5rem',
                        borderRadius: '3px',
                        fontWeight: 700,
                        background: 'rgba(46, 204, 113, 0.15)',
                        color: '#2ECC71',
                      }}
                    >
                      IMPROVEMENT
                    </span>
                  ) : m.assessment === 'REGRESSION' || (m.isImprovement === false && m.absoluteDelta !== 0) ? (
                    <span
                      style={{
                        fontSize: '0.68rem',
                        padding: '0.15rem 0.5rem',
                        borderRadius: '3px',
                        fontWeight: 700,
                        background: 'rgba(255, 51, 17, 0.15)',
                        color: '#FF4422',
                      }}
                    >
                      REGRESSION
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: '0.68rem',
                        padding: '0.15rem 0.5rem',
                        borderRadius: '3px',
                        fontWeight: 700,
                        background: 'rgba(255, 255, 255, 0.08)',
                        color: '#8899AA',
                      }}
                    >
                      PARITY
                    </span>
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
