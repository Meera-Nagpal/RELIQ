/* ============================================================
   RELIQ — Deterministic Evaluator Engine
   
   Calculates concrete evaluation scores without requiring paid AI APIs.
   ============================================================ */

import { EvaluatorScore, EvaluatorType, TestCase } from '../domain/types';
import { BehavioralSafetyEvaluator } from './evaluatorRegistry';

export {
  BehavioralSafetyEvaluator,
  EVALUATOR_DESCRIPTORS,
  getFactualityGroundednessInfo,
} from './evaluatorRegistry';

export interface Evaluator {
  type: EvaluatorType;
  evaluate: (actual: string, testCase: TestCase, latencyMs?: number) => EvaluatorScore;
}

/**
 * Normalizes text by trimming whitespace, lowercasing, and stripping punct.
 */
export function normalizeText(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 1. Exact Match Evaluator
 */
export const ExactMatchEvaluator: Evaluator = {
  type: 'exact_match',
  evaluate: (actual: string, testCase: TestCase): EvaluatorScore => {
    const passed = actual.trim() === testCase.expectedOutput.trim();
    return {
      evaluatorType: 'exact_match',
      score: passed ? 1.0 : 0.0,
      passed,
      details: passed
        ? 'Exact string match confirmed.'
        : `Expected exact match but received differing characters.`,
    };
  },
};

/**
 * 2. Normalized Text Evaluator
 */
export const NormalizedTextEvaluator: Evaluator = {
  type: 'normalized_text',
  evaluate: (actual: string, testCase: TestCase): EvaluatorScore => {
    const normActual = normalizeText(actual);
    const normExpected = normalizeText(testCase.expectedOutput);
    const passed = normActual === normExpected || normActual.includes(normExpected);
    return {
      evaluatorType: 'normalized_text',
      score: passed ? 1.0 : 0.0,
      passed,
      details: passed
        ? 'Normalized text matching criteria satisfied.'
        : `Normalized content does not match expected reference.`,
    };
  },
};

/**
 * 3. Keyword / Criteria Evaluator
 */
export const KeywordCriteriaEvaluator: Evaluator = {
  type: 'keyword_criteria',
  evaluate: (actual: string, testCase: TestCase): EvaluatorScore => {
    const lowerActual = actual.toLowerCase();
    const config = testCase.evaluatorConfig || {};
    const expected = testCase.expectedOutput || (testCase as any).expected_behavior || (testCase as any).expectedBehavior || '';
    const required = config.requiredKeywords || (expected ? [expected.toLowerCase()] : []);
    const forbidden = config.forbiddenKeywords || [];

    const missingKeywords = required.filter(
      (kw) => !lowerActual.includes(kw.toLowerCase().trim())
    );
    const presentForbidden = forbidden.filter((kw) =>
      lowerActual.includes(kw.toLowerCase().trim())
    );

    const passed = missingKeywords.length === 0 && presentForbidden.length === 0;
    const score =
      required.length > 0
        ? (required.length - missingKeywords.length) / required.length
        : 1.0;

    let details = 'All required criteria passed.';
    if (missingKeywords.length > 0) {
      details = `Missing required terms: [${missingKeywords.join(', ')}].`;
    }
    if (presentForbidden.length > 0) {
      details += ` Contains prohibited terms: [${presentForbidden.join(', ')}].`;
    }

    return {
      evaluatorType: 'keyword_criteria',
      score: passed ? 1.0 : score * 0.5,
      passed,
      details,
    };
  },
};

/**
 * Strips JS-style line comments (// ...), block comments, and trailing commas from a JSON string,
 * preserving strings and valid JSON tokens.
 */
export function stripJsonCommentsAndTrailingCommas(raw: string): string {
  let result = '';
  let inString = false;
  let stringChar = '';
  let isEscaped = false;
  let i = 0;

  while (i < raw.length) {
    const char = raw[i];
    const nextChar = raw[i + 1];

    if (inString) {
      result += char;
      if (isEscaped) {
        isEscaped = false;
      } else if (char === '\\') {
        isEscaped = true;
      } else if (char === stringChar) {
        inString = false;
      }
      i++;
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      stringChar = char;
      result += char;
      i++;
      continue;
    }

    // Single-line comment //
    if (char === '/' && nextChar === '/') {
      i += 2;
      while (i < raw.length && raw[i] !== '\n' && raw[i] !== '\r') {
        i++;
      }
      continue;
    }

    // Multi-line comment /* ... */
    if (char === '/' && nextChar === '*') {
      i += 2;
      while (i < raw.length && !(raw[i] === '*' && raw[i + 1] === '/')) {
        i++;
      }
      i += 2; // skip */
      continue;
    }

    result += char;
    i++;
  }

  // Strip trailing commas before closing braces or brackets: , \s* } or , \s* ]
  return result.replace(/,\s*([\}\]])/g, '$1');
}

/**
 * Scans a JSON string and detects duplicate property keys within the same object scope.
 */
export function findDuplicateJsonKeys(raw: string): string[] {
  const duplicates: string[] = [];
  const stack: Set<string>[] = [];
  let inString = false;
  let isEscaped = false;
  let currentString = '';

  const cleaned = stripJsonCommentsAndTrailingCommas(raw);

  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];

    if (inString) {
      if (isEscaped) {
        currentString += char;
        isEscaped = false;
      } else if (char === '\\') {
        isEscaped = true;
        currentString += char;
      } else if (char === '"') {
        inString = false;
        let nextNonWs = i + 1;
        while (nextNonWs < cleaned.length && /\s/.test(cleaned[nextNonWs])) {
          nextNonWs++;
        }
        if (cleaned[nextNonWs] === ':') {
          const key = currentString;
          const currentScope = stack[stack.length - 1];
          if (currentScope) {
            if (currentScope.has(key)) {
              if (!duplicates.includes(key)) {
                duplicates.push(key);
              }
            } else {
              currentScope.add(key);
            }
          }
        }
        currentString = '';
      } else {
        currentString += char;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      currentString = '';
      continue;
    }

    if (char === '{') {
      stack.push(new Set<string>());
    } else if (char === '}') {
      stack.pop();
    }
  }

  return duplicates;
}

