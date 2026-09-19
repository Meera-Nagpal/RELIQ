/* ============================================================
   RELIQ — Server-Side AI Model Provider Adapters
   
   Direct upstream provider adapters executing in Node.js server context.
   Credentials read strictly from server environment (process.env / .env.local).
   
   SECURITY PROTOCOLS:
   - Credentials NEVER sent to browser / client bundle.
   - Credentials NEVER logged in console or response payloads.
   - Strictly preserves V2.7.3 / V2.7.4 failure semantics:
     Operational provider errors (401, 403, 429, 500, timeouts) are
     categorized as operational failures and NEVER as model quality failures.
   - Token usage and latencies are captured from actual provider telemetry.
   ============================================================ */

import {
  CostCalculationParams,
  ModelProvider,
  ModelRequest,
  ModelResponse,
  ProviderMetadata,
  ProviderType,
  RateLimitInfo,
  UsageRecord,
  NormalizedToolCall,
} from '../providers/types';
import { calculateTokenCost } from '../providers/pricing';
import { defaultModelProvider } from '../providers/demoProvider';
import { fetchWithRetry, getApiKey } from './serverUtils';
import { providerScheduler } from './providerScheduler';
import { ServerCerebrasProvider } from './providers/cerebrasProvider';

export { ServerCerebrasProvider };

export class ServerGeminiProvider implements ModelProvider {
  readonly id = 'google-gemini';
  readonly name = 'Google Gemini (Server Execution)';
  readonly providerType = 'google' as const;

  isConfigured(): boolean {
    return Boolean(getApiKey('GEMINI_API_KEY'));
  }

