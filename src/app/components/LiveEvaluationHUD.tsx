/* ============================================================
   RELIQ — Live Evaluation Progress HUD (Floating Status Bar)
   
   Persistent floating status bar that stays visible even if the
   user minimizes the main modal or navigates through views:
   - Current scenario: "Evaluating [4/5]: Stripe webhook signature verification failure"
   - Real-time progress bar (0% -> 100%)
   - Completed vs. remaining count
   - Active model / provider indicator
   - Live elapsed time counter
   - Phase indicator: PREPARING -> RUNNING SCENARIOS -> EVALUATING RESPONSES -> COMPUTING GATE METRICS -> COMPLETE
   - Re-open modal & cancel controls
   ============================================================ */

import React, { useEffect, useState } from 'react';

export interface LiveEvaluationHUDProps {
  isRunning: boolean;
  isModalOpen: boolean;
  datasetName: string;
  baselineModel: string;
  candidateModel: string;
  progressPercent: number;
  currentCount: number;
  totalCount: number;
  caseName?: string;
  phase?: string;
  onOpenModal: () => void;
  onCancel: () => void;
}

export const LiveEvaluationHUD: React.FC<LiveEvaluationHUDProps> = ({
  isRunning,
  isModalOpen,
  datasetName,
  baselineModel,
  candidateModel,
  progressPercent,
  currentCount,
  totalCount,
  caseName,
  phase = 'RUNNING SCENARIOS',
  onOpenModal,
  onCancel,
}) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!isRunning) {
      setElapsedSeconds(0);
      return;
    }
    const timer = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [isRunning]);

  if (!isRunning) return null;

  const minutes = Math.floor(elapsedSeconds / 60);
  const seconds = elapsedSeconds % 60;
  const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  const remaining = Math.max(0, totalCount - currentCount);
  const displayScenarioText = caseName
    ? `Evaluating [${currentCount}/${totalCount}]: ${caseName}`
    : `Evaluating scenario ${currentCount} of ${totalCount}...`;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '1.5rem',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9990,
        width: 'calc(100% - 3rem)',
        maxWidth: '960px',
        background: 'rgba(20, 24, 31, 0.96)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        borderRadius: '12px',
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.7)',
        padding: '0.85rem 1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.55rem',
        animation: 'reliqHudSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <style>{`
        @keyframes reliqHudSlideUp {
          from { transform: translate(-50%, 20px); opacity: 0; }
          to { transform: translate(-50%, 0); opacity: 1; }
        }
        @keyframes reliqHudPulse {
          0%, 100% { opacity: 0.6; transform: scale(0.9); }
          50% { opacity: 1; transform: scale(1.15); }
        }
      `}</style>

      {/* Top row: Status, Phase, Models, Timer, Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: 'var(--reliq-accent, #C86D51)',
              animation: 'reliqHudPulse 1.8s infinite',
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontFamily: 'monospace',
              fontSize: '0.68rem',
              fontWeight: 800,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: 'var(--reliq-accent, #C86D51)',
              background: 'rgba(200, 109, 81, 0.12)',
              border: '1px solid rgba(200, 109, 81, 0.28)',
              padding: '0.15rem 0.5rem',
              borderRadius: '4px',
              whiteSpace: 'nowrap',
            }}
          >
            {phase.toUpperCase()}
          </span>

          <span
            style={{
              fontSize: '0.82rem',
              fontWeight: 600,
              color: '#FFFFFF',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '380px',
            }}
            title={displayScenarioText}
          >
            {displayScenarioText}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
          <span style={{ fontSize: '0.75rem', color: '#8899AA', fontFamily: 'monospace' }}>
            <span style={{ color: '#4E9B6F', fontWeight: 700 }}>{currentCount}</span> completed •{' '}
            <span style={{ color: '#C68B45', fontWeight: 700 }}>{remaining}</span> remaining
          </span>

          <span
            style={{
              fontSize: '0.75rem',
              fontFamily: 'monospace',
              fontWeight: 700,
              color: '#ECECEC',
              background: 'rgba(255, 255, 255, 0.08)',
              padding: '0.2rem 0.5rem',
              borderRadius: '4px',
            }}
          >
            ⏱ {timeStr}
          </span>

          <div style={{ display: 'flex', gap: '0.4rem' }}>
            {!isModalOpen && (
              <button
                onClick={onOpenModal}
                style={{
                  background: 'var(--reliq-accent, #C86D51)',
                  border: 'none',
                  color: '#FFFFFF',
                  padding: '0.3rem 0.65rem',
                  borderRadius: '5px',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Expand View
              </button>
            )}
            <button
              onClick={onCancel}
              style={{
                background: 'rgba(192, 92, 84, 0.12)',
                border: '1px solid rgba(192, 92, 84, 0.3)',
                color: '#E0A8A0',
                padding: '0.3rem 0.6rem',
                borderRadius: '5px',
                fontSize: '0.72rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>

      {/* Bottom row: Progress bar + Model pair info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
        <div
          style={{
            flex: 1,
            height: '6px',
            background: 'rgba(255, 255, 255, 0.08)',
            borderRadius: '3px',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${Math.max(3, Math.min(100, progressPercent))}%`,
              background: '#C86D51',
              borderRadius: '3px',
              transition: 'width 0.25s ease-out',
            }}
          />
        </div>

        <span
          style={{
            fontSize: '0.72rem',
            fontFamily: 'monospace',
            fontWeight: 800,
            color: '#C86D51',
            minWidth: '42px',
            textAlign: 'right',
          }}
        >
          {Math.round(progressPercent)}%
        </span>

        <span
          style={{
            fontSize: '0.68rem',
            color: '#718096',
            maxWidth: '300px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {baselineModel} <span style={{ color: '#5B82A6' }}>vs</span> {candidateModel}
        </span>
      </div>
    </div>
  );
};
