/* ============================================================
   RELIQ — Groq LLM Judge Model Registry & Eligibility Engine
   
   Provides single source of truth for Groq models eligible to act as
   evaluator judges, dynamic exclusion of benchmark models (baseline/candidate),
   and server/client configuration validation.
   ============================================================ */

import { JudgeConfig } from '../domain/types';

export interface GroqJudgeModelDescriptor {
  id: string;
  displayName: string;
  description: string;
  isJudgeEligible: boolean;
  tier: 'reasoning' | 'fast' | 'specialized';
  contextWindow: number;
  recommendedForJudge?: boolean;
}

/**
 * Authoritative Groq models registry for evaluation and judge roles.
 * Single source of truth across UI, backend, runner, and evaluator layers.
 */
export const GROQ_MODEL_REGISTRY: Record<string, GroqJudgeModelDescriptor> = {
  'groq/compound': {
    id: 'groq/compound',
    displayName: 'Groq Compound (128k General Reasoning)',
    description: 'Legacy reasoning model supported for test mock compatibility.',
    isJudgeEligible: true,
    tier: 'reasoning',
    contextWindow: 131072,
    recommendedForJudge: false,
  },
  'groq/compound-mini': {
    id: 'groq/compound-mini',
    displayName: 'Groq Compound Mini (128k Fast Inference)',
    description: 'Legacy compact reasoning model supported for test mock compatibility.',
    isJudgeEligible: true,
    tier: 'fast',
    contextWindow: 131072,
    recommendedForJudge: false,
  },
  'qwen/qwen3.8-27b': {
    id: 'qwen/qwen3.8-27b',
    displayName: 'Qwen 3.8 27B (128k Tongyi Lab)',
    description: 'High-capability instruction-tuned open weights model for complex structured evaluations.',
    isJudgeEligible: true,
    tier: 'reasoning',
    contextWindow: 131072,
    recommendedForJudge: true,
  },
  'allam-2-7b': {
    id: 'allam-2-7b',
    displayName: 'ALLaM 2 7B (SDAIA Bilingual)',
    description: 'Lightweight bilingual foundation model.',
    isJudgeEligible: true,
    tier: 'fast',
    contextWindow: 8192,
  },
  'openai/gpt-oss-20b': {
    id: 'openai/gpt-oss-20b',
    displayName: 'OpenAI GPT-OSS 20B (Groq Fast Inference)',
    description: 'OpenAI open-weight reasoning model (Current benchmark baseline).',
    isJudgeEligible: true,
    tier: 'reasoning',
    contextWindow: 131072,
  },
  'openai/gpt-oss-120b': {
    id: 'openai/gpt-oss-120b',
    displayName: 'OpenAI GPT-OSS 120B (Groq High Capability)',
    description: 'High-parameter open-weight reasoning model (Current benchmark candidate).',
    isJudgeEligible: true,
    tier: 'reasoning',
    contextWindow: 131072,
  },
  // Ineligible or non-general Groq models (audio, guardrails, specialized)
  'whisper-large-v3': {
    id: 'whisper-large-v3',
    displayName: 'Whisper Large v3 (Audio Transcription)',
    description: 'Audio transcription model. Ineligible for text/evaluator judging.',
    isJudgeEligible: false,
    tier: 'specialized',
    contextWindow: 448,
  },
  'whisper-large-v3-turbo': {
    id: 'whisper-large-v3-turbo',
    displayName: 'Whisper Large v3 Turbo (Fast Audio)',
    description: 'Audio transcription model. Ineligible for text/evaluator judging.',
    isJudgeEligible: false,
    tier: 'specialized',
    contextWindow: 448,
  },
  'meta-llama/llama-prompt-guard-2-86m': {
    id: 'meta-llama/llama-prompt-guard-2-86m',
    displayName: 'Llama Prompt Guard 2 (86M)',
    description: 'Prompt safety classifier. Ineligible for general qualitative judging.',
    isJudgeEligible: false,
    tier: 'specialized',
    contextWindow: 512,
  },
  'meta-llama/llama-prompt-guard-2-22m': {
    id: 'meta-llama/llama-prompt-guard-2-22m',
    displayName: 'Llama Prompt Guard 2 (22M)',
    description: 'Prompt safety classifier. Ineligible for general qualitative judging.',
    isJudgeEligible: false,
    tier: 'specialized',
    contextWindow: 512,
  },
};