  getMetadata(): ProviderMetadata {
    return {
      id: this.id,
      name: this.name,
      providerType: this.providerType,
      supportedModels: [
        'gemini-3.6-flash',
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
      docsUrl: 'https://ai.google.dev/gemini-api/docs',
    };
  }

  calculateCost(params: CostCalculationParams): number {
    const { costUsd } = calculateTokenCost(params);
    return costUsd ?? 0;
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const startTime = Date.now();
    const model = request.modelIdentifier || 'gemini-1.5-pro-002';
    const apiKey = getApiKey('GEMINI_API_KEY');

    // 1. Missing server-side credential -> AUTHENTICATION_ERROR (State B)
    if (!apiKey) {
      console.log(`[RELIQ Server Provider] GEMINI 401 — GEMINI_API_KEY not configured in .env.local`);
      return {
        output: '',
        usage: {
          provider: 'google',
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
            message: 'GEMINI_API_KEY is not configured in server-side environment (.env.local).',
          },
        },
        isDemoMode: false,
      };
    }

    return providerScheduler.schedule('google', async () => {
      // 2. Format contents with system directive
      let contents = [
        {
          role: 'user',
          parts: [{ text: request.input }],
        },
      ];
      if (request.systemPrompt) {
        contents[0].parts[0].text = `[System Directive: ${request.systemPrompt}]\n\n${request.input}`;
      }

      try {
        const { response, retries, latencyMs } = await fetchWithRetry({
          url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
            model
          )}:generateContent?key=${apiKey}`,
          init: {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents,
              generationConfig: {
                temperature: request.temperature ?? 0.0,
                maxOutputTokens: request.maxTokens ?? 2048,
              },
            }),
          },
          maxRetries: 2,
          baseDelayMs: 1500,
          timeoutMs: 35000,
        });

        const rateLimit: RateLimitInfo = {
          retryAfter: response.headers.get('retry-after') || undefined,
        };

        const data = await response.json().catch(() => ({
          error: { message: `Non-JSON HTTP ${response.status} response from Google Gemini API` },
        }));

        // 3. Handle upstream HTTP errors
        if (!response.ok) {
          const errMsg = data.error?.message || data.error || `Google Gemini API returned HTTP ${response.status}`;
          const isQuota = response.status === 429;
          const isAuth = response.status === 401 || response.status === 403;
          console.log(`[RELIQ Server Provider] <- GEMINI ${response.status} ERROR: ${errMsg}`);

          // Try extracting retry-after from error text if missing from headers
          if (!rateLimit.retryAfter) {
            const match = String(errMsg).match(/retry in ([\d\.]+)s/i) || String(errMsg).match(/retry after ([\d\.]+)s/i);
            if (match) {
              rateLimit.retryAfter = String(Math.ceil(parseFloat(match[1])));
            }
          }

          // Check Google RPC details
          let retrySec = rateLimit.retryAfter ? parseInt(rateLimit.retryAfter, 10) : 0;
          const retryInfo = data?.error?.details?.find(
            (d: any) => d?.['@type']?.includes('RetryInfo') || d?.retryDelay
          );
          if (retryInfo?.retryDelay) {
            const sec = parseFloat(String(retryInfo.retryDelay).replace('s', ''));
            if (!isNaN(sec) && sec > 0) {
              retrySec = Math.max(retrySec, Math.ceil(sec));
              rateLimit.retryAfter = String(retrySec);
            }
          }

          const quotaViolation = data?.error?.details?.find((d: any) => d?.violations)?.violations?.[0];
          const quotaId = quotaViolation?.quotaId;
          const quotaMetric = quotaViolation?.quotaMetric;
          const isDailyExhausted = Boolean(quotaId?.includes('PerDay'));

          if (isQuota) {
            providerScheduler.recordRateLimit('google', retrySec || 60, errMsg, {
              quotaId,
              quotaMetric,
              isDailyExhausted,
            });
          }

          return {
            output: '',
            usage: {
              provider: 'google',
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

        // On 200 OK, record success in scheduler
        providerScheduler.recordSuccess('google');

        // 4. Extract generated text
        const candidate = data.candidates?.[0];
        const partText = candidate?.content?.parts?.[0]?.text;
        const finishReason = candidate?.finishReason;

      // Handle malformed or empty output
      if (!partText || partText.trim() === '') {
        console.log(`[RELIQ Server Provider] <- GEMINI 200 MALFORMED/EMPTY finishReason=${finishReason}`);
        return {
          output: '',
          usage: {
            provider: 'google',
            model,
            modelVersion: request.promptVersion,
            inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
            outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
            totalTokens: data.usageMetadata?.totalTokenCount ?? 0,
            latencyMs,
            retries,
            estimatedCostUsd: 0,
            error: {
              status: 200,
              code: 'MALFORMED_RESPONSE',
              message: `Model returned empty response payload (finishReason: ${finishReason || 'UNKNOWN'})`,
            },
          },
          isDemoMode: false,
        };
      }

      // 5. Usage telemetry extraction
      const usageMetadata = data.usageMetadata || {};
      const inputTokens = usageMetadata.promptTokenCount ?? 0;
      const outputTokens = usageMetadata.candidatesTokenCount ?? 0;
      const reasoningTokens = usageMetadata.thoughtsTokenCount ?? usageMetadata.thoughtTokenCount;
      const cachedTokens = usageMetadata.cachedContentTokenCount;
      const totalTokens = usageMetadata.totalTokenCount ?? (inputTokens + outputTokens);

      const estimatedCostUsd = this.calculateCost({
        model,
        provider: 'google',
        inputTokens,
        outputTokens,
        reasoningTokens,
        cachedTokens,
      });

      console.log(`[RELIQ Server Provider] <- GEMINI 200 OK | Latency: ${latencyMs}ms | In: ${inputTokens} | Out: ${outputTokens}`);

      return {
        output: partText,
        usage: {
          provider: 'google',
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
        },
        isDemoMode: false,
      };
    } catch (err: any) {
      const isTimeout =
        err.name === 'AbortError' ||
        err.message?.toLowerCase().includes('timeout') ||
        err.message?.toLowerCase().includes('aborted');

      console.log(`[RELIQ Server Provider] <- GEMINI EXCEPTION: ${err.message}`);

      return {
        output: '',
        usage: {
          provider: 'google',
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
              ? 'Request timed out waiting for Google Gemini API'
              : `Network connection error: ${err.message}`,
          },
        },
        isDemoMode: false,
      };
    }
    });
  }
}

export class ServerGroqProvider implements ModelProvider {
  readonly id = 'groq';
  readonly name = 'Groq (Server Execution)';
  readonly providerType = 'groq' as const;

  isConfigured(): boolean {
    return Boolean(getApiKey('GROQ_API_KEY'));
  }

  getMetadata(): ProviderMetadata {
    return {
      id: this.id,
      name: this.name,
      providerType: this.providerType,
      supportedModels: [
        'openai/gpt-oss-20b',
        'openai/gpt-oss-120b',
        'groq/compound',
        'groq/compound-mini',
        'qwen/qwen3.8-27b',
        'allam-2-7b',
      ],
      supportsStreaming: true,
      supportsTools: true,
      supportsReasoningTokens: true,
      supportsPromptCaching: false,
      isServerSideOnly: true,
      configured: this.isConfigured(),
      docsUrl: 'https://console.groq.com/docs',
    };
  }

  calculateCost(params: CostCalculationParams): number {
    const { costUsd } = calculateTokenCost(params);
    return costUsd ?? 0;
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const startTime = Date.now();
    const model = request.modelIdentifier || 'openai/gpt-oss-20b';
    const apiKey = getApiKey('GROQ_API_KEY');

    // 1. Missing server-side credential -> AUTHENTICATION_ERROR
    if (!apiKey) {
      console.log(`[GROQ] Request started`);
      console.log(`[GROQ] Model: ${model}`);
      console.log(`[GROQ] Request failed`);
      console.log(`[GROQ] Status: 401`);
      console.log(`[GROQ] Error: AUTHENTICATION_ERROR`);
      return {
        output: '',
        usage: {
          provider: 'groq',
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
            message: 'GROQ_API_KEY is not configured in server-side environment (.env.local).',
          },
        },
        isDemoMode: false,
      };
    }

    return providerScheduler.schedule('groq', async () => {
      // 2. Format messages
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

    console.log(`[GROQ] Request started`);
    console.log(`[GROQ] Model: ${model}`);

    try {
      const isGptOss = model === 'openai/gpt-oss-20b' || model === 'openai/gpt-oss-120b';
      const reasoningEffort = isGptOss ? (request.reasoningEffort || 'medium') : undefined;

      const groqPayload: any = {
        model,
        messages,
        temperature: request.temperature ?? 0.0,
        max_tokens: request.maxTokens ?? 2048,
      };

      if (reasoningEffort) {
        groqPayload.reasoning_effort = reasoningEffort;
      }

      // Enforce JSON structured output only if the test case specifically requires structured JSON
      if (request.evaluatorType === 'json_validity') {
        groqPayload.response_format = { type: 'json_object' };
      }

      const { response, retries, latencyMs } = await fetchWithRetry({
        url: 'https://api.groq.com/openai/v1/chat/completions',
        init: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(groqPayload),
        },
        maxRetries: 3,
        baseDelayMs: 1000,
        timeoutMs: 30000,
      });

      const rateLimit: RateLimitInfo = {
        limitRequests: response.headers.get('x-ratelimit-limit-requests') || undefined,
        remainingRequests: response.headers.get('x-ratelimit-remaining-requests') || undefined,
        resetRequests: response.headers.get('x-ratelimit-reset-requests') || undefined,
        limitTokens: response.headers.get('x-ratelimit-limit-tokens') || undefined,
        remainingTokens: response.headers.get('x-ratelimit-remaining-tokens') || undefined,
        resetTokens: response.headers.get('x-ratelimit-reset-tokens') || undefined,
        retryAfter: response.headers.get('retry-after') || undefined,
      };

      const data = await response.json().catch(() => ({
        error: { message: `Non-JSON HTTP ${response.status} response from Groq API` },
      }));

      // 3. Handle upstream HTTP errors
      if (!response.ok) {
        // Gracefully recover when Groq returns tool_use_failed with model's actual generation
        if (data.error?.code === 'tool_use_failed' && data.error?.failed_generation) {
          const recoveredOutput =
            typeof data.error.failed_generation === 'string'
              ? data.error.failed_generation
              : JSON.stringify(data.error.failed_generation);
          console.log(`[RELIQ Server Provider] <- GROQ RECOVERED tool_use_failed generation: ${recoveredOutput.slice(0, 80)}...`);
          return {
            output: recoveredOutput,
            usage: {
              provider: 'groq',
              model,
              modelVersion: request.promptVersion,
              inputTokens: data.usage?.prompt_tokens ?? 0,
              outputTokens: data.usage?.completion_tokens ?? 0,
              totalTokens: data.usage?.total_tokens ?? 0,
              latencyMs,
              retries,
              rateLimit,
              estimatedCostUsd: 0,
            },
            isDemoMode: false,
          };
        }

        const errMsg = data.error?.message || data.error || `Groq API returned HTTP ${response.status}`;
        const isQuota = response.status === 429;
        const isAuth = response.status === 401 || response.status === 403;
        console.log(`[GROQ] Request failed`);
        console.log(`[GROQ] Status: ${response.status}`);
        const errType = isAuth ? 'AUTHENTICATION_ERROR' : isQuota ? 'RATE_LIMIT_EXCEEDED' : 'PROVIDER_ERROR';
        console.log(`[GROQ] Error: ${errType}`);

        if (isQuota) {
          const retrySec = rateLimit.retryAfter ? parseInt(rateLimit.retryAfter, 10) : 30;
          providerScheduler.recordRateLimit('groq', retrySec || 30, errMsg);
        }

        return {
          output: '',
          usage: {
            provider: 'groq',
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

      // 4. Extract generated text and normalized tool calls
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
          console.log(`[RELIQ Server Provider] <- GROQ 200 MALFORMED/EMPTY`);
          return {
            output: '',
            usage: {
              provider: 'groq',
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
                message: 'Groq returned empty response payload',
              },
            },
            isDemoMode: false,
          };
        }
      }

      // 5. Usage telemetry extraction
      const usageData = data.usage || {};
      const inputTokens = usageData.prompt_tokens ?? 0;
      const outputTokens = usageData.completion_tokens ?? 0;
      const reasoningTokens = usageData.completion_tokens_details?.reasoning_tokens;
      const cachedTokens = usageData.prompt_tokens_details?.cached_tokens;
      const totalTokens = usageData.total_tokens ?? (inputTokens + outputTokens);

      const estimatedCostUsd = this.calculateCost({
        model,
        provider: 'groq',
        inputTokens,
        outputTokens,
        reasoningTokens,
        cachedTokens,
      });

      console.log(`[GROQ] Response: 200`);
      console.log(`[GROQ] Latency: ${latencyMs} ms`);
      console.log(`[GROQ] Tokens: ${totalTokens}`);
      providerScheduler.recordSuccess('groq');

      return {
        output,
        toolCalls,
        usage: {
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
        },
        isDemoMode: false,
      };
    } catch (err: any) {
      const isTimeout =
        err.name === 'AbortError' ||
        err.message?.toLowerCase().includes('timeout') ||
        err.message?.toLowerCase().includes('aborted');

      console.log(`[GROQ] Request failed`);
      console.log(`[GROQ] Status: ${isTimeout ? 504 : 500}`);
      console.log(`[GROQ] Error: ${isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR'}`);

      return {
        output: '',
        usage: {
          provider: 'groq',
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
              ? 'Request timed out waiting for Groq API'
              : `Network connection error: ${err.message}`,
          },
        },
        isDemoMode: false,
      };
    }
    });
  }
}

