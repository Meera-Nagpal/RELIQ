/* ============================================================
   RELIQ — Frontend UI/UX Polish Automated Test Suite
   
   Verifies:
   1. Evaluation Progress Modal ripple containment (overflow: hidden, position: relative, isolation: isolate)
   2. Page transition timing (~820ms duration, ~380ms midpoint)
   3. Double-trigger protection on page transitions
   4. prefers-reduced-motion immediate execution
   5. Truthful progress telemetry (never fabricating 0/5 or 0% progress)
   6. LLM Judge test connection verification (ping without running benchmark)
   7. Comparison / Version cards data labeling and metric integrity
   8. Non-blocking GPU capability detection
   9. Layering architecture z-index scale integrity
   ============================================================ */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { triggerGlobalTransition } from '../src/router/useRouter.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

export async function runFrontendPolishTests() {
  console.log('\n------------------------------------------------------------');
  console.log('RELIQ FRONTEND POLISH: CONTAINMENT, TIMING, DATA INTEGRITY & 3D');
  console.log('------------------------------------------------------------\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`  ✓ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ FAIL: ${name}`);
      console.error(`    ${err.message}`);
      failed++;
    }
  }

  async function asyncTest(name, fn) {
    try {
      await fn();
      console.log(`  ✓ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ FAIL: ${name}`);
      console.error(`    ${err.message}`);
      failed++;
    }
  }

  // -------------------------------------------------------------
  // Test 1: Modal ripple containment (CSS properties)
  // -------------------------------------------------------------
  test('1. Evaluation modal card enforces overflow: hidden, position: relative, and isolation: isolate', () => {
    const modalPath = path.join(ROOT, 'src/app/components/EvaluationProgressModal.tsx');
    const content = fs.readFileSync(modalPath, 'utf8');

    assert.ok(content.includes("position: 'relative'"), 'Modal card must have position relative');
    assert.ok(content.includes("overflow: 'hidden'"), 'Modal card must have overflow hidden to clip ripple');
    assert.ok(content.includes("isolation: 'isolate'"), 'Modal card must have isolation isolate');
    assert.ok(content.includes("borderRadius: '16px'"), 'Modal card must preserve 16px border radius');
  });

  // -------------------------------------------------------------
  // Test 2: Page transition timing (~820ms total, ~380ms midpoint)
  // -------------------------------------------------------------
  await asyncTest('2. Page transition timing is within target 750-900ms with ~380ms midpoint swap', async () => {
    const routerPath = path.join(ROOT, 'src/router/useRouter.ts');
    const routerContent = fs.readFileSync(routerPath, 'utf8');

    assert.ok(routerContent.includes('durationMs = 820'), 'Default transition duration must be calibrated to ~820ms');

    let callbackFired = false;
    triggerGlobalTransition(() => {
      callbackFired = true;
    }, 200);

    // With 200ms duration, midpoint is ~92ms
    await new Promise((res) => setTimeout(res, 120));
    assert.strictEqual(callbackFired, true, 'Transition callback must fire at midpoint');
    await new Promise((res) => setTimeout(res, 120));
  });

  // -------------------------------------------------------------
  // Test 3: Page transition overlay animation duration in CSS
  // -------------------------------------------------------------
  test('3. PageTransition component and RippleLoader pulse match 0.82s animation duration', () => {
    const ptPath = path.join(ROOT, 'src/app/components/PageTransition.tsx');
    const ptContent = fs.readFileSync(ptPath, 'utf8');
    assert.ok(ptContent.includes('0.82s'), 'PageTransition overlay animation must be 0.82s');

    const rlPath = path.join(ROOT, 'src/app/components/RippleLoader.tsx');
    const rlContent = fs.readFileSync(rlPath, 'utf8');
    assert.ok(rlContent.includes("0.82s"), 'RippleLoader pulse mode must animate for 0.82s');
  });

  // -------------------------------------------------------------
  // Test 4: Truthful Evaluation Progress Display
  // -------------------------------------------------------------
  test('4. EvaluationProgressModal displays EVALUATION IN PROGRESS when progress is 0 or unreceived', () => {
    const modalPath = path.join(ROOT, 'src/app/components/EvaluationProgressModal.tsx');
    const content = fs.readFileSync(modalPath, 'utf8');

    // Must check for progressCounts && progressCounts.current > 0
    assert.ok(
      content.includes('progressCounts.current > 0'),
      'Must check that current count is > 0 before rendering scenario count'
    );
    assert.ok(
      content.includes("'EVALUATION IN PROGRESS'"),
      'Must render EVALUATION IN PROGRESS when per-scenario counts are not yet established'
    );
    // Indeterminate bar for 0% progress
    assert.ok(
      content.includes('reliq-progress-indeterminate'),
      'Must provide an indeterminate pulse bar when running without fixed progress'
    );
  });

  // -------------------------------------------------------------
  // Test 5: LLM Judge "TEST CONNECTION" button and status
  // -------------------------------------------------------------
  test('5. LLM Judge button is labeled TEST CONNECTION / TESTING… and displays availability status', () => {
    const evalViewPath = path.join(ROOT, 'src/app/views/EvaluationsView.tsx');
    const content = fs.readFileSync(evalViewPath, 'utf8');

    assert.ok(content.includes('TEST CONNECTION'), 'Button must be explicitly labeled TEST CONNECTION');
    assert.ok(content.includes('TESTING…'), 'Button must display TESTING… while health check is running');
    assert.ok(content.includes('Test LLM Judge Model Connection'), 'Button must have accessible aria-label');
    assert.ok(content.includes("'AVAILABLE'") && content.includes("'UNAVAILABLE'"), 'Must handle AVAILABLE and UNAVAILABLE status');
    assert.ok(content.includes('/api/judge/test'), 'Must call minimal /api/judge/test endpoint');
  });

  // -------------------------------------------------------------
  // Test 6: Backend /api/judge/test minimal ping verification
  // -------------------------------------------------------------
  test('6. Backend /api/judge/test performs minimal token ping and does NOT launch evaluations', () => {
    const proxyPath = path.join(ROOT, 'src/server/proxyMiddleware.ts');
    const content = fs.readFileSync(proxyPath, 'utf8');

    assert.ok(content.includes("max_tokens: 1"), 'Judge test request must use max_tokens: 1');
    assert.ok(content.includes("content: 'Ping'"), 'Judge test request must send minimal Ping message');
    assert.ok(!content.includes("runEvaluation("), 'Judge test route must NOT invoke full evaluation run');
  });

  // -------------------------------------------------------------
  // Test 7: Comparison / History Cards Data Integrity & Labeling
  // -------------------------------------------------------------
  test('7. VersionCards explicitly badges SAMPLE BENCHMARK AUDIT DATA or binds to authoritative DB runs', () => {
    const vcPath = path.join(ROOT, 'src/overlays/VersionCards.tsx');
    const content = fs.readFileSync(vcPath, 'utf8');

    assert.ok(
      content.includes('SAMPLE BENCHMARK AUDIT DATA • INTERACTIVE DEMO'),
      'Section must explicitly label demo cards as SAMPLE BENCHMARK AUDIT DATA'
    );
    assert.ok(
      content.includes('apiRepository') && content.includes('getEvaluationRuns'),
      'Component must query real evaluation runs from apiRepository'
    );
    assert.ok(
      content.includes('SOURCE:'),
      'Cards must explicitly display their authoritative data source'
    );
    assert.ok(
      content.includes('backdropFilter:'),
      'Cards must have backdrop blur for readability over 3D scene'
    );
  });

  // -------------------------------------------------------------
  // Test 8: Non-blocking GPU capability detection
  // -------------------------------------------------------------
  test('8. useDeviceCapability performs synchronous local GPU inspection without blocking first paint', () => {
    const gpuPath = path.join(ROOT, 'src/hooks/useDeviceCapability.ts');
    const content = fs.readFileSync(gpuPath, 'utf8');

    assert.ok(content.includes('getFastGPUTier'), 'Must use local synchronous GPU inspection');
    assert.ok(content.includes('Promise.race'), 'Must race external getGPUTier with timeout guard');
    assert.ok(content.includes('200'), 'Timeout guard must limit async detection to 200ms');
  });

  // -------------------------------------------------------------
  // Test 9: Clean Layering Architecture & Stacking Context
  // -------------------------------------------------------------
  test('9. CSS design tokens enforce proper stacking architecture from 3D Canvas to Transition', () => {
    const varPath = path.join(ROOT, 'src/styles/variables.css');
    const content = fs.readFileSync(varPath, 'utf8');

    assert.ok(content.includes('--z-canvas: 0'), 'Canvas must be layer 0');
    assert.ok(content.includes('--z-atmospheric: 5'), 'Atmospheric must be layer 5');
    assert.ok(content.includes('--z-content: 10'), 'Content must be layer 10');
    assert.ok(content.includes('--z-progress: 20'), 'Progress must be layer 20');
    assert.ok(content.includes('--z-nav: 30'), 'Nav must be layer 30');
    assert.ok(content.includes('--z-modal: 100'), 'Modal must be layer 100');
    assert.ok(content.includes('--z-transition: 9999'), 'Transition must be top layer');
  });

  // -------------------------------------------------------------
  // Test 10: Horizontal overflow prevention
  // -------------------------------------------------------------
  test('10. Global CSS prevents accidental horizontal scroll across html, body, and root', () => {
    const globPath = path.join(ROOT, 'src/styles/global.css');
    const content = fs.readFileSync(globPath, 'utf8');

    assert.ok(content.includes('overflow-x: hidden'), 'Global CSS must set overflow-x: hidden');
    assert.ok(content.includes('max-width: 100vw'), 'Global CSS must constrain max-width: 100vw');
  });

  // -------------------------------------------------------------
  // Test 11: RELIQ branding prominence (1.4x scale)
  // -------------------------------------------------------------
  test('11. HeroOverlay brand wordmark is scaled to 1.55rem with improved spacing', () => {
    const heroPath = path.join(ROOT, 'src/overlays/HeroOverlay.tsx');
    const content = fs.readFileSync(heroPath, 'utf8');

    assert.ok(content.includes("fontSize: '1.55rem'"), 'Brand wordmark must be scaled to ~1.55rem (1.4x)');
    assert.ok(content.includes("gap: '1.1rem'"), 'Brand container must have 1.1rem spacing');
  });

  // -------------------------------------------------------------
  // Test 12: Top-to-globe intro animation in ReliabilityCore
  // -------------------------------------------------------------
  test('12. ReliabilityCore implements smooth top-to-globe intro energy convergence', () => {
    const corePath = path.join(ROOT, 'src/experience/ReliabilityCore.tsx');
    const content = fs.readFileSync(corePath, 'utf8');

    assert.ok(content.includes('introProgress'), 'ReliabilityCore must track introProgress ref');
    assert.ok(content.includes('introOffsetY'), 'ReliabilityCore must animate energy downward toward globe');
  });

  console.log(`\n============================================================`);
  console.log(`FRONTEND POLISH TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log(`============================================================\n`);

  if (failed > 0) {
    throw new Error(`${failed} frontend polish test(s) failed`);
  }
}

if (process.argv[1] && process.argv[1].endsWith('frontendPolish.test.mjs')) {
  runFrontendPolishTests().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
