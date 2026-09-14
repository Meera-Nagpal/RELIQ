/* ============================================================
   RELIQ — Centralized Model Pricing Configuration
   
   Maintains up-to-date rate cards for supported AI providers.
   Calculates cost from actual token usage x model rate card.
   If pricing for a model is unavailable, returns undefined
   ("Cost: Unavailable") rather than fabricating a fake cost.
   ============================================================ */

import { CostCalculationParams, ProviderType } from './types';

export interface ModelRateCard {
  provider: ProviderType;
  modelIdentifier: string;
  displayName: string;
  costPerMillionInputTokens: number;
  costPerMillionOutputTokens: number;
  costPerMillionReasoningTokens?: number;
  costPerMillionCachedTokens?: number;
  effectiveDate: string;
  notes?: string;
}

/**
 * Centralized rate cards for all recognized models.
 * Rates in USD per 1,000,000 tokens.
 */
export const MODEL_PRICING_TABLE: Record<string, ModelRateCard> = {
  // ── Google Gemini Models ──────────────────────────────────
  'gemini-flash-latest': {
    provider: 'google',
    modelIdentifier: 'gemini-flash-latest',
    displayName: 'Gemini Flash Latest',
    costPerMillionInputTokens: 0.075,
    costPerMillionOutputTokens: 0.30,
    costPerMillionCachedTokens: 0.01875,
    effectiveDate: '2025-01-01',
  },
  'gemini-3.5-flash': {
    provider: 'google',
    modelIdentifier: 'gemini-3.5-flash',
    displayName: 'Gemini 3.5 Flash',
    costPerMillionInputTokens: 0.075,
    costPerMillionOutputTokens: 0.30,
    costPerMillionCachedTokens: 0.01875,
    effectiveDate: '2026-01-01',
  },
  'gemini-3.6-flash': {
    provider: 'google',
    modelIdentifier: 'gemini-3.6-flash',
    displayName: 'Gemini 3.6 Flash',
    costPerMillionInputTokens: 0.075,
    costPerMillionOutputTokens: 0.30,
    costPerMillionCachedTokens: 0.01875,
    effectiveDate: '2026-03-01',
  },
  'gemini-pro-latest': {
    provider: 'google',
    modelIdentifier: 'gemini-pro-latest',
    displayName: 'Gemini Pro Latest',
    costPerMillionInputTokens: 1.25,
    costPerMillionOutputTokens: 5.00,
    costPerMillionCachedTokens: 0.3125,
    effectiveDate: '2025-01-01',
  },
  'gemini-2.0-flash-thinking-exp': {
    provider: 'google',
    modelIdentifier: 'gemini-2.0-flash-thinking-exp',
    displayName: 'Gemini 2.0 Flash Thinking Experimental',
    costPerMillionInputTokens: 0.10,
    costPerMillionOutputTokens: 0.40,
    costPerMillionReasoningTokens: 0.40,
    costPerMillionCachedTokens: 0.025,
    effectiveDate: '2025-01-01',
    notes: 'Thinking tokens billed at standard output rate.',
  },
  'gemini-2.0-flash-thinking-exp-01-21': {
    provider: 'google',
    modelIdentifier: 'gemini-2.0-flash-thinking-exp-01-21',
    displayName: 'Gemini 2.0 Flash Thinking (01-21)',
    costPerMillionInputTokens: 0.10,
    costPerMillionOutputTokens: 0.40,
    costPerMillionReasoningTokens: 0.40,
    costPerMillionCachedTokens: 0.025,
    effectiveDate: '2025-01-21',
  },
  'gemini-2.0-flash': {
    provider: 'google',
    modelIdentifier: 'gemini-2.0-flash',
    displayName: 'Gemini 2.0 Flash',
    costPerMillionInputTokens: 0.10,
    costPerMillionOutputTokens: 0.40,
    costPerMillionCachedTokens: 0.025,
    effectiveDate: '2025-01-01',
  },
  'gemini-1.5-pro-002': {
    provider: 'google',
    modelIdentifier: 'gemini-1.5-pro-002',
    displayName: 'Gemini 1.5 Pro (002)',
    costPerMillionInputTokens: 1.25,
    costPerMillionOutputTokens: 5.00,
    costPerMillionCachedTokens: 0.3125,
    effectiveDate: '2024-09-24',
  },
  'gemini-1.5-pro': {
    provider: 'google',
    modelIdentifier: 'gemini-1.5-pro',
    displayName: 'Gemini 1.5 Pro',
    costPerMillionInputTokens: 1.25,
    costPerMillionOutputTokens: 5.00,
    costPerMillionCachedTokens: 0.3125,
    effectiveDate: '2024-09-24',
  },
  'gemini-1.5-flash-002': {
    provider: 'google',
    modelIdentifier: 'gemini-1.5-flash-002',
    displayName: 'Gemini 1.5 Flash (002)',
    costPerMillionInputTokens: 0.075,
    costPerMillionOutputTokens: 0.30,
    costPerMillionCachedTokens: 0.01875,
    effectiveDate: '2024-09-24',
  },
  'gemini-1.5-flash': {
    provider: 'google',
    modelIdentifier: 'gemini-1.5-flash',
    displayName: 'Gemini 1.5 Flash',
    costPerMillionInputTokens: 0.075,
    costPerMillionOutputTokens: 0.30,
    costPerMillionCachedTokens: 0.01875,
    effectiveDate: '2024-09-24',
  },

  // ── OpenAI Models ─────────────────────────────────────────
  'gpt-4o': {
    provider: 'openai',
    modelIdentifier: 'gpt-4o',
    displayName: 'GPT-4o',
    costPerMillionInputTokens: 2.50,
    costPerMillionOutputTokens: 10.00,
    costPerMillionCachedTokens: 1.25,
    effectiveDate: '2024-10-01',
  },
  'gpt-4o-mini': {
    provider: 'openai',
    modelIdentifier: 'gpt-4o-mini',
    displayName: 'GPT-4o mini',
    costPerMillionInputTokens: 0.15,
    costPerMillionOutputTokens: 0.60,
    costPerMillionCachedTokens: 0.075,
    effectiveDate: '2024-07-18',
  },
  'o3-mini': {
    provider: 'openai',
    modelIdentifier: 'o3-mini',
    displayName: 'o3-mini Reasoning',
    costPerMillionInputTokens: 1.10,
    costPerMillionOutputTokens: 4.40,
    costPerMillionReasoningTokens: 4.40,
    costPerMillionCachedTokens: 0.55,
    effectiveDate: '2025-01-31',
  },
  'o1': {
    provider: 'openai',
    modelIdentifier: 'o1',
    displayName: 'o1 Full Reasoning',
    costPerMillionInputTokens: 15.00,
    costPerMillionOutputTokens: 60.00,
    costPerMillionReasoningTokens: 60.00,
    costPerMillionCachedTokens: 7.50,
    effectiveDate: '2024-12-17',
  },
  'o1-mini': {
    provider: 'openai',
    modelIdentifier: 'o1-mini',
    displayName: 'o1-mini Reasoning',
    costPerMillionInputTokens: 3.00,
    costPerMillionOutputTokens: 12.00,
    costPerMillionReasoningTokens: 12.00,
    costPerMillionCachedTokens: 1.50,
    effectiveDate: '2024-09-12',
  },

  // ── Anthropic Claude Models ───────────────────────────────
  'claude-3-5-sonnet-20241022': {
    provider: 'anthropic',
    modelIdentifier: 'claude-3-5-sonnet-20241022',
    displayName: 'Claude 3.5 Sonnet (v2)',
    costPerMillionInputTokens: 3.00,
    costPerMillionOutputTokens: 15.00,
    costPerMillionCachedTokens: 0.30,
    effectiveDate: '2024-10-22',
  },
  'claude-3-5-haiku-20241022': {
    provider: 'anthropic',
    modelIdentifier: 'claude-3-5-haiku-20241022',
    displayName: 'Claude 3.5 Haiku',
    costPerMillionInputTokens: 0.80,
    costPerMillionOutputTokens: 4.00,
    costPerMillionCachedTokens: 0.08,
    effectiveDate: '2024-10-22',
  },
  'claude-3-opus-20240229': {
    provider: 'anthropic',
    modelIdentifier: 'claude-3-opus-20240229',
    displayName: 'Claude 3 Opus',
    costPerMillionInputTokens: 15.00,
    costPerMillionOutputTokens: 75.00,
    costPerMillionCachedTokens: 1.50,
    effectiveDate: '2024-02-29',
  },

  // ── Groq Models ───────────────────────────────────────────
  'openai/gpt-oss-20b': {
    provider: 'groq',
    modelIdentifier: 'openai/gpt-oss-20b',
    displayName: 'OpenAI GPT-OSS 20B (Groq)',
    costPerMillionInputTokens: 0.10,
    costPerMillionOutputTokens: 0.20,
    effectiveDate: '2025-01-01',
    notes: 'Groq standard tier rate for open models.',
  },
  'llama-3.3-70b-versatile': {
    provider: 'groq',
    modelIdentifier: 'llama-3.3-70b-versatile',
    displayName: 'Llama 3.3 70B Versatile (Groq)',
    costPerMillionInputTokens: 0.59,
    costPerMillionOutputTokens: 0.79,
    effectiveDate: '2024-12-06',
  },
  'llama-3.1-8b-instant': {
    provider: 'groq',
    modelIdentifier: 'llama-3.1-8b-instant',
    displayName: 'Llama 3.1 8B Instant (Groq)',
    costPerMillionInputTokens: 0.05,
    costPerMillionOutputTokens: 0.08,
    effectiveDate: '2024-07-23',
  },
  'mixtral-8x7b-32768': {
    provider: 'groq',
    modelIdentifier: 'mixtral-8x7b-32768',
    displayName: 'Mixtral 8x7B (Groq)',
    costPerMillionInputTokens: 0.24,
    costPerMillionOutputTokens: 0.24,
    effectiveDate: '2024-01-01',
  },

  // ── Cerebras Models ───────────────────────────────────────
  'gpt-oss-120b': {
    provider: 'cerebras',
    modelIdentifier: 'gpt-oss-120b',
    displayName: 'GPT-OSS 120B (Cerebras)',
    costPerMillionInputTokens: 0.15,
    costPerMillionOutputTokens: 0.60,
    effectiveDate: '2025-01-01',
    notes: 'Cerebras wafer-scale engine standard rate card.',
  },
  'llama3.1-8b': {
    provider: 'cerebras',
    modelIdentifier: 'llama3.1-8b',
    displayName: 'Llama 3.1 8B (Cerebras)',
    costPerMillionInputTokens: 0.10,
    costPerMillionOutputTokens: 0.10,
    effectiveDate: '2024-07-23',
    notes: 'Cerebras ultra-low-latency 8B model.',
  },

  // ── Demo Provider Models ──────────────────────────────────
  'demo-claude-3-5-sonnet': {
    provider: 'demo',
    modelIdentifier: 'demo-claude-3-5-sonnet',
    displayName: 'Claude 3.5 Sonnet (Demo)',
    costPerMillionInputTokens: 3.00,
    costPerMillionOutputTokens: 15.00,
    costPerMillionCachedTokens: 0.30,
    effectiveDate: '2024-10-22',
  },
  'demo-gemini-1-5-pro': {
    provider: 'demo',
    modelIdentifier: 'demo-gemini-1-5-pro',
    displayName: 'Gemini 1.5 Pro (Demo)',
    costPerMillionInputTokens: 1.25,
    costPerMillionOutputTokens: 5.00,
    costPerMillionCachedTokens: 0.3125,
    effectiveDate: '2024-09-24',
  },
  'demo-gpt-4o': {
    provider: 'demo',
    modelIdentifier: 'demo-gpt-4o',
    displayName: 'GPT-4o (Demo)',
    costPerMillionInputTokens: 2.50,
    costPerMillionOutputTokens: 10.00,
    costPerMillionCachedTokens: 1.25,
    effectiveDate: '2024-10-01',
  },
  'demo-o3-mini': {
    provider: 'demo',
    modelIdentifier: 'demo-o3-mini',
    displayName: 'o3-mini (Demo)',
    costPerMillionInputTokens: 1.10,
    costPerMillionOutputTokens: 4.40,
    costPerMillionReasoningTokens: 4.40,
    costPerMillionCachedTokens: 0.55,
    effectiveDate: '2025-01-31',
  },
};