export class ServerOpenAIProvider implements ModelProvider {
  readonly id = 'openai';
  readonly name = 'OpenAI (Server Execution)';
  readonly providerType = 'openai' as const;

  isConfigured(): boolean {
    return Boolean(getApiKey('OPENAI_API_KEY'));
  }

  getMetadata(): ProviderMetadata {
    return {
      id: this.id,
      name: this.name,
      providerType: this.providerType,
      supportedModels: [
        'gpt-4o',
        'gpt-4o-mini',
        'o1-preview',
        'o1-mini',
        'gpt-4-turbo',
      ],
      supportsStreaming: true,
      supportsTools: true,
      supportsReasoningTokens: true,
      supportsPromptCaching: true,
      isServerSideOnly: true,
      configured: this.isConfigured(),
      docsUrl: 'https://platform.openai.com/docs',
    };
  }

  calculateCost(params: CostCalculationParams): number {
    const { costUsd } = calculateTokenCost(params);
    return costUsd ?? 0;
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const startTime = Date.now();
    const model = request.modelIdentifier || 'gpt-4o';
    const apiKey = getApiKey('OPENAI_API_KEY');

    if (!apiKey) {
      console.log(`[RELIQ Server Provider] OPENAI 401 — OPENAI_API_KEY not configured in .env.local`);
      return {
        output: '',
        usage: {
          provider: 'openai',
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
            message: 'OPENAI_API_KEY is not configured in server-side environment (.env.local).',
          },
        },
        isDemoMode: false,
      };
    }

