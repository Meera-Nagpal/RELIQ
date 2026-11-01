# RELIQ — AI Reliability & Model Regression Testing Platform

RELIQ is an enterprise-grade AI reliability, regression detection, and model evaluation platform. It enables engineering teams to evaluate, benchmark, and gate production AI models and agent systems against strict quality, latency, safety, and cost thresholds before deployment.

---

## 🚀 Key Capabilities

### 1. Side-by-Side Model Benchmarking
- **Head-to-Head Comparison:** Compare baseline vs. candidate models with synchronized input/output inspection and side-by-side prompt execution.
- **Live Provider Integration:** Real-time inference across Groq (OpenAI GPT-OSS, Qwen), Cerebras, Google Gemini, OpenAI, and Anthropic.
- **Granular Telemetry:** Captures observed round-trip latency, prompt/completion tokens, reasoning tokens, and token-level cost accounting.

### 2. Multi-Layered Evaluation Pipeline
- **Deterministic Evaluators:** Fast, zero-API-cost deterministic checks including Exact Match, Normalized Text, and Keyword Criteria with punctuation tolerance.
- **Structured JSON Validation:** Strict RFC 8259 JSON validation, schema key enforcement, duplicate key detection, and markdown code fence extraction.
- **Behavioral Safety & Refusal Gates:** Distinguishes valid safety refusals from true quality failures; detects prompt injection indicators, credential leaks, and policy bypasses.
- **Surface Semantic Similarity:** Cosine vector math and token overlap for nuance-aware similarity scoring without external API dependencies.
- **Independent LLM-as-a-Judge:** Decoupled qualitative judging powered by independent models (e.g. Qwen 3.8 27B), strictly isolated from benchmark candidates.

### 3. Automated Regression Gating & Release Decisions
- **Decision Engine:** Automatically computes definitive release decisions (`SHIP`, `SHIP_WITH_CONDITIONS`, `BLOCK`, `INSUFFICIENT_EVIDENCE`) based on sample sizes and evidence strength.
- **Configurable Thresholds:** Set maximum allowable degradation in accuracy, maximum latency increase, and minimum pass rate requirements.
- **Root Cause Analysis:** Categorizes regressions into operational failures (rate limits, timeouts) vs. quality failures (formatting, reasoning, safety).

### 4. Flexible Dataset Management
- **Built-in Benchmarks:** Pre-configured golden datasets such as the 27-scenario Checkout Reliability Suite.
- **Multi-Format Ingestion:** Seamlessly upload and evaluate custom test suites via JSON, JSONL / NDJSON, CSV, and pairwise preference formats (chosen/rejected pairs).

### 5. Enterprise Security & Architecture
- **Zero Raw Secret Exposure:** API credentials and database service keys are secured strictly on the server-side proxy; keys are never transmitted to the client bundle or telemetry payloads.
- **Cloud-First Persistence:** Fully persisted projects, datasets, test cases, and evaluation runs backed by Supabase PostgreSQL with local offline fallback.

---

## 🏛️ System Architecture

```
┌────────────────────────────────────────────────────────┐
│                   Vercel (Frontend)                    │
│      React 18 + Vite SPA + Three.js / R3F Canvas       │
│         Auth Client (Supabase) + API Client            │
└──────────────────────────┬─────────────────────────────┘
                           │ HTTPS / REST (JWT Bearer)
                           ▼
┌────────────────────────────────────────────────────────┐
│                    Render (Backend)                    │
│          Node.js Standalone Evaluation Server          │
│       - Worker Pool Concurrency (Bounded Memory)       │
│       - SHA-256 Evaluation Response Caching            │
│       - Provider Rate-Limit Scheduler & Token Bucket   │
│       - Auth Verification & Secret Protection          │
└──────────────┬──────────────────────────┬──────────────┘
               │                          │
               ▼                          ▼
┌──────────────────────────────┐  ┌──────────────────────┐
│     Supabase PostgreSQL      │  │ Real AI Provider APIs│
│   - Projects & Datasets      │  │ - Groq (Qwen / LPU)  │
│   - Test Cases & Versions    │  │ - Cerebras           │
│   - Evaluation Runs & Results│  │ - Google Gemini      │
│   - Row Level Security (RLS) │  │ - OpenAI             │
│   - Response Cache Table     │  │ - Anthropic Claude   │
└──────────────────────────────┘  └──────────────────────┘
```

---

## 🤖 Supported Providers & Models

| Provider | Supported Models | Primary Role |
|---|---|---|
| **Groq** | `openai/gpt-oss-20b`, `openai/gpt-oss-120b`, `qwen/qwen3.8-27b`, `allam-2-7b` | Ultra-fast inference & independent LLM judging |
| **Cerebras** | `gpt-oss-120b`, `llama3.1-8b` | Low-latency inference benchmarking |
| **Google Gemini** | `gemini-2.0-flash`, `gemini-1.5-pro`, `gemini-1.5-flash` | Multimodal & complex reasoning |
| **OpenAI** | `gpt-4o`, `gpt-4o-mini`, `o3-mini`, `o1` | Benchmark baseline / candidate |
| **Anthropic** | `claude-3-5-sonnet`, `claude-3-5-haiku`, `claude-3-opus` | Benchmark baseline / candidate |

---

## 🛠️ Quickstart & Local Setup

```bash
# 1. Clone the repository and install dependencies
git clone https://github.com/Meera-Nagpal/RELIQ.git
cd RELIQ
npm install

# 2. Configure local environment variables
cp .env.example .env.local
# Add your Supabase and provider API keys in .env.local

# 3. Start local development server
npm run dev
```

---

## 📜 License

Private & Confidential — Built for AI Reliability and Production LLM Governance.
