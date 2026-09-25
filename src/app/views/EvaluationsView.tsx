/* ============================================================
   RELIQ — Evaluations & Cross-Provider Benchmark View
   
   Allows configuring and running evaluations across real AI providers:
   - Google Gemini
   - OpenAI
   - Anthropic Claude
   - Deterministic Demo
   
   Supports cross-provider benchmarking (Gemini vs OpenAI, Gemini vs Claude,
   OpenAI vs Claude, version A vs B, prompt A vs B) against identical datasets,
   and viewing full comparison reports with standardized recommendation verdicts.
   ============================================================ */

import React, { useEffect, useState, useMemo, useRef } from 'react';
import { ComparisonReportModal } from '../components/ComparisonReportModal';
import { EvaluationProgressModal } from '../components/EvaluationProgressModal';
import {
  Dataset,
  EvaluationRun,
  ModelVersion,
  Project,
} from '../../domain/types';
import { ComparisonReport } from '../../evaluation/comparator';
import { EvaluationRunner } from '../../evaluation/runner';
import { generateBenchmarkDataset } from '../../data/datasetGenerator';
import { CHECKOUT_RELIABILITY_SYSTEM_PROMPT } from '../../data/seedData';
import { providerRegistry, ServerProviderStatus } from '../../providers/registry';
import { ProviderType } from '../../providers/types';
import { useRouter } from '../../router/useRouter';
import { apiRepository } from '../../services/apiRepository';
import { getEligibleJudgeModels, getDefaultJudgeModel, GROQ_MODEL_REGISTRY } from '../../evaluation/judgeRegistry';

interface EvaluationsViewProps {
  project: Project;
  datasets: Dataset[];
  versions: ModelVersion[];
  evaluationRuns: EvaluationRun[];
  onSaveRun: (run: EvaluationRun) => Promise<void>;
  onDeleteRun: (runId: string) => Promise<void>;
  onSelectActiveRun: (run: EvaluationRun) => void;
}

