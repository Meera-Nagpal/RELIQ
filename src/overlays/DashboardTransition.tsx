import React, { useState, useMemo } from 'react';
import { useExperienceStore } from '../store/experienceStore';
import { mapRangeClamped } from '../utils/math';
import { useRouter } from '../router/useRouter';

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
 * Signature 3D → UI Transition Moment
 * As the user reaches State 6 (CONFIDENCE), the 3D camera approaches the floating
 * 96.8% metric. The number flattens and maps into the headline card of the
 * functional RELIQ application dashboard, with a direct gateway into /app.
 */
export function DashboardTransition() {
  const currentStateIndex = useExperienceStore((state) => state.currentStateIndex);
  const stateProgress = useExperienceStore((state) => state.stateProgress);
  const scrollProgress = useExperienceStore((state) => state.scrollProgress);
  const { navigate } = useRouter();

  const [activeTab, setActiveTab] = useState<'overview' | 'cases'>('overview');
  const [selectedCase, setSelectedCase] = useState<TestCase | null>(SAMPLE_TEST_CASES[0]);

  // Active in state 5 (index 5) or when scroll is >= 0.88
  const isEntering = currentStateIndex === 5 && stateProgress > 0.3;
  const isFullyVisible = scrollProgress > 0.94;

  const scale = useMemo(() => {
    if (!isEntering) return 0.85;
    return mapRangeClamped(stateProgress, 0.3, 0.9, 0.85, 1.0);
  }, [isEntering, stateProgress]);

  const opacity = useMemo(() => {
    if (!isEntering) return 0;
    return mapRangeClamped(stateProgress, 0.3, 0.75, 0, 1.0);
  }, [isEntering, stateProgress]);

  const bgBackdrop = useMemo(() => {
    if (!isEntering) return 0;
    return mapRangeClamped(stateProgress, 0.3, 0.85, 0, 0.96);
  }, [isEntering, stateProgress]);

  if (opacity <= 0.001) return null;

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
        backdropFilter: isFullyVisible ? 'blur(16px)' : 'blur(6px)',
        opacity,
        padding: 'clamp(1rem, 3vw, 2.5rem)',
        overflowY: 'auto',
        transition: 'opacity 0.25s ease-out',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '1120px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(16, 20, 26, 0.95)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '16px',
          boxShadow: '0 30px 80px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.05)',
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
            padding: '2rem',
            background: 'linear-gradient(180deg, rgba(22, 28, 38, 0.7) 0%, rgba(14, 18, 24, 0.9) 100%)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.2fr 2fr',
              gap: '2.5rem',
              alignItems: 'center',
            }}
          >
            {/* Primary AI Reliability Card (Transformed from 3D) */}
            <div
              style={{
                background: 'rgba(10, 13, 18, 0.85)',
                border: '1px solid rgba(255, 107, 53, 0.35)',
                borderRadius: '12px',
                padding: '1.8rem',
                boxShadow: '0 0 30px rgba(255, 107, 53, 0.12)',
              }}
            >
              <div
                style={{
                  fontSize: '0.75rem',
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  color: 'var(--text-muted, #888888)',
                  fontWeight: 600,
                }}
              >
                AI Reliability
              </div>
              <div
                style={{
                  fontSize: 'clamp(2.8rem, 4.5vw, 4.2rem)',
                  fontWeight: 800,
                  letterSpacing: '-0.03em',
                  color: '#FFFFFF',
                  lineHeight: 1.05,
                  margin: '0.5rem 0 1rem 0',
                }}
              >
                96.8%
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '0.8rem',
                  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                  paddingTop: '1rem',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.7rem', color: '#888888' }}>Accuracy</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#4DA6FF' }}>
                    94.8%
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: '#888888' }}>Latency</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ECECEC' }}>
                    1.42s
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: '#888888' }}>Cost</div>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#ECECEC' }}>
                    $0.004
                  </div>
                </div>
              </div>
            </div>

            {/* Evaluation Decision Summary */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
              <div>
                <div
                  style={{
                    fontSize: '0.72rem',
                    letterSpacing: '0.2em',
                    textTransform: 'uppercase',
                    color: '#55DDFF',
                    fontWeight: 600,
                  }}
                >
                  RELEASE EVALUATION READY
                </div>
                <h3
                  style={{
                    fontSize: '1.5rem',
                    fontWeight: 700,
                    color: '#FFFFFF',
                    margin: '0.3rem 0 0.5rem 0',
                  }}
                >
                  Target Model v1.6 Passed Golden Gate
                </h3>
                <p
                  style={{
                    fontSize: '0.9rem',
                    color: '#99AAB8',
                    lineHeight: 1.5,
                    margin: 0,
                  }}
                >
                  All 47 previous regressions in payment validation and tool schemas have been verified resolved.
                  Evaluated against 500 multi-turn test vectors with 0 breaking anomalies.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <button
                  onClick={() => navigate('#/app/dashboard')}
                  style={{
                    background: 'var(--accent, #FF6B35)',
                    color: '#000000',
                    border: 'none',
                    padding: '0.85rem 1.8rem',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    letterSpacing: '0.05em',
                    cursor: 'pointer',
                    boxShadow: '0 4px 15px rgba(255, 107, 53, 0.3)',
                    transition: 'all 0.25s ease',
                  }}
                >
                  Open Full RELIQ Workspace →
                </button>
                <span style={{ fontSize: '0.8rem', color: '#778899' }}>
                  Root-cause confidence: <strong style={{ color: '#FFFFFF' }}>87%</strong>
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ── Interactive Workspace Tabs ── */}
        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
          <button
            onClick={() => setActiveTab('overview')}
            style={{
              padding: '0.9rem 1.8rem',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'overview' ? '2px solid var(--accent, #FF6B35)' : 'none',
              color: activeTab === 'overview' ? '#FFFFFF' : '#888888',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Regression Breakdown
          </button>
          <button
            onClick={() => setActiveTab('cases')}
            style={{
              padding: '0.9rem 1.8rem',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === 'cases' ? '2px solid var(--accent, #FF6B35)' : 'none',
              color: activeTab === 'cases' ? '#FFFFFF' : '#888888',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Test Suite Cases (500)
          </button>
        </div>

        {/* ── Tab Content ── */}
        <div style={{ padding: '2rem', flex: 1, overflowY: 'auto' }}>
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
                    <span style={{ color: '#FFFFFF', fontFamily: 'monospace' }}>claude-3-5-sonnet@20241022</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', paddingBottom: '0.4rem' }}>
                    <span style={{ color: '#888888' }}>Candidate Model</span>
                    <span style={{ color: '#4DA6FF', fontFamily: 'monospace' }}>gemini-1.5-pro-002</span>
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
