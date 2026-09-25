import React, { useMemo, useState, useEffect } from 'react';
import { useExperienceStore } from '../store/experienceStore';
import { mapRangeClamped } from '../utils/math';
import { apiRepository } from '../services/apiRepository';
import { EvaluationRun } from '../domain/types';
import { useRouter } from '../router/useRouter';

export interface VersionItem {
  id: string;
  name: string;
  modelTag: string;
  accuracy: string;
  latency: string;
  cost: string;
  status: 'healthy' | 'warning' | 'regression';
  statusLabel: string;
  source: 'LIVE RUN' | 'HISTORICAL' | 'DEMO / SAMPLE' | 'NO COMPLETED RUN';
  changeSummary: string;
  isRegression?: boolean;
  hasData: boolean;
}

const DEFAULT_VERSIONS: VersionItem[] = [
  {
    id: 'v1.1',
    name: 'CEREBRAS (gpt-oss-120b)',
    modelTag: 'CEREBRAS',
    accuracy: '—',
    latency: '—',
    cost: '—',
    status: 'warning',
    statusLabel: 'NO COMPLETED RUN',
    source: 'NO COMPLETED RUN',
    changeSummary: 'Pending benchmark execution. No completed evaluation data recorded.',
    hasData: false,
    isRegression: false,
  },
  {
    id: 'v1.2',
    name: 'GROQ (openai/gpt-oss-20b)',
    modelTag: 'GROQ',
    accuracy: '40.0%',
    latency: '1.12s',
    cost: '$0.0004',
    status: 'healthy',
    statusLabel: 'VERIFIED STABLE',
    source: 'HISTORICAL',
    changeSummary: 'Baseline evaluated across golden benchmark suite. Stable tool execution.',
    hasData: true,
    isRegression: false,
  },
  {
    id: 'v1.3',
    name: 'DEMO (Golden Baseline)',
    modelTag: 'DEMO',
    accuracy: '95.1%',
    latency: '1.24s',
    cost: '$0.0031',
    status: 'healthy',
    statusLabel: 'VERIFIED STABLE',
    source: 'DEMO / SAMPLE',
    changeSummary: 'Standard golden reference prompt suite evaluated across ground-truth cases.',
    hasData: true,
    isRegression: false,
  },
  {
    id: 'v1.4',
    name: 'GROQ (openai/gpt-oss-120b)',
    modelTag: 'GROQ',
    accuracy: '—',
    latency: '—',
    cost: '—',
    status: 'warning',
    statusLabel: 'NO COMPLETED RUN',
    source: 'NO COMPLETED RUN',
    changeSummary: 'Candidate queued for execution. No completed evaluation data recorded.',
    hasData: false,
    isRegression: false,
  },
  {
    id: 'v1.5',
    name: 'GROQ (Candidate Release)',
    modelTag: 'GROQ',
    accuracy: '89.7%',
    latency: '1.86s',
    cost: '$0.0052',
    status: 'regression',
    statusLabel: 'REGRESSION DETECTED',
    source: 'HISTORICAL',
    changeSummary: 'Critical regression: 47 test cases failed on payment validation tools.',
    hasData: true,
    isRegression: true,
  },
];

/**
 * Continuous Evaluation Track / Horizontal Comparison Rail (Stage 02)
 *
 * Horizontally scrolling card track scrubbing smoothly across the viewport
 * synchronized with vertical page scroll during States 2 & 3.
 * Preserves background 3D globe visibility with frosted backdrop blur.
 */
