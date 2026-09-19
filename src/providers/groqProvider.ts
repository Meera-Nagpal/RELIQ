/* ============================================================
   RELIQ — Groq Model Provider Adapter
   
   Secure server-side proxy integration for Groq LPUs.
   Supports openai/gpt-oss-20b, openai/gpt-oss-120b, groq/compound, groq/compound-mini, qwen/qwen3.8-27b, allam-2-7b.
   Captures normalized UsageRecord telemetry and real-time rate limit headers
   (x-ratelimit-limit-requests, x-ratelimit-remaining-requests,
   x-ratelimit-limit-tokens, x-ratelimit-remaining-tokens, retry-after).
   
   CRITICAL SECURITY: Raw API keys are NEVER exposed on the client.
   All requests route through server-side /api/providers/groq.
   Telemetry rule: Metrics not exposed by provider remain undefined (never fabricated).
   NO SILENT FALLBACK: If Groq fails, returns clear error response.
   ============================================================ */

import {
  CostCalculationParams,
  ModelProvider,
  ModelRequest,
  ModelResponse,
  ProviderMetadata,
  RateLimitInfo,
  UsageRecord,
} from './types';
import { calculateTokenCost } from './pricing';

const DEFAULT_PROXY_ENDPOINT = '/api/providers/groq';
const DEFAULT_MODELS_ENDPOINT = '/api/providers/groq/models';

export const GROQ_SUPPORTED_MODELS = [
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
  'groq/compound',
  'groq/compound-mini',
  'qwen/qwen3.8-27b',
  'allam-2-7b',
];

export class GroqProvider implements ModelProvider {
  readonly id = 'groq';
  readonly name = 'Groq (Server-Side Secure Proxy)';
  readonly providerType = 'groq' as const;

  private proxyEndpoint: string;
  private modelsEndpoint: string;
  private dynamicModels: string[] = [];

  constructor(
    proxyEndpoint: string = DEFAULT_PROXY_ENDPOINT,
    modelsEndpoint: string = DEFAULT_MODELS_ENDPOINT
  ) {
    this.proxyEndpoint = proxyEndpoint;
    this.modelsEndpoint = modelsEndpoint;
  }

  isConfigured(): boolean {
    return true;
  }

  getMetadata(): ProviderMetadata {
    const models = Array.from(new Set([...GROQ_SUPPORTED_MODELS, ...this.dynamicModels]));
    return {
      id: this.id,
      name: this.name,
      providerType: this.providerType,
      supportedModels: models,
      supportsStreaming: true,
      supportsTools: true,
      supportsReasoningTokens: true,
      supportsPromptCaching: false,
      isServerSideOnly: true,
      configured: this.isConfigured(),
      proxyEndpoint: this.proxyEndpoint,
      docsUrl: 'https://console.groq.com/docs',
    };
  }