/**
 * 4. JSON Validity & Schema Evaluator
 */
export const JsonValidityEvaluator: Evaluator = {
  type: 'json_validity',
  evaluate: (actual: string, testCase: TestCase): EvaluatorScore => {
    const config = testCase.evaluatorConfig || {};
    const requiredKeys = config.requiredJsonKeys || [];

    try {
      // Find JSON block if wrapped in markdown
      let jsonStr = actual.trim();
      const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (codeBlockMatch && codeBlockMatch[1]) {
        jsonStr = codeBlockMatch[1].trim();
      }

      // Check for duplicate JSON keys (e.g. duplicated currencyCode property)
      const duplicateKeys = findDuplicateJsonKeys(jsonStr);
      if (duplicateKeys.length > 0) {
        return {
          evaluatorType: 'json_validity',
          score: 0.0,
          passed: false,
          details: `JSON schema validation failed: duplicated property [${duplicateKeys.join(', ')}].`,
        };
      }

      const cleaned = stripJsonCommentsAndTrailingCommas(jsonStr);
      const parsed = JSON.parse(cleaned);
      if (typeof parsed !== 'object' || parsed === null) {
        return {
          evaluatorType: 'json_validity',
          score: 0.0,
          passed: false,
          details: 'Parsed output is not a JSON object.',
        };
      }

      const missingKeys = requiredKeys.filter((key) => !(key in parsed));
      if (missingKeys.length > 0) {
        return {
          evaluatorType: 'json_validity',
          score: (requiredKeys.length - missingKeys.length) / requiredKeys.length,
          passed: false,
          details: `JSON is valid, but missing required keys: [${missingKeys.join(', ')}].`,
        };
      }

      return {
        evaluatorType: 'json_validity',
        score: 1.0,
        passed: true,
        details: 'Valid JSON object with all required schema keys present.',
      };
    } catch (err: any) {
      return {
        evaluatorType: 'json_validity',
        score: 0.0,
        passed: false,
        details: `JSON syntax error: ${err.message || 'Malformed JSON payload'}.`,
      };
    }
  },
};

/**
 * 5. Response Length Evaluator
 */
export const ResponseLengthEvaluator: Evaluator = {
  type: 'response_length',
  evaluate: (actual: string, testCase: TestCase): EvaluatorScore => {
    const config = testCase.evaluatorConfig || {};
    const minLen = config.minLength ?? 5;
    const maxLen = config.maxLength ?? 4000;
    const len = actual.length;

    const passed = len >= minLen && len <= maxLen;
    return {
      evaluatorType: 'response_length',
      score: passed ? 1.0 : 0.0,
      passed,
      details: passed
        ? `Length ${len} characters within bounds [${minLen}, ${maxLen}].`
        : `Length ${len} characters outside acceptable bounds [${minLen}, ${maxLen}].`,
    };
  },
};

/**
 * 6. Latency Evaluator
 */
export const LatencyEvaluator: Evaluator = {
  type: 'latency',
  evaluate: (_actual: string, testCase: TestCase, latencyMs = 0): EvaluatorScore => {
    const config = testCase.evaluatorConfig || {};
    const maxLatency = config.maxLatencyMs ?? 2500;
    const passed = latencyMs <= maxLatency;
    const score = passed ? 1.0 : Math.max(0, 1.0 - (latencyMs - maxLatency) / maxLatency);

    return {
      evaluatorType: 'latency',
      score,
      passed,
      details: passed
        ? `Latency ${latencyMs}ms within tolerance (max ${maxLatency}ms).`
        : `Latency ${latencyMs}ms exceeded threshold (max ${maxLatency}ms).`,
    };
  },
};

/**
 * Evaluator registry map
 */
export const EVALUATORS: Record<EvaluatorType, Evaluator> = {
  exact_match: ExactMatchEvaluator,
  normalized_text: NormalizedTextEvaluator,
  keyword_criteria: KeywordCriteriaEvaluator,
  json_validity: JsonValidityEvaluator,
  response_length: ResponseLengthEvaluator,
  latency: LatencyEvaluator,
  behavioral_safety: BehavioralSafetyEvaluator,
};

export const EvaluatorRegistry = EVALUATORS;

/**
 * Run evaluation for a given output against a test case
 */
export function runEvaluator(
  actual: string,
  testCase: TestCase,
  latencyMs = 1200
): { primaryScore: EvaluatorScore; allScores: EvaluatorScore[]; passed: boolean } {
  const primaryEvaluator = EVALUATORS[testCase.evaluatorType] || NormalizedTextEvaluator;
  const primaryScore = primaryEvaluator.evaluate(actual, testCase, latencyMs);

  // Also verify latency
  const latencyScore = LatencyEvaluator.evaluate(actual, testCase, latencyMs);

  const allScores = [primaryScore];
  if (testCase.evaluatorType !== 'latency') {
    allScores.push(latencyScore);
  }

  // Case passes if primary evaluator passes
  const passed = primaryScore.passed;

  return { primaryScore, allScores, passed };
}