export function VersionCards() {
  const scrollProgress = useExperienceStore((state) => state.scrollProgress);
  const [realRuns, setRealRuns] = useState<VersionItem[] | null>(null);
  const { isTransitioning } = useRouter();

  useEffect(() => {
    let mounted = true;
    apiRepository
      .getEvaluationRuns()
      .then((runs: EvaluationRun[]) => {
        if (!mounted) return;
        if (runs && runs.length >= 2) {
          const mapped: VersionItem[] = runs.slice(0, 5).map((r: EvaluationRun, idx: number) => {
            const totalCases = r.metrics?.totalCases ?? (r.caseResults?.length || 0);
            const score = r.metrics?.candidateQualityScore ?? r.metrics?.candidateAccuracy;
            const lat = r.metrics?.candidateAvgLatencyMs;
            const cost = r.metrics?.candidateEstimatedCost;
            const hasData = totalCases > 0 && score != null;
            const isLive = r.executionMode === 'LIVE' || Boolean(r.provenance?.isLiveExecution);
            const isReg = hasData && Boolean(r.regressionDecision?.isRegression || r.releaseDecision?.status === 'BLOCK' || r.releaseDecision?.status === 'REGRESSION_DETECTED');
            const isWarn = hasData && Boolean(r.releaseDecision?.status === 'SHIP_WITH_CONDITIONS' || r.releaseDecision?.status === 'INSUFFICIENT_EVIDENCE');
            const provider = (r.candidateVersion?.provider || 'RUN').toUpperCase();
            const modelName = r.candidateVersion?.modelIdentifier?.split('/').pop() || r.id.slice(0, 8);

            const source: VersionItem['source'] = !hasData
              ? 'NO COMPLETED RUN'
              : isLive
              ? 'LIVE RUN'
              : 'HISTORICAL';

            const statusLabel = !hasData
              ? 'NO COMPLETED RUN'
              : isReg
              ? 'REGRESSION DETECTED'
              : isWarn
              ? 'DRIFT WARNING'
              : 'VERIFIED STABLE';

            return {
              id: `v1.${idx + 1}`,
              name: `${provider} (${modelName})`,
              modelTag: provider,
              accuracy: hasData ? `${score.toFixed(1)}%` : '—',
              latency: hasData && lat != null ? `${(lat / 1000).toFixed(2)}s` : '—',
              cost: hasData && cost != null ? `$${cost.toFixed(4)}` : '—',
              status: !hasData ? 'warning' : isReg ? 'regression' : isWarn ? 'warning' : 'healthy',
              statusLabel,
              source,
              changeSummary: !hasData
                ? 'No completed evaluation data recorded for this run.'
                : r.regressionDecision?.summary || r.releaseDecision?.reason || `Authoritative benchmark run evaluated across ${totalCases} scenarios.`,
              isRegression: isReg,
              hasData,
            };
          });
          setRealRuns(mapped);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const activeVersions = realRuns && realRuns.length >= 2 ? realRuns : DEFAULT_VERSIONS;
  const isRealData = Boolean(realRuns && realRuns.length >= 2);

  // Active during States 2 and 3 (scrollProgress 0.28 to 0.62)
  const pinStart = 0.28;
  const pinEnd = 0.62;
  const isActive = scrollProgress >= pinStart && scrollProgress <= pinEnd;

  // Horizontal translation progress (0 to 1)
  const hProgress = useMemo(() => {
    return mapRangeClamped(scrollProgress, pinStart, pinEnd, 0, 1);
  }, [scrollProgress]);

  // Fade in / out opacity for the pinned overlay
  const opacity = useMemo(() => {
    if (scrollProgress < pinStart) return 0;
    if (scrollProgress < pinStart + 0.04) {
      return mapRangeClamped(scrollProgress, pinStart, pinStart + 0.04, 0, 1);
    }
    if (scrollProgress > pinEnd - 0.04) {
      return mapRangeClamped(scrollProgress, pinEnd - 0.04, pinEnd, 1, 0);
    }
    return 1;
  }, [scrollProgress]);

  // Total horizontal track translation percentage
  // From right of screen to far left so all 5 cards pass through center
  const translateX = mapRangeClamped(hProgress, 0, 1, 65, -82);

  if (isTransitioning || opacity <= 0.001) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 15,
        pointerEvents: isActive ? 'auto' : 'none',
        opacity,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        background: 'rgba(6, 9, 13, 0.45)',
        backdropFilter: 'blur(3px)',
        WebkitBackdropFilter: 'blur(3px)',
        transition: 'opacity 0.25s ease-out',
        overflow: 'hidden',
      }}
    >
      {/* ── Section Header Track ── */}
      <div
        style={{
          position: 'absolute',
          top: '12%',
          left: 'clamp(2rem, 8vw, 8rem)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.4rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: '0.75rem',
              letterSpacing: '0.25em',
              textTransform: 'uppercase',
              color: 'var(--accent, #FF6B35)',
              fontWeight: 600,
            }}
          >
            02 // HORIZONTAL COMPARISON
          </span>
          <span
            style={{
              fontSize: '0.62rem',
              fontFamily: 'monospace',
              fontWeight: 700,
              letterSpacing: '0.08em',
              padding: '0.15rem 0.55rem',
              borderRadius: '3px',
              background: isRealData ? 'rgba(46, 204, 113, 0.15)' : 'rgba(255, 107, 53, 0.15)',
              color: isRealData ? '#2ECC71' : 'var(--accent, #FF6B35)',
              border: isRealData
                ? '1px solid rgba(46, 204, 113, 0.35)'
                : '1px solid rgba(255, 107, 53, 0.35)',
            }}
          >
            {isRealData ? 'LIVE BACKEND RUNS' : 'SAMPLE BENCHMARK AUDIT DATA • INTERACTIVE DEMO'}
          </span>
        </div>
        <h2
          style={{
            fontSize: 'clamp(1.5rem, 3.5vw, 2.8rem)',
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: '#FFFFFF',
            margin: 0,
          }}
        >
          Continuous Evaluation Track
        </h2>
        <p
          style={{
            fontSize: '0.9rem',
            color: 'var(--text-muted, #888888)',
            maxWidth: '480px',
            margin: 0,
          }}
        >
          Scroll vertically to scrub through model versions in real-time. Watch the background 3D core react to regression.
        </p>
      </div>

      {/* ── Horizontally Scrolling Cards Track ── */}
      <div
        style={{
          display: 'flex',
          gap: '2.5rem',
          paddingLeft: '10vw',
          transform: `translateX(${translateX}vw)`,
          willChange: 'transform',
          transition: 'transform 0.08s linear',
        }}
      >
        {activeVersions.map((v) => {
          const isReg = v.isRegression;
          const isWarn = v.status === 'warning';
          const borderColor = isReg
            ? '#FF2200'
            : isWarn
            ? '#FF9944'
            : 'rgba(255, 255, 255, 0.12)';
          const glowShadow = isReg
            ? '0 0 35px rgba(255, 34, 0, 0.35)'
            : '0 10px 30px rgba(0, 0, 0, 0.5)';

          return (
            <div
              key={v.id}
              style={{
                width: 'clamp(320px, 28vw, 420px)',
                flexShrink: 0,
                background: isReg
                  ? 'linear-gradient(180deg, rgba(35, 10, 8, 0.85) 0%, rgba(18, 6, 5, 0.95) 100%)'
                  : 'linear-gradient(180deg, rgba(20, 24, 30, 0.85) 0%, rgba(12, 14, 18, 0.95) 100%)',
                border: `1px solid ${borderColor}`,
                borderRadius: '12px',
                padding: '2rem',
                boxShadow: glowShadow,
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                display: 'flex',
                flexDirection: 'column',
                gap: '1.4rem',
                position: 'relative',
              }}
            >
              {/* Header Badge */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '1.25rem',
                    fontWeight: 700,
                    color: '#FFFFFF',
                  }}
                >
                  {v.id}
                </div>
                <div
                  style={{
                    fontSize: '0.68rem',
                    fontWeight: 600,
                    letterSpacing: '0.15em',
                    padding: '0.3rem 0.75rem',
                    borderRadius: '999px',
                    background: isReg
                      ? 'rgba(255, 34, 0, 0.2)'
                      : isWarn
                      ? 'rgba(255, 153, 68, 0.15)'
                      : 'rgba(77, 166, 255, 0.15)',
                    color: isReg
                      ? '#FF3311'
                      : isWarn
                      ? '#FFAA55'
                      : '#4DA6FF',
                    border: `1px solid ${
                      isReg ? '#FF2200' : isWarn ? '#FFAA55' : 'rgba(77, 166, 255, 0.3)'
                    }`,
                  }}
                >
                  {v.statusLabel}
                </div>
              </div>

              {/* Version Title */}
              <div>
                <div
                  style={{
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.15em',
                    color: '#888888',
                  }}
                >
                  Model Tag
                </div>
                <div
                  style={{
                    fontSize: '1.1rem',
                    fontWeight: 600,
                    color: '#ECECEC',
                    marginTop: '0.2rem',
                  }}
                >
                  {v.name}
                </div>
              </div>

              {/* Giant Metric Display */}
              <div
                style={{
                  background: 'rgba(0, 0, 0, 0.3)',
                  borderRadius: '8px',
                  padding: '1.2rem',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                }}
              >
                <div
                  style={{
                    fontSize: '0.75rem',
                    letterSpacing: '0.15em',
                    textTransform: 'uppercase',
                    color: '#888888',
                  }}
                >
                  Reliability Score
                </div>
                <div
                  style={{
                    fontSize: '2.8rem',
                    fontWeight: 800,
                    color: isReg ? '#FF2200' : isWarn ? '#FFAA55' : '#4DA6FF',
                    letterSpacing: '-0.03em',
                    marginTop: '0.2rem',
                  }}
                >
                  {v.accuracy}
                </div>
              </div>

              {/* Secondary Stats */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '1rem',
                  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                  paddingTop: '1rem',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.7rem', color: '#888888' }}>LATENCY</div>
                  <div style={{ fontSize: '1rem', fontWeight: 600, color: '#FFFFFF' }}>
                    {v.latency}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.7rem', color: '#888888' }}>COST / RUN</div>
                  <div style={{ fontSize: '1rem', fontWeight: 600, color: '#FFFFFF' }}>
                    {v.cost}
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div
                style={{
                  fontSize: '0.8rem',
                  color: isReg ? '#FFBBAA' : '#99AAB8',
                  lineHeight: 1.45,
                }}
              >
                {v.changeSummary}
              </div>

              {/* Authoritative Source Badge */}
              <div
                style={{
                  fontSize: '0.62rem',
                  fontFamily: 'monospace',
                  letterSpacing: '0.08em',
                  color: '#708090',
                  textTransform: 'uppercase',
                  borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                  paddingTop: '0.6rem',
                }}
              >
                SOURCE: {isRealData ? 'RELIQ AUDIT DATABASE' : v.source === 'DEMO / SAMPLE' ? 'SAMPLE BENCHMARK SCENARIO' : v.source}
              </div>
            </div>
          );
        })}
      </div>

      {/* Track Progress Bar */}
      <div
        style={{
          position: 'absolute',
          bottom: '8%',
          left: 'clamp(2rem, 8vw, 8rem)',
          right: 'clamp(2rem, 8vw, 8rem)',
          height: '2px',
          background: 'rgba(255, 255, 255, 0.1)',
          borderRadius: '1px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${hProgress * 100}%`,
            background: hProgress > 0.8 ? '#FF2200' : '#FF6B35',
            transition: 'background 0.3s ease',
          }}
        />
      </div>
    </div>
  );
}
