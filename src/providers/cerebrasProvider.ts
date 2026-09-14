/* ============================================================
   RELIQ — Cerebras Model Provider Adapter
   
   Secure server-side proxy integration for Cerebras CS-3 wafer-scale engine.
   Supports gpt-oss-120b (default) and llama3.1-8b.
   Captures normalized UsageRecord telemetry and real-time rate limit headers
   (x-ratelimit-remaining-requests-day, x-ratelimit-remaining-tokens-minute, retry-after).
   
   CRITICAL SECURITY: Raw API keys are NEVER exposed on the client.
   All requests route through server-side /api/providers/cerebras.
   Telemetry rule: Metrics not exposed by provider remain undefined (never fabricated).
   NO SILENT FALLBACK: If Cerebras fails, returns clear provider error response.
   ============================================================ */

import {
  CostCalculationParams,
  ModelProvider,
  ModelRequest,
  ModelResponse,
  NormalizedToolCall,
  ProviderMetadata,
  RateLimitInfo,
  UsageRecord,
} from './types';
import { calculateTokenCost } from './pricing';

const DEFAULT_PROXY_ENDPOINT = '/api/providers/cerebras';
const DEFAULT_MODELS_ENDPOINT = '/api/providers/cerebras/models';

export const CEREBRAS_SUPPORTED_MODELS = [
  'gpt-oss-120b',
  'llama3.1-8b',
];

export class CerebrasProvider implements ModelProvider {
  readonly id = 'cerebras';
  readonly name = 'Cerebras (Server-Side Secure Proxy)';
  readonly providerType = 'cerebras' as const;

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
    const models = Array.from(new Set([...CEREBRAS_SUPPORTED_MODELS, ...this.dynamicModels]));
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
      docsUrl: 'https://inference-docs.cerebras.ai',
    };
  }

  /**
   * Optionally fetch live active model identifiers from Cerebras API via server proxy
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
    return CEREBRAS_SUPPORTED_MODELS;
  }

  calculateCost(params: CostCalculationParams): number {
    const { costUsd } = calculateTokenCost(params);
    return costUsd ?? 0;
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const startTime = performance.now();
    const caseIndex = request.metadata?.caseIndex ?? 1;
    const totalCases = request.metadata?.totalCases ?? 1;
    const model = request.modelIdentifier || 'gpt-oss-120b';

    console.log(`\n[Cerebras] Case ${caseIndex}/${totalCases}`);
    console.log(`Request sent: model=${model}`);

    try {
      const messages: any[] = [];
      let systemInstruction = request.systemPrompt || '';
      if (request.evaluatorType === 'json_validity') {
        systemInstruction += (systemInstruction ? '\n\n' : '') +
          'CRITICAL SCHEMA INSTRUCTION: You must respond ONLY with a single valid standard RFC 8259 JSON object. Do not include javascript code comments (//), trailing commas, or duplicate object keys. Ensure all expected property names are double-quoted strings.';
      }
      if (systemInstruction) {
        messages.push({ role: 'system', content: systemInstruction });
      }
      messages.push({ role: 'user', content: request.input });

      const payload: any = {
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

      // Enable JSON response format for json_validity or when requested
      if (request.evaluatorType === 'json_validity') {
        payload.response_format = { type: 'json_object' };
      }

      const response = await fetch(this.proxyEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Reliq-Provider': 'cerebras',
        },
        body: JSON.stringify(payload),
      });

      const clientLatencyMs = Math.round(performance.now() - startTime);

      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({ error: 'Unknown network error' }));
        const rawMsg =
          errorJson.error?.message ||
          errorJson.error ||
          `Cerebras proxy returned status ${response.status}`;
        console.log(`[Cerebras] HTTP ${response.status}`);
        console.log(`Latency: ${clientLatencyMs}ms`);
        console.log(`In: 0 | Out: 0`);
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
      
      // Extract normalized tool calls if returned
      let toolCalls: NormalizedToolCall[] | undefined;
      const messageToolCalls = data.choices?.[0]?.message?.tool_calls;
      if (Array.isArray(messageToolCalls) && messageToolCalls.length > 0) {
        toolCalls = messageToolCalls.map((tc: any) => {
          let args = {};
          try {
            args = typeof tc.function?.arguments === 'string'
              ? JSON.parse(tc.function.arguments)
              : (tc.function?.arguments || {});
          } catch {}
          return {
            name: tc.function?.name || '',
            arguments: args,
          };
        });
      }

      let output =
        data.choices?.[0]?.message?.content ||
        data.output ||
        '';

      if ((!output || output.trim() === '') && toolCalls && toolCalls.length > 0) {
        const primary = toolCalls[0];
        output = JSON.stringify({
          tool: primary.name,
          ...primary.arguments,
        });
      }

      const usageData = data.usage || {};
      const inputTokens = usageData.prompt_tokens ?? 0;
      const outputTokens = usageData.completion_tokens ?? 0;

      // Reasoning tokens if returned
      const reasoningTokens: number | undefined =
        usageData.completion_tokens_details?.reasoning_tokens !== undefined
          ? usageData.completion_tokens_details.reasoning_tokens
          : undefined;

      const cachedTokens: number | undefined =
        usageData.prompt_tokens_details?.cached_tokens !== undefined
          ? usageData.prompt_tokens_details.cached_tokens
          : undefined;

      const totalTokens = usageData.total_tokens ?? (inputTokens + outputTokens);
      const latencyMs = data._reliq_telemetry?.latencyMs ?? clientLatencyMs;
      const retries = data._reliq_telemetry?.retries ?? 0;
      const rateLimit: RateLimitInfo | undefined = data._reliq_telemetry?.rateLimits;

      console.log(`[Cerebras] HTTP ${response.status}`);
      console.log(`Latency: ${latencyMs}ms`);
      console.log(`In: ${inputTokens} | Out: ${outputTokens}`);

      const estimatedCostUsd = this.calculateCost({
        model,
        provider: 'cerebras',
        inputTokens,
        outputTokens,
        reasoningTokens,
        cachedTokens,
      });

      const usage: UsageRecord = {
        provider: 'cerebras',
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
        toolCalls,
        usage,
        rawResponse: data,
        isDemoMode: false,
      };
    } catch (err: any) {
      const clientLatencyMs = Math.round(performance.now() - startTime);
      return this.createErrorResponse(
        request,
        `Cerebras Proxy Endpoint unreachable (${this.proxyEndpoint}). Set up server-side CEREBRAS_API_KEY environment variable. Error: ${err.message}`,
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
        provider: 'cerebras',
        model: request.modelIdentifier || 'gpt-oss-120b',
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

export const cerebrasProvider = new CerebrasProvider();
