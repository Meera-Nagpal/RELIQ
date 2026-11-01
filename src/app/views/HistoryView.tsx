/* ============================================================
   RELIQ — AI Evaluation Laboratory Historical Runs View
   Chronological Audit Log • Multi-Facet Filters • Rapid Comparison
   ============================================================ */

import React, { useState } from 'react';
import { EvaluationRun } from '../../domain/types';
import { useRouter } from '../../router/useRouter';

interface HistoryViewProps {
  evaluationRuns: EvaluationRun[];
  onSelectRun: (run: EvaluationRun) => void;
  onDeleteRun?: (runId: string) => Promise<void>;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  evaluationRuns,
  onSelectRun,
  onDeleteRun,
}) => {
  const { navigate } = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PASS' | 'BLOCK' | 'CONDITIONS'>('ALL');

  const filteredRuns = evaluationRuns.filter((run) => {
    const status = run.releaseDecision?.status || '';
    const isPass = status === 'PASS' || status === 'SHIP' || status === 'NO_REGRESSION';
    const isBlock = status === 'BLOCK' || status === 'REGRESSION_DETECTED' || run.regressionDecision?.isRegression;
    const isConditions = status === 'SHIP_WITH_CONDITIONS' || status === 'INSUFFICIENT_EVIDENCE';

    if (statusFilter === 'PASS' && !isPass) return false;
    if (statusFilter === 'BLOCK' && !isBlock) return false;
    if (statusFilter === 'CONDITIONS' && !isConditions) return false;

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const bName = run.baselineVersion?.name?.toLowerCase() || '';
    const cName = run.candidateVersion?.name?.toLowerCase() || '';
    const rId = run.id.toLowerCase();
    return bName.includes(q) || cName.includes(q) || rId.includes(q);
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '1440px', margin: '0 auto' }}>
      {/* View Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ fontSize: '0.68rem', fontFamily: 'monospace', letterSpacing: '0.12em', color: '#60A5FA', fontWeight: 700, textTransform: 'uppercase' }}>
            AUDIT TRAIL // CHRONOLOGICAL RUNS
          </div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#F2F2F2', margin: '0.2rem 0 0.35rem 0', letterSpacing: '-0.02em' }}>
            Evaluation Run History
          </h1>
          <p style={{ color: '#858585', fontSize: '0.82rem', margin: 0, maxWidth: '640px', lineHeight: 1.5 }}>
            Immutable execution logs for benchmark suites and gate decisions. Filter by release outcome, model architecture, or timestamp.
          </p>
        </div>

        <button
          onClick={() => navigate('#/app/evaluations')}
          style={{
            background: '#BAE6FD',
            color: '#0A1A35',
            border: '1px solid #BAE6FD',
            padding: '0.5rem 1rem',
            borderRadius: '2px',
            fontSize: '0.78rem',
            fontFamily: 'monospace',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'background 0.15s ease, border-color 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#7DD3FC';
            e.currentTarget.style.borderColor = '#7DD3FC';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#BAE6FD';
            e.currentTarget.style.borderColor = '#BAE6FD';
          }}
        >
          + NEW EVALUATION
        </button>
      </div>

      {/* Control Strip */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.8rem',
          background: '#151515',
          border: '1px solid #292929',
          borderRadius: '2px',
          padding: '0.6rem 0.8rem',
        }}
      >
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          {(['ALL', 'PASS', 'BLOCK', 'CONDITIONS'] as const).map((filter) => {
            const isSelected = statusFilter === filter;
            return (
              <button
                key={filter}
                onClick={() => setStatusFilter(filter)}
                style={{
                  background: isSelected ? '#BAE6FD' : 'transparent',
                  color: isSelected ? '#0A1A35' : '#858585',
                  border: isSelected ? '1px solid #BAE6FD' : '1px solid transparent',
                  borderRadius: '2px',
                  padding: '0.3rem 0.65rem',
                  fontSize: '0.72rem',
                  fontFamily: 'monospace',
                  fontWeight: isSelected ? 700 : 500,
                  cursor: 'pointer',
                }}
              >
                {filter === 'ALL' ? 'ALL RUNS' : `GATE: ${filter}`}
              </button>
            );
          })}
        </div>

        <div style={{ width: '260px' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search run ID or model..."
            style={{
              width: '100%',
              background: '#1B1B1B',
              border: '1px solid #292929',
              borderRadius: '2px',
              padding: '0.35rem 0.65rem',
              color: '#F2F2F2',
              fontSize: '0.78rem',
              fontFamily: 'monospace',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      {/* Runs Table */}
      <div
        style={{
          background: '#151515',
          border: '1px solid #292929',
          borderRadius: '2px',
          overflow: 'hidden',
        }}
      >
        {filteredRuns.length === 0 ? (
          <div style={{ padding: '3rem 2rem', textAlign: 'center', color: '#858585', fontFamily: 'monospace', fontSize: '0.85rem' }}>
            No evaluation runs match your search filters.
          </div>
        ) : (
          <div>
            {/* Table Header */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1.6fr 1.4fr 1.4fr 0.9fr 1fr 1fr 1fr 1.1fr',
                padding: '0.7rem 1.1rem',
                background: '#1B1B1B',
                borderBottom: '1px solid #292929',
                fontSize: '0.68rem',
                fontFamily: 'monospace',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: '#858585',
                fontWeight: 600,
              }}
            >
              <div>RUN IDENTIFIER</div>
              <div>BASELINE</div>
              <div>CANDIDATE</div>
              <div>CASES</div>
              <div>PASS RATE</div>
              <div>LATENCY</div>
              <div>GATE VERDICT</div>
              <div style={{ textAlign: 'right' }}>ACTION</div>
            </div>

            {/* Table Rows */}
            {filteredRuns.map((run) => {
              const status = run.releaseDecision?.status || '';
              const isBlock = status === 'BLOCK' || status === 'REGRESSION_DETECTED' || run.regressionDecision?.isRegression;
              const isPass = status === 'PASS' || status === 'SHIP' || status === 'NO_REGRESSION';

              const gateColor = isBlock ? '#EF4444' : isPass ? '#22C55E' : '#F59E0B';
              const gateBg = isBlock ? '#261414' : isPass ? '#13241A' : '#261D10';
              const gateBorder = isBlock ? 'rgba(239, 68, 68, 0.3)' : isPass ? 'rgba(34, 197, 94, 0.3)' : 'rgba(245, 158, 11, 0.3)';
              const gateText = isBlock ? 'BLOCKED' : isPass ? 'PASSED' : 'CONDITIONS';

              const candPass = run.metrics?.candidatePassRate ?? run.metrics?.candidateAccuracy;
              const basePass = run.metrics?.baselinePassRate ?? run.metrics?.baselineAccuracy;

              return (
                <div
                  key={run.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1.6fr 1.4fr 1.4fr 0.9fr 1fr 1fr 1fr 1.1fr',
                    padding: '0.75rem 1.1rem',
                    borderBottom: '1px solid #222222',
                    fontSize: '0.78rem',
                    alignItems: 'center',
                    background: 'transparent',
                    transition: 'background 0.12s ease',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#181818')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* Run ID & Date */}
                  <div>
                    <div style={{ fontFamily: 'monospace', fontWeight: 700, color: '#F2F2F2' }}>
                      {run.id}
                    </div>
                    <div style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: '#555555' }}>
                      {run.timestamp ? new Date(run.timestamp).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                    </div>
                  </div>

                  {/* Baseline */}
                  <div style={{ color: '#858585', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {run.baselineVersion?.name || 'Baseline'}
                  </div>

                  {/* Candidate */}
                  <div style={{ color: '#F2F2F2', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {run.candidateVersion?.name || 'Candidate'}
                  </div>

                  {/* Cases */}
                  <div style={{ fontFamily: 'monospace', color: '#858585' }}>
                    {run.metrics?.candidateEvaluatedCases ?? run.metrics?.totalCases ?? '—'}
                  </div>

                  {/* Pass Rate */}
                  <div style={{ fontFamily: 'monospace', fontWeight: 600, color: candPass !== null && candPass !== undefined ? '#F2F2F2' : '#555555' }}>
                    {candPass !== null && candPass !== undefined ? `${candPass.toFixed(1)}%` : '—'}
                    {basePass !== null && basePass !== undefined && candPass !== null && candPass !== undefined && (
                      <span style={{ fontSize: '0.68rem', marginLeft: '0.35rem', color: candPass >= basePass ? '#22C55E' : '#EF4444' }}>
                        {candPass >= basePass ? `+${(candPass - basePass).toFixed(1)}%` : `${(candPass - basePass).toFixed(1)}%`}
                      </span>
                    )}
                  </div>

                  {/* Latency */}
                  <div style={{ fontFamily: 'monospace', color: '#858585' }}>
                    {run.metrics?.candidateAvgLatencyMs ? `${Math.round(run.metrics.candidateAvgLatencyMs)}ms` : '—'}
                  </div>

                  {/* Gate Verdict */}
                  <div>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '0.15rem 0.5rem',
                        borderRadius: '2px',
                        fontSize: '0.65rem',
                        fontFamily: 'monospace',
                        fontWeight: 700,
                        background: gateBg,
                        color: gateColor,
                        border: `1px solid ${gateBorder}`,
                      }}
                    >
                      {gateText}
                    </span>
                  </div>

                  {/* Action */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem' }}>
                    <button
                      onClick={() => {
                        onSelectRun(run);
                        navigate('#/app/regressions');
                      }}
                      style={{
                        background: '#BAE6FD',
                        border: '1px solid #BAE6FD',
                        color: '#0A1A35',
                        borderRadius: '2px',
                        padding: '0.25rem 0.6rem',
                        fontSize: '0.7rem',
                        fontFamily: 'monospace',
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'background 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#7DD3FC';
                        e.currentTarget.style.borderColor = '#7DD3FC';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#BAE6FD';
                        e.currentTarget.style.borderColor = '#BAE6FD';
                      }}
                    >
                      INSPECT DIFF
                    </button>

                    {onDeleteRun && (
                      <button
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (confirm(`Delete run ${run.id}?`)) {
                            await onDeleteRun(run.id);
                          }
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: '#555555',
                          fontSize: '0.85rem',
                          cursor: 'pointer',
                          padding: '0.2rem 0.4rem',
                        }}
                        title="Delete run"
                        onMouseEnter={(e) => (e.currentTarget.style.color = '#EF4444')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = '#555555')}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
