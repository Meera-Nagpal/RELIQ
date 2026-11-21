/* ============================================================
   RELIQ — Rich Side-by-Side Prompt & Output Diff Viewer
   
   Provides word-level token diffing between Baseline and Candidate
   model outputs, latency/cost telemetry deltas, and diagnostic failure tags.
   Supports both Side-by-Side and Unified Inline diff modes.
   ============================================================ */

import React, { useState, useMemo } from 'react';
import { TestCaseResult } from '../../domain/types';

interface PromptDiffViewerProps {
  testCase: TestCaseResult;
  onClose?: () => void;
}

type DiffMode = 'split' | 'unified';

interface WordDiffItem {
  type: 'same' | 'added' | 'removed';
  text: string;
}

// Lightweight word-level diffing using Longest Common Subsequence
function computeWordDiff(oldStr: string, newStr: string): WordDiffItem[] {
  if (!oldStr && !newStr) return [];
  if (!oldStr) return [{ type: 'added', text: newStr }];
  if (!newStr) return [{ type: 'removed', text: oldStr }];

  const oldWords = oldStr.split(/(\s+)/);
  const newWords = newStr.split(/(\s+)/);

  const n = oldWords.length;
  const m = newWords.length;

  if (n * m > 250000) {
    return [
      { type: 'removed', text: oldStr },
      { type: 'added', text: newStr },
    ];
  }

  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (oldWords[i - 1] === newWords[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result: WordDiffItem[] = [];
  let i = n;
  let j = m;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
      result.unshift({ type: 'same', text: oldWords[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'added', text: newWords[j - 1] });
      j--;
    } else if (i > 0) {
      result.unshift({ type: 'removed', text: oldWords[i - 1] });
      i--;
    }
  }

  return result;
}

export const PromptDiffViewer: React.FC<PromptDiffViewerProps> = ({ testCase, onClose }) => {
  const [diffMode, setDiffMode] = useState<DiffMode>('split');
  const [copied, setCopied] = useState(false);

  const inputPrompt = testCase.input || (testCase as any).inputPrompt || '(No input prompt recorded)';
  const baselineOutput = testCase.baselineOutput || '(No baseline output recorded)';
  const candidateOutput = testCase.candidateOutput || '(No candidate output recorded)';

  const diffItems = useMemo(
    () => computeWordDiff(testCase.baselineOutput || '', testCase.candidateOutput || ''),
    [testCase.baselineOutput, testCase.candidateOutput]
  );

  const bLat = testCase.baselineLatencyMs;
  const cLat = testCase.candidateLatencyMs;
  const latencyDelta = bLat !== null && cLat !== null ? cLat - bLat : null;

  const bTokens = testCase.baselineUsage?.totalTokens ?? (testCase as any).baselineTokens ?? null;
  const cTokens = testCase.candidateUsage?.totalTokens ?? (testCase as any).candidateTokens ?? null;
  const tokenDelta = bTokens !== null && cTokens !== null ? cTokens - bTokens : null;

  const handleCopySummary = () => {
    const summary = `=== RELIQ TEST CASE DIFF: ${testCase.testCaseName} ===
Case ID: ${testCase.testCaseId}
Category: ${testCase.category}
Status: ${testCase.isRegression ? 'REGRESSION' : testCase.passed ? 'PASSED' : 'FAILED'}
Baseline Latency: ${bLat !== null ? `${bLat}ms` : '—'} | Candidate: ${cLat !== null ? `${cLat}ms` : '—'} (${latencyDelta !== null ? `${latencyDelta >= 0 ? '+' : ''}${latencyDelta}ms` : '—'})
Baseline Tokens: ${bTokens ?? '—'} | Candidate: ${cTokens ?? '—'} (${tokenDelta !== null ? `${tokenDelta >= 0 ? '+' : ''}${tokenDelta}` : '—'})

[INPUT PROMPT]
${inputPrompt}

[BASELINE OUTPUT]
${baselineOutput}

[CANDIDATE OUTPUT]
${candidateOutput}

[FAILURE REASON]
${testCase.failureReason || 'N/A'}`;

    navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      style={{
        background: '#0D1117',
        border: '1px solid rgba(255, 255, 255, 0.15)',
        borderRadius: '12px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 25px 60px rgba(0, 0, 0, 0.9)',
      }}
    >
      {/* Top Header Bar */}
      <div
        style={{
          background: '#161B22',
          padding: '1rem 1.4rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <span
            style={{
              padding: '0.25rem 0.65rem',
              borderRadius: '4px',
              fontSize: '0.75rem',
              fontWeight: 800,
              letterSpacing: '0.05em',
              background: testCase.isRegression
                ? 'rgba(255, 51, 17, 0.2)'
                : testCase.passed
                ? 'rgba(46, 204, 113, 0.15)'
                : 'rgba(243, 156, 18, 0.15)',
              color: testCase.isRegression
                ? '#FF4422'
                : testCase.passed
                ? '#2ECC71'
                : '#F39C12',
              border: `1px solid ${
                testCase.isRegression
                  ? 'rgba(255, 51, 17, 0.4)'
                  : testCase.passed
                  ? 'rgba(46, 204, 113, 0.3)'
                  : 'rgba(243, 156, 18, 0.3)'
              }`,
            }}
          >
            {testCase.isRegression ? '⚠ REGRESSION' : testCase.passed ? '✓ PASSED' : '● FAILED'}
          </span>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontFamily: 'monospace', color: '#4DA6FF', fontWeight: 700, fontSize: '0.85rem' }}>
                {testCase.testCaseId}
              </span>
              <span style={{ fontSize: '0.75rem', color: '#8899AA', background: 'rgba(255, 255, 255, 0.06)', padding: '0.15rem 0.45rem', borderRadius: '4px' }}>
                {testCase.category}
              </span>
            </div>
            <h3 style={{ margin: '0.2rem 0 0 0', fontSize: '1.05rem', color: '#FFFFFF', fontWeight: 700 }}>
              {testCase.testCaseName}
            </h3>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          {/* Mode Switcher */}
          <div
            style={{
              display: 'flex',
              background: 'rgba(0, 0, 0, 0.4)',
              borderRadius: '6px',
              padding: '2px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <button
              onClick={() => setDiffMode('split')}
              style={{
                background: diffMode === 'split' ? 'rgba(255, 255, 255, 0.14)' : 'transparent',
                color: diffMode === 'split' ? '#FFFFFF' : '#8899AA',
                border: 'none',
                padding: '0.35rem 0.75rem',
                borderRadius: '4px',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Side-by-Side
            </button>
            <button
              onClick={() => setDiffMode('unified')}
              style={{
                background: diffMode === 'unified' ? 'rgba(255, 255, 255, 0.14)' : 'transparent',
                color: diffMode === 'unified' ? '#FFFFFF' : '#8899AA',
                border: 'none',
                padding: '0.35rem 0.75rem',
                borderRadius: '4px',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Unified Diff
            </button>
          </div>

          <button
            onClick={handleCopySummary}
            style={{
              background: copied ? 'rgba(46, 204, 113, 0.2)' : 'rgba(255, 255, 255, 0.06)',
              color: copied ? '#2ECC71' : '#E6EDF3',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              padding: '0.4rem 0.8rem',
              borderRadius: '6px',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {copied ? '✓ Copied' : '📋 Copy Summary'}
          </button>

          {onClose && (
            <button
              onClick={onClose}
              style={{
                background: 'transparent',
                color: '#8899AA',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                fontSize: '1rem',
                cursor: 'pointer',
                width: '30px',
                height: '30px',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
              }}
              title="Close Diff Viewer (Esc)"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Telemetry Strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '1rem',
          padding: '0.8rem 1.4rem',
          background: 'rgba(0, 0, 0, 0.25)',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          fontSize: '0.82rem',
        }}
      >
        <div>
          <span style={{ color: '#8899AA' }}>Latency Delta: </span>
          {latencyDelta !== null ? (
            <span style={{ fontWeight: 700, color: latencyDelta <= 0 ? '#2ECC71' : '#FF4422' }}>
              {latencyDelta <= 0 ? `${latencyDelta} ms (Faster)` : `+${latencyDelta} ms (Slower)`}
            </span>
          ) : (
            <span style={{ color: '#8899AA' }}>—</span>
          )}
        </div>
        <div>
          <span style={{ color: '#8899AA' }}>Tokens: </span>
          <span style={{ fontWeight: 700, color: '#FFFFFF' }}>
            {cTokens ?? '—'} {tokenDelta !== null && `(${tokenDelta > 0 ? '+' : ''}${tokenDelta})`}
          </span>
        </div>
        <div>
          <span style={{ color: '#8899AA' }}>Evaluator Checks: </span>
          <span style={{ fontWeight: 600, color: '#C084FC' }}>
            {testCase.evaluatorScores?.length ? `${testCase.evaluatorScores.length} Evaluators` : 'Standard'}
          </span>
        </div>
        {testCase.failureReason && (
          <div style={{ gridColumn: '1 / -1', color: '#FF7B72', fontSize: '0.8rem', background: 'rgba(255, 68, 34, 0.08)', padding: '0.5rem 0.8rem', borderRadius: '6px', border: '1px solid rgba(255, 68, 34, 0.2)' }}>
            <strong>Failure Diagnosis: </strong> {testCase.failureReason}
          </div>
        )}
      </div>

      {/* Input Prompt Section */}
      <div style={{ padding: '0.9rem 1.4rem', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
        <div style={{ fontSize: '0.72rem', letterSpacing: '0.1em', color: '#8899AA', textTransform: 'uppercase', marginBottom: '0.4rem', fontWeight: 700 }}>
          Input Test Prompt
        </div>
        <div
          style={{
            background: '#090D12',
            padding: '0.8rem 1rem',
            borderRadius: '6px',
            fontSize: '0.85rem',
            fontFamily: 'Consolas, Monaco, "Courier New", monospace',
            color: '#E6EDF3',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            whiteSpace: 'pre-wrap',
            maxHeight: '130px',
            overflowY: 'auto',
          }}
        >
          {inputPrompt}
        </div>
      </div>

      {/* Diff Content View */}
      <div style={{ padding: '1.2rem 1.4rem', overflowY: 'auto', maxHeight: '480px' }}>
        {diffMode === 'split' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem' }}>
            {/* Baseline Pane */}
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.5rem',
                }}
              >
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4DA6FF', letterSpacing: '0.05em' }}>
                  BASELINE OUTPUT ({bLat !== null ? `${bLat}ms` : '—'})
                </span>
                <span style={{ fontSize: '0.75rem', color: '#8899AA' }}>
                  {bTokens ? `${bTokens} tok` : ''}
                </span>
              </div>
              <div
                style={{
                  background: '#090D12',
                  padding: '1rem',
                  borderRadius: '8px',
                  fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                  fontSize: '0.84rem',
                  lineHeight: 1.6,
                  color: '#C9D1D9',
                  border: '1px solid rgba(255, 255, 255, 0.07)',
                  whiteSpace: 'pre-wrap',
                  minHeight: '160px',
                }}
              >
                {baselineOutput}
              </div>
            </div>

            {/* Candidate Pane with highlight */}
            <div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '0.5rem',
                }}
              >
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent, #FF6B35)', letterSpacing: '0.05em' }}>
                  CANDIDATE OUTPUT ({cLat !== null ? `${cLat}ms` : '—'})
                </span>
                <span style={{ fontSize: '0.75rem', color: '#8899AA' }}>
                  {cTokens ? `${cTokens} tok` : ''}
                </span>
              </div>
              <div
                style={{
                  background: '#090D12',
                  padding: '1rem',
                  borderRadius: '8px',
                  fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                  fontSize: '0.84rem',
                  lineHeight: 1.6,
                  border: '1px solid rgba(255, 255, 255, 0.07)',
                  whiteSpace: 'pre-wrap',
                  minHeight: '160px',
                }}
              >
                {diffItems.map((item, idx) => {
                  if (item.type === 'added') {
                    return (
                      <span
                        key={idx}
                        style={{
                          background: 'rgba(46, 204, 113, 0.25)',
                          color: '#58FF9C',
                          padding: '1px 3px',
                          borderRadius: '2px',
                        }}
                      >
                        {item.text}
                      </span>
                    );
                  }
                  if (item.type === 'removed') {
                    return null;
                  }
                  return (
                    <span key={idx} style={{ color: '#C9D1D9' }}>
                      {item.text}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          /* Unified Inline View */
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#8899AA', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
              UNIFIED TOKEN DIFF (+ CANDIDATE / - BASELINE)
            </div>
            <div
              style={{
                background: '#090D12',
                padding: '1.2rem',
                borderRadius: '8px',
                fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                fontSize: '0.84rem',
                lineHeight: 1.7,
                border: '1px solid rgba(255, 255, 255, 0.08)',
                whiteSpace: 'pre-wrap',
              }}
            >
              {diffItems.map((item, idx) => {
                if (item.type === 'added') {
                  return (
                    <span
                      key={idx}
                      style={{
                        background: 'rgba(46, 204, 113, 0.25)',
                        color: '#58FF9C',
                        padding: '1px 3px',
                        borderRadius: '2px',
                        fontWeight: 600,
                      }}
                    >
                      {item.text}
                    </span>
                  );
                }
                if (item.type === 'removed') {
                  return (
                    <span
                      key={idx}
                      style={{
                        background: 'rgba(255, 51, 17, 0.22)',
                        color: '#FF6B6B',
                        padding: '1px 3px',
                        borderRadius: '2px',
                        textDecoration: 'line-through',
                      }}
                    >
                      {item.text}
                    </span>
                  );
                }
                return (
                  <span key={idx} style={{ color: '#8B949E' }}>
                    {item.text}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
