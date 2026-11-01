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
import { LiveEvaluationHUD } from '../components/LiveEvaluationHUD';
import { DatasetUploadPanel } from '../components/DatasetUploadPanel';
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
  activeDatasetId?: string;
  versions: ModelVersion[];
  evaluationRuns: EvaluationRun[];
  onSaveRun: (run: EvaluationRun) => Promise<void>;
  onDeleteRun: (runId: string) => Promise<void>;
  onSelectActiveRun: (run: EvaluationRun) => void;
  onDatasetImported?: (dataset: Dataset) => Promise<void>;
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
  activeDatasetId,
  versions,
  evaluationRuns,
  onSaveRun,
  onDeleteRun,
  onSelectActiveRun,
  onDatasetImported,
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

  // Initial dataset selection helper (prioritize activeDatasetId, then golden suite or populated dataset)
  const selectInitialDataset = (dsets: Dataset[]): string => {
    if (!dsets || dsets.length === 0) return '';
    if (activeDatasetId && dsets.some((d) => d.id === activeDatasetId)) return activeDatasetId;
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
  }, [datasets, selectedDatasetId, activeDatasetId]);

  const [baselineVersionId, setBaselineVersionId] = useState<string>(project?.baselineVersionId || versions?.[0]?.id || '');
  const [candidateVersionId, setCandidateVersionId] = useState<string>(project?.candidateVersionId || versions?.[1]?.id || versions?.[0]?.id || '');

  // Selection states (Mode 2: Cross-Provider Benchmark - Default: Groq openai/gpt-oss-20b vs openai/gpt-oss-120b)
  const [customBaselineProvider, setCustomBaselineProvider] = useState<ProviderType>('groq');
  const [customBaselineModel, setCustomBaselineModel] = useState<string>('openai/gpt-oss-20b');
  const [customBaselinePrompt, setCustomBaselinePrompt] = useState<string>(CHECKOUT_RELIABILITY_SYSTEM_PROMPT);
  const [customBaselineTemp, setCustomBaselineTemp] = useState<number>(0.2);
  const [customBaselineReasoningEffort, setCustomBaselineReasoningEffort] = useState<'low' | 'medium' | 'high'>('low');

  const [customCandidateProvider, setCustomCandidateProvider] = useState<ProviderType>('groq');
  const [customCandidateModel, setCustomCandidateModel] = useState<string>('openai/gpt-oss-120b');
  const [customCandidatePrompt, setCustomCandidatePrompt] = useState<string>(CHECKOUT_RELIABILITY_SYSTEM_PROMPT);
  const [customCandidateTemp, setCustomCandidateTemp] = useState<number>(0.2);
  const [customCandidateReasoningEffort, setCustomCandidateReasoningEffort] = useState<'low' | 'medium' | 'high'>('low');

  // Execution states
  const [isRunning, setIsRunning] = useState(false);
  const [isProgressModalOpen, setIsProgressModalOpen] = useState(false);
  const isCancelledRef = useRef(false);
  const [maxCasesToRun, setMaxCasesToRun] = useState<number>(5);
  const [progressPercent, setProgressPercent] = useState(0);
  const [currentProgressText, setCurrentProgressText] = useState('');
  const [currentCaseName, setCurrentCaseName] = useState<string>('');
  const [currentPhase, setCurrentPhase] = useState<string>('Initializing');
  const [progressCounts, setProgressCounts] = useState<{ current: number; total: number } | null>(null);
  const [throughput, setThroughput] = useState<number>(0);
  const [avgLatency, setAvgLatency] = useState<number>(0);
  const [retriesCount, setRetriesCount] = useState<number>(0);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [currentRunId, setCurrentRunId] = useState<string | null>(null);
  const [completedScenarios, setCompletedScenarios] = useState<string[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);

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

  // Deduplicate user-uploaded datasets by name so duplicate versions (e.g. v1.0.0 and v1.1.0) don't clutter the selector
  const selectableDatasets = useMemo(() => {
    const uploadMap = new Map<string, Dataset>();
    const builtins: Dataset[] = [];

    for (const d of datasets) {
      if (d.sourceType === 'upload') {
        const existing = uploadMap.get(d.name);
        if (!existing) {
          uploadMap.set(d.name, d);
        } else {
          // Keep newest by date or higher version number
          const existingDate = existing.updatedAt || existing.createdAt || '';
          const currentDate = d.updatedAt || d.createdAt || '';
          if (currentDate >= existingDate) {
            uploadMap.set(d.name, d);
          }
        }
      } else {
        builtins.push(d);
      }
    }

    return [...builtins, ...Array.from(uploadMap.values())].sort(
      (a, b) => (a.cases?.length || 0) - (b.cases?.length || 0)
    );
  }, [datasets]);

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
        maxTokens: 1024,
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
        maxTokens: 1024,
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
    setThroughput(0);
    setAvgLatency(0);
    setRetriesCount(0);
    setCurrentCaseName('');
    setCompletedScenarios([]);
    setElapsedSeconds(0);
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
      } else if (maxCasesToRun > 0 && selectedDataset?.cases && selectedDataset.cases.length > maxCasesToRun) {
        datasetToEvaluate = {
          ...selectedDataset,
          cases: selectedDataset.cases.slice(0, maxCasesToRun),
        };
      }

      const activeCaseCount = maxCasesToRun > 0
        ? Math.min(maxCasesToRun, datasetToEvaluate?.cases?.length || maxCasesToRun)
        : (datasetToEvaluate?.cases?.length || 27);

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
          maxTokens: 256,
        } : undefined,
        regressionSettings: {
          ...project.regressionSettings,
          requiredBenchmarkCases: activeCaseCount,
        },
        maxCases: maxCasesToRun > 0 ? maxCasesToRun : undefined,
        concurrency: 8,
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

        await new Promise((res) => setTimeout(res, 250));

        if (isCancelledRef.current) {
          setIsRunning(false);
          setIsProgressModalOpen(false);
          return;
        }

        const statusRes = await fetch(`/api/evaluations/status/${runId}`);
        if (statusRes.ok) {
          const statusData = await statusRes.json();
          if (statusData.progress) {
            const { current, total, caseName, percent, throughputCasesPerSec, averageLatencyMs, retriesCount: rCount } = statusData.progress;
            setProgressPercent(percent);
            setProgressCounts({ current, total });
            if (typeof throughputCasesPerSec === 'number') setThroughput(throughputCasesPerSec);
            if (typeof averageLatencyMs === 'number') setAvgLatency(averageLatencyMs);
            if (typeof rCount === 'number') setRetriesCount(rCount);
            if (caseName) {
              setCurrentCaseName((prev) => {
                if (prev && prev !== caseName) {
                  setCompletedScenarios((list) => list.includes(prev) ? list : [...list, prev]);
                }
                return caseName;
              });
            }
            const activePhase = judgeEnabled ? 'Semantic Evaluation + LLM Judge' : 'Semantic Criteria Evaluation';
            setCurrentPhase(activePhase);
            setCurrentProgressText(
              caseName ? `Evaluating scenario ${current}/${total}: ${caseName}` : `Processing scenario ${current}/${total}`
            );
          }

          if (statusData.status === 'COMPLETED' && statusData.run) {
            run = statusData.run;
            completed = true;
            const finalCaseName = statusData.progress?.caseName || currentCaseName;
            if (finalCaseName) {
              setCompletedScenarios((list) => list.includes(finalCaseName) ? list : [...list, finalCaseName]);
            }
          } else if (statusData.status === 'FAILED') {
            throw new Error(statusData.error || 'Server evaluation execution failed');
          }
        } else {
          const errText = await statusRes.text().catch(() => '');
          throw new Error(`Failed to check evaluation status (${statusRes.status}): ${errText}`);
        }
      }

      if (run) {
        onSelectActiveRun(run);
        setIsRunning(false);
        setIsProgressModalOpen(false);
        if (run.comparisonReport) {
          triggerTransition(() => {
            setActiveReport(run.comparisonReport || null);
          });
        }
        await onSaveRun(run);
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '1440px', margin: '0 auto' }}>
      {/* ── Page Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ fontSize: '0.68rem', fontFamily: 'monospace', letterSpacing: '0.12em', color: '#60A5FA', fontWeight: 700, textTransform: 'uppercase' }}>
            HARNESS // MULTI-PROVIDER BENCHMARK
          </div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#F2F2F2', margin: '0.2rem 0 0.35rem 0', letterSpacing: '-0.02em' }}>
            Comparative Evaluation Harness
          </h1>
          <p style={{ color: '#858585', fontSize: '0.82rem', margin: 0, maxWidth: '680px', lineHeight: 1.5 }}>
            Execute parallel comparative benchmarks across real AI providers against identical datasets. Enforces strict release gate rules with independent Qwen 3.8B judging.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={() => navigate('#/app/history')}
            style={{
              background: '#ADC0D6',
              border: '1px solid #ADC0D6',
              color: '#0A1A35',
              padding: '0.45rem 0.85rem',
              borderRadius: '2px',
              fontSize: '0.75rem',
              fontFamily: 'monospace',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'background 0.15s ease, border-color 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#C5D4E5';
              e.currentTarget.style.borderColor = '#C5D4E5';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#ADC0D6';
              e.currentTarget.style.borderColor = '#ADC0D6';
            }}
          >
            RUN AUDIT LOG ({evaluationRuns.length})
          </button>
        </div>
      </div>

      {/* ── Provider Readiness Bar ── */}
      <div
        style={{
          background: '#151515',
          border: '1px solid #292929',
          borderRadius: '2px',
          padding: '0.75rem 1.1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.8rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ fontSize: '0.72rem', fontFamily: 'monospace', fontWeight: 700, color: '#F2F2F2', textTransform: 'uppercase' }}>
            Provider Endpoints:
          </span>
          <span style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: '#555555' }}>
            (Render Gateway Proxies)
          </span>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {/* Demo */}
          <span style={{ fontSize: '0.68rem', fontFamily: 'monospace', padding: '0.2rem 0.5rem', borderRadius: '2px', background: '#13241A', color: '#22C55E', border: '1px solid rgba(34, 197, 94, 0.28)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#22C55E' }} />
            DEMO: READY
          </span>

          {/* Gemini */}
          <span
            style={{
              fontSize: '0.68rem',
              fontFamily: 'monospace',
              padding: '0.2rem 0.5rem',
              borderRadius: '2px',
              background: serverStatus.gemini ? '#13241A' : '#1B1B1B',
              color: serverStatus.gemini ? '#22C55E' : '#555555',
              border: serverStatus.gemini ? '1px solid rgba(34, 197, 94, 0.28)' : '1px solid #292929',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: serverStatus.gemini ? '#22C55E' : '#3A3A3A' }} />
            GEMINI: {serverStatus.gemini ? 'LIVE' : 'OFFLINE'}
          </span>

          {/* OpenAI */}
          <span
            style={{
              fontSize: '0.68rem',
              fontFamily: 'monospace',
              padding: '0.2rem 0.5rem',
              borderRadius: '2px',
              background: serverStatus.openai ? '#13241A' : '#1B1B1B',
              color: serverStatus.openai ? '#22C55E' : '#555555',
              border: serverStatus.openai ? '1px solid rgba(34, 197, 94, 0.28)' : '1px solid #292929',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: serverStatus.openai ? '#22C55E' : '#3A3A3A' }} />
            OPENAI: {serverStatus.openai ? 'LIVE' : 'OFFLINE'}
          </span>

          {/* Claude */}
          <span
            style={{
              fontSize: '0.68rem',
              fontFamily: 'monospace',
              padding: '0.2rem 0.5rem',
              borderRadius: '2px',
              background: serverStatus.anthropic ? '#13241A' : '#1B1B1B',
              color: serverStatus.anthropic ? '#22C55E' : '#555555',
              border: serverStatus.anthropic ? '1px solid rgba(34, 197, 94, 0.28)' : '1px solid #292929',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: serverStatus.anthropic ? '#22C55E' : '#3A3A3A' }} />
            CLAUDE: {serverStatus.anthropic ? 'LIVE' : 'OFFLINE'}
          </span>

          {/* Groq */}
          <span
            style={{
              fontSize: '0.68rem',
              fontFamily: 'monospace',
              padding: '0.2rem 0.5rem',
              borderRadius: '2px',
              background: serverStatus.groq ? '#13241A' : '#1B1B1B',
              color: serverStatus.groq ? '#22C55E' : '#555555',
              border: serverStatus.groq ? '1px solid rgba(34, 197, 94, 0.28)' : '1px solid #292929',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: serverStatus.groq ? '#22C55E' : '#3A3A3A' }} />
            GROQ: {serverStatus.groq ? 'LIVE' : 'OFFLINE'}
          </span>

          {/* Cerebras */}
          <span
            style={{
              fontSize: '0.68rem',
              fontFamily: 'monospace',
              padding: '0.2rem 0.5rem',
              borderRadius: '2px',
              background: serverStatus.cerebras ? '#13241A' : '#1B1B1B',
              color: serverStatus.cerebras ? '#22C55E' : '#555555',
              border: serverStatus.cerebras ? '1px solid rgba(34, 197, 94, 0.28)' : '1px solid #292929',
              fontWeight: 700,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: serverStatus.cerebras ? '#22C55E' : '#3A3A3A' }} />
            CEREBRAS: {serverStatus.cerebras ? 'LIVE' : 'OFFLINE'}
          </span>
        </div>
      </div>

      {/* ── Evaluation Launch Configuration Card ── */}
      <div
        style={{
          background: '#151515',
          borderRadius: '2px',
          border: '1px solid #292929',
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, color: '#F2F2F2', fontSize: '1.1rem', fontWeight: 700 }}>
              Configure Comparative Run
            </h3>
            <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#858585' }}>
              Baseline model on left, Candidate model on right. Evaluated simultaneously across identical cases.
            </span>
          </div>

          {/* Mode Switcher */}
          <div style={{ display: 'flex', background: '#111111', padding: '0.2rem', borderRadius: '2px', border: '1px solid #292929' }}>
            <button
              onClick={() => setConfigMode('saved_versions')}
              style={{
                background: configMode === 'saved_versions' ? '#ADC0D6' : 'transparent',
                border: configMode === 'saved_versions' ? '1px solid #ADC0D6' : '1px solid transparent',
                color: configMode === 'saved_versions' ? '#0A1A35' : '#858585',
                padding: '0.35rem 0.75rem',
                borderRadius: '2px',
                fontSize: '0.75rem',
                fontFamily: 'monospace',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'background 0.15s ease, color 0.15s ease',
              }}
            >
              Saved Versions
            </button>
            <button
              onClick={() => setConfigMode('custom_benchmark')}
              style={{
                background: configMode === 'custom_benchmark' ? '#ADC0D6' : 'transparent',
                border: configMode === 'custom_benchmark' ? '1px solid #ADC0D6' : '1px solid transparent',
                color: configMode === 'custom_benchmark' ? '#0A1A35' : '#858585',
                padding: '0.35rem 0.85rem',
                borderRadius: '2px',
                fontSize: '0.75rem',
                fontFamily: 'monospace',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'background 0.15s ease, color 0.15s ease',
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
              background: '#261414',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: '2px',
              padding: '0.8rem 1.1rem',
              color: '#EF4444',
              fontSize: '0.8rem',
              fontFamily: 'monospace',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span>⚠</span>
              <span>{evaluationError}</span>
            </div>
            <button
              onClick={() => setEvaluationError(null)}
              style={{
                background: 'none',
                border: 'none',
                color: '#EF4444',
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
            >
              ✕
            </button>
          </div>
        )}

        {/* ── Active Benchmark Overview Bar ── */}
        <div
          style={{
            background: '#1B1B1B',
            border: '1px solid #292929',
            borderRadius: '2px',
            padding: '0.85rem 1.1rem',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1rem',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: '#858585', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <span>ACTIVE SUITE</span>
              <span
                style={{
                  fontSize: '0.6rem',
                  padding: '0.08rem 0.35rem',
                  borderRadius: '2px',
                  fontWeight: 700,
                  background: '#151515',
                  color: '#858585',
                  border: '1px solid #292929',
                }}
              >
                {selectedDataset?.sourceType === 'upload' ? 'USER UPLOAD' : 'BUILT-IN'}
              </span>
            </div>
            <div style={{ fontSize: '0.88rem', color: '#F2F2F2', fontWeight: 700, marginTop: '0.2rem' }}>
              {selectedDataset?.name || 'Checkout Reliability Suite'}
            </div>
            <div style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: '#60A5FA', fontWeight: 600 }}>
              {selectedDataset?.cases?.length || 27} scenarios ({selectedDataset?.cases?.filter((c) => Boolean(c.expectedOutput && c.expectedOutput.trim())).length ?? (selectedDataset?.cases?.length || 0)} reference criteria)
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: '#858585', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Baseline Model (Left — {configMode === 'custom_benchmark' ? customBaselineProvider.toUpperCase() : (baselineVersion?.provider?.toUpperCase() || 'DEMO')})
            </div>
            <div style={{ fontSize: '0.82rem', color: '#F2F2F2', fontFamily: 'monospace', fontWeight: 600, marginTop: '0.2rem' }}>
              {effectiveBaselineModel}
            </div>
            <div style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: '#22C55E', fontWeight: 600 }}>
              Reference Anchor
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: '#858585', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Candidate Model (Right — {configMode === 'custom_benchmark' ? customCandidateProvider.toUpperCase() : (candidateVersion?.provider?.toUpperCase() || 'DEMO')})
            </div>
            <div style={{ fontSize: '0.82rem', color: '#F2F2F2', fontFamily: 'monospace', fontWeight: 600, marginTop: '0.2rem' }}>
              {effectiveCandidateModel}
            </div>
            <div style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: '#60A5FA', fontWeight: 600 }}>
              Evaluation Target
            </div>
          </div>
        </div>

        {/* ── Live Evaluation Progress Card (Plain-Language Non-Technical HUD) ── */}
        {isRunning && (
          <div
            style={{
              background: '#0A1A35',
              border: '1px solid #1E3A8A',
              borderRadius: '8px',
              padding: '1.2rem 1.4rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.9rem',
              animation: 'fadeIn 0.3s ease',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span
                  style={{
                    display: 'inline-block',
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: '#60A5FA',
                  }}
                />
                <span style={{ fontSize: '0.85rem', fontWeight: 800, letterSpacing: '0.12em', color: '#ECEFF2', textTransform: 'uppercase' }}>
                  EVALUATION PROGRESS
                </span>
              </div>
              <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#60A5FA', fontFamily: 'monospace' }}>
                {progressPercent}% COMPLETE
              </span>
            </div>

            {/* Progress bar */}
            <div
              style={{
                width: '100%',
                height: '6px',
                background: 'rgba(255, 255, 255, 0.08)',
                borderRadius: '3px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${Math.max(4, Math.min(100, progressPercent))}%`,
                  background: '#1E3A8A',
                  borderRadius: '3px',
                  transition: 'width 0.4s ease-out',
                }}
              />
            </div>

            {/* Status numbers: Completed, Remaining, Elapsed, Stage */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '0.8rem',
                fontSize: '0.82rem',
                color: '#8899AA',
              }}
            >
              <div>
                <span style={{ color: '#667788', display: 'block', fontSize: '0.72rem', textTransform: 'uppercase' }}>Completed</span>
                <strong style={{ color: '#FFFFFF', fontSize: '0.95rem' }}>
                  {progressCounts?.current ?? 0} of {progressCounts?.total ?? (selectedDataset?.cases?.length || 100)}
                </strong>
              </div>
              <div>
                <span style={{ color: '#667788', display: 'block', fontSize: '0.72rem', textTransform: 'uppercase' }}>Remaining</span>
                <strong style={{ color: '#FFFFFF', fontSize: '0.95rem' }}>
                  {Math.max(0, (progressCounts?.total ?? (selectedDataset?.cases?.length || 100)) - (progressCounts?.current ?? 0))}
                </strong>
              </div>
              <div>
                <span style={{ color: '#667788', display: 'block', fontSize: '0.72rem', textTransform: 'uppercase' }}>Elapsed Time</span>
                <strong style={{ color: '#FFFFFF', fontSize: '0.95rem', fontFamily: 'monospace' }}>
                  {Math.floor(elapsedSeconds / 60)}:{(elapsedSeconds % 60).toString().padStart(2, '0')}
                </strong>
              </div>
              <div>
                <span style={{ color: '#667788', display: 'block', fontSize: '0.72rem', textTransform: 'uppercase' }}>Current Stage</span>
                <strong style={{ color: '#4DA6FF', fontSize: '0.85rem' }}>
                  Evaluating response against criteria
                </strong>
              </div>
            </div>

            {/* Currently checking scenario */}
            {currentCaseName && (
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '6px',
                  padding: '0.65rem 0.85rem',
                  fontSize: '0.85rem',
                  color: '#ECECEC',
                }}
              >
                <span style={{ color: '#8899AA', fontWeight: 600, marginRight: '0.4rem' }}>Currently checking:</span>
                <strong>{currentCaseName}</strong>
              </div>
            )}

            {/* Completed scenarios checklist */}
            {completedScenarios.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', maxHeight: '130px', overflowY: 'auto' }}>
                <span style={{ fontSize: '0.72rem', color: '#8899AA', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
                  Completed Scenarios:
                </span>
                {completedScenarios.slice(-5).map((name, idx) => (
                  <div key={idx} style={{ fontSize: '0.82rem', color: '#2ECC71', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <span>✓</span>
                    <span style={{ color: '#C0D0E0' }}>{name} complete</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Dataset Selector & Inline Dataset Upload Panel ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.8rem', color: '#E8E4D9', fontWeight: 600, marginBottom: '0.4rem' }}>
              Evaluation Dataset (Identical Test Suite for Both Models)
            </label>
            <select
              value={selectedDatasetId}
              onChange={(e) => {
                const nextId = e.target.value;
                setSelectedDatasetId(nextId);
                setEvaluationError(null);
                const nextDs = datasets.find((d) => d.id === nextId);
                if (nextDs && (nextDs.sourceType === 'upload' || (nextDs.cases?.length || 0) < 27)) {
                  setMaxCasesToRun(0); // Default to Full Suite (Run All) for user-uploaded or smaller datasets
                }
              }}
              disabled={isRunning}
              style={{
                width: '100%',
                padding: '0.65rem',
                background: '#111111',
                border: '1px solid #292929',
                borderRadius: '2px',
                color: '#F2F2F2',
                fontSize: '0.82rem',
                fontFamily: 'monospace',
              }}
            >
              {selectableDatasets.map((d) => {
                const badge = d.sourceType === 'upload' ? '[USER UPLOAD' : '[BUILT-IN';
                return (
                  <option key={d.id} value={d.id}>
                    {badge} v{d.version || '1.0.0'}] {d.name} ({d.cases?.length || 0} scenarios) — {d.description}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Inline Dataset Upload Panel (.json, .jsonl, .ndjson, .csv) */}
          <DatasetUploadPanel
            projectId={project?.id || 'proj-checkout-agent'}
            existingDatasets={datasets}
            onDatasetImported={async (importedDs) => {
              if (onDatasetImported) {
                await onDatasetImported(importedDs);
              }
              setSelectedDatasetId(importedDs.id);
              setMaxCasesToRun(0);
              setEvaluationError(null);
            }}
          />
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
                  padding: '0.55rem 0.75rem',
                  background: '#151515',
                  border: '1px solid #292929',
                  borderRadius: '2px',
                  color: '#F2F2F2',
                  fontSize: '0.82rem',
                  fontFamily: 'monospace',
                }}
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
              <div style={{ marginTop: '0.35rem', fontSize: '0.72rem', color: '#888888', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ textTransform: 'uppercase', color: '#858585', fontWeight: 600 }}>{baselineVersion?.provider}</span>
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
                  padding: '0.55rem 0.75rem',
                  background: '#151515',
                  border: '1px solid #292929',
                  borderRadius: '2px',
                  color: '#F2F2F2',
                  fontSize: '0.82rem',
                  fontFamily: 'monospace',
                }}
              >
                {versions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
              <div style={{ marginTop: '0.35rem', fontSize: '0.72rem', color: '#888888', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ textTransform: 'uppercase', color: '#858585', fontWeight: 600 }}>{candidateVersion?.provider}</span>
                <span>•</span>
                <span style={{ fontFamily: 'monospace' }}>{candidateVersion?.modelIdentifier}</span>
              </div>
            </div>
          </div>
        ) : (
          /* ── Mode 2: Cross-Provider Benchmark / Custom Comparator ── */
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            {/* Baseline Configuration Panel */}
            <div style={{ background: '#0F0F0F', padding: '1.25rem', borderRadius: '2px', border: '1px solid #292929', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#F2F2F2', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
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
                  style={{ width: '100%', padding: '0.55rem 0.75rem', background: '#151515', border: '1px solid #292929', borderRadius: '2px', color: '#F2F2F2', fontSize: '0.82rem', fontFamily: 'monospace' }}
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
                  style={{ width: '100%', padding: '0.55rem 0.75rem', background: '#151515', border: '1px solid #292929', borderRadius: '2px', color: '#F2F2F2', fontSize: '0.82rem', fontFamily: 'monospace' }}
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
                    style={{ width: '100%', padding: '0.55rem 0.75rem', background: '#151515', border: '1px solid #292929', borderRadius: '2px', color: '#F2F2F2', fontSize: '0.82rem', fontFamily: 'monospace' }}
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
                  rows={8}
                  value={customBaselinePrompt}
                  onChange={(e) => setCustomBaselinePrompt(e.target.value)}
                  style={{
                    width: '100%',
                    height: '175px',
                    padding: '0.65rem 0.8rem',
                    background: '#151515',
                    border: '1px solid #292929',
                    borderRadius: '4px',
                    color: '#F2F2F2',
                    fontSize: '0.8rem',
                    fontFamily: 'var(--font-mono, monospace)',
                    lineHeight: 1.5,
                    resize: 'vertical',
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    scrollbarWidth: 'thin',
                    scrollbarColor: '#3A3A3A #151515',
                  }}
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
            <div style={{ background: '#0F0F0F', padding: '1.25rem', borderRadius: '2px', border: '1px solid #292929', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#F2F2F2', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
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
                  style={{ width: '100%', padding: '0.55rem 0.75rem', background: '#151515', border: '1px solid #292929', borderRadius: '2px', color: '#F2F2F2', fontSize: '0.82rem', fontFamily: 'monospace' }}
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
                  style={{ width: '100%', padding: '0.55rem 0.75rem', background: '#151515', border: '1px solid #292929', borderRadius: '2px', color: '#F2F2F2', fontSize: '0.82rem', fontFamily: 'monospace' }}
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
                    style={{ width: '100%', padding: '0.55rem 0.75rem', background: '#151515', border: '1px solid #292929', borderRadius: '2px', color: '#F2F2F2', fontSize: '0.82rem', fontFamily: 'monospace' }}
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
                  rows={8}
                  value={customCandidatePrompt}
                  onChange={(e) => setCustomCandidatePrompt(e.target.value)}
                  style={{
                    width: '100%',
                    height: '175px',
                    padding: '0.65rem 0.8rem',
                    background: '#151515',
                    border: '1px solid #292929',
                    borderRadius: '4px',
                    color: '#F2F2F2',
                    fontSize: '0.8rem',
                    fontFamily: 'var(--font-mono, monospace)',
                    lineHeight: 1.5,
                    resize: 'vertical',
                    overflowY: 'auto',
                    overflowX: 'hidden',
                    scrollbarWidth: 'thin',
                    scrollbarColor: '#3A3A3A #151515',
                  }}
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
                      background: '#0A1A35',
                      color: '#60A5FA',
                      padding: '0.15rem 0.5rem',
                      borderRadius: '4px',
                      fontFamily: 'monospace',
                    }}
                  >
                    Run ID: {currentRunId}
                  </span>
                )}
              </div>
              <span style={{ color: '#60A5FA', fontWeight: 800 }}>{progressPercent}%</span>
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
                  background: '#1E3A8A',
                  transition: 'width 0.15s ease',
                }}
              />
            </div>
          </div>
        )}

        {/* ── Evaluation Models & LLM Judge Configuration ── */}
        <div
          style={{
            background: '#1B1B1B',
            border: isJudgeConflicting ? '1px solid #EF4444' : '1px solid #292929',
            borderRadius: '2px',
            padding: '1.25rem',
            marginBottom: '1.25rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 700, color: '#F2F2F2', display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'monospace' }}>
                <span>[INDEPENDENT ARBITRATION] LLM Judge Configuration</span>
              </h3>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.74rem', fontFamily: 'monospace', color: isJudgeConflicting ? '#EF4444' : '#858585' }}>
                {isJudgeConflicting
                  ? 'Configuration Conflict: Judge model cannot match either benchmark model.'
                  : 'Independent evaluation duty using Qwen 3.8B. Eliminates provider self-bias.'}
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', fontFamily: 'monospace', color: '#F2F2F2', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={judgeEnabled}
                  onChange={(e) => setJudgeEnabled(e.target.checked)}
                  disabled={isRunning}
                  style={{ accentColor: '#2563EB' }}
                />
                <span>Enable Independent Judge</span>
              </label>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
            {/* Benchmark Models Summary */}
            <div style={{ background: '#14181F', borderRadius: '6px', padding: '0.85rem', border: '1px solid rgba(255, 255, 255, 0.06)' }}>
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
                  <span style={{ color: '#4E95FF', fontWeight: 600, textTransform: 'capitalize' }}>
                    {configMode === 'custom_benchmark'
                      ? `${customBaselineReasoningEffort} / ${customCandidateReasoningEffort}`
                      : (candidateVersion?.reasoningEffort || baselineVersion?.reasoningEffort || 'medium')}
                  </span>
                </div>
              </div>
            </div>

            {/* LLM Judge Selector & Status */}
            <div style={{ background: '#181D25', borderRadius: '6px', padding: '0.85rem', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.72rem', color: '#8D98A5', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
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
                        ? 'rgba(78, 155, 111, 0.15)'
                        : judgeStatus === 'CHECKING'
                        ? 'rgba(91, 130, 166, 0.15)'
                        : judgeStatus === 'API KEY MISSING'
                        ? 'rgba(192, 92, 84, 0.15)'
                        : 'rgba(198, 139, 69, 0.15)',
                    color:
                      judgeStatus === 'AVAILABLE'
                        ? '#4E9B6F'
                        : judgeStatus === 'CHECKING'
                        ? '#5B82A6'
                        : judgeStatus === 'API KEY MISSING'
                        ? '#C05C54'
                        : '#C68B45',
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
                        background: '#0F1216',
                        border: isJudgeConflicting ? '1px solid #C05C54' : '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '6px',
                        color: '#ECEFF2',
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#8D98A5' }}>
                      <span>Judge: <strong style={{ color: '#FFFFFF' }}>{eligibleJudgeModels.find((m) => m.id === selectedJudgeModel)?.displayName || selectedJudgeModel}</strong></span>
                      <span>Status: <strong style={{ color: judgeStatus === 'AVAILABLE' ? '#4E9B6F' : judgeStatus === 'CHECKING' ? '#5B82A6' : '#C05C54' }}>{judgeStatus === 'CHECKING' ? 'TESTING…' : judgeStatus}</strong></span>
                    </div>
                    {judgeStatusDetails && (
                      <div style={{ color: judgeStatus === 'AVAILABLE' ? '#4E9B6F' : '#E59892', fontSize: '0.72rem' }}>
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
            <div style={{ background: '#181D25', borderRadius: '6px', padding: '0.85rem', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.72rem', color: '#8D98A5', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
                  Semantic Evaluation
                </span>
                <span
                  style={{
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    padding: '0.15rem 0.45rem',
                    borderRadius: '4px',
                    background: 'rgba(78, 155, 111, 0.15)',
                    color: '#4E9B6F',
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
            <span style={{ fontSize: '0.8rem', color: '#8D98A5', fontWeight: 600 }}>
              Test Scale:
            </span>
            <select
              value={maxCasesToRun}
              onChange={(e) => setMaxCasesToRun(Number(e.target.value))}
              disabled={isRunning}
              style={{
                padding: '0.45rem 0.8rem',
                background: '#0F1216',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '6px',
                color: '#ECEFF2',
                fontSize: '0.82rem',
              }}
            >
              <option value={5}>Validation Smoke Test (5 scenarios)</option>
              <option value={10}>Targeted Benchmark (10 scenarios)</option>
              <option value={20}>Standard Suite (20 scenarios)</option>
              <option value={27}>Checkout Reliability Suite (27 scenarios - Required Benchmark)</option>
              <option value={100}>Enterprise Scale Benchmark (100 scenarios)</option>
              <option value={500}>High-Capacity Benchmark (500 scenarios)</option>
              <option value={1000}>Stress Benchmark (1,000 scenarios)</option>
              <option value={0}>Full Suite ({selectedDataset?.cases?.length || 27} scenarios - Run All)</option>
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', color: '#858585' }}>
              Benchmarking {maxCasesToRun > 0 ? maxCasesToRun : (selectedDataset?.cases?.length || 0)} scenarios
            </span>
            <button
              onClick={handleStartEvaluation}
              disabled={isRunning || !selectedDataset || isJudgeConflicting}
              style={{
                background: isRunning || isJudgeConflicting ? '#1B1B1B' : '#ADC0D6',
                color: isRunning || isJudgeConflicting ? '#555555' : '#0A1A35',
                border: isRunning || isJudgeConflicting ? '1px solid #292929' : '1px solid #ADC0D6',
                padding: '0.55rem 1.4rem',
                borderRadius: '2px',
                fontSize: '0.8rem',
                fontFamily: 'monospace',
                fontWeight: 700,
                letterSpacing: '0.04em',
                cursor: isRunning || isJudgeConflicting ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s ease, border-color 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (!isRunning && !isJudgeConflicting && selectedDataset) {
                  e.currentTarget.style.background = '#C5D4E5';
                  e.currentTarget.style.borderColor = '#C5D4E5';
                }
              }}
              onMouseLeave={(e) => {
                if (!isRunning && !isJudgeConflicting && selectedDataset) {
                  e.currentTarget.style.background = '#ADC0D6';
                  e.currentTarget.style.borderColor = '#ADC0D6';
                }
              }}
            >
              {isRunning ? 'EXECUTING BENCHMARK...' : 'INITIALIZE BENCHMARK →'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Historical Runs Table ── */}
      <div>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#F2F2F2', marginBottom: '0.75rem', fontFamily: 'monospace' }}>
          Evaluation Run History ({evaluationRuns.length})
        </h2>

        <div
          style={{
            background: '#151515',
            borderRadius: '2px',
            border: '1px solid #292929',
            overflowX: 'auto',
          }}
        >
          <div style={{ minWidth: '820px' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '120px 105px 1.4fr 1.1fr 85px 85px 140px 170px',
                padding: '0.65rem 1.1rem',
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
                    const color = isLive ? '#4E9B6F' : isRef ? '#8D98A5' : '#5B82A6';
                    const bg = isLive ? 'rgba(78, 155, 111, 0.12)' : isRef ? 'rgba(141, 152, 165, 0.12)' : 'rgba(91, 130, 166, 0.12)';
                    const border = isLive ? 'rgba(78, 155, 111, 0.3)' : isRef ? 'rgba(141, 152, 165, 0.3)' : 'rgba(91, 130, 166, 0.3)';
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
                              background: '#4E9B6F',
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
                    <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem', borderRadius: '3px', background: 'rgba(78, 155, 111, 0.12)', color: '#4E9B6F', fontWeight: 700 }}>
                      {(run.baselineVersion?.provider || 'BASELINE').toUpperCase()}
                    </span>
                    <span>{run.baselineVersion?.name || 'Baseline'}</span>
                  </div>
                  <div style={{ color: '#5B82A6', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem' }}>
                    <span style={{ fontSize: '0.65rem', padding: '0.1rem 0.35rem', borderRadius: '3px', background: 'rgba(91, 130, 166, 0.12)', color: '#5B82A6', fontWeight: 700 }}>
                      {(run.candidateVersion?.provider || 'CANDIDATE').toUpperCase()}
                    </span>
                    <span>{run.candidateVersion?.name || 'Candidate'}</span>
                  </div>
                </div>

                <div>
                  <div style={{ color: '#CCCCCC', fontWeight: 500 }}>{run.datasetName || 'Dataset'}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.2rem' }}>
                    <span
                      style={{
                        fontSize: '0.62rem',
                        padding: '0.06rem 0.3rem',
                        borderRadius: '3px',
                        fontWeight: 700,
                        background:
                          run.datasetSourceType === 'upload'
                            ? 'rgba(91, 130, 166, 0.15)'
                            : 'rgba(78, 155, 111, 0.15)',
                        color: run.datasetSourceType === 'upload' ? '#5B82A6' : '#4E9B6F',
                      }}
                    >
                      {run.datasetSourceType === 'upload' ? 'UPLOAD' : 'BUILT-IN'}
                    </span>
                    <span style={{ fontSize: '0.68rem', color: '#888888', fontFamily: 'monospace' }}>
                      v{run.datasetVersion || '1.0.0'} • {run.metrics?.totalCases ?? 0} cases
                    </span>
                  </div>
                </div>

                <div>
                  <div style={{ color: isReg ? '#C05C54' : run.metrics?.candidateAccuracy !== null && run.metrics?.candidateAccuracy !== undefined ? '#4E9B6F' : '#8D98A5', fontWeight: 700, fontSize: '0.9rem' }}>
                    {run.metrics?.candidateAccuracy !== null && run.metrics?.candidateAccuracy !== undefined ? `${run.metrics.candidateAccuracy}%` : '—'}
                  </div>
                  {run.metrics?.accuracyDelta !== null && run.metrics?.accuracyDelta !== undefined ? (
                    <div style={{ fontSize: '0.7rem', color: run.metrics.accuracyDelta < 0 ? '#C05C54' : '#4E9B6F' }}>
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
                      ? 'rgba(78, 155, 111, 0.12)'
                      : isBlock
                      ? 'rgba(192, 92, 84, 0.12)'
                      : isCond
                      ? 'rgba(198, 139, 69, 0.12)'
                      : isInsuff
                      ? 'rgba(141, 152, 165, 0.12)'
                      : 'rgba(91, 130, 166, 0.12)';
                    const badgeColor = isShip
                      ? '#4E9B6F'
                      : isBlock
                      ? '#C05C54'
                      : isCond
                      ? '#C68B45'
                      : isInsuff
                      ? '#8D98A5'
                      : '#5B82A6';
                    const badgeBorder = isShip
                      ? 'rgba(78, 155, 111, 0.3)'
                      : isBlock
                      ? 'rgba(192, 92, 84, 0.3)'
                      : isCond
                      ? 'rgba(198, 139, 69, 0.3)'
                      : isInsuff
                      ? 'rgba(141, 152, 165, 0.3)'
                      : 'rgba(91, 130, 166, 0.3)';
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
                              color: evidence === 'STRONG' ? '#4E9B6F' : evidence === 'GOOD' ? '#5B82A6' : evidence === 'MODERATE' ? '#C68B45' : '#C05C54',
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

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.35rem' }}>
                  {report && (
                    <button
                      onClick={() => handleOpenReport(run)}
                      style={{
                        background: '#ADC0D6',
                        border: '1px solid #ADC0D6',
                        color: '#0A1A35',
                        padding: '0.25rem 0.55rem',
                        borderRadius: '2px',
                        fontSize: '0.7rem',
                        fontFamily: 'monospace',
                        fontWeight: 700,
                        cursor: 'pointer',
                        transition: 'background 0.15s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#C5D4E5';
                        e.currentTarget.style.borderColor = '#C5D4E5';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = '#ADC0D6';
                        e.currentTarget.style.borderColor = '#ADC0D6';
                      }}
                    >
                      REPORT
                    </button>
                  )}
                  <button
                    onClick={() => {
                      onSelectActiveRun(run);
                      navigate('#/app/regressions');
                    }}
                    style={{
                      background: '#ADC0D6',
                      border: '1px solid #ADC0D6',
                      color: '#0A1A35',
                      padding: '0.25rem 0.55rem',
                      borderRadius: '2px',
                      fontSize: '0.7rem',
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'background 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#C5D4E5';
                      e.currentTarget.style.borderColor = '#C5D4E5';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#ADC0D6';
                      e.currentTarget.style.borderColor = '#ADC0D6';
                    }}
                  >
                    DIFF
                  </button>
                  {evaluationRuns.length > 1 && (
                    <button
                      onClick={() => onDeleteRun(run.id)}
                      title="Delete run"
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#555555',
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        padding: '0 0.3rem',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = '#EF4444')}
                      onMouseLeave={(e) => (e.currentTarget.style.color = '#555555')}
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
        totalScenarios={maxCasesToRun > 0 ? maxCasesToRun : (selectedDataset?.cases?.length || 100)}
        baselineModel={`${effectiveBaselineModel} (${configMode === 'custom_benchmark' ? customBaselineProvider : baselineVersion?.provider || 'default'})`}
        candidateModel={`${effectiveCandidateModel} (${configMode === 'custom_benchmark' ? customCandidateProvider : candidateVersion?.provider || 'default'})`}
        judgeModel={selectedJudgeModel}
        judgeEnabled={judgeEnabled}
        semanticStatus="ACTIVE"
        progressPercent={progressPercent}
        progressCounts={progressCounts}
        throughputCasesPerSec={throughput}
        averageLatencyMs={avgLatency}
        retriesCount={retriesCount}
        currentStageText={currentProgressText}
        caseName={currentCaseName}
        phase={currentPhase}
        runId={currentRunId}
        error={evaluationError}
        onCancel={() => {
          isCancelledRef.current = true;
          if (currentRunId) {
            fetch(`/api/evaluations/cancel/${currentRunId}`, { method: 'POST' }).catch(() => {});
          }
          setIsRunning(false);
          setIsProgressModalOpen(false);
          setEvaluationError(null);
        }}
        onRetry={() => {
          setEvaluationError(null);
          handleStartEvaluation();
        }}
      />

      {/* ── Persistent Floating Live Evaluation HUD ── */}
      <LiveEvaluationHUD
        isRunning={isRunning}
        isModalOpen={isProgressModalOpen}
        datasetName={selectedDataset?.name || 'Benchmark Dataset'}
        baselineModel={`${effectiveBaselineModel} (${configMode === 'custom_benchmark' ? customBaselineProvider : baselineVersion?.provider || 'default'})`}
        candidateModel={`${effectiveCandidateModel} (${configMode === 'custom_benchmark' ? customCandidateProvider : candidateVersion?.provider || 'default'})`}
        progressPercent={progressPercent}
        currentCount={progressCounts?.current || 0}
        totalCount={progressCounts?.total || (maxCasesToRun > 0 ? maxCasesToRun : (selectedDataset?.cases?.length || 100))}
        caseName={currentCaseName}
        phase={currentPhase}
        throughputCasesPerSec={throughput}
        onOpenModal={() => setIsProgressModalOpen(true)}
        onCancel={() => {
          isCancelledRef.current = true;
          if (currentRunId) {
            fetch(`/api/evaluations/cancel/${currentRunId}`, { method: 'POST' }).catch(() => {});
          }
          setIsRunning(false);
          setIsProgressModalOpen(false);
          setEvaluationError(null);
        }}
      />
    </div>
  );
};