    const messages: any[] = [];
    if (request.systemPrompt) {
      messages.push({ role: 'system', content: request.systemPrompt });
    }
    messages.push({ role: 'user', content: request.input });

    try {
      const { response, retries, latencyMs } = await fetchWithRetry({
        url: 'https://api.openai.com/v1/chat/completions',
        init: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages,
            temperature: request.temperature ?? 0.0,
            max_tokens: request.maxTokens ?? 2048,
          }),
        },
        maxRetries: 3,
        baseDelayMs: 1000,
        timeoutMs: 30000,
      });

      const data = await response.json().catch(() => ({
        error: { message: `Non-JSON HTTP ${response.status} response from OpenAI API` },
      }));

      if (!response.ok) {
        const errMsg = data.error?.message || data.error || `OpenAI API returned HTTP ${response.status}`;
        const isQuota = response.status === 429;
        const isAuth = response.status === 401 || response.status === 403;

        return {
          output: '',
          usage: {
            provider: 'openai',
            model,
            modelVersion: request.promptVersion,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            latencyMs,
            retries,
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

      const output = data.choices?.[0]?.message?.content || '';
      if (!output || output.trim() === '') {
        return {
          output: '',
          usage: {
            provider: 'openai',
            model,
            modelVersion: request.promptVersion,
            inputTokens: data.usage?.prompt_tokens ?? 0,
            outputTokens: data.usage?.completion_tokens ?? 0,
            totalTokens: data.usage?.total_tokens ?? 0,
            latencyMs,
            retries,
            estimatedCostUsd: 0,
            error: {
              status: 200,
              code: 'MALFORMED_RESPONSE',
              message: 'OpenAI returned empty response payload',
            },
          },
          isDemoMode: false,
        };
      }

      const usageData = data.usage || {};
      const inputTokens = usageData.prompt_tokens ?? 0;
      const outputTokens = usageData.completion_tokens ?? 0;
      const reasoningTokens = usageData.completion_tokens_details?.reasoning_tokens;
      const cachedTokens = usageData.prompt_tokens_details?.cached_tokens;
      const totalTokens = usageData.total_tokens ?? (inputTokens + outputTokens);

      const estimatedCostUsd = this.calculateCost({
        model,
        provider: 'openai',
        inputTokens,
        outputTokens,
        reasoningTokens,
        cachedTokens,
      });

      return {
        output,
        usage: {
          provider: 'openai',
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
        },
        isDemoMode: false,
      };
    } catch (err: any) {
      const isTimeout =
        err.name === 'AbortError' ||
        err.message?.toLowerCase().includes('timeout') ||
        err.message?.toLowerCase().includes('aborted');

      return {
        output: '',
        usage: {
          provider: 'openai',
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
              ? 'Request timed out waiting for OpenAI API'
              : `Network connection error: ${err.message}`,
          },
        },
        isDemoMode: false,
      };
    }
  }
}

