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
    if (!isEntering) return 0.98;
    return mapRangeClamped(stateProgress, 0.25, 0.85, 0.98, 1.0);
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
        justifyContent: 'center',
        background: `linear-gradient(180deg, rgba(8, 10, 14, 0) 0%, rgba(8, 10, 14, ${bgBackdrop * 0.25}) 30%, rgba(8, 10, 14, ${bgBackdrop * 0.85}) 100%)`,
        opacity,
        padding: '24px 40px',
        overflow: 'hidden',
        transition: 'opacity 0.25s ease-out',
      }}
    >
      <div
        style={{
          width: 'min(1200px, calc(100% - 80px))',
          minWidth: 'min(1100px, calc(100% - 40px))',
          maxWidth: '1200px',
          height: '380px',
          minHeight: '380px',
          maxHeight: '380px',
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(10, 13, 19, 0.96)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.10)',
          borderRadius: '10px',
          boxShadow: '0 24px 70px rgba(0, 0, 0, 0.85), 0 0 40px rgba(255, 107, 53, 0.08)',
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
      >
        {/* ── Header (48px) ── */}
        <header
          style={{
            height: '48px',
            minHeight: '48px',
            maxHeight: '48px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(6, 8, 12, 0.85)',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.2rem' }}>
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
              <span style={{ fontWeight: 800, letterSpacing: '0.1em', fontSize: '1.05rem', color: '#FFFFFF' }}>
                RELIQ
              </span>
            </div>
            <span style={{ color: 'rgba(255, 255, 255, 0.2)' }}>/</span>
            <div
              style={{
                fontSize: '0.82rem',
                color: '#DDDDDD',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <span style={{ color: '#888888' }}>project:</span>
              <span
                style={{
                  padding: '0.15rem 0.55rem',
                  borderRadius: '4px',
                  background: 'rgba(255, 255, 255, 0.06)',
                  fontFamily: 'monospace',
                  color: '#4DA6FF',
                  fontSize: '0.78rem',
                }}
              >
                checkout-agent-v2
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button
              onClick={() => navigate('#/app/dashboard')}
              style={{
                background: 'var(--accent, #FF6B35)',
                color: '#000000',
                border: 'none',
                padding: '0.4rem 1rem',
                borderRadius: '4px',
                fontSize: '0.78rem',
                fontWeight: 700,
                letterSpacing: '0.04em',
                cursor: 'pointer',
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
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: '#888888',
                padding: '0.35rem 0.75rem',
                borderRadius: '4px',
                fontSize: '0.75rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              ↺ Replay Immersion
            </button>
          </div>
        </header>

        {/* ── Top Content Row (~110px) ── */}
        <section
          style={{
            height: '110px',
            minHeight: '110px',
            maxHeight: '110px',
            padding: '10px 24px',
            background: 'rgba(8, 11, 16, 0.6)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'grid',
            gridTemplateColumns: '140px 1fr',
            gap: '1.5rem',
            alignItems: 'center',
            boxSizing: 'border-box',
          }}
        >
          {/* Metric Block (~140px) */}
          <div
            style={{
              width: '140px',
              height: '90px',
              background: 'rgba(12, 16, 23, 0.85)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '6px',
              padding: '0.5rem 0.75rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              boxSizing: 'border-box',
            }}
          >
            <div
              style={{
                fontSize: '0.62rem',
                fontFamily: 'monospace',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: '#777777',
              }}
            >
              AI RELIABILITY
            </div>
            <div
              style={{
                fontSize: '2.4rem',
                fontWeight: 800,
                color: '#FFFFFF',
                lineHeight: 1,
                letterSpacing: '-0.03em',
                margin: '0.15rem 0',
              }}
            >
              {displayScore}
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '0.2rem',
                fontSize: '0.58rem',
                color: '#888888',
                borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                paddingTop: '0.25rem',
                textAlign: 'center',
              }}
            >
              <div>
                <div style={{ color: '#777777', fontSize: '0.50rem', textTransform: 'uppercase' }}>Acc</div>
                <div style={{ color: '#4DA6FF', fontWeight: 600 }}>{displayAccuracy}</div>
              </div>
              <div>
                <div style={{ color: '#777777', fontSize: '0.50rem', textTransform: 'uppercase' }}>Lat</div>
                <div style={{ color: '#FFFFFF', fontWeight: 600 }}>{displayLatency}</div>
              </div>
              <div>
                <div style={{ color: '#777777', fontSize: '0.50rem', textTransform: 'uppercase' }}>Cost</div>
                <div style={{ color: '#FFFFFF', fontWeight: 600 }}>{displayCost}</div>
              </div>
            </div>
          </div>

          {/* Right Content Area (remaining width) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', minWidth: 0 }}>
            <div
              style={{
                fontSize: '0.68rem',
                fontFamily: 'monospace',
                color: '#4DA6FF',
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
              }}
            >
              RELEASE EVALUATION READY
            </div>
            <h3
              style={{
                margin: 0,
                fontSize: '1.15rem',
                fontWeight: 800,
                color: '#FFFFFF',
                letterSpacing: '-0.01em',
                lineHeight: 1.2,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              Target Model v1.6 Passed Golden Gate
            </h3>
            <p
              style={{
                margin: 0,
                fontSize: '0.78rem',
                color: '#90A0B0',
                lineHeight: 1.35,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              All 47 previous regressions in payment validation and tool schemas have been verified resolved. Evaluated against {dynamicCaseCount} multi-turn test vectors with 0 breaking anomalies.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.2rem' }}>
              <button
                onClick={() => navigate('#/app/dashboard')}
                style={{
                  background: 'var(--accent, #FF6B35)',
                  color: '#000000',
                  border: 'none',
                  padding: '0.35rem 0.95rem',
                  borderRadius: '4px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: '0 0 12px rgba(255, 107, 53, 0.25)',
                }}
              >
                Open Full RELIQ Workspace →
              </button>
              <span style={{ fontSize: '0.75rem', color: '#777777' }}>
                Root-cause confidence: <strong style={{ color: '#FFFFFF' }}>87%</strong>
              </span>
            </div>
          </div>
        </section>

        {/* ── Lower Content Section with Divider (~170px) ── */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            boxSizing: 'border-box',
            overflow: 'hidden',
          }}
        >
          {/* Tabs Bar (1px divider) */}
          <div
            style={{
              height: '33px',
              minHeight: '33px',
              maxHeight: '33px',
              display: 'flex',
              alignItems: 'center',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              background: 'rgba(6, 8, 12, 0.7)',
              padding: '0 24px',
              boxSizing: 'border-box',
            }}
          >
            <button
              onClick={() => setActiveTab('overview')}
              style={{
                height: '100%',
                padding: '0 0.8rem',
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === 'overview' ? '2px solid var(--accent, #FF6B35)' : '2px solid transparent',
                color: activeTab === 'overview' ? '#FFFFFF' : '#777777',
                fontSize: '0.76rem',
                fontWeight: 600,
                cursor: 'pointer',
                letterSpacing: '0.02em',
              }}
            >
              Regression Breakdown
            </button>
            <button
              onClick={() => setActiveTab('cases')}
              style={{
                height: '100%',
                padding: '0 0.8rem',
                background: 'transparent',
                border: 'none',
                borderBottom: activeTab === 'cases' ? '2px solid var(--accent, #FF6B35)' : '2px solid transparent',
                color: activeTab === 'cases' ? '#FFFFFF' : '#777777',
                fontSize: '0.76rem',
                fontWeight: 600,
                cursor: 'pointer',
                letterSpacing: '0.02em',
              }}
            >
              Test Suite Cases ({dynamicCaseCount})
            </button>
          </div>

          {/* Lower Content (~170px) */}
          <div
            style={{
              flex: 1,
              padding: '10px 24px',
              boxSizing: 'border-box',
              overflowY: 'auto',
            }}
          >
            {activeTab === 'overview' && (
              <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: '24px', height: '100%' }}>
                {/* Left Card: Regression Breakdown */}
                <div
                  style={{
                    background: 'rgba(10, 13, 18, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: '6px',
                    padding: '0.75rem 1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <h4 style={{ margin: '0 0 0.35rem 0', fontSize: '0.8rem', color: '#ECECEC' }}>
                    Root Cause Distribution (v1.5 Regression Suite)
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: '0.15rem' }}>
                        <span style={{ color: '#CCCCCC' }}>Tool Schema Parameter Mismatch</span>
                        <span style={{ color: '#FF4422', fontWeight: 600 }}>47% (22 cases)</span>
                      </div>
                      <div style={{ height: '4px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: '47%', background: '#FF4422' }} />
                      </div>
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: '0.15rem' }}>
                        <span style={{ color: '#CCCCCC' }}>Prompt Preamble Compression Truncation</span>
                        <span style={{ color: '#FFAA44', fontWeight: 600 }}>29% (14 cases)</span>
                      </div>
                      <div style={{ height: '4px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: '29%', background: '#FFAA44' }} />
                      </div>
                    </div>

                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', marginBottom: '0.15rem' }}>
                        <span style={{ color: '#CCCCCC' }}>Safety Policy False Positives</span>
                        <span style={{ color: '#4DA6FF', fontWeight: 600 }}>14% (7 cases)</span>
                      </div>
                      <div style={{ height: '4px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: '14%', background: '#4DA6FF' }} />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Card: Reliability Parameters */}
                <div
                  style={{
                    background: 'rgba(10, 13, 18, 0.5)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: '6px',
                    padding: '0.75rem 1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <h4 style={{ margin: '0 0 0.35rem 0', fontSize: '0.8rem', color: '#ECECEC' }}>
                    Reliability Harness Parameters
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.72rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '0.15rem' }}>
                      <span style={{ color: '#888888' }}>Baseline Model</span>
                      <span style={{ color: '#FFFFFF', fontFamily: 'monospace' }}>{baselineModelId}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '0.15rem' }}>
                      <span style={{ color: '#888888' }}>Candidate Model</span>
                      <span style={{ color: '#4DA6FF', fontFamily: 'monospace' }}>{candidateModelId}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '0.15rem' }}>
                      <span style={{ color: '#888888' }}>Independent Judge</span>
                      <span style={{ color: '#2ECC71', fontFamily: 'monospace' }}>{judgeModelId}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => navigate('#/app/evaluations')}
                    style={{
                      marginTop: '0.35rem',
                      background: 'rgba(77, 166, 255, 0.08)',
                      color: '#4DA6FF',
                      border: '1px solid rgba(77, 166, 255, 0.25)',
                      padding: '0.3rem 0.6rem',
                      borderRadius: '4px',
                      fontSize: '0.72rem',
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '70px 1.8fr 100px 80px 70px',
                    padding: '0.3rem 0.6rem',
                    fontSize: '0.68rem',
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
                        gridTemplateColumns: '70px 1.8fr 100px 80px 70px',
                        padding: '0.35rem 0.6rem',
                        borderRadius: '4px',
                        background: isSelected ? 'rgba(255, 255, 255, 0.06)' : 'rgba(10, 13, 18, 0.4)',
                        border: isSelected ? '1px solid rgba(255, 107, 53, 0.4)' : '1px solid rgba(255, 255, 255, 0.04)',
                        cursor: 'pointer',
                        fontSize: '0.74rem',
                        alignItems: 'center',
                      }}
                    >
                      <div style={{ fontFamily: 'monospace', color: '#8899AA', fontSize: '0.7rem' }}>{tc.id}</div>
                      <div style={{ color: '#FFFFFF', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tc.name}</div>
                      <div style={{ color: '#888888', fontSize: '0.7rem' }}>{tc.category}</div>
                      <div>
                        <span
                          style={{
                            padding: '0.15rem 0.4rem',
                            borderRadius: '3px',
                            fontSize: '0.64rem',
                            fontWeight: 700,
                            background: isReg ? 'rgba(255, 34, 0, 0.2)' : 'rgba(46, 204, 113, 0.15)',
                            color: isReg ? '#FF4422' : '#2ECC71',
                            border: `1px solid ${isReg ? '#FF3311' : '#27AE60'}`,
                          }}
                        >
                          {isReg ? 'REGRESSION' : 'PASSED'}
                        </span>
                      </div>
                      <div style={{ color: '#CCCCCC', fontFamily: 'monospace', fontSize: '0.7rem' }}>{tc.latency}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
