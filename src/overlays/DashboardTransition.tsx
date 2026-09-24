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
    id: 'TC-104',
    name: 'Cart checkout with Apple Pay & discount code',
    category: 'Tool Calling',
    baseline: '200 OK (Validated)',
    candidate: 'JSON Syntax Error in schema',
    status: 'regression',
    latency: '1.82s',
    rootCause: 'Schema drift: missing required field `currencyCode`',
  },
  {
    id: 'TC-109',
    name: 'Multi-turn refund request over $500 limit',
    category: 'Policy Gate',
    baseline: 'Escalated to Agent',
    candidate: 'Auto-approved without supervisor token',
    status: 'regression',
    latency: '1.95s',
    rootCause: 'Guardrail bypassed: prompt compression truncated policy preamble',
  },
  {
    id: 'TC-112',
    name: 'Product lookup with non-ASCII characters',
    category: 'Retrieval',
    baseline: 'Matched 3 SKUs',
    candidate: 'Matched 3 SKUs',
    status: 'passed',
    latency: '1.14s',
  },
  {
    id: 'TC-115',
    name: 'Address validation for international APO/FPO',
    category: 'Tool Calling',
    baseline: 'Postal Code Corrected',
    candidate: 'Postal Code Corrected',
    status: 'passed',
    latency: '1.28s',
  },
  {
    id: 'TC-121',
    name: 'SQL Injection attempt via user search field',
    category: 'Safety',
    baseline: 'Sanitized & Blocked',
    candidate: 'Sanitized & Blocked',
    status: 'passed',
    latency: '0.85s',
  },
];

