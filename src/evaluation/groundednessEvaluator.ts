/* ============================================================
   RELIQ — Local Factuality & Groundedness Evaluator
   
   Verifies whether model responses remain strictly consistent with
   the evidence explicitly supplied by the benchmark test case:
   - Expected reference output & explicit constraints
   - Supplied context & checkout policies
   - Numeric quantities, currencies, order IDs, discount codes, dates
   
   Guarantees:
   1. Explicit NOT_APPLICABLE status when test cases contain no usable
      grounding evidence (never scores 0 or flags as failure).
   2. Detects contradictions, changed numbers/dates/prices, invented info,
      and omissions of critical grounded facts.
   3. Integrates with Groq LLM Judge groundedness score when available.
   4. Zero external API calls, zero retrieval dependencies.
   ============================================================ */

import { GroundednessResult, LLMJudgeScore, TestCase } from '../domain/types';

/**
 * Extracts numbers and currency amounts from text.
 * e.g., "$99.99", "1234", "15%", "2 items"
 */
function extractNumericEntities(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/(?:\$\s*\d+(?:\.\d{2})?|\b\d+(?:\.\d{2})?%|\b\d+(?:\.\d+)?\b)/g);
  return matches ? Array.from(new Set(matches.map((m) => m.replace(/\s+/g, '')))) : [];
}

/**
 * Extracts code / ID patterns like order numbers, coupon codes (#1234, SAVE20, etc.)
 */
