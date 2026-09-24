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
 * Editorial Model Ledger / Data Rail (Technical Research Instrument)
 * 
 * Flat, compact data rail supporting State 03 (COMPARE).
 * Keeps the 3D globe and particles fully visible in the background.
 * Provides interactive scrub-synced model rows with truthful data labeling.
 */
export function VersionCards() {
  const scrollProgress = useExperienceStore((state) => state.scrollProgress);
  const [realRuns, setRealRuns] = useState<VersionItem[] | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
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

  // Active strictly during State 2 (COMPARE / EVALUATION: scrollProgress 0.28 to 0.49)
  const pinStart = 0.28;
  const pinEnd = 0.49;
  const isActive = scrollProgress >= pinStart && scrollProgress <= pinEnd;

  // Horizontal scrub progress across the versions (0 to 1)
  const hProgress = useMemo(() => {
    return mapRangeClamped(scrollProgress, pinStart, pinEnd, 0, 1);
  }, [scrollProgress]);

  // Fade in / out opacity for the pinned overlay
  const opacity = useMemo(() => {
    if (scrollProgress < pinStart) return 0;
    if (scrollProgress < pinStart + 0.03) {
      return mapRangeClamped(scrollProgress, pinStart, pinStart + 0.03, 0, 1);
    }
    if (scrollProgress > pinEnd - 0.03) {
      return mapRangeClamped(scrollProgress, pinEnd - 0.03, pinEnd, 1, 0);
    }
    return 1;
  }, [scrollProgress]);

  // Determine active row based on scrub position or explicit hover
  const scrubbedIndex = Math.min(
    Math.floor(hProgress * activeVersions.length),
    activeVersions.length - 1
  );
  const selectedIndex = hoveredIndex !== null ? hoveredIndex : Math.max(0, scrubbedIndex);
  const activeItem = activeVersions[selectedIndex] || activeVersions[0];

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
        alignItems: 'center',
        paddingLeft: 'clamp(2rem, 5vw, 6rem)',
        background: 'transparent',
        transition: 'opacity 0.2s ease-out',
        overflow: 'hidden',
      }}
    >
      {/* ── Compact Left-Aligned Data Rail (Leaves 3D Globe Open & Visible) ── */}
      <div
        style={{
          width: 'clamp(460px, 48vw, 680px)',
          maxWidth: '92vw',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}
      >
        {/* ── Editorial Section Header ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: '0.72rem',
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: 'var(--accent, #FF6B35)',
                fontWeight: 600,
              }}
            >
              STAGE 02 // CONTINUOUS EVALUATION TRACK
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
              fontSize: 'clamp(1.5rem, 2.5vw, 2.1rem)',
              fontWeight: 800,
              letterSpacing: '-0.02em',
              color: '#FFFFFF',
              margin: '0.15rem 0',
              lineHeight: 1.15,
            }}
          >
            Model Evaluation Ledger
          </h2>

          <p
            style={{
              fontSize: '0.82rem',
              color: 'var(--text-muted, #A0B0C0)',
              margin: 0,
              lineHeight: 1.45,
            }}
          >
            Observability rail tracking regression tolerances and latency bounds across release candidates.
          </p>
        </div>

        {/* ── Data Rail Column Labels ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '0 1rem',
            fontSize: '0.64rem',
            fontFamily: 'monospace',
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#607080',
            fontWeight: 600,
          }}
        >
          <div style={{ width: '48px' }}>VER</div>
          <div style={{ flex: 2.2 }}>MODEL CANDIDATE</div>
          <div style={{ flex: 1.6 }}>STATUS</div>
          <div style={{ flex: 1.1, textAlign: 'right' }}>RELIABILITY</div>
          <div style={{ flex: 0.9, textAlign: 'right' }}>LATENCY</div>
          <div style={{ flex: 0.9, textAlign: 'right' }}>COST</div>
          <div style={{ flex: 1.2, textAlign: 'right' }}>SOURCE</div>
        </div>

        {/* ── Horizontal Data Rails (Flatter Editorial Treatment) ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
          {activeVersions.map((v, i) => {
            const isSelected = i === selectedIndex;
            const isReg = v.isRegression;
            const isWarn = v.status === 'warning' && v.hasData;
            const noData = !v.hasData;

            // Color tokens
            const accentColor = isReg
              ? '#FF2200'
              : isWarn
              ? '#FFAA55'
              : noData
              ? '#667788'
              : '#4DA6FF';

            return (
              <div
                key={v.id}
                onMouseEnter={() => setHoveredIndex(i)}
                onMouseLeave={() => setHoveredIndex(null)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0.7rem 1rem',
                  borderRadius: '6px',
                  background: isSelected
                    ? isReg
                      ? 'rgba(38, 14, 12, 0.92)'
                      : 'rgba(22, 28, 38, 0.92)'
                    : 'rgba(12, 16, 22, 0.84)',
                  backdropFilter: 'blur(6px)',
                  WebkitBackdropFilter: 'blur(6px)',
                  border: isSelected
                    ? `1px solid ${accentColor}`
                    : '1px solid rgba(255, 255, 255, 0.07)',
                  borderLeft: isSelected
                    ? `3px solid ${accentColor}`
                    : '3px solid transparent',
                  boxShadow: isSelected
                    ? isReg
                      ? '0 4px 20px rgba(255, 34, 0, 0.22)'
                      : '0 4px 20px rgba(77, 166, 255, 0.15)'
                    : 'none',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {/* Version Pill */}
                <div
                  style={{
                    width: '48px',
                    fontFamily: 'monospace',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    color: isSelected ? accentColor : '#A0B0C0',
                  }}
                >
                  {v.id}
                </div>

                {/* Model Candidate Name */}
                <div style={{ flex: 2.2, display: 'flex', flexDirection: 'column' }}>
                  <span
                    style={{
                      fontSize: '0.88rem',
                      fontWeight: 600,
                      color: isSelected ? '#FFFFFF' : '#D0D8E0',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {v.name}
                  </span>
                </div>

                {/* Status Badge */}
                <div style={{ flex: 1.6, display: 'flex', alignItems: 'center' }}>
                  <span
                    style={{
                      fontSize: '0.62rem',
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      padding: '0.2rem 0.55rem',
                      borderRadius: '3px',
                      background: isReg
                        ? 'rgba(255, 34, 0, 0.18)'
                        : isWarn
                        ? 'rgba(255, 170, 85, 0.18)'
                        : noData
                        ? 'rgba(100, 120, 140, 0.14)'
                        : 'rgba(77, 166, 255, 0.16)',
                      color: accentColor,
                      border: `1px solid ${accentColor}40`,
                    }}
                  >
                    {v.statusLabel}
                  </span>
                </div>

                {/* Primary Metric: Reliability */}
                <div
                  style={{
                    flex: 1.1,
                    textAlign: 'right',
                    fontFamily: 'monospace',
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    color: isReg
                      ? '#FF3311'
                      : noData
                      ? '#607080'
                      : isSelected
                      ? '#FFFFFF'
                      : '#4DA6FF',
                  }}
                >
                  {v.accuracy}
                </div>

                {/* Latency */}
                <div
                  style={{
                    flex: 0.9,
                    textAlign: 'right',
                    fontFamily: 'monospace',
                    fontSize: '0.82rem',
                    color: noData ? '#607080' : '#A0B0C0',
                  }}
                >
                  {v.latency}
                </div>

                {/* Cost */}
                <div
                  style={{
                    flex: 0.9,
                    textAlign: 'right',
                    fontFamily: 'monospace',
                    fontSize: '0.82rem',
                    color: noData ? '#607080' : '#A0B0C0',
                  }}
                >
                  {v.cost}
                </div>

                {/* Truthful Source Tag */}
                <div
                  style={{
                    flex: 1.2,
                    textAlign: 'right',
                    fontFamily: 'monospace',
                    fontSize: '0.62rem',
                    letterSpacing: '0.05em',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    color: v.source === 'LIVE RUN'
                      ? '#2ECC71'
                      : v.source === 'HISTORICAL'
                      ? '#4DA6FF'
                      : v.source === 'DEMO / SAMPLE'
                      ? '#FFAA55'
                      : '#607080',
                  }}
                >
                  {v.source}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Active Row Audit Summary Drawer ── */}
        <div
          style={{
            padding: '0.65rem 0.95rem',
            borderRadius: '4px',
            background: 'rgba(10, 14, 20, 0.88)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: '0.6rem',
            fontSize: '0.78rem',
            lineHeight: 1.45,
            color: activeItem?.isRegression ? '#FFAA99' : '#A0B0C0',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem' }}>
            <span
              style={{
                fontFamily: 'monospace',
                fontSize: '0.68rem',
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: activeItem?.isRegression ? '#FF2200' : 'var(--accent, #FF6B35)',
                whiteSpace: 'nowrap',
              }}
            >
              {activeItem?.id} AUDIT NOTE //
            </span>
            <span>{activeItem?.changeSummary}</span>
          </div>
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: '0.64rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
              color: isRealData ? '#2ECC71' : 'var(--text-dim, #708090)',
            }}
          >
            SOURCE: {isRealData ? 'RELIQ AUDIT DATABASE' : 'SAMPLE BENCHMARK SCENARIO'}
          </span>
        </div>

        {/* ── Rail Scrub Progress Bar ── */}
        <div
          style={{
            width: '100%',
            height: '2px',
            background: 'rgba(255, 255, 255, 0.08)',
            borderRadius: '1px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${hProgress * 100}%`,
              background: activeItem?.isRegression ? '#FF2200' : '#FF6B35',
              transition: 'background 0.25s ease',
            }}
          />
        </div>
      </div>
    </div>
  );
}