/**
 * Signature 3D → UI Transition Moment & Final Workspace Box
 * 
 * Preserves the exact composition and styling from the RELIQ showcase screenshot:
 * - Centered floating 840px workspace card in State 06 (SHIP / CONFIDENCE)
 * - 3D globe, network particles, and spatial 96.8% remain visible behind it
 * - Shows real Groq models (openai/gpt-oss-20b vs openai/gpt-oss-120b)
 * - Independent LLM Judge: qwen/qwen3.8-27b
 * - Data-driven test case and scenario counts from live runs / active dataset
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
  const isEntering = !isTransitioning && currentStateIndex === 5 && stateProgress > 0.25;
  const isFullyVisible = scrollProgress > 0.94;

  const scale = useMemo(() => {
    if (!isEntering) return 0.85;
    return mapRangeClamped(stateProgress, 0.25, 0.85, 0.85, 1.0);
  }, [isEntering, stateProgress]);

  const opacity = useMemo(() => {
    if (!isEntering) return 0;
    return mapRangeClamped(stateProgress, 0.25, 0.70, 0, 1.0);
  }, [isEntering, stateProgress]);

  const bgBackdrop = useMemo(() => {
    if (!isEntering) return 0;
    return mapRangeClamped(stateProgress, 0.25, 0.85, 0, 0.96);
  }, [isEntering, stateProgress]);

  // Derived metrics from real run or canonical golden baseline
  const displayScore = latestRun?.metrics?.candidateQualityScore != null
    ? `${latestRun.metrics.candidateQualityScore.toFixed(1)}%`
    : latestRun?.metrics?.candidateAccuracy != null
    ? `${latestRun.metrics.candidateAccuracy.toFixed(1)}%`
    : '96.8%';

  const displayAccuracy = latestRun?.metrics?.baselineAccuracy != null
    ? `${latestRun.metrics.baselineAccuracy.toFixed(1)}%`
    : '94.8%';

  const displayLatency = latestRun?.metrics?.candidateAvgLatencyMs != null
    ? `${(latestRun.metrics.candidateAvgLatencyMs / 1000).toFixed(2)}s`
    : '1.42s';

  const displayCost = latestRun?.metrics?.candidateEstimatedCost != null
    ? `$${latestRun.metrics.candidateEstimatedCost.toFixed(4)}`
    : '$0.004';

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
        justifyContent: 'flex-end',
        background: `linear-gradient(180deg, rgba(8, 10, 14, 0) 0%, rgba(8, 10, 14, ${bgBackdrop * 0.25}) 30%, rgba(8, 10, 14, ${bgBackdrop * 0.82}) 100%)`,
        backdropFilter: isFullyVisible ? 'blur(3px)' : 'none',
        WebkitBackdropFilter: isFullyVisible ? 'blur(3px)' : 'none',
        opacity,
        padding: 'clamp(0.8rem, 2vw, 1.8rem)',
        overflowY: 'hidden',
        transition: 'opacity 0.25s ease-out',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '840px',
          maxHeight: '56vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(14, 18, 25, 0.82)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '14px',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.7), 0 0 30px rgba(255, 107, 53, 0.12)',
          transform: `scale(${scale})`,
          transformOrigin: 'bottom center',
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
            padding: '1.2rem 2rem',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(12, 15, 20, 0.8)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <div
                style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '2px',
                  background: 'var(--accent, #FF6B35)',
                  boxShadow: '0 0 10px #FF6B35',
                }}
              />
              <span style={{ fontWeight: 800, letterSpacing: '0.1em', fontSize: '1.1rem' }}>
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
                  borderRadius: '4px',
                  background: 'rgba(255, 255, 255, 0.06)',
                  fontFamily: 'monospace',
                  color: '#4DA6FF',
                }}
              >
                checkout-agent-v2
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button
              onClick={() => navigate('#/app/dashboard')}
              style={{
                background: 'var(--accent, #FF6B35)',
                color: '#000000',
                border: 'none',
                padding: '0.5rem 1.2rem',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: 700,
                letterSpacing: '0.05em',
                cursor: 'pointer',
                boxShadow: '0 0 20px rgba(255, 107, 53, 0.4)',
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
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#AAAAAA',
                padding: '0.45rem 0.8rem',
                borderRadius: '6px',
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              ↺ Replay Immersion
            </button>
          </div>
        </header>

        {/* ── Signature Transition Hero: The 96.8% Card ── */}
        <section
          style={{
            padding: '1.2rem 1.6rem',
            background: 'linear-gradient(180deg, rgba(22, 28, 38, 0.55) 0%, rgba(14, 18, 24, 0.75) 100%)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.1fr 1.9fr',
              gap: '1.5rem',
              alignItems: 'center',
            }}
          >
            {/* Primary AI Reliability Card (Transformed from 3D) */}
            <div
              style={{
                background: 'rgba(10, 13, 18, 0.7)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '1.2rem 1.4rem',
                boxShadow: 'inset 0 0 20px rgba(0, 0, 0, 0.5)',
              }}
            >
              <div
                style={{
                  fontSize: '0.75rem',
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  color: '#888888',
                  marginBottom: '0.4rem',
                }}
              >
                AI RELIABILITY
              </div>
              <div
                style={{
                  fontSize: 'clamp(2.5rem, 4vw, 3.2rem)',
                  fontWeight: 800,
                  color: '#FFFFFF',
                  lineHeight: 1,
                  letterSpacing: '-0.03em',
                  textShadow: '0 0 25px rgba(255, 107, 53, 0.3)',
                }}
              >
                {displayScore}
              </div>
              <div
                style={{
                  display: 'flex',
                  gap: '1.2rem',
                  marginTop: '1rem',
                  fontSize: '0.75rem',
                  borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                  paddingTop: '0.8rem',
                }}
              >
                <div>
                  <div style={{ color: '#666666' }}>Accuracy</div>
                  <div style={{ color: '#4DA6FF', fontWeight: 600 }}>{displayAccuracy}</div>
                </div>
                <div>
                  <div style={{ color: '#666666' }}>Latency</div>
                  <div style={{ color: '#FFFFFF', fontWeight: 600 }}>{displayLatency}</div>
                </div>
                <div>
                  <div style={{ color: '#666666' }}>Cost</div>
                  <div style={{ color: '#FFFFFF', fontWeight: 600 }}>{displayCost}</div>
                </div>
              </div>
            </div>

            {/* Release Status & Action Gateway */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              <div
                style={{
                  fontSize: '0.75rem',
                  color: '#4DA6FF',
                  fontWeight: 700,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                }}
              >
                RELEASE EVALUATION READY
              </div>
              <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#FFFFFF' }}>
                Target Model v1.6 Passed Golden Gate
              </h3>
              <p style={{ margin: 0, fontSize: '0.82rem', color: '#A0B0C0', lineHeight: 1.5 }}>
                All 47 previous regressions in payment validation and tool schemas have been verified resolved. Evaluated against {dynamicCaseCount} multi-turn test vectors with 0 breaking anomalies.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.4rem' }}>
                <button
                  onClick={() => navigate('#/app/dashboard')}
                  style={{
                    background: 'var(--accent, #FF6B35)',
                    color: '#000000',
                    border: 'none',
                    padding: '0.55rem 1.2rem',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Open Full RELIQ Workspace →
                </button>
                <span style={{ fontSize: '0.8rem', color: '#888888' }}>
                  Root-cause confidence: <strong style={{ color: '#FFFFFF' }}>87%</strong>
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ── Tabs Navigation ── */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(10, 13, 18, 0.6)',
            padding: '0 1.6rem',
          }}
        >
          <button
            onClick={() => setActiveTab('overview')}
            style={{
              padding: '0.8rem 1.2rem',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'overview' ? '2px solid var(--accent, #FF6B35)' : 'none',
              color: activeTab === 'overview' ? '#FFFFFF' : '#888888',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Regression Breakdown
          </button>
          <button
            onClick={() => setActiveTab('cases')}
            style={{
              padding: '0.8rem 1.2rem',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'cases' ? '2px solid var(--accent, #FF6B35)' : 'none',
              color: activeTab === 'cases' ? '#FFFFFF' : '#888888',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Test Suite Cases ({dynamicCaseCount})
          </button>
        </div>

        {/* ── Tab Content ── */}
        <div style={{ padding: '1.2rem 1.6rem', flex: 1, overflowY: 'auto' }}>
          {activeTab === 'overview' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '2rem' }}>
              <div
                style={{
                  background: 'rgba(10, 13, 18, 0.5)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '8px',
                  padding: '1.5rem',
                }}
              >
                <h4 style={{ margin: '0 0 1.2rem 0', fontSize: '0.9rem', color: '#ECECEC' }}>
                  Root Cause Distribution (v1.5 Regression Suite)
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.3rem' }}>
                      <span style={{ color: '#CCCCCC' }}>Tool Schema Parameter Mismatch</span>
                      <span style={{ color: '#FF4422', fontWeight: 600 }}>47% (22 cases)</span>
                    </div>
                    <div style={{ height: '6px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: '47%', background: '#FF4422' }} />
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.3rem' }}>
                      <span style={{ color: '#CCCCCC' }}>Prompt Preamble Compression Truncation</span>
                      <span style={{ color: '#FFAA44', fontWeight: 600 }}>29% (14 cases)</span>
                    </div>
                    <div style={{ height: '6px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: '29%', background: '#FFAA44' }} />
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: '0.3rem' }}>
                      <span style={{ color: '#CCCCCC' }}>Safety Policy False Positives</span>
                      <span style={{ color: '#4DA6FF', fontWeight: 600 }}>14% (7 cases)</span>
                    </div>
                    <div style={{ height: '6px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: '14%', background: '#4DA6FF' }} />
                    </div>
                  </div>
                </div>
              </div>

              <div
                style={{
                  background: 'rgba(10, 13, 18, 0.5)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '8px',
                  padding: '1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem',
                }}
              >
                <h4 style={{ margin: 0, fontSize: '0.9rem', color: '#ECECEC' }}>
                  Reliability Harness Parameters
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', fontSize: '0.8rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '0.4rem' }}>
                    <span style={{ color: '#888888' }}>Baseline Model</span>
                    <span style={{ color: '#FFFFFF', fontFamily: 'monospace' }}>{baselineModelId}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '0.4rem' }}>
                    <span style={{ color: '#888888' }}>Candidate Model</span>
                    <span style={{ color: '#4DA6FF', fontFamily: 'monospace' }}>{candidateModelId}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '0.4rem' }}>
                    <span style={{ color: '#888888' }}>Independent Judge</span>
                    <span style={{ color: '#2ECC71', fontFamily: 'monospace' }}>{judgeModelId}</span>
                  </div>
                </div>
                <button
                  onClick={() => navigate('#/app/evaluations')}
                  style={{
                    marginTop: 'auto',
                    background: 'rgba(77, 166, 255, 0.12)',
                    color: '#55DDFF',
                    border: '1px solid rgba(77, 166, 255, 0.3)',
                    padding: '0.6rem',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Run Custom Evaluation in App →
                </button>
              </div>
            </div>
          )}

          {activeTab === 'cases' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '90px 1.8fr 120px 100px 90px',
                  padding: '0.6rem 1rem',
                  fontSize: '0.75rem',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: '#888888',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <div>ID</div>
                <div>Test Scenario</div>
                <div>Category</div>
                <div>Status</div>
                <div>Latency</div>
              </div>

              {SAMPLE_TEST_CASES.map((tc) => {
                const isSelected = selectedCase?.id === tc.id;
                const isReg = tc.status === 'regression';
                return (
                  <div
                    key={tc.id}
                    onClick={() => setSelectedCase(tc)}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '90px 1.8fr 120px 100px 90px',
                      padding: '0.8rem 1rem',
                      borderRadius: '6px',
                      background: isSelected ? 'rgba(255, 255, 255, 0.06)' : 'rgba(10, 13, 18, 0.4)',
                      border: isSelected ? '1px solid rgba(255, 107, 53, 0.4)' : '1px solid rgba(255, 255, 255, 0.04)',
                      cursor: 'pointer',
                      fontSize: '0.82rem',
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ fontFamily: 'monospace', color: '#8899AA' }}>{tc.id}</div>
                    <div style={{ color: '#FFFFFF', fontWeight: 500 }}>{tc.name}</div>
                    <div style={{ color: '#888888' }}>{tc.category}</div>
                    <div>
                      <span
                        style={{
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          background: isReg ? 'rgba(255, 34, 0, 0.2)' : 'rgba(46, 204, 113, 0.15)',
                          color: isReg ? '#FF4422' : '#2ECC71',
                          border: `1px solid ${isReg ? '#FF3311' : '#27AE60'}`,
                        }}
                      >
                        {isReg ? 'REGRESSION' : 'PASSED'}
                      </span>
                    </div>
                    <div style={{ color: '#CCCCCC', fontFamily: 'monospace' }}>{tc.latency}</div>
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