const PROVIDER_MODELS: Record<ProviderType, { id: string; label: string }[]> = {
  demo: [
    { id: 'demo-claude-3-5-sonnet', label: 'Claude 3.5 Sonnet (Demo Calibration)' },
    { id: 'demo-gemini-1-5-pro', label: 'Gemini 1.5 Pro (Demo Calibration)' },
    { id: 'demo-gpt-4o', label: 'GPT-4o (Demo Calibration)' },
    { id: 'demo-o3-mini', label: 'o3-mini (Demo Calibration)' },
  ],
  google: [
    { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash (Fast Tier)' },
    { id: 'gemini-flash-latest', label: 'Gemini Flash Latest (Production Active)' },
    { id: 'gemini-pro-latest', label: 'Gemini Pro Latest (Production Active)' },
    { id: 'gemini-2.0-flash-thinking-exp', label: 'Gemini 2.0 Flash Thinking (🧠 Thinking Tokens)' },
    { id: 'gemini-1.5-pro-002', label: 'Gemini 1.5 Pro (002)' },
    { id: 'gemini-1.5-flash-002', label: 'Gemini 1.5 Flash (002)' },
  ],
  groq: [
    { id: 'openai/gpt-oss-20b', label: 'OpenAI GPT-OSS 20B (Groq Fast Inference)' },
    { id: 'openai/gpt-oss-120b', label: 'OpenAI GPT-OSS 120B (Groq High Capability)' },
    { id: 'qwen/qwen3.8-27b', label: 'Qwen 3.8 27B (128k Tongyi Lab)' },
    { id: 'allam-2-7b', label: 'ALLaM 2 7B (SDAIA Bilingual)' },
  ],
  openai: [
    { id: 'gpt-4o', label: 'GPT-4o (Flagship Multimodal)' },
    { id: 'gpt-4o-mini', label: 'GPT-4o mini (Fast & Cost-Efficient)' },
    { id: 'o3-mini', label: 'o3-mini (🧠 Advanced Reasoning)' },
    { id: 'o1', label: 'o1 (🧠 Deep Complex Reasoning)' },
    { id: 'o1-mini', label: 'o1-mini (Reasoning Compact)' },
  ],
  anthropic: [
    { id: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet (⚡ Prompt Caching)' },
    { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku (⚡ Fast Caching)' },
    { id: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
  ],
  cerebras: [
    { id: 'gpt-oss-120b', label: 'Cerebras GPT-OSS 120B (Default Ultra-Fast)' },
    { id: 'llama3.1-8b', label: 'Cerebras Llama 3.1 8B (Ultra-Low Latency)' },
  ],
  custom: [
    { id: 'custom-model', label: 'Custom HTTP Proxy Model' },
  ],
};

export const EvaluationsView: React.FC<EvaluationsViewProps> = ({
  project,
  datasets,
  versions,
  evaluationRuns,
  onSaveRun,
  onDeleteRun,
  onSelectActiveRun,
}) => {
  const { navigate, triggerTransition } = useRouter();

  // Mode: 'saved_versions' vs 'custom_benchmark' (Default to Cross-Provider Benchmark)
  const [configMode, setConfigMode] = useState<'saved_versions' | 'custom_benchmark'>('custom_benchmark');

  // Server credentials status
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

  // Initial dataset selection helper (prioritize golden suite or populated dataset)
  const selectInitialDataset = (dsets: Dataset[]): string => {
    if (!dsets || dsets.length === 0) return '';
    const golden = dsets.find((d) => d.id === 'ds-checkout-golden');
    if (golden) return golden.id;
    const populated = dsets.find((d) => (d.cases?.length || 0) > 0);
    if (populated) return populated.id;
    return dsets[0].id;
  };

  // Selection states (Mode 1: Saved Versions)
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>(() => selectInitialDataset(datasets));

  useEffect(() => {
    if (datasets && datasets.length > 0) {
      const current = datasets.find((d) => d.id === selectedDatasetId);
      if (!current) {
        setSelectedDatasetId(selectInitialDataset(datasets));
      }
    }
  }, [datasets, selectedDatasetId]);

  const [baselineVersionId, setBaselineVersionId] = useState<string>(project?.baselineVersionId || versions?.[0]?.id || '');
  const [candidateVersionId, setCandidateVersionId] = useState<string>(project?.candidateVersionId || versions?.[1]?.id || versions?.[0]?.id || '');

  // Selection states (Mode 2: Cross-Provider Benchmark - Default: Groq openai/gpt-oss-20b vs openai/gpt-oss-120b)
  const [customBaselineProvider, setCustomBaselineProvider] = useState<ProviderType>('groq');
  const [customBaselineModel, setCustomBaselineModel] = useState<string>('openai/gpt-oss-20b');
  const [customBaselinePrompt, setCustomBaselinePrompt] = useState<string>(CHECKOUT_RELIABILITY_SYSTEM_PROMPT);
  const [customBaselineTemp, setCustomBaselineTemp] = useState<number>(0.2);
  const [customBaselineReasoningEffort, setCustomBaselineReasoningEffort] = useState<'low' | 'medium' | 'high'>('medium');

  const [customCandidateProvider, setCustomCandidateProvider] = useState<ProviderType>('groq');
  const [customCandidateModel, setCustomCandidateModel] = useState<string>('openai/gpt-oss-120b');
  const [customCandidatePrompt, setCustomCandidatePrompt] = useState<string>(CHECKOUT_RELIABILITY_SYSTEM_PROMPT);
  const [customCandidateTemp, setCustomCandidateTemp] = useState<number>(0.2);
  const [customCandidateReasoningEffort, setCustomCandidateReasoningEffort] = useState<'low' | 'medium' | 'high'>('medium');

  // Execution states
  const [isRunning, setIsRunning] = useState(false);
  const [isProgressModalOpen, setIsProgressModalOpen] = useState(false);
  const isCancelledRef = useRef(false);
  const [maxCasesToRun, setMaxCasesToRun] = useState<number>(0);
  const [progressPercent, setProgressPercent] = useState(0);
  const [currentProgressText, setCurrentProgressText] = useState('');
  const [currentCaseName, setCurrentCaseName] = useState<string>('');
  const [currentPhase, setCurrentPhase] = useState<string>('Initializing');
  const [progressCounts, setProgressCounts] = useState<{ current: number; total: number } | null>(null);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);

  // Active Comparison Report Modal
  const [activeReport, setActiveReport] = useState<ComparisonReport | null>(null);

  const handleOpenReport = async (run: EvaluationRun) => {
    try {
      const freshRun = await apiRepository.getEvaluationRunById(run.id);
      if (freshRun && freshRun.comparisonReport) {
        triggerTransition(() => {
          setActiveReport(freshRun.comparisonReport || null);
        });
        return;
      }
    } catch {}
    if (run.comparisonReport) {
      triggerTransition(() => {
        setActiveReport(run.comparisonReport || null);
      });
    }
  };

  const selectedDataset = datasets.find((d) => d.id === selectedDatasetId) || datasets.find((d) => d.id === 'ds-checkout-golden') || datasets[0];
  const baselineVersion = versions.find((v) => v.id === baselineVersionId) || versions[0];
  const candidateVersion = versions.find((v) => v.id === candidateVersionId) || versions[1] || versions[0];

  // Effective benchmark models for judge eligibility
  const effectiveBaselineModel = configMode === 'custom_benchmark' ? customBaselineModel : (baselineVersion?.modelIdentifier || 'openai/gpt-oss-20b');
  const effectiveCandidateModel = configMode === 'custom_benchmark' ? customCandidateModel : (candidateVersion?.modelIdentifier || 'openai/gpt-oss-120b');

  // Dynamic judge eligibility calculation
  const eligibleJudgeModels = useMemo(() => {
    return getEligibleJudgeModels(effectiveBaselineModel, effectiveCandidateModel);
  }, [effectiveBaselineModel, effectiveCandidateModel]);

  // Judge selection states
  const [judgeEnabled, setJudgeEnabled] = useState<boolean>(true);
  const [selectedJudgeModel, setSelectedJudgeModel] = useState<string>('qwen/qwen3.8-27b');
  const [judgeStatus, setJudgeStatus] = useState<string>('CHECKING');
  const [judgeStatusDetails, setJudgeStatusDetails] = useState<string>('');

  // Auto-adjust judge model if current selection becomes ineligible
  useEffect(() => {
    if (eligibleJudgeModels.length > 0) {
      if (!eligibleJudgeModels.some((m) => m.id === selectedJudgeModel)) {
        const def = getDefaultJudgeModel(effectiveBaselineModel, effectiveCandidateModel);
        if (def) setSelectedJudgeModel(def.id);
      }
    }
  }, [eligibleJudgeModels, effectiveBaselineModel, effectiveCandidateModel, selectedJudgeModel]);

  // Model availability check
  const checkJudgeAvailability = async (modelId: string) => {
    setJudgeStatus('CHECKING');
    setJudgeStatusDetails('');
    try {
      const res = await fetch(`/api/judge/test?model=${encodeURIComponent(modelId)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'AVAILABLE' || data.available) {
          setJudgeStatus('AVAILABLE');
          const modelName = eligibleJudgeModels.find((m) => m.id === modelId)?.displayName || modelId;
          setJudgeStatusDetails(`✓ Judge model available. ${modelName} responded successfully${data.latencyMs ? ` (${data.latencyMs}ms)` : ''}.`);
        } else {
          setJudgeStatus('UNAVAILABLE');
          setJudgeStatusDetails(data.error || 'Judge model unavailable or API key missing.');
        }
      } else {
        setJudgeStatus('UNAVAILABLE');
        setJudgeStatusDetails(`HTTP ${res.status}: Judge connection test failed.`);
      }
    } catch (err: any) {
      setJudgeStatus('UNAVAILABLE');
      setJudgeStatusDetails(err.message || 'Network error connecting to judge service.');
    }
  };

  useEffect(() => {
    if (judgeEnabled && selectedJudgeModel) {
      checkJudgeAvailability(selectedJudgeModel);
    }
  }, [judgeEnabled, selectedJudgeModel]);

  const isJudgeConflicting = judgeEnabled && (
    selectedJudgeModel === effectiveBaselineModel ||
    selectedJudgeModel === effectiveCandidateModel
  );

  const handleStartEvaluation = async () => {
    let bVer: ModelVersion = baselineVersion;
    let cVer: ModelVersion = candidateVersion;

    if (configMode === 'custom_benchmark') {
      bVer = {
        id: `custom-base-${Date.now()}`,
        name: `Baseline: ${customBaselineProvider.toUpperCase()} (${customBaselineModel})`,
        provider: customBaselineProvider,
        modelIdentifier: customBaselineModel,
        promptVersion: 'custom-baseline-prompt',
        systemPrompt: customBaselinePrompt,
        temperature: customBaselineTemp,
        maxTokens: 4096,
        reasoningEffort: (customBaselineModel === 'openai/gpt-oss-20b' || customBaselineModel === 'openai/gpt-oss-120b') ? customBaselineReasoningEffort : undefined,
        isBaseline: true,
        createdAt: new Date().toISOString(),
      };

      cVer = {
        id: `custom-cand-${Date.now()}`,
        name: `Candidate: ${customCandidateProvider.toUpperCase()} (${customCandidateModel})`,
        provider: customCandidateProvider,
        modelIdentifier: customCandidateModel,
        promptVersion: 'custom-candidate-prompt',
        systemPrompt: customCandidatePrompt,
        temperature: customCandidateTemp,
        maxTokens: 4096,
        reasoningEffort: (customCandidateModel === 'openai/gpt-oss-20b' || customCandidateModel === 'openai/gpt-oss-120b') ? customCandidateReasoningEffort : undefined,
        isBaseline: false,
        createdAt: new Date().toISOString(),
      };
    }

    // Required RELIQ UI Console Logging
    console.log('[RELIQ UI] Run Evaluation clicked');
    console.log('[RELIQ UI] Dataset:', selectedDataset ? selectedDataset.name : 'None');
    console.log('[RELIQ UI] Test cases:', selectedDataset ? (selectedDataset.cases?.length || 0) : 0);
    console.log('[RELIQ UI] Baseline:', `${bVer?.provider || 'none'} / ${bVer?.modelIdentifier || bVer?.name || 'none'}`);
    console.log('[RELIQ UI] Candidate:', `${cVer?.provider || 'none'} / ${cVer?.modelIdentifier || cVer?.name || 'none'}`);

    // Validation for judge conflict
    if (isJudgeConflicting) {
      setEvaluationError('Judge model must be different from both benchmark models.');
      return;
    }

    // Validation for datasets with 0 test cases
    if (!selectedDataset || !selectedDataset.cases || selectedDataset.cases.length === 0) {
      setEvaluationError('Cannot run evaluation: selected dataset contains 0 test cases.');
      return;
    }

    if (isRunning) return;

    setEvaluationError(null);
    setIsRunning(true);
    setIsProgressModalOpen(true);
    isCancelledRef.current = false;
    setCurrentRunId(null);
    setProgressPercent(0);
    setProgressCounts(null);
    setCurrentCaseName('');
    setCurrentPhase('Initializing Harness');
    setCurrentProgressText('Initializing model providers & telemetry harness...');

    try {
      let datasetToEvaluate = selectedDataset;
      if (
        maxCasesToRun > 0 &&
        maxCasesToRun > (selectedDataset?.cases.length || 0) &&
        selectedDataset.id.startsWith('ds-checkout')
      ) {
        datasetToEvaluate = generateBenchmarkDataset(
          maxCasesToRun,
          `${selectedDataset.name} (Scaled to ${maxCasesToRun})`
        );
      }

      const payload = {
        project,
        dataset: datasetToEvaluate,
        baselineVersion: bVer,
        candidateVersion: cVer,
        judgeConfig: judgeEnabled ? {
          enabled: true,
          provider: 'groq' as const,
          modelIdentifier: selectedJudgeModel,
          temperature: 0.1,
          maxTokens: 1024,
        } : undefined,
        regressionSettings: project.regressionSettings,
        maxCases: maxCasesToRun > 0 ? maxCasesToRun : undefined,
        concurrency: 1,
        async: true,
      };

      console.log('[RELIQ UI] POST /api/evaluations/run');
      const response = await fetch('/api/evaluations/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      console.log('[RELIQ UI] Response:', response.status, response.statusText);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Server evaluation rejected (HTTP ${response.status} ${response.statusText})`);
      }

      const initData = await response.json();
      const runId = initData.runId;
      console.log('[RELIQ UI] runId:', runId);
      setCurrentRunId(runId);
      setCurrentPhase('Running Benchmark Scenarios');

      // Poll /api/evaluations/status/:runId until completed or failed
      let run: EvaluationRun | null = null;
      let completed = false;
      while (!completed) {
        if (isCancelledRef.current) {
          console.log('[RELIQ UI] Evaluation loop cancelled by user');
          setIsRunning(false);
          setIsProgressModalOpen(false);
          return;
        }

        await new Promise((res) => setTimeout(res, 400));

        if (isCancelledRef.current) {
          setIsRunning(false);
          setIsProgressModalOpen(false);
          return;
        }

        const statusRes = await fetch(`/api/evaluations/status/${runId}`);
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          if (statusData.progress) {
            const { current, total, caseName, percent } = statusData.progress;
            setProgressPercent(percent);
            setProgressCounts({ current, total });
            if (caseName) setCurrentCaseName(caseName);
            const activePhase = judgeEnabled ? 'Semantic Evaluation + LLM Judge' : 'Semantic Criteria Evaluation';
            setCurrentPhase(activePhase);
            setCurrentProgressText(
              caseName ? `Evaluating scenario ${current}/${total}: ${caseName}` : `Processing scenario ${current}/${total}`
            );
          }

          if (statusData.status === 'COMPLETED' && statusData.run) {
            run = statusData.run;
            completed = true;
          } else if (statusData.status === 'FAILED') {
            throw new Error(statusData.error || 'Server evaluation execution failed');
          }
        } else {
          const errText = await statusRes.text().catch(() => '');
          throw new Error(`Failed to check evaluation status (${statusRes.status}): ${errText}`);
        }
      }

      if (run) {
        await onSaveRun(run);
        onSelectActiveRun(run);
        setIsRunning(false);
        setIsProgressModalOpen(false);
        if (run.comparisonReport) {
          triggerTransition(() => {
            setActiveReport(run.comparisonReport || null);
          });
        }
      }
      setIsRunning(false);
    } catch (err: any) {
      console.error('[RELIQ UI] Evaluation error:', err);
      setEvaluationError(err.message || 'Evaluation run failed');
      setIsRunning(false);
      // Keep isProgressModalOpen true so failure view displays error details & retry
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', maxWidth: '1240px' }}>
      {/* ── Page Header ── */}
      <div>
        <div style={{ fontSize: '0.75rem', letterSpacing: '0.2em', color: 'var(--accent, #FF6B35)', fontWeight: 600, textTransform: 'uppercase' }}>
          HARNESS // MULTI-PROVIDER BENCHMARK
        </div>
        <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#FFFFFF', margin: '0.3rem 0 0.4rem 0' }}>
          Cross-Provider Evaluation Harness
        </h1>
        <p style={{ color: '#8899AA', fontSize: '0.9rem', margin: 0 }}>
          Benchmark real AI providers (Google Gemini, OpenAI, Anthropic Claude, Demo) against identical datasets to detect regressions and enforce deployment decisions.
        </p>
      </div>

      {/* ── Server Credentials Readiness Bar ── */}
      <div
        style={{
          background: '#161B22',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '10px',
          padding: '0.9rem 1.4rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.8rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#FFFFFF' }}>
            Server Proxy Credentials:
          </span>
          <span style={{ fontSize: '0.72rem', color: '#888888' }}>
            (Read strictly in Node.js from .env.local — zero client exposure)
          </span>
        </div>

        <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
          {/* Demo */}
          <span style={{ fontSize: '0.7rem', padding: '0.2rem 0.55rem', borderRadius: '4px', background: 'rgba(46, 204, 113, 0.15)', color: '#2ECC71', fontWeight: 700 }}>
            DEMO: READY (ZERO COST)
          </span>

          {/* Gemini */}
          <span
            style={{
              fontSize: '0.7rem',
              padding: '0.2rem 0.55rem',
              borderRadius: '4px',
              background: serverStatus.gemini ? 'rgba(46, 204, 113, 0.15)' : 'rgba(255, 170, 68, 0.12)',
              color: serverStatus.gemini ? '#2ECC71' : '#FFAA44',
              fontWeight: 700,
            }}
          >
            GEMINI: {serverStatus.gemini ? 'API READY' : 'KEY MISSING IN .env.local'}
          </span>

          {/* OpenAI */}
          <span
            style={{
              fontSize: '0.7rem',
              padding: '0.2rem 0.55rem',
              borderRadius: '4px',
              background: serverStatus.openai ? 'rgba(46, 204, 113, 0.15)' : 'rgba(255, 170, 68, 0.12)',
              color: serverStatus.openai ? '#2ECC71' : '#FFAA44',
              fontWeight: 700,
            }}
          >
            OPENAI: {serverStatus.openai ? 'API READY' : 'KEY MISSING IN .env.local'}
          </span>

          {/* Anthropic */}
          <span
            style={{
              fontSize: '0.7rem',
              padding: '0.2rem 0.55rem',
              borderRadius: '4px',
              background: serverStatus.anthropic ? 'rgba(46, 204, 113, 0.15)' : 'rgba(255, 170, 68, 0.12)',
              color: serverStatus.anthropic ? '#2ECC71' : '#FFAA44',
              fontWeight: 700,
            }}
          >
            CLAUDE: {serverStatus.anthropic ? 'API READY' : 'KEY MISSING IN .env.local'}
          </span>

          {/* Groq */}
          <span
            style={{
              fontSize: '0.7rem',
              padding: '0.2rem 0.55rem',
              borderRadius: '4px',
              background: serverStatus.groq ? 'rgba(46, 204, 113, 0.15)' : 'rgba(255, 170, 68, 0.12)',
              color: serverStatus.groq ? '#2ECC71' : '#FFAA44',
              fontWeight: 700,
            }}
          >
            GROQ: {serverStatus.groq ? 'API READY' : 'KEY MISSING IN .env.local'}
          </span>

          {/* Cerebras */}
          <span
            style={{
              fontSize: '0.7rem',
              padding: '0.2rem 0.55rem',
              borderRadius: '4px',
              background: serverStatus.cerebras ? 'rgba(46, 204, 113, 0.15)' : 'rgba(255, 170, 68, 0.12)',
              color: serverStatus.cerebras ? '#2ECC71' : '#FFAA44',
              fontWeight: 700,
            }}
          >
            CEREBRAS: {serverStatus.cerebras ? 'API READY' : 'KEY MISSING IN .env.local'}
          </span>
        </div>
      </div>

      {/* ── Evaluation Launch Configuration Card ── */}
      <div
        style={{
          background: '#161B22',
          borderRadius: '12px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          padding: '2rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, color: '#FFFFFF', fontSize: '1.2rem' }}>
              Configure Comparative Run
            </h3>
            <span style={{ fontSize: '0.8rem', color: '#888888' }}>
              Select candidate configurations. Both will run against the exact same evaluation dataset.
            </span>
          </div>

          {/* Mode Switcher */}
          <div style={{ display: 'flex', background: '#0D1117', padding: '0.25rem', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <button
              onClick={() => setConfigMode('saved_versions')}
              style={{
                background: configMode === 'saved_versions' ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
                border: 'none',
                color: configMode === 'saved_versions' ? '#FFFFFF' : '#888888',
                padding: '0.4rem 0.8rem',
                borderRadius: '4px',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Saved Project Versions
            </button>
            <button
              onClick={() => setConfigMode('custom_benchmark')}
              style={{
                background: configMode === 'custom_benchmark' ? 'var(--accent, #FF6B35)' : 'transparent',
                border: 'none',
                color: configMode === 'custom_benchmark' ? '#000000' : '#888888',
                padding: '0.4rem 0.9rem',
                borderRadius: '4px',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Cross-Provider Comparator
            </button>
          </div>
        </div>

        {datasets.length === 0 && (
          <div
            style={{
              background: 'rgba(255, 170, 68, 0.1)',
              border: '1px solid rgba(255, 170, 68, 0.3)',
              borderRadius: '8px',
              padding: '1rem 1.2rem',
              color: '#FFAA44',
              fontSize: '0.85rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>No evaluation datasets found for this project. Create a test suite first before running benchmarks.</span>
            <button
              onClick={() => navigate('#/app/datasets')}
              style={{
                background: '#FFAA44',
                color: '#000000',
                border: 'none',
                padding: '0.45rem 0.9rem',
                borderRadius: '4px',
                fontWeight: 700,
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              Go to Datasets →
            </button>
          </div>
        )}

        {/* ── Evaluation Error Banner ── */}
        {evaluationError && (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: '8px',
              padding: '0.85rem 1.2rem',
              color: '#EF4444',
              fontSize: '0.88rem',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span>⚠️</span>
              <span>{evaluationError}</span>
            </div>
            <button
              onClick={() => setEvaluationError(null)}
              style={{
                background: 'none',
                border: 'none',
                color: '#EF4444',
                cursor: 'pointer',
                fontSize: '1rem',
              }}
            >
              ✕
            </button>
          </div>
        )}

        {/* ── Active Benchmark Overview Bar ── */}
        <div
          style={{
            background: 'rgba(255, 107, 53, 0.05)',
            border: '1px solid rgba(255, 107, 53, 0.22)',
            borderRadius: '8px',
            padding: '0.85rem 1.2rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontSize: '0.68rem', color: '#8899AA', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Active Benchmark Suite
            </div>
            <div style={{ fontSize: '0.9rem', color: '#FFFFFF', fontWeight: 700, marginTop: '0.2rem' }}>
              {selectedDataset?.name || 'Checkout Reliability Suite'}
            </div>
            <div style={{ fontSize: '0.72rem', color: 'var(--accent, #FF6B35)', fontWeight: 600 }}>
              {selectedDataset?.cases?.length || 27} authoritative scenarios
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.68rem', color: '#8899AA', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Baseline Model ({configMode === 'custom_benchmark' ? customBaselineProvider.toUpperCase() : (baselineVersion?.provider?.toUpperCase() || 'DEMO')})
            </div>
            <div style={{ fontSize: '0.85rem', color: '#ECECEC', fontFamily: 'monospace', fontWeight: 600, marginTop: '0.2rem' }}>
              {effectiveBaselineModel}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#2ECC71', fontWeight: 600 }}>
              Reference Anchor
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.68rem', color: '#8899AA', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Candidate Model ({configMode === 'custom_benchmark' ? customCandidateProvider.toUpperCase() : (candidateVersion?.provider?.toUpperCase() || 'DEMO')})
            </div>
            <div style={{ fontSize: '0.85rem', color: '#4DA6FF', fontFamily: 'monospace', fontWeight: 600, marginTop: '0.2rem' }}>
              {effectiveCandidateModel}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#4DA6FF', fontWeight: 600 }}>
              Evaluation Candidate
            </div>
          </div>
        </div>

        {/* ── Dataset Selector ── */}
        <div>
          <label style={{ display: 'block', fontSize: '0.8rem', color: '#CCCCCC', fontWeight: 600, marginBottom: '0.4rem' }}>
            Evaluation Dataset (Identical Test Suite for Both Models)
          </label>
          <select
            value={selectedDatasetId}
            onChange={(e) => {
              setSelectedDatasetId(e.target.value);
              setEvaluationError(null);
            }}
            disabled={isRunning}
            style={{
              width: '100%',
              padding: '0.65rem',
              background: '#0D1117',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '6px',
              color: '#FFFFFF',
              fontSize: '0.85rem',
            }}
          >
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.cases?.length || 0} scenarios) — {d.description}
              </option>
            ))}
          </select>
        </div>

        {/* ── Mode 1: Saved Project Versions ── */}
        {configMode === 'saved_versions' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            {/* Baseline Version */}
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#AAAAAA', marginBottom: '0.4rem' }}>
                Baseline Model Version (Standard Reference)
              </label>
              <select
                value={baselineVersionId}
                onChange={(e) => setBaselineVersionId(e.target.value)}
                disabled={isRunning}
                style={{
                  width: '100%',
                  padding: '0.65rem',
                  background: '#0D1117',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '6px',
                  color: '#FFFFFF',
                  fontSize: '0.85rem',
                }}
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
              <div style={{ marginTop: '0.35rem', fontSize: '0.72rem', color: '#888888', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ textTransform: 'uppercase', color: '#2ECC71', fontWeight: 600 }}>{baselineVersion?.provider}</span>
                <span>•</span>
                <span style={{ fontFamily: 'monospace' }}>{baselineVersion?.modelIdentifier}</span>
              </div>
            </div>

            {/* Candidate Version */}
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#AAAAAA', marginBottom: '0.4rem' }}>
                Candidate Model Version (Under Test)
              </label>
              <select
                value={candidateVersionId}
                onChange={(e) => setCandidateVersionId(e.target.value)}
                disabled={isRunning}
                style={{
                  width: '100%',
                  padding: '0.65rem',
                  background: '#0D1117',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '6px',
                  color: '#FFFFFF',
                  fontSize: '0.85rem',
                }}
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
              <div style={{ marginTop: '0.35rem', fontSize: '0.72rem', color: '#888888', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ textTransform: 'uppercase', color: '#4DA6FF', fontWeight: 600 }}>{candidateVersion?.provider}</span>
                <span>•</span>
                <span style={{ fontFamily: 'monospace' }}>{candidateVersion?.modelIdentifier}</span>
              </div>
            </div>
          </div>
        ) : (
          /* ── Mode 2: Cross-Provider Benchmark / Custom Comparator ── */
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            {/* Baseline Configuration Panel */}
            <div style={{ background: '#0D1117', padding: '1.2rem', borderRadius: '8px', border: '1px solid rgba(46, 204, 113, 0.3)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#2ECC71', textTransform: 'uppercase' }}>
                Baseline Model Configuration
              </div>

              {/* Provider Selection */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#888888', marginBottom: '0.3rem' }}>
                  Provider
                </label>
                <select
                  value={customBaselineProvider}
                  onChange={(e) => {
                    const p = e.target.value as ProviderType;
                    setCustomBaselineProvider(p);
                    setCustomBaselineModel(PROVIDER_MODELS[p][0].id);
                  }}
                  style={{ width: '100%', padding: '0.5rem', background: '#161B22', border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: '4px', color: '#FFFFFF', fontSize: '0.85rem' }}
                >
                  <option value="demo">Deterministic Demo (Zero Cost)</option>
                  <option value="groq">Groq (LPU Inference)</option>
                  <option value="cerebras">Cerebras (CS-3 Inference)</option>
                  <option value="google">Google Gemini (Server Proxy)</option>
                  <option value="openai">OpenAI (Server Proxy)</option>
                  <option value="anthropic">Anthropic Claude (Server Proxy)</option>
                </select>
              </div>

              {/* Model Selection */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#888888', marginBottom: '0.3rem' }}>
                  Model Identifier
                </label>
                <select
                  value={customBaselineModel}
                  onChange={(e) => setCustomBaselineModel(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', background: '#161B22', border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: '4px', color: '#FFFFFF', fontSize: '0.85rem' }}
                >
                  {PROVIDER_MODELS[customBaselineProvider].map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Reasoning Effort (GPT-OSS on Groq) */}
              {(customBaselineModel === 'openai/gpt-oss-20b' || customBaselineModel === 'openai/gpt-oss-120b') && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#888888', marginBottom: '0.3rem' }}>
                    Reasoning Effort (GPT-OSS)
                  </label>
                  <select
                    value={customBaselineReasoningEffort}
                    onChange={(e) => setCustomBaselineReasoningEffort(e.target.value as 'low' | 'medium' | 'high')}
                    style={{ width: '100%', padding: '0.5rem', background: '#161B22', border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: '4px', color: '#FFFFFF', fontSize: '0.85rem' }}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium (Default / Fair Comparison)</option>
                    <option value="high">High</option>
                  </select>
                </div>
              )}

              {/* System Prompt */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#888888', marginBottom: '0.3rem' }}>
                  System Prompt Directive
                </label>
                <textarea
                  rows={3}
                  value={customBaselinePrompt}
                  onChange={(e) => setCustomBaselinePrompt(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', background: '#161B22', border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: '4px', color: '#FFFFFF', fontSize: '0.8rem', fontFamily: 'monospace', resize: 'vertical' }}
                />
              </div>

              {/* Temperature */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#888888', marginBottom: '0.3rem' }}>
                  <span>Temperature</span>
                  <span style={{ color: '#FFFFFF', fontWeight: 600 }}>{customBaselineTemp}</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.05"
                  value={customBaselineTemp}
                  onChange={(e) => setCustomBaselineTemp(Number(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>
            </div>

            {/* Candidate Configuration Panel */}
            <div style={{ background: '#0D1117', padding: '1.2rem', borderRadius: '8px', border: '1px solid rgba(77, 166, 255, 0.3)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#4DA6FF', textTransform: 'uppercase' }}>
                Candidate Model Configuration
              </div>

              {/* Provider Selection */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#888888', marginBottom: '0.3rem' }}>
                  Provider
                </label>
                <select
                  value={customCandidateProvider}
                  onChange={(e) => {
                    const p = e.target.value as ProviderType;
                    setCustomCandidateProvider(p);
                    setCustomCandidateModel(PROVIDER_MODELS[p][0].id);
                  }}
                  style={{ width: '100%', padding: '0.5rem', background: '#161B22', border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: '4px', color: '#FFFFFF', fontSize: '0.85rem' }}
                >
                  <option value="demo">Deterministic Demo (Zero Cost)</option>
                  <option value="groq">Groq (LPU Inference)</option>
                  <option value="cerebras">Cerebras (CS-3 Inference)</option>
                  <option value="google">Google Gemini (Server Proxy)</option>
                  <option value="openai">OpenAI (Server Proxy)</option>
                  <option value="anthropic">Anthropic Claude (Server Proxy)</option>
                </select>
              </div>

              {/* Model Selection */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#888888', marginBottom: '0.3rem' }}>
                  Model Identifier
                </label>
                <select
                  value={customCandidateModel}
                  onChange={(e) => setCustomCandidateModel(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', background: '#161B22', border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: '4px', color: '#FFFFFF', fontSize: '0.85rem' }}
                >
                  {PROVIDER_MODELS[customCandidateProvider].map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Reasoning Effort (GPT-OSS on Groq) */}
              {(customCandidateModel === 'openai/gpt-oss-20b' || customCandidateModel === 'openai/gpt-oss-120b') && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: '#888888', marginBottom: '0.3rem' }}>
                    Reasoning Effort (GPT-OSS)
                  </label>
                  <select
                    value={customCandidateReasoningEffort}
                    onChange={(e) => setCustomCandidateReasoningEffort(e.target.value as 'low' | 'medium' | 'high')}
                    style={{ width: '100%', padding: '0.5rem', background: '#161B22', border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: '4px', color: '#FFFFFF', fontSize: '0.85rem' }}
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium (Default / Fair Comparison)</option>
                    <option value="high">High</option>
                  </select>
                </div>
              )}

              {/* System Prompt */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: '#888888', marginBottom: '0.3rem' }}>
                  System Prompt Directive
                </label>
                <textarea
                  rows={3}
                  value={customCandidatePrompt}
                  onChange={(e) => setCustomCandidatePrompt(e.target.value)}
                  style={{ width: '100%', padding: '0.5rem', background: '#161B22', border: '1px solid rgba(255, 255, 255, 0.15)', borderRadius: '4px', color: '#FFFFFF', fontSize: '0.8rem', fontFamily: 'monospace', resize: 'vertical' }}
                />
              </div>

              {/* Temperature */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#888888', marginBottom: '0.3rem' }}>
                  <span>Temperature</span>
                  <span style={{ color: '#FFFFFF', fontWeight: 600 }}>{customCandidateTemp}</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.05"
                  value={customCandidateTemp}
                  onChange={(e) => setCustomCandidateTemp(Number(e.target.value))}
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Progress Bar (Visible while running) */}
        {isRunning && (
          <div
            style={{
              background: 'rgba(0, 0, 0, 0.4)',
              padding: '1.2rem',
              borderRadius: '8px',
              border: '1px solid rgba(255, 107, 53, 0.3)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.6rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem', flexWrap: 'wrap', gap: '0.4rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span style={{ color: '#FFFFFF', fontWeight: 600 }}>{currentProgressText}</span>
                {currentRunId && (
                  <span
                    style={{
                      fontSize: '0.72rem',
                      background: 'rgba(255, 107, 53, 0.2)',
                      color: 'var(--accent, #FF6B35)',
                      padding: '0.15rem 0.5rem',
                      borderRadius: '4px',
                      fontFamily: 'monospace',
                    }}
                  >
                    Run ID: {currentRunId}
                  </span>
                )}
              </div>
              <span style={{ color: 'var(--accent, #FF6B35)', fontWeight: 800 }}>{progressPercent}%</span>
            </div>
            {progressCounts && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: '#8899AA' }}>
                <span>{progressCounts.current} of {progressCounts.total} scenarios processed</span>
                <span>{progressCounts.total - progressCounts.current} remaining</span>
              </div>
            )}
            <div style={{ height: '8px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '4px', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${progressPercent}%`,
                  background: 'var(--accent, #FF6B35)',
                  transition: 'width 0.15s ease',
                  boxShadow: '0 0 12px rgba(255, 107, 53, 0.6)',
                }}
              />
            </div>
          </div>
        )}

        {/* ── Evaluation Models & LLM Judge Configuration ── */}
        <div
          style={{
            background: '#0D1117',
            border: isJudgeConflicting ? '1px solid #FF4444' : '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            padding: '1.25rem',
            marginBottom: '1.25rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span>⚖️ Evaluation Models & LLM Judge</span>
              </h3>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.76rem', color: isJudgeConflicting ? '#FF6B6B' : '#8899AA' }}>
                {isJudgeConflicting
                  ? '⚠️ Configuration Error: Judge model must be different from both benchmark models.'
                  : 'Judge model must be different from both benchmark models. Reuses existing GROQ_API_KEY.'}
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem', color: '#CCCCCC', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={judgeEnabled}
                  onChange={(e) => setJudgeEnabled(e.target.checked)}
                  disabled={isRunning}
                  style={{ accentColor: 'var(--accent, #FF6B35)' }}
                />
                <span>Enable LLM Judge</span>
              </label>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
            {/* Benchmark Models Summary */}
            <div style={{ background: '#161B22', borderRadius: '6px', padding: '0.85rem', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <div style={{ fontSize: '0.72rem', color: '#8899AA', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem', fontWeight: 600 }}>
                Active Benchmark Models
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.82rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#AAAAAA' }}>Baseline:</span>
                  <span style={{ color: '#FFFFFF', fontFamily: 'monospace', fontSize: '0.78rem' }}>{effectiveBaselineModel}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#AAAAAA' }}>Candidate:</span>
                  <span style={{ color: '#FFFFFF', fontFamily: 'monospace', fontSize: '0.78rem' }}>{effectiveCandidateModel}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#AAAAAA' }}>Reasoning Effort:</span>
                  <span style={{ color: '#4E95FF', fontWeight: 600 }}>Medium</span>
                </div>
              </div>
            </div>

            {/* LLM Judge Selector & Status */}
            <div style={{ background: '#161B22', borderRadius: '6px', padding: '0.85rem', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.72rem', color: '#8899AA', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                  Independent LLM Judge
                </span>
                <span
                  style={{
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    padding: '0.15rem 0.45rem',
                    borderRadius: '4px',
                    background:
                      judgeStatus === 'AVAILABLE'
                        ? 'rgba(46, 160, 67, 0.2)'
                        : judgeStatus === 'CHECKING'
                        ? 'rgba(78, 149, 255, 0.2)'
                        : judgeStatus === 'API KEY MISSING'
                        ? 'rgba(255, 68, 68, 0.2)'
                        : 'rgba(210, 153, 34, 0.2)',
                    color:
                      judgeStatus === 'AVAILABLE'
                        ? '#3FB950'
                        : judgeStatus === 'CHECKING'
                        ? '#4E95FF'
                        : judgeStatus === 'API KEY MISSING'
                        ? '#FF6B6B'
                        : '#E3B341',
                  }}
                >
                  {judgeStatus}
                </span>
              </div>

              {judgeEnabled ? (
                <div>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.4rem' }}>
                    <select
                      value={selectedJudgeModel}
                      onChange={(e) => setSelectedJudgeModel(e.target.value)}
                      disabled={isRunning || !judgeEnabled}
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        background: '#0D1117',
                        border: isJudgeConflicting ? '1px solid #FF4444' : '1px solid rgba(255, 255, 255, 0.15)',
                        borderRadius: '6px',
                        color: '#FFFFFF',
                        fontSize: '0.82rem',
                      }}
                    >
                      {eligibleJudgeModels.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.displayName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ marginTop: '0.45rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.72rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#8899AA' }}>
                      <span>Judge: <strong style={{ color: '#FFFFFF' }}>{eligibleJudgeModels.find((m) => m.id === selectedJudgeModel)?.displayName || selectedJudgeModel}</strong></span>
                      <span>Status: <strong style={{ color: judgeStatus === 'AVAILABLE' ? '#3FB950' : judgeStatus === 'CHECKING' ? '#4E95FF' : '#FF6B6B' }}>{judgeStatus === 'CHECKING' ? 'TESTING…' : judgeStatus}</strong></span>
                    </div>
                    {judgeStatusDetails && (
                      <div style={{ color: judgeStatus === 'AVAILABLE' ? '#3FB950' : '#FF7777', fontSize: '0.72rem' }}>
                        {judgeStatusDetails}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: '0.8rem', color: '#666666', fontStyle: 'italic', padding: '0.5rem 0' }}>
                  LLM Judge is currently disabled. Evaluation will use deterministic criteria.
                </div>
              )}
            </div>

            {/* Semantic Evaluation Status */}
            <div style={{ background: '#161B22', borderRadius: '6px', padding: '0.85rem', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.72rem', color: '#8899AA', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                  Semantic Evaluation
                </span>
                <span
                  style={{
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    padding: '0.15rem 0.45rem',
                    borderRadius: '4px',
                    background: 'rgba(46, 160, 67, 0.2)',
                    color: '#3FB950',
                  }}
                >
                  Local (Configured)
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '0.76rem', color: '#CCCCCC', lineHeight: 1.4 }}>
                Local mathematical n-gram vectorization & cosine similarity analyzer. Zero external API calls.
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ fontSize: '0.8rem', color: '#8899AA', fontWeight: 600 }}>
              Test Scale:
            </span>
            <select
              value={maxCasesToRun}
              onChange={(e) => setMaxCasesToRun(Number(e.target.value))}
              disabled={isRunning}
              style={{
                padding: '0.45rem 0.8rem',
                background: '#0D1117',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '6px',
                color: '#FFFFFF',
                fontSize: '0.82rem',
              }}
            >
              <option value={0}>Full Suite ({selectedDataset?.cases?.length || 27} scenarios - Run All)</option>
              <option value={27}>Checkout Reliability Suite (27 scenarios - Required Benchmark)</option>
              <option value={100}>Enterprise Scale Benchmark (100 scenarios)</option>
              <option value={5}>Validation Smoke Test (5 scenarios)</option>
              <option value={10}>Targeted Benchmark (10 scenarios)</option>
              <option value={20}>Standard Suite (20 scenarios)</option>
              <option value={500}>High-Capacity Benchmark (500 scenarios)</option>
              <option value={1000}>Stress Benchmark (1,000 scenarios)</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontSize: '0.8rem', color: '#888888' }}>
              Will benchmark {maxCasesToRun > 0 ? maxCasesToRun : (selectedDataset?.cases?.length || 0)} scenarios
            </span>
          <button
            onClick={handleStartEvaluation}
            disabled={isRunning || !selectedDataset || isJudgeConflicting}
            style={{
              background: isRunning || isJudgeConflicting ? '#444444' : 'var(--accent, #FF6B35)',
              color: isRunning || isJudgeConflicting ? '#AAAAAA' : '#000000',
              border: 'none',
              padding: '0.75rem 2rem',
              borderRadius: '6px',
              fontSize: '0.88rem',
              fontWeight: 700,
              letterSpacing: '0.04em',
              cursor: isRunning || isJudgeConflicting ? 'not-allowed' : 'pointer',
              boxShadow: isRunning || isJudgeConflicting ? 'none' : '0 4px 15px rgba(255, 107, 53, 0.35)',
            }}
          >
            {isRunning ? 'Running Evaluation...' : 'Run Evaluation →'}
          </button>
        </div>
      </div>
    </div>

      {/* ── Historical Runs Table ── */}
      <div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#FFFFFF', marginBottom: '1rem' }}>
          Evaluation Run History ({evaluationRuns.length})
        </h2>

        <div
          style={{
            background: '#161B22',
            borderRadius: '10px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            overflowX: 'auto',
          }}
        >
          <div style={{ minWidth: '820px' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '120px 105px 1.4fr 1.1fr 85px 85px 140px 170px',
                padding: '0.8rem 1.2rem',
                background: '#0D1117',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                fontSize: '0.72rem',
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: '#888888',
                fontWeight: 600,
              }}
            >
              <div>Run ID</div>
              <div>Mode</div>
              <div>Versions / Models</div>
              <div>Dataset</div>
              <div>Accuracy</div>
              <div>Latency</div>
              <div>Recommendation</div>
              <div style={{ textAlign: 'right' }}>Actions</div>
            </div>

            {evaluationRuns.length === 0 ? (
              <div
                style={{
                  padding: '3.5rem 1.5rem',
                  textAlign: 'center',
                  color: '#888888',
                }}
              >
                <div style={{ fontSize: '2rem', marginBottom: '0.6rem' }}>⏱</div>
                <div style={{ fontSize: '1.05rem', fontWeight: 600, color: '#FFFFFF', marginBottom: '0.4rem' }}>
                  No Evaluation Runs Executed Yet
                </div>
                <div style={{ fontSize: '0.85rem', color: '#8899AA', maxWidth: '440px', margin: '0 auto', lineHeight: 1.5 }}>
                  Configure your baseline and candidate models above, select a test dataset, and trigger your first comparative evaluation.
                </div>
              </div>
            ) : (
              evaluationRuns.map((run) => {
                if (!run) return null;
                const report = run.comparisonReport;
                const isReg = Boolean(run.regressionDecision?.isRegression);
                const rec = report?.recommendation || (isReg ? 'BLOCK RELEASE' : 'NO REGRESSION');

            return (
              <div
                key={run.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '120px 105px 1.4fr 1.1fr 85px 85px 140px 170px',
                  padding: '1rem 1.2rem',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                  fontSize: '0.82rem',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div style={{ fontFamily: 'monospace', color: '#FFFFFF', fontWeight: 600 }}>
                    {run.id.slice(0, 12)}
                  </div>
                  <div style={{ fontSize: '0.7rem', color: '#888888' }}>
                    {new Date(run.timestamp).toLocaleDateString()} {new Date(run.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>

                <div>
                  {(() => {
                    const mode = run.executionMode || run.comparisonReport?.executionMode || 'SAVED';
                    const isLive = mode === 'LIVE';
                    const isRef = mode === 'REFERENCE';
                    const color = isLive ? '#10B981' : isRef ? '#A78BFA' : '#38BDF8';
                    const bg = isLive ? 'rgba(16, 185, 129, 0.15)' : isRef ? 'rgba(167, 139, 250, 0.15)' : 'rgba(56, 189, 248, 0.15)';
                    const border = isLive ? 'rgba(16, 185, 129, 0.4)' : isRef ? 'rgba(167, 139, 250, 0.4)' : 'rgba(56, 189, 248, 0.4)';
                    const label = isLive ? 'LIVE' : isRef ? 'REFERENCE' : 'SAVED';

                    return (
                      <span
                        style={{
                          fontSize: '0.66rem',
                          padding: '0.15rem 0.45rem',
                          borderRadius: '4px',
                          background: bg,
                          color,
                          border: `1px solid ${border}`,
                          fontWeight: 800,
                          letterSpacing: '0.06em',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.3rem',
                        }}
                      >
                        {isLive && (
                          <span
                            style={{
                              width: '5px',
                              height: '5px',
                              borderRadius: '50%',
                              background: '#10B981',
                              boxShadow: '0 0 5px #10B981',
                            }}
                          />
                        )}
                        {label}
                      </span>
                    );
                  })()}
                </div>

                <div>
                  <div style={{ color: '#CCCCCC', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem', borderRadius: '3px', background: 'rgba(46, 204, 113, 0.15)', color: '#2ECC71', fontWeight: 700 }}>
                      {(run.baselineVersion?.provider || 'BASELINE').toUpperCase()}
                    </span>
                    <span>{run.baselineVersion?.name || 'Baseline'}</span>
                  </div>
                  <div style={{ color: '#4DA6FF', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem' }}>
                    <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem', borderRadius: '3px', background: 'rgba(77, 166, 255, 0.15)', color: '#4DA6FF', fontWeight: 700 }}>
                      {(run.candidateVersion?.provider || 'CANDIDATE').toUpperCase()}
                    </span>
                    <span>{run.candidateVersion?.name || 'Candidate'}</span>
                  </div>
                </div>

                <div style={{ color: '#AAAAAA' }}>{run.datasetName || 'Dataset'}</div>

                <div>
                  <div style={{ color: isReg ? '#FF4422' : run.metrics?.candidateAccuracy !== null && run.metrics?.candidateAccuracy !== undefined ? '#2ECC71' : '#888888', fontWeight: 700, fontSize: '0.9rem' }}>
                    {run.metrics?.candidateAccuracy !== null && run.metrics?.candidateAccuracy !== undefined ? `${run.metrics.candidateAccuracy}%` : '—'}
                  </div>
                  {run.metrics?.accuracyDelta !== null && run.metrics?.accuracyDelta !== undefined ? (
                    <div style={{ fontSize: '0.7rem', color: run.metrics.accuracyDelta < 0 ? '#FF4422' : '#2ECC71' }}>
                      {run.metrics.accuracyDelta > 0 ? `+${run.metrics.accuracyDelta}%` : `${run.metrics.accuracyDelta}%`}
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.7rem', color: '#888888' }}>—</div>
                  )}
                </div>

                <div style={{ color: '#DDDDDD' }}>
                  {run.metrics?.candidateAvgLatencyMs !== null && run.metrics?.candidateAvgLatencyMs !== undefined ? `${run.metrics.candidateAvgLatencyMs}ms` : '—'}
                </div>

                <div>
                  {(() => {
                    const isShip = rec === 'SHIP' || rec === 'NO REGRESSION';
                    const isBlock = rec === 'BLOCK RELEASE' || rec === 'BLOCK' || rec === 'REGRESSION DETECTED';
                    const isCond = rec === 'SHIP WITH CONDITIONS';
                    const isInsuff = rec === 'INSUFFICIENT EVIDENCE' || rec === 'INSUFFICIENT_EVIDENCE';
                    const badgeBg = isShip
                      ? 'rgba(46, 204, 113, 0.15)'
                      : isBlock
                      ? 'rgba(255, 51, 17, 0.15)'
                      : isCond
                      ? 'rgba(243, 156, 18, 0.15)'
                      : isInsuff
                      ? 'rgba(245, 158, 11, 0.15)'
                      : 'rgba(77, 166, 255, 0.15)';
                    const badgeColor = isShip
                      ? '#2ECC71'
                      : isBlock
                      ? '#FF4422'
                      : isCond
                      ? '#F39C12'
                      : isInsuff
                      ? '#F59E0B'
                      : '#4DA6FF';
                    const badgeBorder = isShip
                      ? '#2ECC71'
                      : isBlock
                      ? '#FF3311'
                      : isCond
                      ? '#F39C12'
                      : isInsuff
                      ? '#F59E0B'
                      : '#4DA6FF';
                    const evidence = report?.evidenceStrength || run.metrics?.evidenceStrength;

                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-start' }}>
                        <span
                          style={{
                            padding: '0.25rem 0.55rem',
                            borderRadius: '4px',
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            background: badgeBg,
                            color: badgeColor,
                            border: `1px solid ${badgeBorder}`,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {rec}
                        </span>
                        {evidence && (
                          <span
                            style={{
                              fontSize: '0.62rem',
                              fontWeight: 700,
                              color: evidence === 'STRONG' ? '#10B981' : evidence === 'GOOD' ? '#38BDF8' : evidence === 'MODERATE' ? '#F59E0B' : '#EF4444',
                              letterSpacing: '0.04em',
                            }}
                          >
                            EV: {evidence}
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem' }}>
                  {report && (
                    <button
                      onClick={() => handleOpenReport(run)}
                      style={{
                        background: 'rgba(77, 166, 255, 0.12)',
                        border: '1px solid #4DA6FF',
                        color: '#4DA6FF',
                        padding: '0.3rem 0.6rem',
                        borderRadius: '4px',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Report
                    </button>
                  )}
                  <button
                    onClick={() => {
                      onSelectActiveRun(run);
                      navigate('#/app/regressions');
                    }}
                    style={{
                      background: 'rgba(255, 107, 53, 0.12)',
                      border: '1px solid var(--accent, #FF6B35)',
                      color: 'var(--accent, #FF6B35)',
                      padding: '0.3rem 0.6rem',
                      borderRadius: '4px',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Failures
                  </button>
                  {evaluationRuns.length > 1 && (
                    <button
                      onClick={() => onDeleteRun(run.id)}
                      title="Delete run"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#666666',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                        padding: '0 0.3rem',
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
          </div>
        </div>
      </div>

      {/* ── Comparison Report Modal ── */}
      {activeReport && (
        <ComparisonReportModal
          report={activeReport}
          onClose={() => setActiveReport(null)}
        />
      )}

      {/* ── Live Evaluation Running Modal ── */}
      <EvaluationProgressModal
        isOpen={isProgressModalOpen}
        datasetName={selectedDataset?.name || 'Benchmark Dataset'}
        totalScenarios={maxCasesToRun > 0 ? maxCasesToRun : (selectedDataset?.cases?.length || 27)}
        baselineModel={`${effectiveBaselineModel} (${configMode === 'custom_benchmark' ? customBaselineProvider : baselineVersion?.provider || 'default'})`}
        candidateModel={`${effectiveCandidateModel} (${configMode === 'custom_benchmark' ? customCandidateProvider : candidateVersion?.provider || 'default'})`}
        judgeModel={selectedJudgeModel}
        judgeEnabled={judgeEnabled}
        semanticStatus="ACTIVE"
        progressPercent={progressPercent}
        progressCounts={progressCounts}
        currentStageText={currentProgressText}
        caseName={currentCaseName}
        phase={currentPhase}
        runId={currentRunId}
        error={evaluationError}
        onCancel={() => {
          isCancelledRef.current = true;
          setIsRunning(false);
          setIsProgressModalOpen(false);
          setEvaluationError(null);
        }}
        onRetry={() => {
          setEvaluationError(null);
          handleStartEvaluation();
        }}
      />
    </div>
  );
};
