/* ============================================================
   RELIQ — Server-Side Cerebras Provider Adapter
   
   Direct server-to-API integration with Cerebras CS-3 wafer-scale engine.
   - Endpoint: https://api.cerebras.ai/v1/chat/completions
   - Models: gpt-oss-120b (default), llama3.1-8b
   - Reads CEREBRAS_API_KEY securely via getApiKey('CEREBRAS_API_KEY')
   - Routes all calls through providerScheduler.schedule('cerebras', ...)
   - Extracts real rate limit headers and updates providerScheduler
   - Normalizes tool calls into NormalizedToolCall[]
   - Supports structured output (response_format: { type: 'json_object' })
   - Strict reliability failure semantics: 429, 401, 5xx, timeouts never produce qualityScore=0
   ============================================================ */

import {
  CostCalculationParams,
  ModelProvider,
  ModelRequest,
  ModelResponse,
  NormalizedToolCall,
  ProviderMetadata,
  RateLimitInfo,
} from '../../providers/types';
import { calculateTokenCost } from '../../providers/pricing';
import { providerScheduler } from '../providerScheduler';
import { fetchWithRetry, getApiKey } from '../serverUtils';

export class ServerCerebrasProvider implements ModelProvider {
  readonly id = 'cerebras';
  readonly name = 'Cerebras (Server Execution)';
  readonly providerType = 'cerebras' as const;

  isConfigured(): boolean {
    return Boolean(getApiKey('CEREBRAS_API_KEY'));
  }

  getMetadata(): ProviderMetadata {
    return {
      id: this.id,
      name: this.name,
      providerType: this.providerType,
      supportedModels: [
        'gpt-oss-120b',
        'llama3.1-8b',
      ],
      supportsStreaming: true,
      supportsTools: true,
      supportsReasoningTokens: true,
      supportsPromptCaching: false,
      isServerSideOnly: true,
      configured: this.isConfigured(),
      docsUrl: 'https://inference-docs.cerebras.ai',
    };
  }

