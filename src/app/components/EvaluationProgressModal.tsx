/* ============================================================
   RELIQ — Evaluation Progress & Running Modal
   
   Dedicated real-time telemetry modal for live evaluation runs:
   - 3-ring concentric RELIQ ripple animation
   - Real progress tracking without simulated/fake progress
   - Stage indicators (Semantic Evaluation, LLM Judge)
   - Live elapsed time counter
   - Cancellation and Failure error handling states
   ============================================================ */

import React, { useEffect, useState } from 'react';
import { RippleLoader } from './RippleLoader';

export interface EvaluationProgressModalProps {
  isOpen: boolean;
  datasetName: string;
  totalScenarios: number;
  baselineModel: string;
  candidateModel: string;
  judgeModel?: string;
  judgeEnabled: boolean;
  semanticStatus?: string;
  progressPercent: number;
  progressCounts: { current: number; total: number } | null;
  throughputCasesPerSec?: number;
  averageLatencyMs?: number;
  retriesCount?: number;
  currentStageText: string;
  caseName?: string;
  phase?: string;
  runId: string | null;
  error: string | null;
  onCancel: () => void;
  onRetry?: () => void;
}

export const EvaluationProgressModal: React.FC<EvaluationProgressModalProps> = ({
  isOpen,
  datasetName,
  totalScenarios,
  baselineModel,
  candidateModel,
  judgeModel,
  judgeEnabled,
  semanticStatus = 'ACTIVE',
  progressPercent,
  progressCounts,
  throughputCasesPerSec,
  averageLatencyMs,
  retriesCount,
  currentStageText,
  caseName,
  phase,
  runId,
  error,
  onCancel,
  onRetry,
}) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Timer tracking while evaluation is actively running
  useEffect(() => {
    if (!isOpen || error) return;
    setElapsedSeconds(0);
    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, error]);

  if (!isOpen) return null;

  const isFailed = Boolean(error);
  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const formattedTime = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  const currentCaseNumber = progressCounts?.current ?? 0;
  const targetTotal = progressCounts?.total || totalScenarios || 27;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        background: 'rgba(0, 0, 0, 0.82)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="evaluation-modal-card"
        style={{
          position: 'relative',
          overflow: 'hidden',
          isolation: 'isolate',
          background: '#14181F',
          border: isFailed ? '1px solid rgba(192, 92, 84, 0.4)' : '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '560px',
          boxShadow: isFailed
            ? '0 20px 60px rgba(0, 0, 0, 0.8), 0 0 20px rgba(192, 92, 84, 0.15)'
            : '0 20px 60px rgba(0, 0, 0, 0.8)',
          padding: '2rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '1.4rem',
          boxSizing: 'border-box',
          animation: 'reliqModalIn 0.25s cubic-bezier(0.22, 0.61, 0.36, 1)',
        }}
      >
        <style>{`
          @keyframes reliqModalIn {
            from {
              opacity: 0;
              transform: scale(0.95);
            }
            to {
              opacity: 1;
              transform: scale(1);
            }
          }
          @keyframes reliqIndeterminate {
            0% {
              transform: translateX(-100%);
            }
            100% {
              transform: translateX(300%);
            }
          }
        `}</style>

        {/* ── Circular Frame with Concentric Expanding Ripple Rings ── */}
        <div
          className="evaluation-modal-ripple-container"
          style={{
            margin: '0.2rem auto 0.6rem auto',
            position: 'relative',
            overflow: 'hidden',
            isolation: 'isolate',
            borderRadius: '50%',
            width: '136px',
            height: '136px',
            minWidth: '136px',
            minHeight: '136px',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            background: isFailed
              ? 'rgba(192, 92, 84, 0.08)'
              : 'rgba(200, 109, 81, 0.06)',
            border: isFailed ? '1.5px solid rgba(192, 92, 84, 0.35)' : '1.5px solid rgba(200, 109, 81, 0.28)',
          }}
        >
          {isFailed ? (
            <div
              style={{
                width: '74px',
                height: '74px',
                borderRadius: '50%',
                background: 'rgba(192, 92, 84, 0.12)',
                border: '2px solid #C05C54',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2.2rem',
                color: '#C05C54',
              }}
            >
              ⚠
            </div>
          ) : (
            <RippleLoader size={136} mode="continuous" />
          )}
        </div>

        {/* ── Header Title & Subtitle ── */}
        <div style={{ textAlign: 'center', width: '100%' }}>
          <div
            style={{
              fontSize: '0.72rem',
              fontWeight: 800,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: isFailed ? '#C05C54' : 'var(--blue-light, #60A5FA)',
              marginBottom: '0.3rem',
            }}
          >
            {isFailed ? 'EXECUTION ANOMALY DETECTED' : 'LIVE BENCHMARK HARNESS'}
          </div>
          <h2
            style={{
              margin: 0,
              fontSize: '1.4rem',
              fontWeight: 800,
              color: '#FFFFFF',
              letterSpacing: '0.02em',
            }}
          >
            {isFailed ? 'EVALUATION FAILED' : 'EVALUATION IN PROGRESS'}
          </h2>
          <div
            style={{
              fontSize: '0.82rem',
              color: '#8899AA',
              marginTop: '0.35rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.45rem',
              flexWrap: 'wrap',
            }}
          >
            <span>{datasetName}</span>
            <span style={{ color: 'rgba(255, 255, 255, 0.25)' }}>•</span>
            <span
              style={{
                color: progressPercent >= 100 ? '#4E9B6F' : 'var(--blue-light, #60A5FA)',
                fontWeight: 700,
                letterSpacing: '0.02em',
              }}
            >
              {progressPercent}% Completed
            </span>
            <span style={{ color: '#C0D0E0', fontSize: '0.78rem' }}>
              ({currentCaseNumber} of {targetTotal} evaluated)
            </span>
            <span style={{ color: 'rgba(255, 255, 255, 0.25)' }}>•</span>
            <span>
              Elapsed: <strong style={{ color: '#FFFFFF', fontFamily: 'monospace' }}>{formattedTime}</strong>
            </span>
          </div>
        </div>

        {/* ── Model Pair Telemetry ── */}
        <div
          style={{
            width: '100%',
            background: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '12px',
            padding: '0.9rem 1.1rem',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '0.8rem',
            fontSize: '0.78rem',
          }}
        >
          <div>
            <div style={{ color: '#8899AA', fontSize: '0.68rem', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
              Baseline Model
            </div>
            <div style={{ color: '#FFFFFF', fontWeight: 600, fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {baselineModel}
            </div>
          </div>
          <div>
            <div style={{ color: '#8899AA', fontSize: '0.68rem', textTransform: 'uppercase', marginBottom: '0.2rem' }}>
              Candidate Model
            </div>
            <div style={{ color: '#5B82A6', fontWeight: 600, fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {candidateModel}
            </div>
          </div>
          <div style={{ gridColumn: 'span 2', borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '0.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ color: '#8899AA', fontSize: '0.68rem', textTransform: 'uppercase' }}>Judge: </span>
              <span style={{ color: judgeEnabled ? '#4E9B6F' : '#888888', fontWeight: 600, fontSize: '0.75rem' }}>
                {judgeEnabled ? (judgeModel || 'Qwen 3.8 27B') : 'Disabled (Deterministic)'}
              </span>
            </div>
            {runId && (
              <div style={{ fontSize: '0.68rem', color: '#778899', fontFamily: 'monospace' }}>
                ID: {runId}
              </div>
            )}
          </div>
        </div>

        {/* ── Real Live Progress Section ── */}
        {!isFailed ? (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
              <span style={{ color: '#CCCCCC', fontWeight: 600 }}>
                {progressCounts && progressCounts.current > 0
                  ? `Evaluating scenario ${currentCaseNumber} of ${targetTotal}`
                  : 'EVALUATION IN PROGRESS'}
              </span>
              <span style={{ color: 'var(--blue-light, #60A5FA)', fontWeight: 800 }}>
                {progressPercent > 0 ? `${progressPercent}% Complete` : ''}
              </span>
            </div>

            {/* Visual Progress Bar */}
            <div
              style={{
                width: '100%',
                height: '8px',
                background: 'rgba(255, 255, 255, 0.08)',
                borderRadius: '4px',
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              {progressPercent > 0 ? (
                <div
                  style={{
                    width: `${Math.max(4, Math.min(100, progressPercent))}%`,
                    height: '100%',
                    background: 'var(--navy-royal, #1E3A8A)',
                    borderRadius: '4px',
                    transition: 'width 0.3s ease-out',
                  }}
                />
              ) : (
                <div
                  className="reliq-progress-indeterminate"
                  style={{
                    width: '35%',
                    height: '100%',
                    background: 'var(--blue-accent, #2563EB)',
                    borderRadius: '4px',
                    animation: 'reliqIndeterminate 1.4s ease-in-out infinite',
                  }}
                />
              )}
            </div>

            {/* Current Stage or Case Text */}
            <div
              style={{
                fontSize: '0.74rem',
                color: '#8899AA',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                fontStyle: 'italic',
              }}
              title={caseName ? `Scenario: ${caseName}` : currentStageText}
            >
              {caseName
                ? `Current: ${caseName}`
                : currentStageText && !currentStageText.includes(' 0/')
                ? currentStageText
                : 'Initializing test criteria and model evaluation...'}
            </div>

            {/* Live Progress Telemetry Counters (Completed vs Remaining) */}
            {progressCounts && progressCounts.current > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.4rem 0.75rem',
                    borderRadius: '6px',
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    fontSize: '0.72rem',
                    fontFamily: 'monospace',
                  }}
                >
                  <div style={{ color: '#4E9B6F' }}>
                    COMPLETED: <strong>{currentCaseNumber}</strong>
                  </div>
                  <div style={{ color: '#8899AA' }}>
                    REMAINING: <strong style={{ color: '#FFFFFF' }}>{Math.max(0, targetTotal - currentCaseNumber)}</strong>
                  </div>
                  <div style={{ color: 'var(--blue-light, #60A5FA)' }}>
                    TIME: <strong>{formattedTime}</strong>
                  </div>
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '0.35rem 0.75rem',
                    borderRadius: '6px',
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid rgba(255, 255, 255, 0.05)',
                    fontSize: '0.70rem',
                    fontFamily: 'monospace',
                  }}
                >
                  <div style={{ color: '#5B82A6' }}>
                    RATE: <strong>{throughputCasesPerSec ? `${throughputCasesPerSec.toFixed(1)} c/s` : '—'}</strong>
                  </div>
                  <div style={{ color: '#8899AA' }}>
                    AVG LATENCY: <strong style={{ color: '#EAEFF5' }}>{averageLatencyMs ? `${Math.round(averageLatencyMs)}ms` : '—'}</strong>
                  </div>
                  <div style={{ color: retriesCount && retriesCount > 0 ? '#E5A93C' : '#4E9B6F' }}>
                    RETRIES: <strong>{retriesCount ?? 0}</strong>
                  </div>
                </div>
              </div>
            )}

            {/* Evaluator Engine Status Chips */}
            <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.4rem', flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  padding: '0.2rem 0.6rem',
                  borderRadius: '4px',
                  background: 'rgba(78, 155, 111, 0.12)',
                  color: '#4E9B6F',
                  border: '1px solid rgba(78, 155, 111, 0.28)',
                }}
              >
                Semantic Evaluation: {semanticStatus}
              </span>
              <span
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  padding: '0.2rem 0.6rem',
                  borderRadius: '4px',
                  background: judgeEnabled ? 'rgba(91, 130, 166, 0.12)' : 'rgba(255, 255, 255, 0.06)',
                  color: judgeEnabled ? '#5B82A6' : '#888888',
                  border: judgeEnabled ? '1px solid rgba(91, 130, 166, 0.28)' : '1px solid rgba(255, 255, 255, 0.1)',
                }}
              >
                LLM Judge: {judgeEnabled ? 'ACTIVE' : 'OFF'}
              </span>
              {phase && (
                <span
                  style={{
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    padding: '0.2rem 0.6rem',
                    borderRadius: '4px',
                    background: 'rgba(10, 26, 53, 0.65)',
                    color: 'var(--blue-light, #60A5FA)',
                    border: '1px solid rgba(37, 99, 235, 0.28)',
                  }}
                >
                  Phase: {phase}
                </span>
              )}
            </div>
          </div>
        ) : (
          /* ── Failure Details Box ── */
          <div
            style={{
              width: '100%',
              background: 'rgba(192, 92, 84, 0.1)',
              border: '1px solid rgba(192, 92, 84, 0.35)',
              borderRadius: '8px',
              padding: '1rem',
              fontSize: '0.8rem',
              color: '#E0A8A0',
              lineHeight: 1.4,
            }}
          >
            <div style={{ fontWeight: 700, color: '#C05C54', marginBottom: '0.3rem' }}>
              Failure Summary:
            </div>
            <div>{error}</div>
            {runId && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.72rem', color: '#8899AA', fontFamily: 'monospace' }}>
                Run Reference: {runId}
              </div>
            )}
          </div>
        )}

        {/* ── Footer Actions ── */}
        <div style={{ display: 'flex', gap: '0.8rem', width: '100%', justifyContent: 'flex-end', marginTop: '0.4rem' }}>
          {isFailed && onRetry && (
            <button
              onClick={onRetry}
              style={{
                background: '#BAE6FD',
                color: '#0A1A35',
                border: '1px solid #BAE6FD',
                padding: '0.55rem 1.2rem',
                borderRadius: '2px',
                fontSize: '0.8rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              ↺ Retry Evaluation
            </button>
          )}

          <button
            onClick={onCancel}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#CCCCCC',
              padding: '0.55rem 1.2rem',
              borderRadius: '6px',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {isFailed ? 'Close' : 'Cancel Evaluation'}
          </button>
        </div>
      </div>
    </div>
  );
};
