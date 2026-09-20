/* ============================================================
   RELIQ — Frontend UI/UX Polish Automated Test Suite
   
   Verifies:
   1. Evaluation Progress Modal ripple containment (overflow: hidden, position: relative, isolation: isolate)
   2. Page transition timing (2500ms duration, ~1300ms midpoint in 2-3s window)
   3. PageTransition CSS animation duration (2.5s) and RippleLoader pulse timing
   4. Truthful progress telemetry (never fabricating 0/5 or 0% progress)
   5. Removal of manual LLM Judge TEST button and automatic availability check
   6. Backend /api/judge/test minimal ping verification
   7. Comparison / Version cards truthful data labeling and N/A handling
   8. Non-blocking GPU capability detection
   9. Layering architecture z-index scale integrity
   10. Horizontal overflow prevention
   11. RELIQ branding prominence (1.4x scale)
   12. Top-to-globe intro animation in ReliabilityCore
   13. 3D Spatial typography background positioning and layering hierarchy
   14. Removal of raw Initializing RELIQ Workspace loading screen
   15. N/A Data Rule enforcement across repositories and service
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
  test('1. Evaluation modal card and ripple host enforce overflow: hidden, position: relative, and isolation: isolate', () => {
    const modalPath = path.join(ROOT, 'src/app/components/EvaluationProgressModal.tsx');
    const content = fs.readFileSync(modalPath, 'utf8');

    assert.ok(content.includes("position: 'relative'"), 'Modal card must have position relative');
    assert.ok(content.includes("overflow: 'hidden'"), 'Modal card must have overflow hidden to clip ripple');
    assert.ok(content.includes("isolation: 'isolate'"), 'Modal card must have isolation isolate');
    assert.ok(content.includes("borderRadius: '16px'"), 'Modal card must preserve 16px border radius');
    assert.ok(content.includes('evaluation-modal-ripple-container'), 'Modal must have designated ripple container');
    assert.ok(content.includes("borderRadius: '12px'"), 'Ripple container must have 12px border radius');
  });

  // -------------------------------------------------------------
  // Test 2: Page transition timing (2500ms total, ~1300ms midpoint in 2-3s window)
  // -------------------------------------------------------------
  await asyncTest('2. Page transition timing is calibrated to 2500ms (2-3s target) with midpoint route swap', async () => {
    const routerPath = path.join(ROOT, 'src/router/useRouter.ts');
    const routerContent = fs.readFileSync(routerPath, 'utf8');

    assert.ok(routerContent.includes('durationMs = 2500'), 'Default transition duration must be calibrated to 2500ms');

    let callbackFired = false;
    triggerGlobalTransition(() => {
      callbackFired = true;
    }, 200);

    // With 200ms duration, midpoint is ~104ms
    await new Promise((res) => setTimeout(res, 130));
    assert.strictEqual(callbackFired, true, 'Transition callback must fire at midpoint');
    await new Promise((res) => setTimeout(res, 100));
  });

  // -------------------------------------------------------------
  // Test 3: Page transition overlay animation duration in CSS
  // -------------------------------------------------------------
  test('3. PageTransition component and RippleLoader pulse match 2.5s animation duration', () => {
    const ptPath = path.join(ROOT, 'src/app/components/PageTransition.tsx');
    const ptContent = fs.readFileSync(ptPath, 'utf8');
    assert.ok(ptContent.includes('2.5s'), 'PageTransition overlay animation must be 2.5s');

    const rlPath = path.join(ROOT, 'src/app/components/RippleLoader.tsx');
    const rlContent = fs.readFileSync(rlPath, 'utf8');
    assert.ok(rlContent.includes("2.5s"), 'RippleLoader pulse mode must animate for 2.5s');
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
  // Test 5: LLM Judge manual TEST button removed & real status retained
  // -------------------------------------------------------------
  test('5. LLM Judge manual TEST button is removed and selector displays automatic real availability status', () => {
    const evalViewPath = path.join(ROOT, 'src/app/views/EvaluationsView.tsx');
    const content = fs.readFileSync(evalViewPath, 'utf8');

    assert.ok(!content.includes('TEST CONNECTION'), 'Manual TEST CONNECTION button must be completely removed');
    assert.ok(!content.includes('aria-label="Test LLM Judge Model Connection"'), 'Manual test button aria-label must be removed');
    assert.ok(content.includes('checkJudgeAvailability(selectedJudgeModel)'), 'Must automatically check judge availability on selection');
    assert.ok(content.includes("'AVAILABLE'") && content.includes("'UNAVAILABLE'"), 'Must handle real AVAILABLE and UNAVAILABLE status');
    assert.ok(content.includes('/api/judge/test'), 'Must query /api/judge/test endpoint for actual availability');
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
  test('7. VersionCards explicitly badges DEMO vs LIVE and enforces No completed evaluation data for N/A', () => {
    const vcPath = path.join(ROOT, 'src/overlays/VersionCards.tsx');
    const content = fs.readFileSync(vcPath, 'utf8');

    assert.ok(
      content.includes('DEMO / SAMPLE BENCHMARK DATA'),
      'Section must explicitly label demo cards as DEMO / SAMPLE BENCHMARK DATA'
    );
    assert.ok(
      content.includes('LIVE / HISTORICAL EVALUATION'),
      'Section must explicitly badge real runs as LIVE / HISTORICAL EVALUATION'
    );
    assert.ok(
      content.includes('No completed evaluation data'),
      'Section must display No completed evaluation data when metrics are null'
    );
    assert.ok(
      content.includes('apiRepository') && content.includes('getEvaluationRuns'),
      'Component must query real evaluation runs from apiRepository'
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

  // -------------------------------------------------------------
  // Test 13: 3D Spatial typography background positioning and layering hierarchy
  // -------------------------------------------------------------
  test('13. 3D Spatial typography groups are in background z-space preventing collision with foreground HUD', () => {
    const stPath = path.join(ROOT, 'src/experience/SpatialTypography.tsx');
    const stContent = fs.readFileSync(stPath, 'utf8');

    // State 4 DETECT at z = -2.4
    assert.ok(stContent.includes("position={[0, 1.8, -2.4]}"), 'State 4 DETECT must be placed in deep background at z = -2.4');
    // State 5 INVESTIGATE at x = 1.8, z = -1.8, 47 fontSize 2.4
    assert.ok(stContent.includes("position={[1.8, 0.1, -1.8]}"), 'State 5 INVESTIGATE must be moved to background right at z = -1.8');
    assert.ok(stContent.includes("fontSize={2.4}"), 'State 5 must retain large decorative 47 (fontSize 2.4)');
    assert.ok(stContent.includes("ISOLATED FAILURES"), 'State 5 must display ISOLATED FAILURES subtitle');
    // State 6 SHIP at z = -1.8, fontSize 2.0
    assert.ok(stContent.includes("position={[0, 0.2, -1.8]}"), 'State 6 SHIP must be positioned at z = -1.8');
    assert.ok(stContent.includes("fontSize={2.0}"), 'State 6 96.8% must have dominant fontSize 2.0');
  });

  // -------------------------------------------------------------
  // Test 14: Removal of raw Initializing RELIQ Workspace loading screen
  // -------------------------------------------------------------
  test('14. ReliqApp does not render raw Initializing RELIQ Workspace full-screen screen', () => {
    const appPath = path.join(ROOT, 'src/app/ReliqApp.tsx');
    const appContent = fs.readFileSync(appPath, 'utf8');

    assert.ok(!appContent.includes('Initializing RELIQ Workspace...'), 'Must NOT render raw Initializing RELIQ Workspace text');
    assert.ok(appContent.includes('<AppNav'), 'Must render AppNav immediately in workspace');
    assert.ok(appContent.includes('<AppHeader'), 'Must render AppHeader immediately in workspace');
  });

  // -------------------------------------------------------------
  // Test 15: N/A Data Rule enforcement across repositories and service
  // -------------------------------------------------------------
  test('15. N/A Data Rule: Repositories and evaluation service do not report No regressions detected when no data exists', () => {
    const localRepoPath = path.join(ROOT, 'src/services/localRepository.ts');
    const localRepo = fs.readFileSync(localRepoPath, 'utf8');
    assert.ok(localRepo.includes("!hasData ? 'No completed evaluation data'"), 'localRepository must report No completed evaluation data when no data exists');

    const apiRepoPath = path.join(ROOT, 'src/services/apiRepository.ts');
    const apiRepo = fs.readFileSync(apiRepoPath, 'utf8');
    assert.ok(apiRepo.includes("!hasData ? 'No completed evaluation data'"), 'apiRepository must report No completed evaluation data when no data exists');

    const evalServPath = path.join(ROOT, 'src/server/evaluationService.ts');
    const evalServ = fs.readFileSync(evalServPath, 'utf8');
    assert.ok(evalServ.includes("!hasData ? 'No completed evaluation data'"), 'evaluationService must report No completed evaluation data when no data exists');
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
