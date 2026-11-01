import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const projectRoot = process.cwd();

async function benchmark() {
  process.env.RELIQ_DB_PATH = path.join(projectRoot, 'data', 'test_runner_db', 'test_runner.db');
  process.env.RELIQ_DB_DRIVER = 'sqlite';

  const server = await createServer({
    root: projectRoot,
    server: { middlewareMode: true },
    appType: 'custom',
  });

  const { EvaluationRunner } = await server.ssrLoadModule('/src/evaluation/runner.ts');
  const { generateBenchmarkDataset } = await server.ssrLoadModule('/src/data/datasetGenerator.ts');
  const { SEED_BASELINE_VERSION, SEED_CANDIDATE_VERSION, SEED_PROJECT } = await server.ssrLoadModule('/src/data/seedData.ts');

  console.log('============================================================');
  console.log('RELIQ EVALUATION ENGINE BENCHMARK (CURRENT BASELINE)');
  console.log('============================================================\n');

  // Provider that simulates realistic provider response with 50ms latency
  const createBenchmarkProvider = (providerId, modelId) => ({
    id: providerId,
    name: `Benchmark ${providerId}`,
    providerType: providerId,
    isConfigured: () => true,
    getMetadata: () => ({ id: providerId, name: providerId, supportedModels: [modelId], configured: true }),
    calculateCost: () => 0.0001,
    generate: async (req) => {
      // Simulate 50ms realistic network latency
      await new Promise((r) => setTimeout(r, 50));
      return {
        output: req.expectedOutput || '{"status":"success","orderId":"ORD-1001","total":25.5,"currency":"USD","paymentMethod":"credit_card"}',
        usage: {
          promptTokens: 120,
          completionTokens: 45,
          totalTokens: 165,
          latencyMs: 50,
          provider: providerId,
          model: modelId,
        },
        isDemoMode: false,
      };
    },
  });

  const baselineProvider = createBenchmarkProvider('cerebras', 'gpt-oss-120b');
  const candidateProvider = createBenchmarkProvider('groq', 'qwen/qwen3.8-27b');

  const testSuiteSizes = [27, 100, 500];

  for (const caseCount of testSuiteSizes) {
    const dataset = generateBenchmarkDataset(caseCount, `Benchmark Suite (${caseCount} cases)`);
    const runner = new EvaluationRunner();

    const memBefore = process.memoryUsage();
    const t0 = performance.now();

    const result = await runner.run({
      project: SEED_PROJECT,
      dataset,
      baselineVersion: { ...SEED_BASELINE_VERSION, provider: 'cerebras', modelIdentifier: 'gpt-oss-120b' },
      candidateVersion: { ...SEED_CANDIDATE_VERSION, provider: 'groq', modelIdentifier: 'qwen/qwen3.8-27b' },
      baselineProvider,
      candidateProvider,
      concurrency: 4,
    });

    const t1 = performance.now();
    const memAfter = process.memoryUsage();

    const durationSec = (t1 - t0) / 1000;
    const throughput = caseCount / durationSec;
    const memDiffMb = (memAfter.heapUsed - memBefore.heapUsed) / (1024 * 1024);

    console.log(`[Suite ${caseCount} cases]`);
    console.log(`  - Total Time: ${durationSec.toFixed(3)}s`);
    console.log(`  - Throughput: ${throughput.toFixed(2)} cases/sec`);
    console.log(`  - Total Cases: ${result.totalScenarioCount}`);
    console.log(`  - Completed Results: ${result.caseResults.length}`);
    console.log(`  - Memory Heap Used: ${(memAfter.heapUsed / 1024 / 1024).toFixed(2)} MB (Delta: ${memDiffMb.toFixed(2)} MB)`);
    console.log(`  - RSS: ${(memAfter.rss / 1024 / 1024).toFixed(2)} MB\n`);
  }

  await server.close();
}

benchmark().catch(console.error);
