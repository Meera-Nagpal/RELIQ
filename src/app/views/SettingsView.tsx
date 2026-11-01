/* ============================================================
   RELIQ — Settings & Policy Configuration View
   
   Allows configuring regression thresholds, reviewing model providers,
   and resetting demo data.
   ============================================================ */

import React, { useState, useEffect } from 'react';
import { Project, RegressionSettings } from '../../domain/types';
import { providerRegistry, ServerProviderStatus } from '../../providers/registry';
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

  // String state for input fields so typing, backspacing and clearing never injects leading zeros
  const [minAccuracy, setMinAccuracy] = useState<string>(
    String(project.regressionSettings.minAccuracyPercent)
  );
  const [maxDegradation, setMaxDegradation] = useState<string>(
    String(project.regressionSettings.maxAccuracyDegradationPercent)
  );
  const [maxLatency, setMaxLatency] = useState<string>(
    String(project.regressionSettings.maxLatencyIncreasePercent)
  );
  const [maxFailure, setMaxFailure] = useState<string>(
    String(project.regressionSettings.maxFailureRatePercent)
  );
  const [minCoverage, setMinCoverage] = useState<string>(
    String(project.regressionSettings.minEvaluationCoveragePercent ?? 80.0)
  );

  // Live provider status
  const [serverStatus, setServerStatus] = useState<ServerProviderStatus>({
    gemini: false,
    openai: false,
    anthropic: false,
    groq: false,
    cerebras: false,
  });

  useEffect(() => {
    providerRegistry.checkServerStatus().then(setServerStatus);
  }, []);

  useEffect(() => {
    setMinAccuracy(String(project.regressionSettings.minAccuracyPercent));
    setMaxDegradation(String(project.regressionSettings.maxAccuracyDegradationPercent));
    setMaxLatency(String(project.regressionSettings.maxLatencyIncreasePercent));
    setMaxFailure(String(project.regressionSettings.maxFailureRatePercent));
    setMinCoverage(String(project.regressionSettings.minEvaluationCoveragePercent ?? 80.0));
  }, [project]);

  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  /**
   * Cleans numeric string input:
   * - Allows typing freely, clearing to empty string
   * - Strips leading zeros when additional digits are typed (e.g. "0666" -> "666", but "0." is preserved)
   */
  const handleNumericChange = (
    setter: React.Dispatch<React.SetStateAction<string>>,
    raw: string
  ) => {
    if (raw === '') {
      setter('');
      return;
    }
    // Remove unwanted leading zeroes (e.g. "06" -> "6", "0666" -> "666")
    let cleaned = raw;
    if (/^0\d/.test(cleaned)) {
      cleaned = cleaned.replace(/^0+/, '');
    }
    setter(cleaned);
  };

  /**
   * On blur: clamps values to acceptable bounds and avoids empty fields
   */
  const handleBlur = (
    value: string,
    setter: React.Dispatch<React.SetStateAction<string>>,
    fallback: number,
    min: number,
    max: number
  ) => {
    if (value === '' || isNaN(Number(value))) {
      setter(String(fallback));
      return;
    }
    const num = parseFloat(value);
    const clamped = Math.min(max, Math.max(min, num));
    setter(String(clamped));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSaving(true);
      setSaveError(null);

      // Parse and clamp values safely
      const parsedMinAcc = parseFloat(minAccuracy);
      const parsedMaxDeg = parseFloat(maxDegradation);
      const parsedMaxLat = parseFloat(maxLatency);
      const parsedMaxFail = parseFloat(maxFailure);
      const parsedMinCov = parseFloat(minCoverage);

      const validMinAcc = isNaN(parsedMinAcc) ? 95 : Math.min(100, Math.max(0, parsedMinAcc));
      const validMaxDeg = isNaN(parsedMaxDeg) ? 2 : Math.min(100, Math.max(0, parsedMaxDeg));
      const validMaxLat = isNaN(parsedMaxLat) ? 20 : Math.min(1000, Math.max(0, parsedMaxLat));
      const validMaxFail = isNaN(parsedMaxFail) ? 5 : Math.min(100, Math.max(0, parsedMaxFail));
      const validMinCov = isNaN(parsedMinCov) ? 80 : Math.min(100, Math.max(0, parsedMinCov));

      // Synchronize input fields with clean clamped values
      setMinAccuracy(String(validMinAcc));
      setMaxDegradation(String(validMaxDeg));
      setMaxLatency(String(validMaxLat));
      setMaxFailure(String(validMaxFail));
      setMinCoverage(String(validMinCov));

      await onSaveSettings({
        minAccuracyPercent: validMinAcc,
        maxAccuracyDegradationPercent: validMaxDeg,
        maxLatencyIncreasePercent: validMaxLat,
        maxFailureRatePercent: validMaxFail,
        minEvaluationCoveragePercent: validMinCov,
      });

      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err: any) {
      setSaveError(err.message || 'Failed to persist threshold policies to Supabase');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '1040px', margin: '0 auto' }}>
      {/* Header */}
      <div>
        <div style={{ fontSize: '0.68rem', fontFamily: 'monospace', letterSpacing: '0.12em', color: '#60A5FA', fontWeight: 700, textTransform: 'uppercase' }}>
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

        <form onSubmit={handleSubmit} noValidate style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.2rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontFamily: 'monospace', color: '#F2F2F2', fontWeight: 600, marginBottom: '0.35rem' }}>
                MINIMUM ACCURACY GATE (%)
              </label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={minAccuracy}
                onChange={(e) => handleNumericChange(setMinAccuracy, e.target.value)}
                onBlur={() => handleBlur(minAccuracy, setMinAccuracy, 95.0, 0, 100)}
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
                Release is blocked if candidate accuracy drops below this value (0–100%).
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
                max="100"
                value={maxDegradation}
                onChange={(e) => handleNumericChange(setMaxDegradation, e.target.value)}
                onBlur={() => handleBlur(maxDegradation, setMaxDegradation, 2.0, 0, 100)}
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
                max="1000"
                value={maxLatency}
                onChange={(e) => handleNumericChange(setMaxLatency, e.target.value)}
                onBlur={() => handleBlur(maxLatency, setMaxLatency, 20, 0, 1000)}
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
                max="100"
                value={maxFailure}
                onChange={(e) => handleNumericChange(setMaxFailure, e.target.value)}
                onBlur={() => handleBlur(maxFailure, setMaxFailure, 5.0, 0, 100)}
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
                min="0"
                max="100"
                value={minCoverage}
                onChange={(e) => handleNumericChange(setMinCoverage, e.target.value)}
                onBlur={() => handleBlur(minCoverage, setMinCoverage, 80.0, 0, 100)}
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

          {/* Feedback & Submit Bar */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.6rem', flexWrap: 'wrap', gap: '0.8rem' }}>
            <div>
              {savedSuccess && (
                <span style={{ color: '#22C55E', fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: 600 }}>
                  ✓ Threshold policies updated and persisted successfully to Supabase!
                </span>
              )}
              {saveError && (
                <span style={{ color: '#EF4444', fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: 600 }}>
                  ⚠ {saveError}
                </span>
              )}
            </div>

            <button
              type="submit"
              disabled={isSaving}
              style={{
                background: isSaving ? '#122B63' : '#1E3A8A',
                color: '#F2F2F2',
                border: '1px solid #1E3A8A',
                padding: '0.55rem 1.4rem',
                borderRadius: '2px',
                fontSize: '0.78rem',
                fontFamily: 'monospace',
                fontWeight: 700,
                cursor: isSaving ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s ease, border-color 0.15s ease',
                opacity: isSaving ? 0.7 : 1,
              }}
              onMouseEnter={(e) => {
                if (!isSaving) {
                  e.currentTarget.style.background = '#2563EB';
                  e.currentTarget.style.borderColor = '#2563EB';
                }
              }}
              onMouseLeave={(e) => {
                if (!isSaving) {
                  e.currentTarget.style.background = '#1E3A8A';
                  e.currentTarget.style.borderColor = '#1E3A8A';
                }
              }}
            >
              {isSaving ? 'SAVING POLICIES...' : 'SAVE POLICIES'}
            </button>
          </div>
        </form>
      </div>

      {/* ── 2. Provider Harness Layer ── */}
      <div
        style={{
          background: '#151515',
          border: '1px solid #292929',
          borderRadius: '2px',
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.4rem',
        }}
      >
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h3 style={{ margin: 0, color: '#F2F2F2', fontSize: '1.05rem', fontWeight: 700, fontFamily: 'monospace' }}>
              Normalized AI Provider Architecture
            </h3>
            <span style={{ fontSize: '0.72rem', color: '#60A5FA', background: '#0A1A35', border: '1px solid #1E3A8A', padding: '0.2rem 0.6rem', borderRadius: '2px', fontFamily: 'monospace', fontWeight: 600 }}>
              {providerRegistry.listProviders().length} Registered Adapters
            </span>
          </div>
          <p style={{ color: '#858585', fontSize: '0.82rem', lineHeight: 1.5, margin: 0 }}>
            RELIQ executes evaluations via normalized ModelProvider adapters. All model telemetries (input tokens, output tokens, reasoning tokens, cached tokens, latency, cost) conform to the UsageRecord specification.
          </p>
        </div>

        {/* Security Alert */}
        <div
          style={{
            background: '#111111',
            border: '1px solid #292929',
            borderRadius: '2px',
            padding: '0.85rem 1.1rem',
            fontSize: '0.78rem',
            color: '#858585',
            lineHeight: 1.45,
            fontFamily: 'monospace',
          }}
        >
          🔒 <strong style={{ color: '#F2F2F2' }}>Zero-Client Secrets Guarantee:</strong> API tokens (GROQ_API_KEY, GEMINI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY) are never bundled or exposed in client-side code. Production requests route through isolated backend proxy endpoints (/api/providers/:provider).
        </div>

        {/* Live Registered Providers */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          {providerRegistry.listProviders().map((prov) => {
            const isDemo = prov.providerType === 'demo';
            const isLive = isDemo
              ? true
              : prov.id === 'groq'
              ? Boolean(serverStatus.groq)
              : prov.id === 'google'
              ? Boolean(serverStatus.gemini)
              : prov.id === 'openai'
              ? Boolean(serverStatus.openai)
              : prov.id === 'anthropic'
              ? Boolean(serverStatus.anthropic)
              : prov.id === 'cerebras'
              ? Boolean(serverStatus.cerebras)
              : false;

            return (
              <div
                key={prov.id}
                style={{
                  background: '#111111',
                  padding: '1rem 1.2rem',
                  borderRadius: '2px',
                  border: '1px solid #292929',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
                    <span
                      style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: isLive ? '#22C55E' : '#555555',
                        boxShadow: isLive ? '0 0 5px rgba(34, 197, 94, 0.45)' : 'none',
                        display: 'inline-block',
                      }}
                    />
                    <span style={{ fontWeight: 700, color: '#F2F2F2', fontSize: '0.88rem', fontFamily: 'monospace' }}>
                      {prov.name}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: '#555555', fontFamily: 'monospace' }}>
                      [{prov.id}]
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: '0.68rem',
                      fontFamily: 'monospace',
                      padding: '0.2rem 0.55rem',
                      borderRadius: '2px',
                      background: isLive ? '#13241A' : '#1B1B1B',
                      color: isLive ? '#22C55E' : '#555555',
                      border: isLive ? '1px solid rgba(34, 197, 94, 0.28)' : '1px solid #292929',
                      fontWeight: 700,
                    }}
                  >
                    {isDemo
                      ? 'DETERMINISTIC DEMO (ZERO COST)'
                      : isLive
                      ? 'GATEWAY LIVE'
                      : 'GATEWAY OFFLINE'}
                  </span>
                </div>

                {/* Supported Models */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.6rem' }}>
                  <span style={{ fontSize: '0.72rem', color: '#858585', fontWeight: 600, fontFamily: 'monospace' }}>Supported Models:</span>
                  {prov.supportedModels.map((m) => (
                    <span
                      key={m}
                      style={{
                        fontSize: '0.68rem',
                        fontFamily: 'monospace',
                        background: '#1B1B1B',
                        color: isLive ? '#F2F2F2' : '#858585',
                        padding: '0.15rem 0.45rem',
                        borderRadius: '2px',
                        border: '1px solid #292929',
                      }}
                    >
                      {m}
                    </span>
                  ))}
                </div>

                {/* Capabilities */}
                <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', fontSize: '0.68rem', fontFamily: 'monospace' }}>
                  {prov.supportsReasoningTokens && (
                    <span style={{ color: '#60A5FA', background: '#0A1A35', border: '1px solid #1E3A8A', padding: '0.15rem 0.45rem', borderRadius: '2px' }}>
                      🧠 Thinking Tokens Telemetry
                    </span>
                  )}
                  {prov.supportsPromptCaching && (
                    <span style={{ color: '#22C55E', background: '#13241A', border: '1px solid rgba(34, 197, 94, 0.3)', padding: '0.15rem 0.45rem', borderRadius: '2px' }}>
                      ⚡ Prompt Caching Discounts
                    </span>
                  )}
                  {prov.supportsTools && (
                    <span style={{ color: '#F59E0B', background: '#261D10', border: '1px solid rgba(245, 158, 11, 0.3)', padding: '0.15rem 0.45rem', borderRadius: '2px' }}>
                      🛠 Tool Calling Schema Validation
                    </span>
                  )}
                  {prov.proxyEndpoint && (
                    <span style={{ color: '#858585', background: '#1B1B1B', border: '1px solid #292929', padding: '0.15rem 0.45rem', borderRadius: '2px', fontFamily: 'monospace' }}>
                      Endpoint: {prov.proxyEndpoint}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 2.5 Data Privacy & Raw Output Retention ── */}
      <div
        style={{
          background: '#151515',
          border: '1px solid #292929',
          borderRadius: '2px',
          padding: '1.5rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1.2rem' }}>
          <div>
            <h3 style={{ margin: '0 0 0.4rem 0', color: '#F2F2F2', fontSize: '1.05rem', fontWeight: 700, fontFamily: 'monospace' }}>
              Data Privacy & Raw Output Retention
            </h3>
            <p style={{ margin: 0, fontSize: '0.82rem', color: '#858585', maxWidth: '550px', lineHeight: 1.5 }}>
              Control whether full model output strings and raw payload responses are persisted to local storage. When disabled, RELIQ records evaluation scores, latency, and token telemetry while stripping prompt text and completion bodies to adhere to zero-retention data privacy standards.
            </p>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', background: '#111111', padding: '0.6rem 1rem', borderRadius: '2px', border: '1px solid #292929' }}>
            <input
              type="checkbox"
              checked={storeRawOutputs}
              onChange={(e) => {
                const nextVal = e.target.checked;
                setStoreRawOutputs(nextVal);
                apiRepository.setStoreRawOutputs(nextVal);
              }}
              style={{ cursor: 'pointer', width: '15px', height: '15px', accentColor: '#2563EB' }}
            />
            <span style={{ fontSize: '0.78rem', fontFamily: 'monospace', fontWeight: 600, color: storeRawOutputs ? '#22C55E' : '#F59E0B' }}>
              {storeRawOutputs ? 'Store Raw Outputs (Enabled)' : 'Redact Raw Outputs (Strict Privacy)'}
            </span>
          </label>
        </div>
      </div>

      {/* ── 3. Data Management & Reset ── */}
      <div
        style={{
          background: '#151515',
          border: '1px solid #292929',
          borderRadius: '2px',
          padding: '1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <h3 style={{ margin: '0 0 0.3rem 0', color: '#F2F2F2', fontSize: '1.05rem', fontWeight: 700, fontFamily: 'monospace' }}>
            Reset Golden Demo Data
          </h3>
          <p style={{ margin: 0, fontSize: '0.82rem', color: '#858585' }}>
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
            border: '1px solid #4A2222',
            color: '#EF4444',
            padding: '0.55rem 1.1rem',
            borderRadius: '2px',
            fontSize: '0.78rem',
            fontFamily: 'monospace',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'background 0.15s ease, border-color 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#2A1414';
            e.currentTarget.style.borderColor = '#EF4444';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.borderColor = '#4A2222';
          }}
        >
          Reset to Demo State
        </button>
      </div>
    </div>
  );
};