/**
 * Filter available Groq models to only those eligible to act as independent LLM judges.
 * 
 * Rules:
 * 1. Removes the baseline model identifier
 * 2. Removes the candidate model identifier
 * 3. Removes non-judge / specialized models (e.g. whisper, prompt guard)
 * 4. Filters to only models supported by the Groq provider
 * 5. Operates on internal model IDs, not display labels
 */
export function getEligibleJudgeModels(
  baselineModel?: string,
  candidateModel?: string,
  availableModels?: string[]
): GroqJudgeModelDescriptor[] {
  const normBase = baselineModel?.trim().toLowerCase();
  const normCand = candidateModel?.trim().toLowerCase();
  const allowedSet = availableModels ? new Set(availableModels.map((m) => m.trim().toLowerCase())) : null;

  return Object.values(GROQ_MODEL_REGISTRY).filter((model) => {
    // Must be marked eligible for judging
    if (!model.isJudgeEligible) return false;

    const normId = model.id.toLowerCase();

    // Must not be the baseline model
    if (normBase && normId === normBase) return false;

    // Must not be the candidate model
    if (normCand && normId === normCand) return false;

    // If available models constraint is provided, must be in the set
    if (allowedSet && !allowedSet.has(normId)) return false;

    return true;
  });
}

/**
 * Dynamically selects the preferred default judge model given the current benchmark models.
 * 
 * Priority:
 * 1. A general reasoning model suitable for evaluation (recommendedForJudge = true)
 * 2. Any other eligible general reasoning model
 * 3. Any eligible judge model
 * 4. Returns null if no eligible judge model is available (LLM Judge = NOT CONFIGURED)
 */
export function getDefaultJudgeModel(
  baselineModel?: string,
  candidateModel?: string
): GroqJudgeModelDescriptor | null {
  const eligible = getEligibleJudgeModels(baselineModel, candidateModel);
  if (eligible.length === 0) return null;

  // 1. Preferred reasoning judge
  const recommended = eligible.find((m) => m.recommendedForJudge);
  if (recommended) return recommended;

  // 2. Any reasoning tier model
  const reasoning = eligible.find((m) => m.tier === 'reasoning');
  if (reasoning) return reasoning;

  // 3. First eligible model
  return eligible[0];
}

/**
 * Validates judge model independence and configuration for both frontend and backend.
 * Enforces: baseline !== judge && candidate !== judge.
 */
export function validateJudgeConfiguration(
  judgeConfig: JudgeConfig | undefined,
  baselineModel?: string,
  candidateModel?: string
): { valid: boolean; error?: string } {
  if (!judgeConfig || !judgeConfig.enabled) {
    return { valid: true };
  }

  if (judgeConfig.provider !== 'groq') {
    return {
      valid: false,
      error: `Invalid Judge Provider: '${judgeConfig.provider}'. Only 'groq' is supported for LLM judging.`,
    };
  }

  const judgeId = (judgeConfig.modelIdentifier || (judgeConfig as any).model)?.trim();
  if (!judgeId) {
    return {
      valid: false,
      error: 'Invalid Judge Configuration: No judge model identifier specified.',
    };
  }

  const normJudge = judgeId.toLowerCase();
  const normBase = baselineModel?.trim().toLowerCase();
  const normCand = candidateModel?.trim().toLowerCase();

  // Strict Independence Rule 1: Judge cannot be baseline
  if (normBase && normJudge === normBase) {
    return {
      valid: false,
      error: `Configuration Error: Judge model ('${judgeId}') cannot be the baseline model being evaluated ('${baselineModel}').`,
    };
  }

  // Strict Independence Rule 2: Judge cannot be candidate
  if (normCand && normJudge === normCand) {
    return {
      valid: false,
      error: `Configuration Error: Judge model ('${judgeId}') cannot be the candidate model being evaluated ('${candidateModel}').`,
    };
  }

  // Check if model exists in registry and is judge eligible
  const descriptor = GROQ_MODEL_REGISTRY[judgeId];
  if (!descriptor) {
    return {
      valid: false,
      error: `Configuration Error: Judge model '${judgeId}' is not available or not supported as a recognized Groq model.`,
    };
  }

  if (!descriptor.isJudgeEligible) {
    return {
      valid: false,
      error: `Configuration Error: Model '${judgeId}' (${descriptor.displayName}) is not eligible to act as an LLM judge.`,
    };
  }

  return { valid: true };
}