export class ServerAnthropicProvider implements ModelProvider {
  readonly id = 'anthropic';
  readonly name = 'Anthropic Claude (Server Execution)';
  readonly providerType = 'anthropic' as const;

  isConfigured(): boolean {
    return Boolean(getApiKey('ANTHROPIC_API_KEY'));
  }

  getMetadata(): ProviderMetadata {
    return {
      id: this.id,
      name: this.name,
      providerType: this.providerType,
      supportedModels: [
        'claude-3-7-sonnet-20250219',
        'claude-3-5-sonnet-20241022',
        'claude-3-5-haiku-20241022',
        'claude-3-opus-20240229',
      ],
      supportsStreaming: true,
      supportsTools: true,
      supportsReasoningTokens: true,
      supportsPromptCaching: true,
      isServerSideOnly: true,
      configured: this.isConfigured(),
      docsUrl: 'https://docs.anthropic.com',
    };
  }

  calculateCost(params: CostCalculationParams): number {
    const { costUsd } = calculateTokenCost(params);
    return costUsd ?? 0;
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    const startTime = Date.now();
    const model = request.modelIdentifier || 'claude-3-5-sonnet-20241022';
    const apiKey = getApiKey('ANTHROPIC_API_KEY');

    if (!apiKey) {
      console.log(`[RELIQ Server Provider] ANTHROPIC 401 — ANTHROPIC_API_KEY not configured in .env.local`);
      return {
        output: '',
        usage: {
          provider: 'anthropic',
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
            message: 'ANTHROPIC_API_KEY is not configured in server-side environment (.env.local).',
          },
        },
        isDemoMode: false,
      };
    }

