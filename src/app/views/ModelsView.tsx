/* ============================================================
   RELIQ — AI Evaluation Laboratory Models Library View
   Provider Telemetry • Context Lengths • Pricing & Latency Tiers
   ============================================================ */

import React, { useState } from 'react';
import { useRouter } from '../../router/useRouter';
import { MODEL_PRICING_TABLE } from '../../providers/pricing';

interface ModelEntry {
  id: string;
  name: string;
  provider: 'groq' | 'cerebras' | 'google' | 'openai' | 'anthropic';
  providerLabel: string;
  contextWindow: string;
  latencyTier: string;
  role: 'FAST_INFERENCE' | 'REASONING' | 'FLAGSHIP' | 'SPECIALIZED';
  inputPricePer1M: number;
  outputPricePer1M: number;
  description: string;
  status: 'ACTIVE' | 'CALIBRATED' | 'READY';
}

const MODELS_CATALOG: ModelEntry[] = [
  {
    id: 'openai/gpt-oss-20b',
    name: 'GPT-OSS 20B',
    provider: 'groq',
    providerLabel: 'Groq LPU',
    contextWindow: '128k',
    latencyTier: '~85ms TTFT',
    role: 'FAST_INFERENCE',
    inputPricePer1M: MODEL_PRICING_TABLE['openai/gpt-oss-20b']?.costPerMillionInputTokens ?? 0.1,
    outputPricePer1M: MODEL_PRICING_TABLE['openai/gpt-oss-20b']?.costPerMillionOutputTokens ?? 0.3,
    description: 'High-speed LPU accelerated inference for latency-critical agent workflows.',
    status: 'ACTIVE',
  },
  {
    id: 'openai/gpt-oss-120b',
    name: 'GPT-OSS 120B',
    provider: 'groq',
    providerLabel: 'Groq LPU',
    contextWindow: '128k',
    latencyTier: '~140ms TTFT',
    role: 'FLAGSHIP',
    inputPricePer1M: MODEL_PRICING_TABLE['openai/gpt-oss-120b']?.costPerMillionInputTokens ?? 0.6,
    outputPricePer1M: MODEL_PRICING_TABLE['openai/gpt-oss-120b']?.costPerMillionOutputTokens ?? 1.8,
    description: 'Flagship reasoning and instruction-following capability on Groq LPUs.',
    status: 'ACTIVE',
  },
  {
    id: 'qwen/qwen3.8-27b',
    name: 'Qwen 3.8 27B',
    provider: 'groq',
    providerLabel: 'Groq LPU',
    contextWindow: '128k',
    latencyTier: '~110ms TTFT',
    role: 'SPECIALIZED',
    inputPricePer1M: MODEL_PRICING_TABLE['qwen/qwen3.8-27b']?.costPerMillionInputTokens ?? 0.35,
    outputPricePer1M: MODEL_PRICING_TABLE['qwen/qwen3.8-27b']?.costPerMillionOutputTokens ?? 0.95,
    description: 'Designated Independent LLM-as-a-Judge with high calibrated arbitration accuracy.',
    status: 'ACTIVE',
  },
  {
    id: 'allam-2-7b',
    name: 'ALLaM 2 7B',
    provider: 'groq',
    providerLabel: 'Groq LPU',
    contextWindow: '32k',
    latencyTier: '~70ms TTFT',
    role: 'FAST_INFERENCE',
    inputPricePer1M: MODEL_PRICING_TABLE['allam-2-7b']?.costPerMillionInputTokens ?? 0.08,
    outputPricePer1M: MODEL_PRICING_TABLE['allam-2-7b']?.costPerMillionOutputTokens ?? 0.24,
    description: 'Compact high-speed bilingual Arabic/English inference model.',
    status: 'ACTIVE',
  },
  {
    id: 'gpt-oss-120b',
    name: 'Cerebras GPT-OSS 120B',
    provider: 'cerebras',
    providerLabel: 'Cerebras Wafer',
    contextWindow: '128k',
    latencyTier: '~95ms TTFT',
    role: 'FLAGSHIP',
    inputPricePer1M: 0.6,
    outputPricePer1M: 1.8,
    description: 'Wafer-scale engine with extreme token-per-second output throughput.',
    status: 'ACTIVE',
  },
  {
    id: 'llama3.1-8b',
    name: 'Cerebras Llama 3.1 8B',
    provider: 'cerebras',
    providerLabel: 'Cerebras Wafer',
    contextWindow: '128k',
    latencyTier: '~45ms TTFT',
    role: 'FAST_INFERENCE',
    inputPricePer1M: 0.1,
    outputPricePer1M: 0.2,
    description: 'Ultra-low latency edge benchmarking target for production verification.',
    status: 'READY',
  },
  {
    id: 'gemini-3.6-flash',
    name: 'Gemini 3.6 Flash',
    provider: 'google',
    providerLabel: 'Google AI',
    contextWindow: '1000k',
    latencyTier: '~160ms TTFT',
    role: 'FAST_INFERENCE',
    inputPricePer1M: 0.075,
    outputPricePer1M: 0.3,
    description: 'Next-gen million-token context window with sub-second multimodal execution.',
    status: 'ACTIVE',
  },
  {
    id: 'gemini-pro-latest',
    name: 'Gemini Pro Latest',
    provider: 'google',
    providerLabel: 'Google AI',
    contextWindow: '2000k',
    latencyTier: '~280ms TTFT',
    role: 'FLAGSHIP',
    inputPricePer1M: 1.25,
    outputPricePer1M: 5.0,
    description: 'Deep context reasoning and enterprise data extraction benchmark baseline.',
    status: 'ACTIVE',
  },
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    providerLabel: 'OpenAI API',
    contextWindow: '128k',
    latencyTier: '~240ms TTFT',
    role: 'FLAGSHIP',
    inputPricePer1M: 2.5,
    outputPricePer1M: 10.0,
    description: 'Omni-modal foundation model for high-rigor baseline quality comparisons.',
    status: 'ACTIVE',
  },
  {
    id: 'claude-3-5-sonnet-20241022',
    name: 'Claude 3.5 Sonnet',
    provider: 'anthropic',
    providerLabel: 'Anthropic API',
    contextWindow: '200k',
    latencyTier: '~290ms TTFT',
    role: 'REASONING',
    inputPricePer1M: 3.0,
    outputPricePer1M: 15.0,
    description: 'State-of-the-art coding and safety benchmark target with prompt caching.',
    status: 'ACTIVE',
  },
];