export function getModelRateCard(modelIdentifier: string, provider?: ProviderType): ModelRateCard | undefined {
  if (!modelIdentifier) return undefined;
  const normalized = modelIdentifier.toLowerCase().trim();

  // 1. Direct match with provider check if supplied
  if (MODEL_PRICING_TABLE[normalized]) {
    const card = MODEL_PRICING_TABLE[normalized];
    if (!provider || card.provider === provider) {
      return card;
    }
  }

  // 2. Scan pricing table matching provider first
  for (const [key, card] of Object.entries(MODEL_PRICING_TABLE)) {
    if (provider && card.provider !== provider) continue;
    if (normalized.startsWith(key) || key.startsWith(normalized)) {
      return card;
    }
  }

  // 3. Fallback scan without provider restriction
  for (const [key, card] of Object.entries(MODEL_PRICING_TABLE)) {
    if (normalized.startsWith(key) || key.startsWith(normalized)) {
      return card;
    }
  }

  return undefined;
}

export function calculateTokenCost(params: CostCalculationParams): {
  costUsd?: number;
  isAvailable: boolean;
  rateCard?: ModelRateCard;
} {
  const rateCard = getModelRateCard(params.model, params.provider);
  if (!rateCard) {
    return {
      costUsd: undefined,
      isAvailable: false,
    };
  }

  const {
    inputTokens = 0,
    outputTokens = 0,
    reasoningTokens = 0,
    cachedTokens = 0,
  } = params;

  const rateInput = rateCard.costPerMillionInputTokens / 1_000_000;
  const rateOutput = rateCard.costPerMillionOutputTokens / 1_000_000;
  const rateReasoning =
    (rateCard.costPerMillionReasoningTokens ?? rateCard.costPerMillionOutputTokens) / 1_000_000;
  const rateCached =
    (rateCard.costPerMillionCachedTokens ?? rateCard.costPerMillionInputTokens) / 1_000_000;

  const billableInput = Math.max(0, inputTokens - cachedTokens);

  // In OpenAI, Groq, Anthropic, and Gemini, outputTokens (completion tokens) already
  // accounts for all generated tokens including reasoning/thinking tokens.
  // Reasoning tokens must NEVER be added on top of outputTokens unless billed at a differential rate!
  const hasDifferentialReasoningRate =
    rateCard.costPerMillionReasoningTokens !== undefined &&
    rateCard.costPerMillionReasoningTokens !== rateCard.costPerMillionOutputTokens;

  let outputCost = 0;
  if (hasDifferentialReasoningRate && reasoningTokens > 0) {
    const regularOutputTokens = Math.max(0, outputTokens - reasoningTokens);
    outputCost = regularOutputTokens * rateOutput + reasoningTokens * rateReasoning;
  } else {
    outputCost = outputTokens * rateOutput;
  }

  const cost = billableInput * rateInput + cachedTokens * rateCached + outputCost;

  return {
    costUsd: Number(cost.toFixed(6)),
    isAvailable: true,
    rateCard,
  };
}

export function formatCost(costUsd?: number): string {
  if (costUsd === undefined || isNaN(costUsd)) {
    return 'Cost: unavailable';
  }
  if (costUsd === 0) {
    return '$0.000000';
  }
  if (costUsd < 0.0001) {
    return '$' + costUsd.toFixed(6);
  }
  return '$' + costUsd.toFixed(4);
}