    try {
      const { response, retries, latencyMs } = await fetchWithRetry({
        url: 'https://api.anthropic.com/v1/messages',
        init: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model,
            system: request.systemPrompt,
            messages: [{ role: 'user', content: request.input }],
            max_tokens: request.maxTokens ?? 2048,
            temperature: request.temperature ?? 0.0,
          }),
        },
        maxRetries: 3,
        baseDelayMs: 1000,
        timeoutMs: 30000,
      });

      const data = await response.json().catch(() => ({
        error: { message: `Non-JSON HTTP ${response.status} response from Anthropic API` },
      }));

      if (!response.ok) {
        const errMsg = data.error?.message || data.error || `Anthropic API returned HTTP ${response.status}`;
        const isQuota = response.status === 429;
        const isAuth = response.status === 401 || response.status === 403;

        return {
          output: '',
          usage: {
            provider: 'anthropic',
            model,
            modelVersion: request.promptVersion,
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            latencyMs,
            retries,
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

      const output = data.content?.[0]?.text || '';
      if (!output || output.trim() === '') {
        return {
          output: '',
          usage: {
            provider: 'anthropic',
            model,
            modelVersion: request.promptVersion,
            inputTokens: data.usage?.input_tokens ?? 0,
            outputTokens: data.usage?.output_tokens ?? 0,
            totalTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
            latencyMs,
            retries,
            estimatedCostUsd: 0,
            error: {
              status: 200,
              code: 'MALFORMED_RESPONSE',
              message: 'Anthropic returned empty response payload',
            },
          },
          isDemoMode: false,
        };
      }

      const inputTokens = data.usage?.input_tokens ?? 0;
      const outputTokens = data.usage?.output_tokens ?? 0;
      const totalTokens = inputTokens + outputTokens;

      const estimatedCostUsd = this.calculateCost({
        model,
        provider: 'anthropic',
        inputTokens,
        outputTokens,
      });

      return {
        output,
        usage: {
          provider: 'anthropic',
          model,
          modelVersion: request.promptVersion,
          inputTokens,
          outputTokens,
          totalTokens,
          latencyMs,
          estimatedCostUsd,
          retries,
          rawResponse: data,
        },
        isDemoMode: false,
      };
    } catch (err: any) {
      const isTimeout =
        err.name === 'AbortError' ||
        err.message?.toLowerCase().includes('timeout') ||
        err.message?.toLowerCase().includes('aborted');

      return {
        output: '',
        usage: {
          provider: 'anthropic',
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
              ? 'Request timed out waiting for Anthropic API'
              : `Network connection error: ${err.message}`,
          },
        },
        isDemoMode: false,
      };
    }
  }
}

/**
 * Resolves a server-side ModelProvider for a given model version specification.
 * Never silently falls back to DemoProvider for real providers.
 */
export function resolveServerProvider(version: { provider: ProviderType; modelIdentifier?: string }): ModelProvider {
  switch (version.provider) {
    case 'demo':
      return defaultModelProvider;
    case 'google':
      return new ServerGeminiProvider();
    case 'groq':
      return new ServerGroqProvider();
    case 'cerebras':
      return new ServerCerebrasProvider();
    case 'openai':
      return new ServerOpenAIProvider();
    case 'anthropic':
      return new ServerAnthropicProvider();
    default:
      throw new Error(`Provider '${version.provider}' is not supported by the RELIQ server.`);
  }
}