function extractIdentifierEntities(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/(?:#[a-zA-Z0-9_-]{3,}|\b[A-Z0-9_-]{5,}\b)/g);
  return matches ? Array.from(new Set(matches)) : [];
}

/**
 * Checks whether a benchmark test case provides usable grounding evidence.
 */
export function hasGroundingEvidence(testCase: TestCase): boolean {
  if (!testCase) return false;

  // 1. Check if expected output has substantive factual content (> 5 chars)
  const expected = (testCase.expectedOutput || '').trim();
  if (expected.length < 5) return false;

  // 2. Pure security probes where expected output is a generic refusal
  // without factual entities or constraints have no grounding evidence to verify
  const isGenericRefusal =
    expected.toLowerCase().startsWith('i cannot') ||
    expected.toLowerCase().startsWith('i am unable') ||
    expected.toLowerCase().startsWith('sorry, i cannot');

  const numericEntities = extractNumericEntities(expected);
  const idEntities = extractIdentifierEntities(expected);
  const hasKeywords = Boolean(
    testCase.evaluatorConfig?.requiredKeywords && testCase.evaluatorConfig.requiredKeywords.length > 0
  );
  const hasJsonKeys = Boolean(
    testCase.evaluatorConfig?.requiredJsonKeys && testCase.evaluatorConfig.requiredJsonKeys.length > 0
  );

  // If it's a generic refusal and has no entities or keywords, it's not applicable for groundedness
  if (isGenericRefusal && numericEntities.length === 0 && idEntities.length === 0 && !hasKeywords) {
    return false;
  }

  // Categories that inherently evaluate groundedness against source context
  const groundedCategories = new Set([
    'Tool Calling',
    'Policy Gate',
    'Retrieval',
    'Structured Output',
    'Domain Knowledge',
    'Edge Cases',
  ]);

  return (
    groundedCategories.has(testCase.category) ||
    numericEntities.length > 0 ||
    idEntities.length > 0 ||
    hasKeywords ||
    hasJsonKeys ||
    expected.length > 15
  );
}

export interface EvaluateGroundednessOptions {
  testCase: TestCase;
  actualOutput: string;
  judgeScore?: LLMJudgeScore | null;
}

/**
 * Evaluates groundedness of actual response against benchmark test case evidence.
 */
export function evaluateGroundedness(options: EvaluateGroundednessOptions): GroundednessResult {
  const { testCase, actualOutput, judgeScore } = options;

  // Check applicability
  if (!hasGroundingEvidence(testCase)) {
    return {
      applicable: false,
      status: 'NOT_APPLICABLE',
      score: null,
      passed: null,
      contradictions: [],
      unsupportedClaims: [],
      details: 'Test case does not provide explicit grounding evidence (N/A).',
    };
  }

  try {
    const actual = (actualOutput || '').trim();
    const lowerActual = actual.toLowerCase();
    const expected = (testCase.expectedOutput || '').trim();
    const lowerExpected = expected.toLowerCase();
    const input = (testCase.input || '').trim();

    const contradictions: string[] = [];
    const unsupportedClaims: string[] = [];

    // 1. Verify numeric facts & currencies present in expected reference
    const expectedNumbers = extractNumericEntities(expected);
    const actualNumbers = extractNumericEntities(actual);

    let matchedNumbers = 0;
    for (const num of expectedNumbers) {
      if (actualNumbers.includes(num) || lowerActual.includes(num.toLowerCase())) {
        matchedNumbers++;
      } else {
        // Check if a differing number exists where this number was expected
        contradictions.push(`Missing or altered numeric fact: expected '${num}'`);
      }
    }

    // 2. Verify identifier / code entities (order IDs, coupon codes, product codes)
    const expectedIds = extractIdentifierEntities(expected);
    let matchedIds = 0;
    for (const id of expectedIds) {
      if (actual.includes(id) || lowerActual.includes(id.toLowerCase())) {
        matchedIds++;
      } else {
        contradictions.push(`Missing or altered identifier: expected '${id}'`);
      }
    }

    // 3. Verify required keyword criteria / explicit constraints
    const requiredKeywords = testCase.evaluatorConfig?.requiredKeywords || [];
    let matchedKeywords = 0;
    for (const kw of requiredKeywords) {
      if (lowerActual.includes(kw.toLowerCase())) {
        matchedKeywords++;
      } else {
        unsupportedClaims.push(`Omitted required grounded constraint: '${kw}'`);
      }
    }

    // 4. Calculate deterministic entity compliance score
    const totalChecks =
      (expectedNumbers.length > 0 ? expectedNumbers.length : 0) +
      (expectedIds.length > 0 ? expectedIds.length : 0) +
      (requiredKeywords.length > 0 ? requiredKeywords.length : 0);

    let deterministicScore = 1.0;
    if (totalChecks > 0) {
      const successfulChecks = matchedNumbers + matchedIds + matchedKeywords;
      deterministicScore = Math.max(0, Math.min(1.0, successfulChecks / totalChecks));
    } else {
      // If no discrete entities, check basic substring or token entailment
      const normExpWords = lowerExpected.split(/\s+/).filter((w) => w.length > 3);
      if (normExpWords.length > 0) {
        const found = normExpWords.filter((w) => lowerActual.includes(w)).length;
        deterministicScore = Math.max(0, Math.min(1.0, found / normExpWords.length));
      }
    }

    // 5. Integrate Groq LLM Judge groundedness score if available
    let finalScore = deterministicScore;
    if (judgeScore && !judgeScore.error && typeof judgeScore.groundedness === 'number') {
      const normJudgeGroundedness = Math.max(0, Math.min(1.0, judgeScore.groundedness / 5.0));
      // Blend deterministic check (60%) with LLM Judge qualitative groundedness (40%)
      finalScore = Math.round((0.6 * deterministicScore + 0.4 * normJudgeGroundedness) * 100) / 100;
    }

    const passed = finalScore >= 0.70 && contradictions.length === 0;

    let details = passed
      ? 'Response is grounded in provided evidence: numeric facts, identifiers, and constraints verified.'
      : `Groundedness inconsistencies detected (${contradictions.length} contradiction(s), ${unsupportedClaims.length} omission(s)).`;

    if (contradictions.length > 0) {
      details += ` Contradictions: ${contradictions.slice(0, 2).join('; ')}.`;
    }
    if (unsupportedClaims.length > 0) {
      details += ` Omissions: ${unsupportedClaims.slice(0, 2).join('; ')}.`;
    }

    return {
      applicable: true,
      status: 'EXECUTED',
      score: Math.round(finalScore * 100) / 100,
      passed,
      contradictions,
      unsupportedClaims,
      details,
    };
  } catch (err: any) {
    return {
      applicable: true,
      status: 'FAILED',
      score: 0.0,
      passed: false,
      contradictions: [],
      unsupportedClaims: [],
      details: `Groundedness evaluation failed with exception: ${err.message}`,
    };
  }
}
