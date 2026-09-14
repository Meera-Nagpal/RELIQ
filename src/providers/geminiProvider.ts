/* ============================================================
   RELIQ — Google Gemini Model Provider Adapter
   
   Secure server-side proxy integration for Google Gemini models.
   Supports Gemini 2.0 Flash Thinking, Gemini 1.5 Pro, and 1.5 Flash.
   Extracts prompt tokens, candidate tokens, thought/reasoning tokens,
   and cached content tokens into normalized UsageRecord telemetry.
   
   CRITICAL SECURITY: Raw API keys are NEVER exposed on the client.
   All requests route through server-side /api/providers/gemini.
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

const DEFAULT_PROXY_ENDPOINT = '/api/providers/gemini';

export class GeminiProvider implements ModelProvider {
  readonly id = 'google-gemini';
  readonly name = 'Google Gemini (Server-Side Secure Proxy)';
  readonly providerType = 'google' as const;

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
        'gemini-flash-latest',
        'gemini-pro-latest',
        'gemini-2.0-flash-thinking-exp',
        'gemini-2.0-flash',
        'gemini-1.5-pro-002',
        'gemini-1.5-flash-002',
      ],
      supportsStreaming: true,
      supportsTools: true,
      supportsReasoningTokens: true,
      supportsPromptCaching: true,
      isServerSideOnly: true,
      configured: this.isConfigured(),
      proxyEndpoint: this.proxyEndpoint,
      docsUrl: 'https://ai.google.dev/gemini-api/docs',
    };
  }

  calculateCost(params: CostCalculationParams): number {
    const { costUsd } = calculateTokenCost(params);
    return costUsd ?? 0;
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const startTime = performance.now();
    const caseIndex = request.metadata?.caseIndex ?? 1;
    const totalCases = request.metadata?.totalCases ?? 1;
    const model = request.modelIdentifier || 'gemini-1.5-pro-002';
    const maxTokens = request.maxTokens ?? 2048;

    console.log(`\n[Gemini] Case ${caseIndex}/${totalCases}`);
    console.log(`[Gemini] model=${model}`);
    console.log(`[Gemini] maxOutputTokens=${maxTokens}`);
    console.log(`Request sent`);

    try {
      const response = await fetch(this.proxyEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Reliq-Provider': 'google',
        },
        body: JSON.stringify({
          model,
          contents: [
            {
              role: 'user',
              parts: [{ text: request.input }],
            },
          ],
          systemInstruction: request.systemPrompt
            ? { parts: [{ text: request.systemPrompt }] }
            : undefined,
          generationConfig: {
            temperature: request.temperature ?? 0.2,
            maxOutputTokens: maxTokens,
          },
          metadata: {
            testCaseId: request.testCaseId,
            promptVersion: request.promptVersion,
            caseIndex: request.metadata?.caseIndex,
            totalCases: request.metadata?.totalCases,
          },
        }),
      });

      const clientLatencyMs = Math.round(performance.now() - startTime);

      if (!response.ok) {
        const errorJson = await response.json().catch(() => ({ error: 'Unknown network error' }));
        const errMsg = errorJson.error || `Gemini proxy returned status ${response.status}`;
        console.log(`HTTP ${response.status}`);
        console.log(`Latency: ${clientLatencyMs}ms`);
        console.log(`In: 0`);
        console.log(`Out: 0`);
        console.log(`Error: ${errMsg}`);
        return this.createErrorResponse(
          request,
          errMsg,
          clientLatencyMs,
          response.status,
          errorJson.retries || 0
        );
      }

      const data = await response.json();
      const candidate = data.candidates?.[0];
      const finishReason = candidate?.finishReason;
      const parts = candidate?.content?.parts || [];

      // Separate thinking tokens from final response text
      const nonThoughtPart = parts.find((p: any) => typeof p.text === 'string' && !p.thought);
      const textPart = nonThoughtPart || parts.find((p: any) => typeof p.text === 'string');
      let output = textPart?.text || data.output || '';

      // Handle safety-blocked responses
      if (candidate?.finishReason === 'SAFETY') {
        output = `[Safety Filter Blocked: finishReason=SAFETY]`;
      } else if (data.promptFeedback?.blockReason) {
        output = `[Prompt Filter Blocked: ${data.promptFeedback.blockReason}]`;
      }

      const usageMetadata = data.usageMetadata || {};
      const inputTokens = usageMetadata.promptTokenCount ?? 0;
      const outputTokens = usageMetadata.candidatesTokenCount ?? 0;
      const cachedTokens =
        usageMetadata.cachedContentTokenCount !== undefined
          ? usageMetadata.cachedContentTokenCount
          : undefined;

      // Extract thinking/reasoning tokens if returned by model
      let reasoningTokens: number | undefined = undefined;
      if (usageMetadata.thoughtsTokenCount !== undefined) {
        reasoningTokens = usageMetadata.thoughtsTokenCount;
      } else if (usageMetadata.thoughtTokenCount !== undefined) {
        reasoningTokens = usageMetadata.thoughtTokenCount;
      } else {
        const thinkingDetail = usageMetadata.candidatesTokensDetails?.find(
          (d: any) => d.modality === 'THINKING'
        );
        if (thinkingDetail?.tokenCount !== undefined) {
          reasoningTokens = thinkingDetail.tokenCount;
        }
      }

      const totalTokens = usageMetadata.totalTokenCount ?? (inputTokens + outputTokens);
      const latencyMs = data._reliq_telemetry?.latencyMs ?? clientLatencyMs;
      const retries = data._reliq_telemetry?.retries ?? 0;

      console.log(`HTTP ${response.status}`);
      console.log(`Latency: ${latencyMs}ms`);
      console.log(`In: ${inputTokens}`);
      console.log(`Out: ${outputTokens}`);
      if (reasoningTokens !== undefined) {
        console.log(`Thinking: ${reasoningTokens}`);
      }

      const estimatedCostUsd = this.calculateCost({
        model: request.modelIdentifier,
        inputTokens,
        outputTokens,
        reasoningTokens,
        cachedTokens,
      });

      const usage: UsageRecord = {
        provider: 'google',
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
      console.log(`[Gemini] HTTP 503 Error: ${err.message}`);
      return this.createErrorResponse(
        request,
        `Google Gemini Proxy Endpoint unreachable (${this.proxyEndpoint}). Set up server-side GEMINI_API_KEY environment variable. Error: ${err.message}`,
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
    let errorCode = 'PROXY_UNAVAILABLE';
    const lower = errorMessage.toLowerCase();
    if (statusCode === 429 || lower.includes('quota') || lower.includes('rate limit') || lower.includes('rate_limit')) {
      errorCode = 'RATE_LIMIT_EXCEEDED';
    } else if (statusCode === 401 || statusCode === 403 || lower.includes('api key') || lower.includes('unauthorized')) {
      errorCode = 'AUTH_FAILED';
    } else if (statusCode === 408 || statusCode === 504 || lower.includes('timeout') || lower.includes('aborted')) {
      errorCode = 'TIMEOUT';
    } else if (statusCode >= 500) {
      errorCode = 'SERVER_ERROR';
    }

    return {
      output: `[Error: Provider proxy unconfigured or failed - ${errorMessage}]`,
      usage: {
        provider: 'google',
        model: request.modelIdentifier,
        modelVersion: request.promptVersion,
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        latencyMs,
        estimatedCostUsd: 0,
        retries,
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

export const geminiProvider = new GeminiProvider();
export const googleGeminiProvider = geminiProvider;
export { GeminiProvider as GoogleGeminiProvider };
