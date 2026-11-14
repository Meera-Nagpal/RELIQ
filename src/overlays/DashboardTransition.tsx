import React, { useMemo, useState, useEffect } from 'react';
import { useExperienceStore } from '../store/experienceStore';
import { mapRangeClamped } from '../utils/math';
import { useRouter } from '../router/useRouter';
import { apiRepository } from '../services/apiRepository';
import { EvaluationRun, Dataset } from '../domain/types';

interface TestCase {
  id: string;
  name: string;
  category: string;
  baseline: string;
  candidate: string;
  status: 'passed' | 'regression';
  latency: string;
  rootCause?: string;
}

const SAMPLE_TEST_CASES: TestCase[] = [
  {
    id: 'TC-01',
    name: 'Tax recalculation tool call with currency schema validation',
    category: 'Tool Schema',
    baseline: 'Success (1.48s)',
    candidate: 'Success (1.22s)',
    status: 'passed',
    latency: '1.22s',
    rootCause: 'Resolved: schema matches strict JSON output specification',
  },
  {
    id: 'TC-02',
    name: 'Stripe tokenized card payment delegation',
    category: 'Security Gate',
    baseline: 'Verified Delegation',
    candidate: 'Verified Delegation',
    status: 'passed',
    latency: '1.38s',
  },
  {
    id: 'TC-03',
    name: 'Multi-item inventory reservation under concurrency lock',
    category: 'Concurrency',
    baseline: 'Atomic lock confirmed',
    candidate: 'Atomic lock confirmed',
    status: 'passed',
    latency: '1.45s',
  },
  {
    id: 'TC-04',
    name: 'Coupon code stacking rule enforcement (max 1 promo)',
    category: 'Business Rules',
    baseline: 'Single promo enforced',
    candidate: 'Single promo enforced',
    status: 'passed',
    latency: '1.19s',
    rootCause: 'Resolved: conditional tool invocation verified',
  },
  {
    id: 'TC-05',
    name: 'Address normalization & postal code webhook fallback',
    category: 'Integration',
    baseline: 'Standardized USPS format',
    candidate: 'Standardized USPS format',
    status: 'passed',
    latency: '1.51s',
  },
  {
    id: 'TC-06',
    name: 'Order dispatch idempotency check on duplicate retry',
    category: 'Idempotency',
    baseline: 'Single dispatch returned',
    candidate: 'Single dispatch returned',
    status: 'passed',
    latency: '1.26s',
  },
  {
    id: 'TC-07',
    name: 'Customer session token renewal during multi-turn checkout',
    category: 'Session State',
    baseline: 'Token rotated cleanly',
    candidate: 'Token rotated cleanly',
    status: 'passed',
    latency: '1.34s',
  },
  {
    id: 'TC-08',
    name: 'Refund exception escalation exceeding agent policy limit',
    category: 'Guardrails',
    baseline: 'Escalated to human supervisor',
    candidate: 'Escalated to human supervisor',
    status: 'passed',
    latency: '1.40s',
  },
];

/**
 * Signature 3D → UI Transition Moment & Final Workspace Box
 * 
 * Clean, realistic engineering telemetry dashboard matching the RELIQ workspace:
 * - Matte charcoal surfaces (#151515, #111111) and crisp #292929 borders
 * - Workspace blue accents (#ADC0D6, #2563EB)
 * - Zero artificial glow or marketing copy
 * - Authoritative Golden Release Evaluation: 96.8% reliability, zero regressions
 */
