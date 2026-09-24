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
  currentStageText: string;
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
  currentStageText,
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
          background: '#0D1117',
          border: isFailed ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(255, 107, 53, 0.35)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '560px',
          boxShadow: isFailed
            ? '0 20px 60px rgba(239, 68, 68, 0.2)'
            : '0 20px 60px rgba(0, 0, 0, 0.8), 0 0 30px rgba(255, 107, 53, 0.15)',
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
              ? 'radial-gradient(circle, rgba(239, 68, 68, 0.14) 0%, rgba(13, 17, 23, 0.96) 75%)'
              : 'radial-gradient(circle, rgba(255, 107, 53, 0.09) 0%, rgba(13, 17, 23, 0.96) 75%)',
            border: isFailed ? '1.5px solid rgba(239, 68, 68, 0.5)' : '1.5px solid rgba(255, 107, 53, 0.38)',
            boxShadow: isFailed
              ? '0 0 24px rgba(239, 68, 68, 0.22), inset 0 0 16px rgba(239, 68, 68, 0.12)'
              : '0 0 24px rgba(255, 107, 53, 0.18), inset 0 0 16px rgba(255, 107, 53, 0.10)',
          }}
        >
          {isFailed ? (
            <div
              style={{
                width: '74px',
                height: '74px',
                borderRadius: '50%',
                background: 'rgba(239, 68, 68, 0.15)',
                border: '2px solid #EF4444',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2.2rem',
                color: '#EF4444',
                boxShadow: '0 0 20px rgba(239, 68, 68, 0.3)',
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
              color: isFailed ? '#EF4444' : 'var(--reliq-accent, #FF6B35)',
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
          <div style={{ fontSize: '0.8rem', color: '#8899AA', marginTop: '0.3rem' }}>
            {datasetName} • {targetTotal} scenarios • Elapsed: <strong style={{ color: '#FFFFFF' }}>{formattedTime}</strong>
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
            <div style={{ color: '#4DA6FF', fontWeight: 600, fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {candidateModel}
            </div>
          </div>
          <div style={{ gridColumn: 'span 2', borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '0.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ color: '#8899AA', fontSize: '0.68rem', textTransform: 'uppercase' }}>Judge: </span>
              <span style={{ color: judgeEnabled ? '#2ECC71' : '#888888', fontWeight: 600, fontSize: '0.75rem' }}>
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
                  ? `Processing scenario ${currentCaseNumber} / ${targetTotal}`
                  : 'EVALUATION IN PROGRESS'}
              </span>
              <span style={{ color: 'var(--reliq-accent, #FF6B35)', fontWeight: 800 }}>
                {progressPercent > 0 ? `${progressPercent}%` : ''}
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
                    background: 'linear-gradient(90deg, #FF6B35 0%, #FF8C5A 100%)',
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
                    background: 'linear-gradient(90deg, transparent 0%, #FF6B35 50%, transparent 100%)',
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
              title={currentStageText}
            >
              {currentStageText || 'Executing model telemetry and criteria evaluation...'}
            </div>

            {/* Evaluator Engine Status Chips */}
            <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.4rem' }}>
              <span
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  padding: '0.2rem 0.6rem',
                  borderRadius: '4px',
                  background: 'rgba(46, 204, 113, 0.15)',
                  color: '#2ECC71',
                  border: '1px solid rgba(46, 204, 113, 0.3)',
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
                  background: judgeEnabled ? 'rgba(77, 166, 255, 0.15)' : 'rgba(255, 255, 255, 0.08)',
                  color: judgeEnabled ? '#4DA6FF' : '#888888',
                  border: judgeEnabled ? '1px solid rgba(77, 166, 255, 0.3)' : '1px solid rgba(255, 255, 255, 0.12)',
                }}
              >
                LLM Judge: {judgeEnabled ? 'ACTIVE' : 'OFF'}
              </span>
            </div>
          </div>
        ) : (
          /* ── Failure Details Box ── */
          <div
            style={{
              width: '100%',
              background: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '8px',
              padding: '1rem',
              fontSize: '0.8rem',
              color: '#FCA5A5',
              lineHeight: 1.4,
            }}
          >
            <div style={{ fontWeight: 700, color: '#EF4444', marginBottom: '0.3rem' }}>
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
                background: 'var(--reliq-accent, #FF6B35)',
                color: '#000000',
                border: 'none',
                padding: '0.55rem 1.2rem',
                borderRadius: '6px',
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
