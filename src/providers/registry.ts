/* ============================================================
   RELIQ — Model Provider Registry
   
   Central registry for all AI providers:
   ModelProvider
   ├── DemoProvider
   ├── GeminiProvider
   ├── OpenAIProvider
   └── AnthropicProvider
   
   The evaluation engine queries this registry to obtain provider adapters
   for any ModelVersion or runtime configuration.
   ============================================================ */

import { AnthropicProvider, anthropicProvider } from './anthropicProvider';
import { CerebrasProvider, cerebrasProvider } from './cerebrasProvider';
import { DemoProvider, defaultModelProvider, demoProvider } from './demoProvider';
import { GeminiProvider, geminiProvider, googleGeminiProvider } from './geminiProvider';
import { GroqProvider, groqProvider } from './groqProvider';
import { OpenAIProvider, openAIProvider } from './openaiProvider';
import { ModelProvider, ProviderMetadata, ProviderType } from './types';

export { DemoProvider, GeminiProvider, OpenAIProvider, AnthropicProvider, GroqProvider, CerebrasProvider };

export interface ServerProviderStatus {
  gemini: boolean;
  openai: boolean;
  anthropic: boolean;
  groq: boolean;
  cerebras: boolean;
}

export class ProviderRegistry {
  private providers: Map<string, ModelProvider> = new Map();

  constructor() {
    this.register(defaultModelProvider);
    this.register(geminiProvider);
    this.register(openAIProvider);
    this.register(anthropicProvider);
    this.register(groqProvider);
    this.register(cerebrasProvider);
  }

  /**
   * Register a new model provider adapter
   */
  register(provider: ModelProvider): void {
    this.providers.set(provider.id, provider);
    this.providers.set(provider.providerType, provider);
  }

  /**
   * Retrieve a provider by ID or ProviderType
   */
  getProvider(idOrType: string): ModelProvider | undefined {
    return this.providers.get(idOrType);
  }

  /**
   * Retrieve provider for a specific ProviderType
   */
  getProviderForType(type: ProviderType): ModelProvider {
    const provider = this.providers.get(type);
    if (provider) return provider;
    if (type === 'demo') return defaultModelProvider;
    throw new Error(`Requested provider '${type}' is not registered. Silent fallback to demo is forbidden.`);
  }

  /**
   * Retrieve the appropriate provider for a given model version specification.
   * STRICT: NEVER silently falls back to DemoProvider for real AI providers.
   */
  getProviderForVersion(version: { provider: ProviderType; modelIdentifier?: string }): ModelProvider {
    const provider = this.providers.get(version.provider);
    if (provider) {
      return provider;
    }
    if (version.provider === 'demo') {
      return defaultModelProvider;
    }
    throw new Error(`Provider '${version.provider}' is not registered. Live evaluation cannot fall back to demo.`);
  }

  /**
   * List metadata and capabilities of all registered providers
   */
  listProviders(): ProviderMetadata[] {
    const seen = new Set<string>();
    const list: ProviderMetadata[] = [];

    for (const provider of this.providers.values()) {
      if (!seen.has(provider.id)) {
        seen.add(provider.id);
        list.push(provider.getMetadata());
      }
    }

    return list;
  }

  /**
   * Query server-side status endpoint to check if backend environment keys are configured
   */
  async checkServerStatus(): Promise<ServerProviderStatus> {
    try {
      const res = await fetch('/api/providers/status');
      if (res.ok) {
        return await res.json();
      }
      return { gemini: false, openai: false, anthropic: false, groq: false, cerebras: false };
    } catch {
      return { gemini: false, openai: false, anthropic: false, groq: false, cerebras: false };
    }
  }
}

export const providerRegistry = new ProviderRegistry();