  calculateCost(params: CostCalculationParams): number {
    const { costUsd } = calculateTokenCost(params);
    return costUsd ?? 0;
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const startTime = Date.now();
    const model = request.modelIdentifier || 'gpt-oss-120b';
    const apiKey = getApiKey('CEREBRAS_API_KEY');

    // 1. Missing server-side credential -> AUTHENTICATION_ERROR
    if (!apiKey) {
      console.log(`[CEREBRAS] Request started`);
      console.log(`[CEREBRAS] Model: ${model}`);
      console.log(`[CEREBRAS] Request failed`);
      console.log(`[CEREBRAS] Status: 401`);
      console.log(`[CEREBRAS] Error: AUTHENTICATION_ERROR`);
      return {
        output: '',
        usage: {
          provider: 'cerebras',
          model,
          modelVersion: request.promptVersion,
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: 0,
          latencyMs: 0,
          estimatedCostUsd: 0,
          error: {
            status: 401,
            code: 'AUTH_MISSING_KEY',
            message: 'CEREBRAS_API_KEY is not configured in server-side environment (.env.local).',
          },
        },
        isDemoMode: false,
      };
    }

    // 2. Route through providerScheduler for independent queue execution & rate limiting
    return providerScheduler.schedule('cerebras', async () => {
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

      const requestBody: Record<string, any> = {
        model,
        messages,
        temperature: request.temperature ?? 0.0,
        max_tokens: request.maxTokens ?? 2048,
      };

      // Structured output JSON schema support
      if (request.evaluatorType === 'json_validity') {
        requestBody.response_format = { type: 'json_object' };
      }

      // Preserve tool definitions if scenario requires them
      if (request.metadata?.tools && Array.isArray(request.metadata.tools)) {
        requestBody.tools = request.metadata.tools;
        requestBody.tool_choice = request.metadata.tool_choice || 'auto';
      }

      console.log(`[CEREBRAS] Request started`);
      console.log(`[CEREBRAS] Model: ${model}`);

      try {
        const { response, retries, latencyMs } = await fetchWithRetry({
          url: 'https://api.cerebras.ai/v1/chat/completions',
          init: {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(requestBody),
          },
          maxRetries: 3,
          baseDelayMs: 1000,
          timeoutMs: 30000,
        });

        const rateLimit: RateLimitInfo = {
          limitRequests: response.headers.get('x-ratelimit-limit-requests-day') || undefined,
          remainingRequests: response.headers.get('x-ratelimit-remaining-requests-day') || undefined,
          resetRequests: response.headers.get('x-ratelimit-reset-requests-day') || undefined,
          limitTokens: response.headers.get('x-ratelimit-limit-tokens-minute') || undefined,
          remainingTokens: response.headers.get('x-ratelimit-remaining-tokens-minute') || undefined,
          resetTokens: response.headers.get('x-ratelimit-reset-tokens-minute') || undefined,
          retryAfter: response.headers.get('retry-after') || undefined,
        };

        const data = await response.json().catch(() => ({
          error: { message: `Non-JSON HTTP ${response.status} response from Cerebras API` },
        }));

        // Handle upstream HTTP errors
        if (!response.ok) {
          const errMsg = data.error?.message || data.error || `Cerebras API returned HTTP ${response.status}`;
          const isQuota = response.status === 429;
          const isAuth = response.status === 401 || response.status === 403;
          console.log(`[CEREBRAS] Request failed`);
          console.log(`[CEREBRAS] Status: ${response.status}`);
          const errType = isAuth ? 'AUTHENTICATION_ERROR' : isQuota ? 'RATE_LIMIT_EXCEEDED' : 'PROVIDER_ERROR';
          console.log(`[CEREBRAS] Error: ${errType}`);

          if (isQuota) {
            const retrySec = rateLimit.retryAfter ? parseInt(rateLimit.retryAfter, 10) : 30;
            providerScheduler.recordRateLimit('cerebras', retrySec || 30, errMsg);
          }

          return {
            output: '',
            usage: {
              provider: 'cerebras',
              model,
              modelVersion: request.promptVersion,
              inputTokens: 0,
              outputTokens: 0,
              totalTokens: 0,
              latencyMs,
              retries,
              rateLimit,
              estimatedCostUsd: 0,
              error: {
                status: response.status,
                code: isQuota ? 'RATE_LIMIT_EXCEEDED' : isAuth ? 'AUTH_FAILED' : 'PROVIDER_ERROR',
                message: errMsg,
              },
            },
            isDemoMode: false,
          };
        }

        // Extract generated text and normalized tool calls
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

        let output = data.choices?.[0]?.message?.content || '';
        if (!output || output.trim() === '') {
          if (toolCalls && toolCalls.length > 0) {
            const primaryCall = toolCalls[0];
            output = JSON.stringify({
              tool: primaryCall.name,
              ...primaryCall.arguments,
            });
          } else {
            console.log(`[RELIQ Server Provider] <- CEREBRAS 200 MALFORMED/EMPTY`);
            return {
              output: '',
              usage: {
                provider: 'cerebras',
                model,
                modelVersion: request.promptVersion,
                inputTokens: data.usage?.prompt_tokens ?? 0,
                outputTokens: data.usage?.completion_tokens ?? 0,
                totalTokens: data.usage?.total_tokens ?? 0,
                latencyMs,
                retries,
                rateLimit,
                estimatedCostUsd: 0,
                error: {
                  status: 200,
                  code: 'MALFORMED_RESPONSE',
                  message: 'Cerebras returned empty response payload',
                },
              },
              isDemoMode: false,
            };
          }
        }

        // Usage telemetry extraction
        const usageData = data.usage || {};
        const inputTokens = usageData.prompt_tokens ?? 0;
        const outputTokens = usageData.completion_tokens ?? 0;
        const reasoningTokens = usageData.completion_tokens_details?.reasoning_tokens;
        const cachedTokens = usageData.prompt_tokens_details?.cached_tokens;
        const totalTokens = usageData.total_tokens ?? (inputTokens + outputTokens);

        const estimatedCostUsd = this.calculateCost({
          model,
          provider: 'cerebras',
          inputTokens,
          outputTokens,
          reasoningTokens,
          cachedTokens,
        });

        console.log(`[CEREBRAS] Response: 200`);
        console.log(`[CEREBRAS] Latency: ${latencyMs} ms`);
        console.log(`[CEREBRAS] Tokens: ${totalTokens}`);
        providerScheduler.recordSuccess('cerebras');

        return {
          output,
          toolCalls,
          usage: {
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
          },
          isDemoMode: false,
        };
      } catch (err: any) {
        const isTimeout =
          err.name === 'AbortError' ||
          err.message?.toLowerCase().includes('timeout') ||
          err.message?.toLowerCase().includes('aborted');

        console.log(`[CEREBRAS] Request failed`);
        console.log(`[CEREBRAS] Status: ${isTimeout ? 504 : 500}`);
        console.log(`[CEREBRAS] Error: ${isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR'}`);

        return {
          output: '',
          usage: {
            provider: 'cerebras',
            model,
            modelVersion: request.promptVersion,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            latencyMs: Date.now() - startTime,
            estimatedCostUsd: 0,
            error: {
              status: isTimeout ? 504 : 500,
              code: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
              message: isTimeout
                ? 'Request timed out waiting for Cerebras API'
                : `Network connection error: ${err.message}`,
            },
          },
          isDemoMode: false,
        };
      }
    });
  }
}