  /**
   * Optionally fetch live active model identifiers from Groq API via server proxy
   */
  async fetchLiveModels(): Promise<string[]> {
    try {
      const res = await fetch(this.modelsEndpoint);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.models) && data.models.length > 0) {
          this.dynamicModels = data.models;
          return this.dynamicModels;
        }
      }
    } catch {
      // Retain static supported models on network disconnect
    }
    return GROQ_SUPPORTED_MODELS;
  }

  calculateCost(params: CostCalculationParams): number {
    const { costUsd } = calculateTokenCost(params);
    return costUsd ?? 0;
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const startTime = performance.now();
    const caseIndex = request.metadata?.caseIndex ?? 1;
    const totalCases = request.metadata?.totalCases ?? 1;
    const model = request.modelIdentifier || 'openai/gpt-oss-20b';

    console.log(`\n[Groq] Case ${caseIndex}/${totalCases}`);
    console.log(`Request sent`);

    try {
      const messages: any[] = [];
      if (request.systemPrompt) {
        messages.push({ role: 'system', content: request.systemPrompt });
      }
      messages.push({ role: 'user', content: request.input });

      const isGptOss = model === 'openai/gpt-oss-20b' || model === 'openai/gpt-oss-120b';
      const reasoningEffort = isGptOss ? (request.reasoningEffort || 'medium') : undefined;

      const groqPayload: any = {
        model,
        messages,
        temperature: request.temperature ?? 0.0,
        max_tokens: request.maxTokens ?? 2048,
        metadata: {
          testCaseId: request.testCaseId,
          promptVersion: request.promptVersion,
          caseIndex: request.metadata?.caseIndex,
          totalCases: request.metadata?.totalCases,
        },
      };

      if (reasoningEffort) {
        groqPayload.reasoning_effort = reasoningEffort;
      }

      // Enforce JSON structured output only if the test case specifically requires structured JSON
      if (request.evaluatorType === 'json_validity') {
        groqPayload.response_format = { type: 'json_object' };
      }

      const response = await fetch(this.proxyEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Reliq-Provider': 'groq',
        },
        body: JSON.stringify(groqPayload),
      });

      const clientLatencyMs = Math.round(performance.now() - startTime);

      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({ error: 'Unknown network error' }));
        const rawMsg =
          errorJson.error?.message ||
          errorJson.error ||
          `Groq proxy returned status ${response.status}`;
        console.log(`HTTP ${response.status}`);
        console.log(`Latency: ${clientLatencyMs}ms`);
        console.log(`In: 0`);
        console.log(`Out: 0`);
        console.log(`Error: ${rawMsg}`);
        return this.createErrorResponse(
          request,
          rawMsg,
          clientLatencyMs,
          response.status,
          errorJson.retries || 0,
          errorJson.rateLimits
        );
      }

      const data = await response.json();
      const output =
        data.choices?.[0]?.message?.content ||
        data.output ||
        '';

      const usageData = data.usage || {};
      const inputTokens = usageData.prompt_tokens ?? 0;
      const outputTokens = usageData.completion_tokens ?? 0;

      // Only expose reasoning_tokens if explicitly returned by model
      const reasoningTokens: number | undefined =
        usageData.completion_tokens_details?.reasoning_tokens !== undefined
          ? usageData.completion_tokens_details.reasoning_tokens
          : undefined;

      // Only expose cached_tokens if explicitly returned
      const cachedTokens: number | undefined =
        usageData.prompt_tokens_details?.cached_tokens !== undefined
          ? usageData.prompt_tokens_details.cached_tokens
          : undefined;

      const totalTokens = usageData.total_tokens ?? (inputTokens + outputTokens);
      const latencyMs = data._reliq_telemetry?.latencyMs ?? clientLatencyMs;
      const retries = data._reliq_telemetry?.retries ?? 0;
      const rateLimit: RateLimitInfo | undefined = data._reliq_telemetry?.rateLimits;

      console.log(`HTTP ${response.status}`);
      console.log(`Latency: ${latencyMs}ms`);
      console.log(`In: ${inputTokens}`);
      console.log(`Out: ${outputTokens}`);
      if (reasoningTokens !== undefined) {
        console.log(`Reasoning: ${reasoningTokens}`);
      }

      const estimatedCostUsd = this.calculateCost({
        model,
        provider: 'groq',
        inputTokens,
        outputTokens,
        reasoningTokens,
        cachedTokens,
      });

      const usage: UsageRecord = {
        provider: 'groq',
        model,
        modelVersion: request.promptVersion,
        inputTokens,
        outputTokens,
        reasoningTokens,
        cachedTokens,
        totalTokens,
        latencyMs,
        estimatedCostUsd,
        retries,
        rawResponse: data,
        rateLimit,
      };

      return {
        output,
        usage,
        rawResponse: data,
        isDemoMode: false,
      };
    } catch (err: any) {
      const clientLatencyMs = Math.round(performance.now() - startTime);
      return this.createErrorResponse(
        request,
        `Groq Proxy Endpoint unreachable (${this.proxyEndpoint}). Set up server-side GROQ_API_KEY environment variable. Error: ${err.message}`,
        clientLatencyMs,
        503,
        0
      );
    }
  }

  private createErrorResponse(
    request: ModelRequest,
    errorMessage: string,
    latencyMs: number,
    statusCode: number,
    retries: number = 0,
    rateLimit?: RateLimitInfo
  ): ModelResponse {
    let errorCode = 'PROXY_UNAVAILABLE';
    const lower = errorMessage.toLowerCase();
    if (statusCode === 429 || lower.includes('rate limit') || lower.includes('quota')) {
      errorCode = 'RATE_LIMIT_EXCEEDED';
    } else if (statusCode === 401 || statusCode === 403 || lower.includes('api key') || lower.includes('unauthorized')) {
      errorCode = 'AUTH_FAILED';
    } else if (statusCode === 408 || statusCode === 504 || lower.includes('timeout') || lower.includes('aborted')) {
      errorCode = 'TIMEOUT';
    } else if (statusCode >= 500) {
      errorCode = 'SERVER_ERROR';
    } else if (statusCode === 404 || lower.includes('model')) {
      errorCode = 'INVALID_MODEL';
    }

    return {
      output: `[Error: Provider proxy unconfigured or failed - ${errorMessage}]`,
      usage: {
        provider: 'groq',
        model: request.modelIdentifier || 'openai/gpt-oss-20b',
        modelVersion: request.promptVersion,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        latencyMs,
        estimatedCostUsd: 0,
        retries,
        rateLimit,
        error: {
          code: errorCode,
          message: errorMessage,
          status: statusCode,
        },
      },
      isDemoMode: false,
    };
  }
}

export const groqProvider = new GroqProvider();
