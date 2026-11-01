/* ============================================================
   RELIQ — Settings & Policy Configuration View
   
   Allows configuring regression thresholds, reviewing model providers,
   and resetting demo data.
   ============================================================ */

import React, { useState, useEffect } from 'react';
import { Project, RegressionSettings } from '../../domain/types';
import { providerRegistry } from '../../providers/registry';
import { apiRepository } from '../../services/apiRepository';

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
    apiRepository.getStoreRawOutputs()
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

  useEffect(() => {
    setMinAccuracy(project.regressionSettings.minAccuracyPercent);
    setMaxDegradation(project.regressionSettings.maxAccuracyDegradationPercent);
    setMaxLatency(project.regressionSettings.maxLatencyIncreasePercent);
    setMaxFailure(project.regressionSettings.maxFailureRatePercent);
    setMinCoverage(project.regressionSettings.minEvaluationCoveragePercent ?? 80.0);
  }, [project]);

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '1040px', margin: '0 auto' }}>
      {/* Header */}
      <div>
        <div style={{ fontSize: '0.68rem', fontFamily: 'monospace', letterSpacing: '0.12em', color: '#0000FF', fontWeight: 700, textTransform: 'uppercase' }}>
          CONFIGURATION // POLICIES & STORAGE
        </div>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#F2F2F2', margin: '0.2rem 0 0.35rem 0', letterSpacing: '-0.02em' }}>
          Regression Policies & Settings
        </h1>
        <p style={{ color: '#858585', fontSize: '0.82rem', margin: 0, maxWidth: '640px', lineHeight: 1.5 }}>
          Define automated pass/block boundary criteria for AI releases and manage provider harnesses. All settings persist in Supabase PostgreSQL.
        </p>
      </div>

      {/* ── 1. Regression Thresholds Form ── */}
      <div
        style={{
          background: '#151515',
          border: '1px solid #292929',
          borderRadius: '2px',
          padding: '1.5rem',
        }}
      >
        <h3 style={{ margin: '0 0 1rem 0', color: '#F2F2F2', fontSize: '1.05rem', fontWeight: 700, fontFamily: 'monospace' }}>
          Automated Release Gate Thresholds
        </h3>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontFamily: 'monospace', color: '#F2F2F2', fontWeight: 600, marginBottom: '0.35rem' }}>
                MINIMUM ACCURACY GATE (%)
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
                  padding: '0.55rem 0.75rem',
                  background: '#111111',
                  border: '1px solid #292929',
                  borderRadius: '2px',
                  color: '#F2F2F2',
                  fontSize: '0.82rem',
                  fontFamily: 'monospace',
                  boxSizing: 'border-box',
                }}
              />
              <span style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: '#555555' }}>
                Release is blocked if candidate accuracy drops below this value.
              </span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontFamily: 'monospace', color: '#F2F2F2', fontWeight: 600, marginBottom: '0.35rem' }}>
                MAX ALLOWED ACCURACY DEGRADATION (PTS)
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
                  padding: '0.55rem 0.75rem',
                  background: '#111111',
                  border: '1px solid #292929',
                  borderRadius: '2px',
                  color: '#F2F2F2',
                  fontSize: '0.82rem',
                  fontFamily: 'monospace',
                  boxSizing: 'border-box',
                }}
              />
              <span style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: '#555555' }}>
                Maximum acceptable percentage points drop compared to baseline standard.
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontFamily: 'monospace', color: '#F2F2F2', fontWeight: 600, marginBottom: '0.35rem' }}>
                MAX ALLOWABLE LATENCY INCREASE (%)
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
                  padding: '0.55rem 0.75rem',
                  background: '#111111',
                  border: '1px solid #292929',
                  borderRadius: '2px',
                  color: '#F2F2F2',
                  fontSize: '0.82rem',
                  fontFamily: 'monospace',
                  boxSizing: 'border-box',
                }}
              />
              <span style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: '#555555' }}>
                Blocks deployment if candidate average latency spikes beyond this percentage.
              </span>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontFamily: 'monospace', color: '#F2F2F2', fontWeight: 600, marginBottom: '0.35rem' }}>
                MAX ALLOWED SCENARIO FAILURE RATE (%)
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
                  padding: '0.55rem 0.75rem',
                  background: '#111111',
                  border: '1px solid #292929',
                  borderRadius: '2px',
                  color: '#F2F2F2',
                  fontSize: '0.82rem',
                  fontFamily: 'monospace',
                  boxSizing: 'border-box',
                }}
              />
              <span style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: '#555555' }}>
                Overall tolerance limit for total test scenario failures.
              </span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontFamily: 'monospace', color: '#F2F2F2', fontWeight: 600, marginBottom: '0.35rem' }}>
                MINIMUM REQUIRED EVALUATION COVERAGE (%)
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
                  padding: '0.55rem 0.75rem',
                  background: '#111111',
                  border: '1px solid #292929',
                  borderRadius: '2px',
                  color: '#F2F2F2',
                  fontSize: '0.82rem',
                  fontFamily: 'monospace',
                  boxSizing: 'border-box',
                }}
              />
              <span style={{ fontSize: '0.68rem', fontFamily: 'monospace', color: '#555555' }}>
                Releases are flagged as INSUFFICIENT_EVIDENCE if completed case coverage drops below this threshold.
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', padding: '0.85rem', background: '#111111', borderRadius: '2px', border: '1px solid #292929' }}>
              <span style={{ fontSize: '0.74rem', fontFamily: 'monospace', color: '#858585', lineHeight: 1.4 }}>
                ℹ Benchmark runs require sufficient coverage and sample size (N ≥ 100) to certify full production release without caveats.
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.6rem' }}>
            {savedSuccess ? (
              <span style={{ color: '#22C55E', fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: 600 }}>
                ✓ Threshold policies updated successfully!
              </span>
            ) : <span />}

            <button
              type="submit"
              style={{
                background: '#0000FF',
                color: '#FFFFFF',
                border: 'none',
                padding: '0.55rem 1.4rem',
                borderRadius: '2px',
                fontSize: '0.78rem',
                fontFamily: 'monospace',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              SAVE POLICIES
            </button>
          </div>
        </form>
      </div>

      {/* ── 2. Provider Harness Layer ── */}
      <div
        style={{
          background: '#14181F',
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
            <span style={{ fontSize: '0.72rem', color: '#5B82A6', background: 'rgba(91, 130, 166, 0.12)', padding: '0.2rem 0.6rem', borderRadius: '4px' }}>
              {providerRegistry.listProviders().length} Registered Adapters
            </span>
          </div>
          <p style={{ color: '#8899AA', fontSize: '0.85rem', lineHeight: 1.5, margin: 0 }}>
            RELIQ executes evaluations via normalized <code style={{ color: '#5B82A6' }}>ModelProvider</code> adapters. All model telemetries (input tokens, output tokens, reasoning tokens, cached tokens, latency, cost) conform to the <code style={{ color: '#4E9B6F' }}>UsageRecord</code> specification.
          </p>
        </div>

        {/* Security Alert */}
        <div
          style={{
            background: 'rgba(91, 130, 166, 0.08)',
            border: '1px solid rgba(91, 130, 166, 0.25)',
            borderRadius: '8px',
            padding: '0.9rem 1.2rem',
            fontSize: '0.82rem',
            color: '#B8CDE0',
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
                background: '#101419',
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
                    background: prov.providerType === 'demo' ? 'rgba(78, 155, 111, 0.12)' : 'rgba(91, 130, 166, 0.12)',
                    color: prov.providerType === 'demo' ? '#4E9B6F' : '#5B82A6',
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
                  <span style={{ color: '#8B7EC8', background: 'rgba(139, 126, 200, 0.12)', padding: '0.15rem 0.45rem', borderRadius: '3px' }}>
                    🧠 Thinking Tokens Telemetry
                  </span>
                )}
                {prov.supportsPromptCaching && (
                  <span style={{ color: '#4E9B6F', background: 'rgba(78, 155, 111, 0.12)', padding: '0.15rem 0.45rem', borderRadius: '3px' }}>
                    ⚡ Prompt Caching Discounts
                  </span>
                )}
                {prov.supportsTools && (
                  <span style={{ color: '#C68B45', background: 'rgba(198, 139, 69, 0.12)', padding: '0.15rem 0.45rem', borderRadius: '3px' }}>
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
          background: '#14181F',
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

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', background: '#101419', padding: '0.6rem 1rem', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <input
              type="checkbox"
              checked={storeRawOutputs}
              onChange={(e) => {
                const nextVal = e.target.checked;
                setStoreRawOutputs(nextVal);
                apiRepository.setStoreRawOutputs(nextVal);
              }}
              style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: 'var(--accent, #C86D51)' }}
            />
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: storeRawOutputs ? '#4E9B6F' : '#C68B45' }}>
              {storeRawOutputs ? 'Store Raw Outputs (Enabled)' : 'Redact Raw Outputs (Strict Privacy)'}
            </span>
          </label>
        </div>
      </div>

      {/* ── 3. Data Management & Reset ── */}
      <div
        style={{
          background: '#14181F',
          border: '1px solid rgba(192, 92, 84, 0.25)',
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
            border: '1px solid rgba(192, 92, 84, 0.35)',
            color: '#C05C54',
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
