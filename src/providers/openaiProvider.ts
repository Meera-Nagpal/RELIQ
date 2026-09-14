/* ============================================================
   RELIQ — OpenAI Model Provider Adapter
   
   Secure server-side proxy integration for OpenAI models.
   Supports GPT-4o, GPT-4o-mini, o1, and o3-mini.
   Extracts prompt tokens, completion tokens, reasoning tokens
   (completion_tokens_details.reasoning_tokens), and prompt cached tokens
   into normalized UsageRecord telemetry.
   
   CRITICAL SECURITY: Raw API keys are NEVER exposed on the client.
   All requests route through server-side /api/providers/openai.
   Telemetry rule: Metrics not exposed by provider remain undefined.
   ============================================================ */

import {
  CostCalculationParams,
  ModelProvider,
  ModelRequest,
  ModelResponse,
  ProviderMetadata,
  UsageRecord,
} from './types';
import { calculateTokenCost } from './pricing';

const DEFAULT_PROXY_ENDPOINT = '/api/providers/openai';

export class OpenAIProvider implements ModelProvider {
  readonly id = 'openai';
  readonly name = 'OpenAI (Server-Side Secure Proxy)';
  readonly providerType = 'openai' as const;

  private proxyEndpoint: string;

  constructor(proxyEndpoint: string = DEFAULT_PROXY_ENDPOINT) {
    this.proxyEndpoint = proxyEndpoint;
  }

  isConfigured(): boolean {
    return true;
  }

  getMetadata(): ProviderMetadata {
    return {
      id: this.id,
      name: this.name,
      providerType: this.providerType,
      supportedModels: [
        'gpt-4o',
        'gpt-4o-mini',
        'o1',
        'o1-mini',
        'o3-mini',
      ],
      supportsStreaming: true,
      supportsTools: true,
      supportsReasoningTokens: true,
      supportsPromptCaching: true,
      isServerSideOnly: true,
      configured: this.isConfigured(),
      proxyEndpoint: this.proxyEndpoint,
      docsUrl: 'https://platform.openai.com/docs',
    };
  }

  calculateCost(params: CostCalculationParams): number {
    const { costUsd } = calculateTokenCost(params);
    return costUsd ?? 0;
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const startTime = performance.now();

    try {
      const messages: any[] = [];
      if (request.systemPrompt) {
        messages.push({ role: 'system', content: request.systemPrompt });
      }
      messages.push({ role: 'user', content: request.input });

      const isReasoningModel =
        request.modelIdentifier.startsWith('o1') || request.modelIdentifier.startsWith('o3');

      const response = await fetch(this.proxyEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Reliq-Provider': 'openai',
        },
        body: JSON.stringify({
          model: request.modelIdentifier || 'gpt-4o',
          messages,
          temperature: isReasoningModel ? undefined : (request.temperature ?? 0.2),
          max_completion_tokens: request.maxTokens ?? 1024,
          metadata: {
            testCaseId: request.testCaseId,
            promptVersion: request.promptVersion,
          },
        }),
      });

      const clientLatencyMs = Math.round(performance.now() - startTime);

      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({ error: 'Unknown network error' }));
        return this.createErrorResponse(
          request,
          errorJson.error || `OpenAI proxy returned status ${response.status}`,
          clientLatencyMs,
          response.status,
          errorJson.retries || 0
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

      // Only expose reasoning_tokens if returned by the provider (e.g. o1, o3-mini)
      const reasoningTokens: number | undefined =
        usageData.completion_tokens_details?.reasoning_tokens !== undefined
          ? usageData.completion_tokens_details.reasoning_tokens
          : undefined;

      // Only expose cached_tokens if returned by prompt_tokens_details
      const cachedTokens: number | undefined =
        usageData.prompt_tokens_details?.cached_tokens !== undefined
          ? usageData.prompt_tokens_details.cached_tokens
          : undefined;

      const totalTokens = usageData.total_tokens ?? (inputTokens + outputTokens);
      const latencyMs = data._reliq_telemetry?.latencyMs ?? clientLatencyMs;
      const retries = data._reliq_telemetry?.retries ?? 0;

      const estimatedCostUsd = this.calculateCost({
        model: request.modelIdentifier,
        inputTokens,
        outputTokens,
        reasoningTokens,
        cachedTokens,
      });

      const usage: UsageRecord = {
        provider: 'openai',
        model: request.modelIdentifier,
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
        `OpenAI Proxy Endpoint unreachable (${this.proxyEndpoint}). Set up server-side OPENAI_API_KEY environment variable. Error: ${err.message}`,
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
    retries: number = 0
  ): ModelResponse {
    return {
      output: `[Error: Provider proxy unconfigured or failed - ${errorMessage}]`,
      usage: {
        provider: 'openai',
        model: request.modelIdentifier,
        modelVersion: request.promptVersion,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        latencyMs,
        estimatedCostUsd: 0,
        retries,
        error: {
          code: statusCode === 401 ? 'AUTH_MISSING_KEY' : 'PROXY_UNAVAILABLE',
          message: errorMessage,
          status: statusCode,
        },
      },
      isDemoMode: false,
    };
  }
}

export const openAIProvider = new OpenAIProvider();