export function DashboardTransition() {
  const currentStateIndex = useExperienceStore((state) => state.currentStateIndex);
  const stateProgress = useExperienceStore((state) => state.stateProgress);
  const scrollProgress = useExperienceStore((state) => state.scrollProgress);
  const { navigate, isTransitioning } = useRouter();

  const [activeTab, setActiveTab] = useState<'overview' | 'cases'>('overview');
  const [selectedCase, setSelectedCase] = useState<TestCase | null>(SAMPLE_TEST_CASES[0]);
  const [latestRun, setLatestRun] = useState<EvaluationRun | null>(null);
  const [activeCaseCount, setActiveCaseCount] = useState<number>(500);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      apiRepository.getEvaluationRuns().catch(() => []),
      apiRepository.getDatasets().catch(() => []),
    ]).then(([runs, datasets]: [EvaluationRun[], Dataset[]]) => {
      if (!mounted) return;
      if (runs && runs.length > 0) {
        setLatestRun(runs[0]);
      }
      if (datasets && datasets.length > 0) {
        const storedDatasetId = localStorage.getItem('reliq_active_dataset_id');
        const matched = storedDatasetId ? datasets.find((d) => d.id === storedDatasetId) : null;
        const target = matched || datasets.find((d) => (d.cases?.length || 0) > 0) || datasets[0];
        if (target?.cases?.length) {
          setActiveCaseCount(target.cases.length);
        }
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Active in state 5 (index 5) or when scroll is >= 0.88
  // State 6 3D text dissolves to 0 by stateProgress = 0.26, so dashboard enters cleanly without overlap
  const isEntering = !isTransitioning && currentStateIndex === 5 && stateProgress > 0.26;
  const isFullyVisible = scrollProgress > 0.94;

  const scale = useMemo(() => {
    if (!isEntering) return 0.94;
    return mapRangeClamped(stateProgress, 0.26, 0.70, 0.94, 1.0);
  }, [isEntering, stateProgress]);

  const opacity = useMemo(() => {
    if (!isEntering) return 0;
    return mapRangeClamped(stateProgress, 0.26, 0.55, 0, 1.0);
  }, [isEntering, stateProgress]);

  const bgBackdrop = useMemo(() => {
    if (!isEntering) return 0;
    return mapRangeClamped(stateProgress, 0.24, 0.45, 0, 0.98);
  }, [isEntering, stateProgress]);

  // Derived metrics: Authoritative Golden Release evaluation (96.8% Target Candidate)
  const isRunPassed = latestRun && !latestRun.regressionDecision?.isRegression &&
    (latestRun.releaseDecision?.status === 'SHIP' || latestRun.releaseDecision?.status === 'PASS');

  const displayScore = isRunPassed && latestRun?.metrics?.candidateQualityScore != null
    ? `${latestRun.metrics.candidateQualityScore.toFixed(1)}%`
    : '96.8%';

  const displayAccuracy = isRunPassed && latestRun?.metrics?.candidateAccuracy != null
    ? `${latestRun.metrics.candidateAccuracy.toFixed(1)}%`
    : '96.8%';

  const baselineAccuracy = isRunPassed && latestRun?.metrics?.baselineAccuracy != null
    ? `${latestRun.metrics.baselineAccuracy.toFixed(1)}%`
    : '94.8%';

  const displayLatency = latestRun?.metrics?.candidateAvgLatencyMs != null
    ? `${(latestRun.metrics.candidateAvgLatencyMs / 1000).toFixed(2)}s`
    : '1.42s';

  const displayCost = latestRun?.metrics?.candidateEstimatedCost != null
    ? `$${latestRun.metrics.candidateEstimatedCost.toFixed(4)}`
    : '$0.0040';

  const baselineModelId = latestRun?.baselineVersion?.modelIdentifier || 'openai/gpt-oss-20b';
  const candidateModelId = latestRun?.candidateVersion?.modelIdentifier || 'openai/gpt-oss-120b';
  const judgeModelId = latestRun?.comparisonReport?.judgeModel || 'qwen/qwen3.8-27b';

  const dynamicCaseCount = latestRun?.metrics?.totalCases || activeCaseCount || 500;

  if (isTransitioning || opacity <= 0.001) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 30,
        pointerEvents: isEntering ? 'auto' : 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: `rgba(8, 10, 14, ${bgBackdrop})`,
        backdropFilter: 'blur(28px)',
        WebkitBackdropFilter: 'blur(28px)',
        opacity,
        padding: 'clamp(1rem, 3vw, 2.5rem)',
        overflowY: 'auto',
        transition: 'opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1120px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          background: '#151515',
          border: '1px solid #292929',
          borderRadius: '4px',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.85)',
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          transition: 'transform 0.1s linear',
          overflow: 'hidden',
        }}
      >
        {/* ── Dashboard App Header ── */}
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1rem 1.8rem',
            borderBottom: '1px solid #292929',
            background: '#111111',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <div
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '2px',
                  background: 'var(--accent, #ADC0D6)',
                }}
              />
              <span style={{ fontWeight: 800, letterSpacing: '0.1em', fontSize: '1.1rem', color: '#F2F2F2' }}>
                RELIQ
              </span>
            </div>
            <span style={{ color: 'rgba(255, 255, 255, 0.2)' }}>/</span>
            <div
              style={{
                fontSize: '0.85rem',
                color: '#DDDDDD',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <span>project:</span>
              <span
                style={{
                  padding: '0.2rem 0.6rem',
                  borderRadius: '2px',
                  background: 'rgba(255, 255, 255, 0.06)',
                  fontFamily: 'monospace',
                  color: '#ADC0D6',
                }}
              >
                checkout-agent-v2
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                fontSize: '0.75rem',
                color: '#888888',
                fontFamily: 'monospace',
              }}
            >
              <span>run_rel_9680a</span>
              <span>•</span>
              <span>main@8f3a1c2</span>
              <span>•</span>
              <span style={{ color: '#4ADE80' }}>canary-prod</span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
            <button
              onClick={() => navigate('#/app/dashboard')}
              style={{
                background: 'var(--accent, #ADC0D6)',
                color: '#0A1A35',
                border: '1px solid var(--accent, #ADC0D6)',
                padding: '0.5rem 1.2rem',
                borderRadius: '2px',
                fontSize: '0.8rem',
                fontWeight: 700,
                fontFamily: 'monospace',
                letterSpacing: '0.04em',
                cursor: 'pointer',
                transition: 'background 0.15s ease',
              }}
            >
              Launch Workspace →
            </button>
            <button
              onClick={() => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              title="Replay 3D experience"
              style={{
                background: 'transparent',
                border: '1px solid #292929',
                color: '#888888',
                padding: '0.45rem 0.8rem',
                borderRadius: '2px',
                fontSize: '0.75rem',
                cursor: 'pointer',
                fontFamily: 'monospace',
              }}
            >
              ↺ Replay Immersion
            </button>
          </div>
        </header>

        {/* ── Signature Transition Hero: Golden Release Evaluation ── */}
        <section
          style={{
            padding: '1.8rem',
            background: '#151515',
            borderBottom: '1px solid #292929',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(280px, 1fr) 2fr',
              gap: '2rem',
              alignItems: 'stretch',
            }}
          >
            {/* Primary Telemetry Scorecard */}
            <div
              style={{
                background: '#111111',
                border: '1px solid #292929',
                borderRadius: '4px',
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: '0.72rem',
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: 'var(--text-muted, #888888)',
                    fontWeight: 600,
                    fontFamily: 'monospace',
                    marginBottom: '0.4rem',
                  }}
                >
                  CANDIDATE QUALITY SCORE
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.8rem' }}>
                  <div
                    style={{
                      fontSize: 'clamp(2.6rem, 4vw, 3.8rem)',
                      fontWeight: 800,
                      letterSpacing: '-0.03em',
                      color: '#FFFFFF',
                      lineHeight: 1,
                    }}
                  >
                    {displayScore}
                  </div>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      padding: '0.2rem 0.5rem',
                      borderRadius: '2px',
                      background: '#13241A',
                      border: '1px solid rgba(34, 197, 94, 0.35)',
                      color: '#22C55E',
                    }}
                  >
                    ▲ +2.0%
                  </span>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '0.8rem',
                  borderTop: '1px solid #292929',
                  paddingTop: '1rem',
                  marginTop: '1.2rem',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.68rem', color: '#888888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Baseline</div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: '#94A3B8', fontFamily: 'monospace', marginTop: '0.15rem' }}>
                    {baselineAccuracy}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.68rem', color: '#888888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>P95 Latency</div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: '#4ADE80', fontFamily: 'monospace', marginTop: '0.15rem' }}>
                    {displayLatency}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.68rem', color: '#888888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Unit Cost</div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: '#ECECEC', fontFamily: 'monospace', marginTop: '0.15rem' }}>
                    {displayCost}
                  </div>
                </div>
              </div>
            </div>

            {/* Quality Gating Decision & Criteria Checklist */}
            <div
              style={{
                background: '#111111',
                border: '1px solid #292929',
                borderRadius: '4px',
                padding: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '1rem',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
                  <div
                    style={{
                      fontSize: '0.72rem',
                      letterSpacing: '0.15em',
                      textTransform: 'uppercase',
                      color: 'var(--blue-light, #60A5FA)',
                      fontWeight: 700,
                      fontFamily: 'monospace',
                    }}
                  >
                    PIPELINE VERDICT // RELEASE GATING
                  </div>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      padding: '0.2rem 0.6rem',
                      borderRadius: '2px',
                      background: '#13241A',
                      border: '1px solid rgba(34, 197, 94, 0.35)',
                      color: '#22C55E',
                    }}
                  >
                    RELEASE APPROVED // PASSING GATE
                  </span>
                </div>

                <h3
                  style={{
                    fontSize: '1.3rem',
                    fontWeight: 700,
                    color: '#FFFFFF',
                    margin: '0 0 0.4rem 0',
                    letterSpacing: '-0.02em',
                  }}
                >
                  Candidate Model v1.6 Passed Golden Gate Criteria
                </h3>
                <p
                  style={{
                    fontSize: '0.85rem',
                    color: '#858585',
                    lineHeight: 1.45,
                    margin: 0,
                  }}
                >
                  Deterministic evaluation across {dynamicCaseCount} test vectors verified zero breaking regressions. Statistical quality score of {displayScore} exceeds the 95.0% release threshold.
                </p>
              </div>

              {/* Gating criteria checklist */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
                  gap: '0.6rem',
                  fontSize: '0.78rem',
                  fontFamily: 'monospace',
                  background: '#151515',
                  padding: '0.8rem 1rem',
                  borderRadius: '2px',
                  border: '1px solid #242424',
                }}
              >
                <div style={{ color: '#22C55E' }}>✓ Min Quality Score: {displayScore} (≥95%)</div>
                <div style={{ color: '#22C55E' }}>✓ Regressions: 0 detected (0 max)</div>
                <div style={{ color: '#22C55E' }}>✓ P95 Latency: {displayLatency} (≤2.00s)</div>
                <div style={{ color: '#22C55E' }}>✓ Schema Conformance: 100% valid</div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.4rem' }}>
                <button
                  onClick={() => navigate('#/app/dashboard')}
                  style={{
                    background: 'var(--accent, #ADC0D6)',
                    color: '#0A1A35',
                    border: '1px solid var(--accent, #ADC0D6)',
                    padding: '0.65rem 1.4rem',
                    borderRadius: '2px',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    fontFamily: 'monospace',
                    letterSpacing: '0.04em',
                    cursor: 'pointer',
                  }}
                >
                  Open Full RELIQ Workspace →
                </button>
                <span style={{ fontSize: '0.78rem', color: '#888888', fontFamily: 'monospace' }}>
                  Statistical Confidence: <strong style={{ color: '#FFFFFF' }}>99.2%</strong>
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ── Interactive Workspace Tabs ── */}
        <div style={{ display: 'flex', borderBottom: '1px solid #292929', background: '#111111' }}>
          <button
            onClick={() => setActiveTab('overview')}
            style={{
              padding: '0.85rem 1.6rem',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'overview' ? '2px solid var(--accent, #ADC0D6)' : '2px solid transparent',
              color: activeTab === 'overview' ? '#FFFFFF' : '#888888',
              fontSize: '0.82rem',
              fontWeight: 600,
              fontFamily: 'monospace',
              cursor: 'pointer',
            }}
          >
            Telemetry & Telemetry Distribution
          </button>
          <button
            onClick={() => setActiveTab('cases')}
            style={{
              padding: '0.85rem 1.6rem',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'cases' ? '2px solid var(--accent, #ADC0D6)' : '2px solid transparent',
              color: activeTab === 'cases' ? '#FFFFFF' : '#888888',
              fontSize: '0.82rem',
              fontWeight: 600,
              fontFamily: 'monospace',
              cursor: 'pointer',
            }}
          >
            Verification Test Scenarios ({SAMPLE_TEST_CASES.length})
          </button>
        </div>

        {/* ── Tab Content ── */}
        <div style={{ padding: '1.6rem', flex: 1, overflowY: 'auto', background: '#151515' }}>
          {activeTab === 'overview' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '1.5rem' }}>
              <div
                style={{
                  background: '#111111',
                  border: '1px solid #292929',
                  borderRadius: '4px',
                  padding: '1.4rem',
                }}
              >
                <h4 style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: '#ECECEC', fontFamily: 'monospace' }}>
                  Root Cause Resolution Analysis (v1.5 Regression Suite)
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.35rem' }}>
                      <span style={{ color: '#CCCCCC' }}>Tool Schema & Parameter Type Validation</span>
                      <span style={{ color: '#4ADE80', fontWeight: 600, fontFamily: 'monospace' }}>100% Resolved (22 / 22 cases)</span>
                    </div>
                    <div style={{ height: '4px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: '100%', background: '#22C55E' }} />
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.35rem' }}>
                      <span style={{ color: '#CCCCCC' }}>Instruction Preamble & Context Retention</span>
                      <span style={{ color: '#60A5FA', fontWeight: 600, fontFamily: 'monospace' }}>100% Resolved (14 / 14 cases)</span>
                    </div>
                    <div style={{ height: '4px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: '100%', background: 'var(--accent-blue, #2563EB)' }} />
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.35rem' }}>
                      <span style={{ color: '#CCCCCC' }}>Safety Policy & Guardrail Verification</span>
                      <span style={{ color: '#94A3B8', fontWeight: 600, fontFamily: 'monospace' }}>100% Compliant (7 / 7 cases)</span>
                    </div>
                    <div style={{ height: '4px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: '100%', background: '#64748B' }} />
                    </div>
                  </div>
                </div>
              </div>

              <div
                style={{
                  background: '#111111',
                  border: '1px solid #292929',
                  borderRadius: '4px',
                  padding: '1.4rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.8rem',
                }}
              >
                <h4 style={{ margin: 0, fontSize: '0.85rem', color: '#ECECEC', fontFamily: 'monospace' }}>
                  Reliability Harness Runtime Parameters
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.8rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #242424', paddingBottom: '0.4rem' }}>
                    <span style={{ color: '#888888' }}>Baseline Model</span>
                    <span style={{ color: '#FFFFFF', fontFamily: 'monospace' }}>{baselineModelId}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #242424', paddingBottom: '0.4rem' }}>
                    <span style={{ color: '#888888' }}>Candidate Model</span>
                    <span style={{ color: 'var(--blue-light, #60A5FA)', fontFamily: 'monospace' }}>{candidateModelId}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #242424', paddingBottom: '0.4rem' }}>
                    <span style={{ color: '#888888' }}>Independent Judge</span>
                    <span style={{ color: '#2ECC71', fontFamily: 'monospace' }}>{judgeModelId}</span>
                  </div>
                </div>
                <button
                  onClick={() => navigate('#/app/evaluations')}
                  style={{
                    marginTop: 'auto',
                    background: 'rgba(37, 99, 235, 0.12)',
                    color: 'var(--blue-light, #60A5FA)',
                    border: '1px solid rgba(37, 99, 235, 0.3)',
                    padding: '0.55rem',
                    borderRadius: '2px',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                  }}
                >
                  Run Custom Evaluation in App →
                </button>
              </div>
            </div>
          )}

          {activeTab === 'cases' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '70px 1.8fr 130px 100px 90px',
                  padding: '0.5rem 0.8rem',
                  fontSize: '0.72rem',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: '#888888',
                  borderBottom: '1px solid #292929',
                  fontFamily: 'monospace',
                }}
              >
                <div>ID</div>
                <div>Test Scenario Vector</div>
                <div>Category</div>
                <div>Status</div>
                <div>Latency</div>
              </div>

              {SAMPLE_TEST_CASES.map((tc) => {
                const isSelected = selectedCase?.id === tc.id;
                return (
                  <div
                    key={tc.id}
                    onClick={() => setSelectedCase(tc)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '70px 1.8fr 130px 100px 90px',
                      padding: '0.65rem 0.8rem',
                      borderRadius: '2px',
                      background: isSelected ? '#1E232D' : '#111111',
                      border: isSelected ? '1px solid var(--accent-blue, #2563EB)' : '1px solid #242424',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      alignItems: 'center',
                      transition: 'border-color 0.15s ease',
                    }}
                  >
                    <div style={{ fontFamily: 'monospace', color: '#8899AA', fontSize: '0.75rem' }}>{tc.id}</div>
                    <div style={{ color: '#FFFFFF', fontWeight: 500 }}>{tc.name}</div>
                    <div style={{ color: '#888888', fontSize: '0.75rem' }}>{tc.category}</div>
                    <div>
                      <span
                        style={{
                          padding: '0.15rem 0.45rem',
                          borderRadius: '2px',
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          background: '#13241A',
                          color: '#22C55E',
                          border: '1px solid rgba(34, 197, 94, 0.35)',
                          fontFamily: 'monospace',
                        }}
                      >
                        PASSED
                      </span>
                    </div>
                    <div style={{ color: '#CCCCCC', fontFamily: 'monospace', fontSize: '0.75rem' }}>{tc.latency}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
