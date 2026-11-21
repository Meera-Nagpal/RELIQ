/* ============================================================
   RELIQ — Interactive Analytical Metric Charts
   
   Provides zero-dependency SVG-based analytical visualizations:
   1. Historical Run Trend (Pass rate & regressions across runs)
   2. Latency Percentiles Distribution (P50, P75, P90, P95, P99)
   3. Category Performance Matrix (Comparative pass rates)
   ============================================================ */

import React, { useState } from 'react';
import { EvaluationRun } from '../../domain/types';

// ==========================================
// 1. Historical Run Trend Chart
// ==========================================
interface HistoricalTrendProps {
  runs: EvaluationRun[];
  onSelectRun?: (runId: string) => void;
  activeRunId?: string;
}

export const HistoricalTrendChart: React.FC<HistoricalTrendProps> = ({
  runs,
  onSelectRun,
  activeRunId,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!runs || runs.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#8899AA', fontSize: '0.85rem' }}>
        No evaluation history available to render trend curves.
      </div>
    );
  }

  // Chronological order (oldest to newest for the graph)
  const sortedRuns = [...runs].reverse().slice(-15);
  const width = 680;
  const height = 180;
  const padding = { top: 20, right: 30, bottom: 35, left: 45 };
  const graphWidth = width - padding.left - padding.right;
  const graphHeight = height - padding.top - padding.bottom;

  const points = sortedRuns.map((r, i) => {
    const x = padding.left + (i / Math.max(sortedRuns.length - 1, 1)) * graphWidth;
    const passRate = r.metrics?.candidatePassRate ?? r.metrics?.candidateAccuracy ?? 0;
    const y = padding.top + (1 - passRate / 100) * graphHeight;
    return { x, y, run: r, passRate };
  });

  const pathD = points.length === 1
    ? `M ${points[0].x} ${points[0].y} L ${points[0].x + 1} ${points[0].y}`
    : points.reduce((acc, pt, i) => (i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`), '');

  const areaD = points.length > 0
    ? `${pathD} L ${points[points.length - 1].x} ${padding.top + graphHeight} L ${points[0].x} ${padding.top + graphHeight} Z`
    : '';

  return (
    <div style={{ background: '#161B22', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.08)', padding: '1.2rem', position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div>
          <span style={{ fontSize: '0.72rem', letterSpacing: '0.15em', color: 'var(--accent, #FF6B35)', fontWeight: 700, textTransform: 'uppercase' }}>
            HISTORICAL VELOCITY // PASS RATE TREND
          </span>
          <h4 style={{ margin: '0.2rem 0 0 0', color: '#FFFFFF', fontSize: '0.95rem' }}>
            Candidate Quality Across Recent Benchmark Runs
          </h4>
        </div>
        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#2ECC71' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#2ECC71' }} /> Pass Rate (%)
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#FF4422' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#FF4422' }} /> Regressions Detected
          </span>
        </div>
      </div>

      <div style={{ width: '100%', overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', minWidth: '480px', height: 'auto', display: 'block' }}>
          <defs>
            <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2ECC71" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#2ECC71" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0, 25, 50, 75, 100].map((val) => {
            const y = padding.top + (1 - val / 100) * graphHeight;
            return (
              <g key={val}>
                <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="rgba(255, 255, 255, 0.06)" strokeDasharray="3 3" />
                <text x={padding.left - 8} y={y + 3} textAnchor="end" fill="#8899AA" fontSize="9" fontFamily="monospace">
                  {val}%
                </text>
              </g>
            );
          })}

          {/* Shaded Area */}
          {areaD && <path d={areaD} fill="url(#trendGradient)" />}

          {/* Main Trend Line */}
          {pathD && <path d={pathD} fill="none" stroke="#2ECC71" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}

          {/* Data Points */}
          {points.map((pt, i) => {
            const isHovered = hoveredIdx === i;
            const isActive = pt.run.id === activeRunId;
            const hasRegressions = (pt.run.metrics?.regressedCasesCount ?? 0) > 0;
            const pointColor = hasRegressions ? '#FF4422' : '#2ECC71';

            return (
              <g
                key={pt.run.id}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
                onClick={() => onSelectRun?.(pt.run.id)}
                style={{ cursor: 'pointer' }}
              >
                {/* Active selection ring */}
                {isActive && (
                  <circle cx={pt.x} cy={pt.y} r={9} fill="none" stroke="var(--accent, #FF6B35)" strokeWidth={2} strokeDasharray="2 2" />
                )}
                {/* Outer halo on hover */}
                {isHovered && <circle cx={pt.x} cy={pt.y} r={8} fill={pointColor} opacity={0.3} />}
                {/* Center dot */}
                <circle cx={pt.x} cy={pt.y} r={isHovered || isActive ? 5 : 3.5} fill={pointColor} stroke="#161B22" strokeWidth={1.5} />
                {/* Run index label */}
                <text x={pt.x} y={height - 10} textAnchor="middle" fill={isActive ? '#FFFFFF' : '#8899AA'} fontSize="9" fontWeight={isActive ? 700 : 400}>
                  R{sortedRuns.length - i}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Hover tooltip card */}
      {hoveredIdx !== null && points[hoveredIdx] && (
        <div
          style={{
            position: 'absolute',
            bottom: '10px',
            right: '15px',
            background: 'rgba(9, 13, 18, 0.95)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '6px',
            padding: '0.6rem 0.9rem',
            fontSize: '0.78rem',
            pointerEvents: 'none',
            boxShadow: '0 8px 16px rgba(0, 0, 0, 0.5)',
            zIndex: 10,
          }}
        >
          <div style={{ color: '#FFFFFF', fontWeight: 700 }}>
            {points[hoveredIdx].run.datasetName || points[hoveredIdx].run.id}
          </div>
          <div style={{ color: '#8899AA', marginTop: '2px' }}>
            Pass Rate: <span style={{ color: '#2ECC71', fontWeight: 700 }}>{points[hoveredIdx].passRate.toFixed(1)}%</span>
            {' • '}
            Regressions: <span style={{ color: (points[hoveredIdx].run.metrics?.regressedCasesCount ?? 0) > 0 ? '#FF4422' : '#2ECC71', fontWeight: 700 }}>
              {points[hoveredIdx].run.metrics?.regressedCasesCount ?? 0}
            </span>
          </div>
          <div style={{ color: '#8899AA', fontSize: '0.72rem', marginTop: '2px' }}>
            {new Date(points[hoveredIdx].run.timestamp).toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
};

// ==========================================
// 2. Latency Percentiles Curve
// ==========================================
interface LatencyPercentilesProps {
  baselineLatency?: number;
  candidateLatency?: number;
  baselineP95?: number;
  candidateP95?: number;
}

export const LatencyPercentilesChart: React.FC<LatencyPercentilesProps> = ({
  baselineLatency = 450,
  candidateLatency = 380,
  baselineP95 = 850,
  candidateP95 = 620,
}) => {
  // Approximate curve distribution
  const percentiles = [
    { label: 'P50', b: baselineLatency * 0.9, c: candidateLatency * 0.9 },
    { label: 'P75', b: baselineLatency * 1.15, c: candidateLatency * 1.1 },
    { label: 'P90', b: (baselineLatency + baselineP95) / 2, c: (candidateLatency + candidateP95) / 2 },
    { label: 'P95', b: baselineP95, c: candidateP95 },
    { label: 'P99', b: baselineP95 * 1.3, c: candidateP95 * 1.25 },
  ];

  const maxLatency = Math.max(...percentiles.map((p) => Math.max(p.b, p.c)), 1000);
  const width = 500;
  const height = 160;
  const pad = { top: 15, right: 25, bottom: 25, left: 45 };
  const gW = width - pad.left - pad.right;
  const gH = height - pad.top - pad.bottom;

  const bPoints = percentiles.map((p, i) => ({
    x: pad.left + (i / (percentiles.length - 1)) * gW,
    y: pad.top + (1 - p.b / maxLatency) * gH,
    val: p.b,
  }));

  const cPoints = percentiles.map((p, i) => ({
    x: pad.left + (i / (percentiles.length - 1)) * gW,
    y: pad.top + (1 - p.c / maxLatency) * gH,
    val: p.c,
  }));

  const bPath = bPoints.reduce((acc, pt, i) => (i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`), '');
  const cPath = cPoints.reduce((acc, pt, i) => (i === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`), '');

  return (
    <div style={{ background: '#161B22', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.08)', padding: '1.2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
        <span style={{ fontSize: '0.72rem', letterSpacing: '0.15em', color: '#4DA6FF', fontWeight: 700, textTransform: 'uppercase' }}>
          LATENCY PERCENTILE DISTRIBUTION
        </span>
        <div style={{ display: 'flex', gap: '0.8rem', fontSize: '0.75rem' }}>
          <span style={{ color: '#4DA6FF', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: 8, height: 8, background: '#4DA6FF', borderRadius: '2px' }} /> Baseline
          </span>
          <span style={{ color: 'var(--accent, #FF6B35)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ width: 8, height: 8, background: 'var(--accent, #FF6B35)', borderRadius: '2px' }} /> Candidate
          </span>
        </div>
      </div>

      <div style={{ width: '100%', overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
          {/* Horizontal grid lines */}
          {[0, 0.5, 1].map((ratio) => {
            const y = pad.top + ratio * gH;
            const val = Math.round((1 - ratio) * maxLatency);
            return (
              <g key={ratio}>
                <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke="rgba(255, 255, 255, 0.06)" />
                <text x={pad.left - 6} y={y + 3} textAnchor="end" fill="#8899AA" fontSize="9" fontFamily="monospace">
                  {val}ms
                </text>
              </g>
            );
          })}

          {/* Curves */}
          <path d={bPath} fill="none" stroke="#4DA6FF" strokeWidth="2" strokeDasharray="4 4" />
          <path d={cPath} fill="none" stroke="var(--accent, #FF6B35)" strokeWidth="2.5" />

          {/* Markers */}
          {percentiles.map((p, i) => (
            <g key={p.label}>
              <text x={bPoints[i].x} y={height - 8} textAnchor="middle" fill="#8899AA" fontSize="9" fontWeight={600}>
                {p.label}
              </text>
              <circle cx={bPoints[i].x} cy={bPoints[i].y} r={3} fill="#4DA6FF" />
              <circle cx={cPoints[i].x} cy={cPoints[i].y} r={3.5} fill="var(--accent, #FF6B35)" />
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
};

// ==========================================
// 3. Category Pass Rate Matrix
// ==========================================
interface CategoryMatrixProps {
  categoryStats: Record<string, { total: number; passed: number; regressions?: number }>;
}

export const CategoryPerformanceMatrix: React.FC<CategoryMatrixProps> = ({ categoryStats }) => {
  const entries = Object.entries(categoryStats);

  if (entries.length === 0) {
    return (
      <div style={{ padding: '1rem', color: '#8899AA', fontSize: '0.85rem' }}>
        No category breakdowns available.
      </div>
    );
  }

  return (
    <div style={{ background: '#161B22', borderRadius: '10px', border: '1px solid rgba(255, 255, 255, 0.08)', padding: '1.2rem' }}>
      <div style={{ fontSize: '0.72rem', letterSpacing: '0.15em', color: '#C084FC', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.8rem' }}>
        CATEGORY DOMAIN COVERAGE & PASS RATES
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {entries.map(([cat, stats]) => {
          const pct = stats.total > 0 ? (stats.passed / stats.total) * 100 : 0;
          const isHealthy = pct >= 85;
          const isWarning = pct >= 60 && pct < 85;
          const barColor = isHealthy ? '#2ECC71' : isWarning ? '#F39C12' : '#FF4422';

          return (
            <div key={cat} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                <span style={{ color: '#E6EDF3', fontWeight: 600 }}>{cat}</span>
                <span style={{ color: barColor, fontWeight: 700, fontFamily: 'monospace' }}>
                  {stats.passed}/{stats.total} ({pct.toFixed(0)}%)
                </span>
              </div>
              <div style={{ height: '6px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: barColor, transition: 'width 0.4s ease' }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