export const ModelsView: React.FC = () => {
  const { navigate } = useRouter();
  const [selectedProvider, setSelectedProvider] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredModels = MODELS_CATALOG.filter((m) => {
    const matchesProvider = selectedProvider === 'ALL' || m.provider === selectedProvider;
    const matchesSearch =
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.providerLabel.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesProvider && matchesSearch;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '1440px', margin: '0 auto' }}>
      {/* View Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ fontSize: '0.68rem', fontFamily: 'monospace', letterSpacing: '0.12em', color: '#60A5FA', fontWeight: 700, textTransform: 'uppercase' }}>
            REGISTRY // EVALUATION TARGETS
          </div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#F2F2F2', margin: '0.2rem 0 0.35rem 0', letterSpacing: '-0.02em' }}>
            Model Library & Providers
          </h1>
          <p style={{ color: '#858585', fontSize: '0.82rem', margin: 0, maxWidth: '640px', lineHeight: 1.5 }}>
            Calibrated foundation models and high-throughput inference endpoints available for baseline and candidate evaluation runs.
          </p>
        </div>

        <button
          onClick={() => navigate('#/app/evaluations')}
          style={{
            background: '#1E3A8A',
            color: '#F2F2F2',
            border: '1px solid #1E3A8A',
            padding: '0.5rem 1rem',
            borderRadius: '2px',
            fontSize: '0.78rem',
            fontFamily: 'monospace',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'background 0.15s ease, border-color 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = '#2563EB';
            e.currentTarget.style.borderColor = '#2563EB';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = '#1E3A8A';
            e.currentTarget.style.borderColor = '#1E3A8A';
          }}
        >
          + RUN EVALUATION
        </button>
      </div>

      {/* Control Bar: Provider Filter Tabs & Search */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.8rem',
          background: '#151515',
          border: '1px solid #292929',
          borderRadius: '2px',
          padding: '0.6rem 0.8rem',
        }}
      >
        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          {['ALL', 'groq', 'cerebras', 'google', 'openai', 'anthropic'].map((prov) => {
            const isSelected = selectedProvider === prov;
            const label = prov === 'ALL' ? 'ALL PROVIDERS' : prov.toUpperCase();
            return (
              <button
                key={prov}
                onClick={() => setSelectedProvider(prov)}
                style={{
                  background: isSelected ? '#0A1A35' : 'transparent',
                  color: isSelected ? '#F2F2F2' : '#858585',
                  border: isSelected ? '1px solid #2563EB' : '1px solid transparent',
                  borderRadius: '2px',
                  padding: '0.3rem 0.65rem',
                  fontSize: '0.72rem',
                  fontFamily: 'monospace',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', width: '240px' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search models..."
            style={{
              width: '100%',
              background: '#1B1B1B',
              border: '1px solid #292929',
              borderRadius: '2px',
              padding: '0.35rem 0.65rem',
              color: '#F2F2F2',
              fontSize: '0.78rem',
              fontFamily: 'monospace',
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Models Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
          gap: '1rem',
        }}
      >
        {filteredModels.map((model) => (
          <div
            key={model.id}
            style={{
              background: '#151515',
              border: '1px solid #292929',
              borderRadius: '2px',
              padding: '1.1rem',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              gap: '1rem',
              transition: 'border-color 0.15s ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#3A3A3A')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#292929')}
          >
            <div>
              {/* Header: Provider & Role Tag */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span
                  style={{
                    fontSize: '0.65rem',
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    letterSpacing: '0.06em',
                    color: '#858585',
                    background: '#1B1B1B',
                    padding: '0.15rem 0.45rem',
                    borderRadius: '2px',
                    border: '1px solid #292929',
                  }}
                >
                  {model.providerLabel.toUpperCase()}
                </span>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: '#22C55E',
                      display: 'inline-block',
                    }}
                  />
                  <span style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: '#22C55E' }}>
                    {model.status}
                  </span>
                </div>
              </div>

              {/* Model Name & ID */}
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#F2F2F2', margin: '0 0 0.2rem 0' }}>
                {model.name}
              </h3>
              <div style={{ fontSize: '0.72rem', fontFamily: 'monospace', color: '#858585', marginBottom: '0.65rem' }}>
                {model.id}
              </div>

              {/* Description */}
              <p style={{ fontSize: '0.78rem', color: '#858585', margin: 0, lineHeight: 1.45 }}>
                {model.description}
              </p>
            </div>

            {/* Spec Strip: Context, Latency, Cost */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '0.5rem',
                background: '#1B1B1B',
                border: '1px solid #292929',
                borderRadius: '2px',
                padding: '0.6rem 0.75rem',
                fontSize: '0.72rem',
                fontFamily: 'monospace',
              }}
            >
              <div>
                <div style={{ color: '#555555', fontSize: '0.62rem' }}>CONTEXT</div>
                <div style={{ color: '#F2F2F2', fontWeight: 600 }}>{model.contextWindow}</div>
              </div>

              <div>
                <div style={{ color: '#555555', fontSize: '0.62rem' }}>LATENCY</div>
                <div style={{ color: '#F2F2F2', fontWeight: 600 }}>{model.latencyTier}</div>
              </div>

              <div>
                <div style={{ color: '#555555', fontSize: '0.62rem' }}>PRICING</div>
                <div style={{ color: '#22C55E', fontWeight: 600 }}>${model.inputPricePer1M}/M</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
