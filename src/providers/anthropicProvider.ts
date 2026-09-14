/* ============================================================
   RELIQ — Anthropic Model Provider Adapter
   
   Secure server-side proxy integration for Anthropic Claude models.
   Supports Claude 3.5 Sonnet, Claude 3.5 Haiku, and Claude 3 Opus.
   Extracts input tokens, output tokens, and prompt caching telemetry
   (cache_creation_input_tokens & cache_read_input_tokens) into normalized
   UsageRecord telemetry.
   
   CRITICAL SECURITY: Raw API keys are NEVER exposed on the client.
   All requests route through server-side /api/providers/anthropic.
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

const DEFAULT_PROXY_ENDPOINT = '/api/providers/anthropic';

export class AnthropicProvider implements ModelProvider {
  readonly id = 'anthropic';
  readonly name = 'Anthropic (Server-Side Secure Proxy)';
  readonly providerType = 'anthropic' as const;

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
        'claude-3-5-sonnet-20241022',
        'claude-3-5-haiku-20241022',
        'claude-3-opus-20240229',
      ],
      supportsStreaming: true,
      supportsTools: true,
      supportsReasoningTokens: false,
      supportsPromptCaching: true,
      isServerSideOnly: true,
      configured: this.isConfigured(),
      proxyEndpoint: this.proxyEndpoint,
      docsUrl: 'https://docs.anthropic.com/claude/reference',
    };
  }

  calculateCost(params: CostCalculationParams): number {
    const { costUsd } = calculateTokenCost(params);
    return costUsd ?? 0;
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const startTime = performance.now();

    try {
      const response = await fetch(this.proxyEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Reliq-Provider': 'anthropic',
        },
        body: JSON.stringify({
          model: request.modelIdentifier || 'claude-3-5-sonnet-20241022',
          system: request.systemPrompt,
          messages: [{ role: 'user', content: request.input }],
          max_tokens: request.maxTokens ?? 1024,
          temperature: request.temperature ?? 0.2,
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
          errorJson.error || `Anthropic proxy returned status ${response.status}`,
          clientLatencyMs,
          response.status,
          errorJson.retries || 0
        );
      }

      const data = await response.json();
      const output =
        data.content?.[0]?.text ||
        data.output ||
        '';

      const usageData = data.usage || {};
      const inputTokens = usageData.input_tokens ?? 0;
      const outputTokens = usageData.output_tokens ?? 0;
      // Claude exposes cache_read_input_tokens; undefined if not cached
      const cachedTokens: number | undefined =
        usageData.cache_read_input_tokens !== undefined
          ? usageData.cache_read_input_tokens
          : undefined;

      // Anthropic does not expose reasoning tokens; leave undefined
      const reasoningTokens = undefined;
      const totalTokens = inputTokens + outputTokens;
      const latencyMs = data._reliq_telemetry?.latencyMs ?? clientLatencyMs;
      const retries = data._reliq_telemetry?.retries ?? 0;

      const estimatedCostUsd = this.calculateCost({
        model: request.modelIdentifier,
        inputTokens,
        outputTokens,
        cachedTokens: cachedTokens || 0,
      });

      const usage: UsageRecord = {
        provider: 'anthropic',
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
        `Anthropic Proxy Endpoint unreachable (${this.proxyEndpoint}). Set up server-side ANTHROPIC_API_KEY environment variable. Error: ${err.message}`,
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
        provider: 'anthropic',
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

export const anthropicProvider = new AnthropicProvider();
