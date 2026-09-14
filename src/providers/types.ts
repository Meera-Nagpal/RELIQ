/* ============================================================
   RELIQ — Model Provider Abstraction & Telemetry Contracts
   
   Normalized interfaces for all AI providers (Demo, Google Gemini,
   OpenAI, Anthropic) ensuring the evaluation engine remains completely
   decoupled from provider-specific SDKs and network protocols.
   ============================================================ */

export type ProviderType = 'demo' | 'google' | 'openai' | 'anthropic' | 'groq' | 'cerebras' | 'custom';

/**
 * Real rate limit metadata extracted from provider HTTP response headers.
 */
export interface RateLimitInfo {
  limitRequests?: string;
  remainingRequests?: string;
  resetRequests?: string;
  limitTokens?: string;
  remainingTokens?: string;
  resetTokens?: string;
  retryAfter?: string;
}

/**
 * Normalized usage telemetry record captured for every model invocation.
 * Fields not provided by an underlying provider remain undefined (never fabricated).
 */
export interface UsageRecord {
  provider: ProviderType;
  model: string;
  modelVersion?: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens?: number;       // Reasoning / Thinking tokens (undefined if provider does not expose)
  cachedTokens?: number;          // Prompt cache tokens (undefined if provider does not expose)
  totalTokens: number;
  latencyMs: number;
  timeToFirstTokenMs?: number;    // Time to first token (undefined if non-streaming/unmeasured)
  estimatedCostUsd: number;
  retries?: number;               // Number of retry attempts made
  rawResponse?: unknown;          // Raw provider response payload
  rateLimit?: RateLimitInfo;      // Upstream provider rate limit telemetry
  error?: {
    code?: string;
    message: string;
    status?: number;
  };
}

/**
 * Decoupled request payload sent to any model provider
 */
export interface ModelRequest {
  testCaseId: string;
  input: string;
  systemPrompt?: string;
  modelIdentifier: string;
  promptVersion?: string;
  temperature?: number;
  maxTokens?: number;
  expectedOutput?: string;
  evaluatorType?: string;
  metadata?: Record<string, any>;
}

/**
 * Standardized internal representation for model tool invocations
 */
export interface NormalizedToolCall {
  name: string;
  arguments: Record<string, any>;
}

/**
 * Standardized response payload returned by any model provider
 */
export interface ModelResponse {
  output: string;
  toolCalls?: NormalizedToolCall[];
  usage: UsageRecord;
  rawResponse?: unknown;
  isDemoMode: boolean;
}

/**
 * Metadata capabilities advertised by a registered provider
 */
export interface ProviderMetadata {
  id: string;
  name: string;
  providerType: ProviderType;
  supportedModels: string[];
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsReasoningTokens: boolean;
  supportsPromptCaching: boolean;
  isServerSideOnly: boolean;
  configured: boolean;
  proxyEndpoint?: string;
  docsUrl?: string;
}

/**
 * Cost calculation input parameters
 */
export interface CostCalculationParams {
  model: string;
  provider?: ProviderType;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens?: number;
  cachedTokens?: number;
}

/**
 * Normalized Model Provider interface
 */
export interface ModelProvider {
  readonly id: string;
  readonly name: string;
  readonly providerType: ProviderType;

  /**
   * Check if the provider is configured and available (e.g. backend proxy ready)
   */
  isConfigured(): boolean;

  /**
   * Execute model inference for a given test scenario request
   */
  generate(request: ModelRequest): Promise<ModelResponse>;

  /**
   * Calculate financial cost in USD from token usage telemetry
   */
  calculateCost(params: CostCalculationParams): number;

  /**
   * Retrieve provider capabilities and supported model registry
   */
  getMetadata(): ProviderMetadata;
}

