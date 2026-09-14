/* ============================================================
   RELIQ — Settings & Policy Configuration View
   
   Allows configuring regression thresholds, reviewing model providers,
   and resetting demo data.
   ============================================================ */

import React, { useState } from 'react';
import { Project, RegressionSettings } from '../../domain/types';
import { providerRegistry } from '../../providers/registry';
import { localRepository } from '../../services/localRepository';

interface SettingsViewProps {
  project: Project;
  onSaveSettings: (settings: RegressionSettings) => Promise<void>;
  onResetSeedData: () => Promise<void>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  project,
  onSaveSettings,
  onResetSeedData,
}) => {
  const [storeRawOutputs, setStoreRawOutputs] = useState<boolean>(
    localRepository.getStoreRawOutputs()
  );
  const [minAccuracy, setMinAccuracy] = useState(
    project.regressionSettings.minAccuracyPercent
  );
  const [maxDegradation, setMaxDegradation] = useState(
    project.regressionSettings.maxAccuracyDegradationPercent
  );
  const [maxLatency, setMaxLatency] = useState(
    project.regressionSettings.maxLatencyIncreasePercent
  );
  const [maxFailure, setMaxFailure] = useState(
    project.regressionSettings.maxFailureRatePercent
  );
  const [minCoverage, setMinCoverage] = useState(
    project.regressionSettings.minEvaluationCoveragePercent ?? 80.0
  );

  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSaveSettings({
      minAccuracyPercent: Number(minAccuracy),
      maxAccuracyDegradationPercent: Number(maxDegradation),
      maxLatencyIncreasePercent: Number(maxLatency),
      maxFailureRatePercent: Number(maxFailure),
      minEvaluationCoveragePercent: Number(minCoverage),
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', maxWidth: '880px' }}>
      {/* Header */}
      <div>
        <div style={{ fontSize: '0.75rem', letterSpacing: '0.2em', color: 'var(--accent, #FF6B35)', fontWeight: 600, textTransform: 'uppercase' }}>
          CONFIGURATION // RELIABILITY POLICIES
        </div>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#FFFFFF', margin: '0.3rem 0 0.4rem 0' }}>
          Regression Policies & Settings
        </h1>
        <p style={{ color: '#8899AA', fontSize: '0.9rem', margin: 0 }}>
          Define automated pass/block boundary criteria for AI releases and manage provider harnesses.
        </p>
      </div>

      {/* ── 1. Regression Thresholds Form ── */}
      <div
        style={{
          background: '#161B22',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '12px',
          padding: '2rem',
        }}
      >
        <h3 style={{ margin: '0 0 1.2rem 0', color: '#FFFFFF', fontSize: '1.15rem' }}>
          Automated Release Gate Thresholds
        </h3>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', color: '#CCCCCC', fontWeight: 600, marginBottom: '0.4rem' }}>
                Minimum Absolute Accuracy (%)
              </label>
              <input
                type="number"
                step="0.1"
                min="50"
                max="100"
                value={minAccuracy}
                onChange={(e) => setMinAccuracy(Number(e.target.value))}
                style={{
                  width: '100%',
                  padding: '0.65rem 0.8rem',
                  background: '#0D1117',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '6px',
                  color: '#FFFFFF',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box',
                }}
              />
              <span style={{ fontSize: '0.72rem', color: '#778899' }}>
                Release is blocked if candidate accuracy drops below this value.
              </span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', color: '#CCCCCC', fontWeight: 600, marginBottom: '0.4rem' }}>
                Max Allowed Accuracy Degradation (pts)
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="25"
                value={maxDegradation}
                onChange={(e) => setMaxDegradation(Number(e.target.value))}
                style={{
                  width: '100%',
                  padding: '0.65rem 0.8rem',
                  background: '#0D1117',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '6px',
                  color: '#FFFFFF',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box',
                }}
              />
              <span style={{ fontSize: '0.72rem', color: '#778899' }}>
                Maximum acceptable percentage points drop compared to baseline standard.
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', color: '#CCCCCC', fontWeight: 600, marginBottom: '0.4rem' }}>
                Max Allowable Latency Increase (%)
              </label>
              <input
                type="number"
                step="1"
                min="0"
                max="100"
                value={maxLatency}
                onChange={(e) => setMaxLatency(Number(e.target.value))}
                style={{
                  width: '100%',
                  padding: '0.65rem 0.8rem',
                  background: '#0D1117',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '6px',
                  color: '#FFFFFF',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box',
                }}
              />
              <span style={{ fontSize: '0.72rem', color: '#778899' }}>
                Blocks deployment if candidate average latency spikes beyond this percentage.
              </span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', color: '#CCCCCC', fontWeight: 600, marginBottom: '0.4rem' }}>
                Max Allowed Scenario Failure Rate (%)
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                max="50"
                value={maxFailure}
                onChange={(e) => setMaxFailure(Number(e.target.value))}
                style={{
                  width: '100%',
                  padding: '0.65rem 0.8rem',
                  background: '#0D1117',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '6px',
                  color: '#FFFFFF',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box',
                }}
              />
              <span style={{ fontSize: '0.72rem', color: '#778899' }}>
                Overall tolerance limit for total test scenario failures.
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.82rem', color: '#CCCCCC', fontWeight: 600, marginBottom: '0.4rem' }}>
                Minimum Required Evaluation Coverage (%)
              </label>
              <input
                type="number"
                step="1"
                min="10"
                max="100"
                value={minCoverage}
                onChange={(e) => setMinCoverage(Number(e.target.value))}
                style={{
                  width: '100%',
                  padding: '0.65rem 0.8rem',
                  background: '#0D1117',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '6px',
                  color: '#FFFFFF',
                  fontSize: '0.9rem',
                  boxSizing: 'border-box',
                }}
              />
              <span style={{ fontSize: '0.72rem', color: '#778899' }}>
                Releases are flagged as INSUFFICIENT_EVIDENCE if completed case coverage drops below this threshold.
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', padding: '1rem', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
              <span style={{ fontSize: '0.78rem', color: '#8899AA', lineHeight: 1.4 }}>
                ℹ Benchmark runs require sufficient coverage and sample size (N ≥ 100) to certify full production release without caveats.
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.8rem' }}>
            {savedSuccess ? (
              <span style={{ color: '#2ECC71', fontSize: '0.85rem', fontWeight: 600 }}>
                ✓ Threshold policies updated successfully!
              </span>
            ) : <span />}

            <button
              type="submit"
              style={{
                background: 'var(--accent, #FF6B35)',
                color: '#000000',
                border: 'none',
                padding: '0.7rem 1.8rem',
                borderRadius: '6px',
                fontSize: '0.85rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Save Policy Rules
            </button>
          </div>
        </form>
      </div>

      {/* ── 2. Provider Harness Layer ── */}
      <div
        style={{
          background: '#161B22',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '12px',
          padding: '2rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.4rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
            <h3 style={{ margin: 0, color: '#FFFFFF', fontSize: '1.15rem' }}>
              Normalized AI Provider Architecture
            </h3>
            <span style={{ fontSize: '0.72rem', color: '#4DA6FF', background: 'rgba(77, 166, 255, 0.12)', padding: '0.2rem 0.6rem', borderRadius: '4px' }}>
              {providerRegistry.listProviders().length} Registered Adapters
            </span>
          </div>
          <p style={{ color: '#8899AA', fontSize: '0.85rem', lineHeight: 1.5, margin: 0 }}>
            RELIQ executes evaluations via normalized <code style={{ color: '#4DA6FF' }}>ModelProvider</code> adapters. All model telemetries (input tokens, output tokens, reasoning tokens, cached tokens, latency, cost) conform to the <code style={{ color: '#2ECC71' }}>UsageRecord</code> specification.
          </p>
        </div>

        {/* Security Alert */}
        <div
          style={{
            background: 'rgba(77, 166, 255, 0.08)',
            border: '1px solid rgba(77, 166, 255, 0.25)',
            borderRadius: '8px',
            padding: '0.9rem 1.2rem',
            fontSize: '0.82rem',
            color: '#B0D5FF',
            lineHeight: 1.45,
          }}
        >
          🔒 <strong>Zero-Client Secrets Guarantee:</strong> API tokens (<code style={{ color: '#FFFFFF' }}>GEMINI_API_KEY</code>, <code style={{ color: '#FFFFFF' }}>OPENAI_API_KEY</code>, <code style={{ color: '#FFFFFF' }}>ANTHROPIC_API_KEY</code>) are never bundled or exposed in client-side code. Production requests route through isolated backend proxy endpoints (<code style={{ color: '#FFFFFF' }}>/api/providers/:provider</code>).
        </div>

        {/* Live Registered Providers */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          {providerRegistry.listProviders().map((prov) => (
            <div
              key={prov.id}
              style={{
                background: '#0D1117',
                padding: '1.1rem 1.3rem',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.07)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
                  <span style={{ fontWeight: 700, color: '#FFFFFF', fontSize: '0.9rem' }}>
                    {prov.name}
                  </span>
                  <span style={{ fontSize: '0.7rem', color: '#888888', fontFamily: 'monospace' }}>
                    [{prov.id}]
                  </span>
                </div>
                <span
                  style={{
                    fontSize: '0.7rem',
                    padding: '0.2rem 0.55rem',
                    borderRadius: '4px',
                    background: prov.providerType === 'demo' ? 'rgba(46, 204, 113, 0.15)' : 'rgba(77, 166, 255, 0.15)',
                    color: prov.providerType === 'demo' ? '#2ECC71' : '#4DA6FF',
                    fontWeight: 700,
                  }}
                >
                  {prov.providerType === 'demo' ? 'ACTIVE // DETERMINISTIC (ZERO COST)' : 'SERVER-SIDE PROXY'}
                </span>
              </div>

              {/* Supported Models */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
                <span style={{ fontSize: '0.72rem', color: '#778899', fontWeight: 600 }}>Supported Models:</span>
                {prov.supportedModels.map((m) => (
                  <span
                    key={m}
                    style={{
                      fontSize: '0.68rem',
                      fontFamily: 'monospace',
                      background: 'rgba(255, 255, 255, 0.05)',
                      color: '#CCCCCC',
                      padding: '0.15rem 0.45rem',
                      borderRadius: '4px',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                    }}
                  >
                    {m}
                  </span>
                ))}
              </div>

              {/* Capabilities */}
              <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', fontSize: '0.7rem' }}>
                {prov.supportsReasoningTokens && (
                  <span style={{ color: '#C084FC', background: 'rgba(192, 132, 252, 0.1)', padding: '0.15rem 0.45rem', borderRadius: '3px' }}>
                    🧠 Thinking Tokens Telemetry
                  </span>
                )}
                {prov.supportsPromptCaching && (
                  <span style={{ color: '#2ECC71', background: 'rgba(46, 204, 113, 0.1)', padding: '0.15rem 0.45rem', borderRadius: '3px' }}>
                    ⚡ Prompt Caching Discounts
                  </span>
                )}
                {prov.supportsTools && (
                  <span style={{ color: '#FFAA44', background: 'rgba(255, 170, 68, 0.1)', padding: '0.15rem 0.45rem', borderRadius: '3px' }}>
                    🛠 Tool Calling Schema Validation
                  </span>
                )}
                {prov.proxyEndpoint && (
                  <span style={{ color: '#8899AA', background: 'rgba(255, 255, 255, 0.05)', padding: '0.15rem 0.45rem', borderRadius: '3px', fontFamily: 'monospace' }}>
                    Endpoint: {prov.proxyEndpoint}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 2.5 Data Privacy & Raw Output Retention ── */}
      <div
        style={{
          background: '#161B22',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '12px',
          padding: '2rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1.2rem' }}>
          <div>
            <h3 style={{ margin: '0 0 0.4rem 0', color: '#FFFFFF', fontSize: '1.15rem' }}>
              Data Privacy & Raw Output Retention
            </h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: '#8899AA', maxWidth: '550px', lineHeight: 1.5 }}>
              Control whether full model output strings and raw payload responses are persisted to local storage. When disabled, RELIQ records evaluation scores, latency, and token telemetry while stripping prompt text and completion bodies to adhere to zero-retention data privacy standards.
            </p>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', background: '#0D1117', padding: '0.6rem 1rem', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <input
              type="checkbox"
              checked={storeRawOutputs}
              onChange={(e) => {
                const nextVal = e.target.checked;
                setStoreRawOutputs(nextVal);
                localRepository.setStoreRawOutputs(nextVal);
              }}
              style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: 'var(--accent, #FF6B35)' }}
            />
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: storeRawOutputs ? '#2ECC71' : '#FFAA44' }}>
              {storeRawOutputs ? 'Store Raw Outputs (Enabled)' : 'Redact Raw Outputs (Strict Privacy)'}
            </span>
          </label>
        </div>
      </div>

      {/* ── 3. Data Management & Reset ── */}
      <div
        style={{
          background: '#161B22',
          border: '1px solid rgba(255, 34, 0, 0.2)',
          borderRadius: '12px',
          padding: '2rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <h3 style={{ margin: '0 0 0.3rem 0', color: '#FFFFFF', fontSize: '1.1rem' }}>
            Reset Golden Demo Data
          </h3>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#888888' }}>
            Restore the pre-calibrated Checkout Agent project, golden test cases, and evaluation run.
          </p>
        </div>

        <button
          onClick={async () => {
            if (confirm('Reset all project data to golden demo state?')) {
              await onResetSeedData();
              alert('Demo data restored successfully.');
            }
          }}
          style={{
            background: 'transparent',
            border: '1px solid rgba(255, 34, 0, 0.4)',
            color: '#FF4422',
            padding: '0.65rem 1.2rem',
            borderRadius: '6px',
            fontSize: '0.82rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Reset to Demo State
        </button>
      </div>
    </div>
  );
};
