/* ============================================================
   RELIQ — Dataset Parser, Validator, Normalizer & Importer (Phase 1A)
   
   Supports importing user-provided evaluation datasets in:
   - JSON (.json) — array of records or { name, description, version, cases: [...] }
   - JSONL / NDJSON (.jsonl, .ndjson) — line-delimited JSON records
   - CSV (.csv) — RFC 4180 quote-aware CSV with header row
   
   Guarantees:
   - Never silently discards malformed rows; reports 1-indexed record numbers
   - Supports field mapping from common column/property names to canonical schema
   - Enforces file size (default 10 MB) and record count (default 1,000) limits
   - Scans for accidental API key / secret patterns
   - Computes evaluator/metric compatibility based on expected_output & context presence
   ============================================================ */

import {
  DatasetEvaluatorCompatibility,
  DatasetFieldMapping,
  DatasetFormatType,
  DatasetPreviewResult,
  DatasetValidationIssue,
  EvaluatorType,
  SeverityLevel,
  TestCase,
  TestCaseCategory,
} from '../domain/types';

export const MAX_DATASET_FILE_BYTES = 5 * 1024 * 1024; // 5 MB
export const MAX_DATASET_RECORDS = 500;

export const VALID_EVALUATOR_TYPES: EvaluatorType[] = [
  'exact_match',
  'normalized_text',
  'keyword_criteria',
  'json_validity',
  'response_length',
  'latency',
  'behavioral_safety',
  'semantic_similarity',
  'llm_judge',
];

export const REFERENCE_REQUIRED_EVALUATORS: Set<EvaluatorType> = new Set([
  'exact_match',
  'normalized_text',
  'semantic_similarity',
]);

export const REFERENCE_FREE_EVALUATORS: Set<EvaluatorType> = new Set([
  'json_validity',
  'response_length',
  'latency',
  'behavioral_safety',
  'llm_judge',
]);

export const VALID_SEVERITIES: SeverityLevel[] = ['critical', 'high', 'medium', 'low'];

const UPLOAD_SECRET_PATTERNS: RegExp[] = [
  /\bsk-[a-zA-Z0-9]{20,}\b/,
  /\bsk-proj-[a-zA-Z0-9_-]{20,}\b/,
  /\bAIzaSy[a-zA-Z0-9_-]{33}\b/,
  /\bgsk_[a-zA-Z0-9]{20,}\b/,
  /\bcsk-[a-zA-Z0-9]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /-----BEGIN (?:RSA |OPENSSH |EC |PGP )?PRIVATE KEY-----/,
];

export const PREFERENCE_CHOSEN_ALIASES: string[] = [
  'chosen',
  'chosen_output',
  'chosenoutput',
  'chosen_response',
  'chosenresponse',
  'preferred',
  'preferred_output',
  'preferred_response',
];

const FIELD_ALIASES: Record<keyof DatasetFieldMapping, string[]> = {
  inputField: [
    'input',
    'prompt',
    'question',
    'query',
    'user_message',
    'usermessage',
    'user_input',
    'userinput',
    'message',
    'text',
  ],
  expectedOutputField: [
    'expected_output',
    'expectedoutput',
    'expected',
    'expected_behavior',
    'expectedbehavior',
    'answer',
    'reference',
    'ground_truth',
    'groundtruth',
    'target',
    'ideal_output',
    ...PREFERENCE_CHOSEN_ALIASES,
  ],
  rejectedOutputField: [
    'rejected',
    'rejected_output',
    'rejectedoutput',
    'rejected_response',
    'rejectedresponse',
    'dispreferred',
    'dispreferred_output',
    'dispreferred_response',
  ],
  contextField: [
    'context',
    'source_context',
    'sourcecontext',
    'retrieved_context',
    'passages',
    'documents',
    'knowledge',
  ],
  idField: ['id', 'case_id', 'caseid', 'case_key', 'casekey', 'scenario_id', 'scenarioid'],
  nameField: ['name', 'title', 'scenario', 'label', 'summary', 'test_name'],
  categoryField: ['category', 'type', 'domain', 'group', 'suite'],
  tagsField: ['tags', 'labels', 'keywords'],
  metadataField: ['metadata', 'meta', 'extra', 'properties'],
  evaluatorTypeField: ['evaluator_type', 'evaluatortype', 'evaluator', 'metric'],
  severityField: ['severity', 'priority', 'criticality', 'risk'],
};

/**
 * Deterministic cross-environment content hash (FNV-1a 64-bit hex representation).
 * Works identically in browser and Node.js without native crypto dependencies.
 */
export function computeDatasetContentHash(content: string): string {
  let h1 = 0xdeadbeef ^ content.length;
  let h2 = 0x41c6ce57 ^ content.length;
  for (let i = 0; i < content.length; i++) {
    const ch = content.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (
    'sha256-' +
    (h2 >>> 0).toString(16).padStart(8, '0') +
    (h1 >>> 0).toString(16).padStart(8, '0')
  );
}

/**
 * Detects dataset format from filename extension or raw content structure.
 */
export function detectDatasetFormat(rawContent: string, filename?: string): DatasetFormatType {
  if (filename) {
    const lower = filename.trim().toLowerCase();
    if (lower.endsWith('.jsonl')) return 'jsonl';
    if (lower.endsWith('.ndjson')) return 'ndjson';
    if (lower.endsWith('.csv')) return 'csv';
    if (lower.endsWith('.json')) return 'json';
  }

  const trimmed = (rawContent || '').trim();
  if (!trimmed) return 'json';

  if (trimmed.startsWith('[')) {
    return 'json';
  }

  if (trimmed.startsWith('{')) {
    // Check if it's multi-line JSONL where line 1 is a JSON object and line 2 is also a JSON object
    const lines = trimmed
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length > 1 && lines[0].startsWith('{') && lines[0].endsWith('}') && lines[1].startsWith('{')) {
      try {
        JSON.parse(lines[0]);
        JSON.parse(lines[1]);
        return 'jsonl';
      } catch {
        // Fall through to standard JSON
      }
    }
    return 'json';
  }

  return 'csv';
}

/**
 * RFC 4180 compliant CSV parser supporting quoted fields, escaped quotes (""),
 * embedded commas, and embedded newlines.
 */
export function parseCsvRows(rawContent: string): {
  headers: string[];
  rows: Array<{ recordNumber: number; lineNumber: number; values: string[]; rawObj: Record<string, string> }>;
  issues: DatasetValidationIssue[];
} {
  const issues: DatasetValidationIssue[] = [];
  const parsedGrid: Array<{ lineNumber: number; cells: string[] }> = [];

  let currentCell = '';
  let currentRow: string[] = [];
  let inQuotes = false;
  let currentLine = 1;
  let rowStartLine = 1;

  const text = rawContent.replace(/^\uFEFF/, ''); // Strip UTF-8 BOM if present

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"') {
        if (next === '"') {
          currentCell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === '\n') currentLine++;
        currentCell += ch;
      }
      continue;
    }

    if (ch === '"') {
      if (currentCell.trim().length === 0) {
        inQuotes = true;
        currentCell = '';
      } else {
        currentCell += ch;
      }
      continue;
    }

    if (ch === ',') {
      currentRow.push(currentCell);
      currentCell = '';
      continue;
    }

    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && next === '\n') {
        i++;
      }
      currentRow.push(currentCell);
      currentCell = '';

      const isBlankRow = currentRow.length === 1 && currentRow[0].trim() === '';
      if (!isBlankRow) {
        parsedGrid.push({ lineNumber: rowStartLine, cells: currentRow });
      }
      currentRow = [];
      currentLine++;
      rowStartLine = currentLine;
      continue;
    }

    currentCell += ch;
  }

  if (inQuotes) {
    issues.push({
      recordNumber: Math.max(1, parsedGrid.length),
      severity: 'error',
      code: 'PARSE_ERROR',
      message: `CSV parse error near line ${rowStartLine}: unclosed double quote.`,
    });
  }

  if (currentRow.length > 0 || currentCell.trim().length > 0) {
    currentRow.push(currentCell);
    const isBlankRow = currentRow.length === 1 && currentRow[0].trim() === '';
    if (!isBlankRow) {
      parsedGrid.push({ lineNumber: rowStartLine, cells: currentRow });
    }
  }

  if (parsedGrid.length === 0) {
    return { headers: [], rows: [], issues };
  }

  const rawHeaders = parsedGrid[0].cells.map((h) => h.trim());
  const headers = rawHeaders.filter(Boolean);

  if (headers.length === 0) {
    issues.push({
      recordNumber: 1,
      severity: 'error',
      code: 'PARSE_ERROR',
      message: 'CSV header row (line 1) contains no column names.',
    });
    return { headers: [], rows: [], issues };
  }

  const rows: Array<{
    recordNumber: number;
    lineNumber: number;
    values: string[];
    rawObj: Record<string, string>;
  }> = [];

  for (let r = 1; r < parsedGrid.length; r++) {
    const gridRow = parsedGrid[r];
    const recordNumber = r; // 1-indexed data record
    const rawObj: Record<string, string> = {};

    if (gridRow.cells.length > rawHeaders.length) {
      issues.push({
        recordNumber,
        severity: 'error',
        code: 'PARSE_ERROR',
        message: `Row ${recordNumber} (CSV line ${gridRow.lineNumber}) has ${gridRow.cells.length} columns, expected ${rawHeaders.length} (${rawHeaders.join(', ')}).`,
      });
    }

    for (let c = 0; c < rawHeaders.length; c++) {
      const colName = rawHeaders[c];
      if (colName) {
        rawObj[colName] = (gridRow.cells[c] ?? '').trim();
      }
    }

    rows.push({
      recordNumber,
      lineNumber: gridRow.lineNumber,
      values: gridRow.cells,
      rawObj,
    });
  }

  return { headers, rows, issues };
}

/**
 * Automatically infers field mapping from the detected record keys.
 */
export function inferFieldMapping(
  detectedFields: string[],
  explicitMapping?: DatasetFieldMapping
): DatasetFieldMapping {
  const lowerToOriginal = new Map<string, string>();
  for (const f of detectedFields) {
    lowerToOriginal.set(f.toLowerCase().trim(), f);
  }

  const isPreferenceColumn = (col?: string): boolean => {
    if (!col) return false;
    const lower = col.trim().toLowerCase();
    return (
      PREFERENCE_CHOSEN_ALIASES.includes(lower) ||
      FIELD_ALIASES.rejectedOutputField.includes(lower)
    );
  };

  const findMatch = (aliases: string[], explicit?: string): string | undefined => {
    if (explicit && explicit.trim()) {
      return explicit.trim();
    }
    for (const alias of aliases) {
      const found = lowerToOriginal.get(alias.toLowerCase());
      if (found) return found;
    }
    return undefined;
  };

  const safeExplicitInput = isPreferenceColumn(explicitMapping?.inputField)
    ? undefined
    : explicitMapping?.inputField;
  const safeExplicitId = isPreferenceColumn(explicitMapping?.idField)
    ? undefined
    : explicitMapping?.idField;

  return {
    inputField: findMatch(FIELD_ALIASES.inputField, safeExplicitInput),
    expectedOutputField: findMatch(FIELD_ALIASES.expectedOutputField, explicitMapping?.expectedOutputField),
    rejectedOutputField: findMatch(FIELD_ALIASES.rejectedOutputField, explicitMapping?.rejectedOutputField),
    contextField: findMatch(FIELD_ALIASES.contextField, explicitMapping?.contextField),
    idField: findMatch(FIELD_ALIASES.idField, safeExplicitId),
    nameField: findMatch(FIELD_ALIASES.nameField, explicitMapping?.nameField),
    categoryField: findMatch(FIELD_ALIASES.categoryField, explicitMapping?.categoryField),
    tagsField: findMatch(FIELD_ALIASES.tagsField, explicitMapping?.tagsField),
    metadataField: findMatch(FIELD_ALIASES.metadataField, explicitMapping?.metadataField),
    evaluatorTypeField: findMatch(FIELD_ALIASES.evaluatorTypeField, explicitMapping?.evaluatorTypeField),
    severityField: findMatch(FIELD_ALIASES.severityField, explicitMapping?.severityField),
  };
}

export interface TranscriptTurn {
  role: 'user' | 'assistant';
  label: string;
  content: string;
}

export type PreferenceExtractionResult =
  | {
      status: 'extracted';
      input: string;
      lastUserTurn: string;
      chosenResponse: string;
      rejectedResponse: string;
      turnCount: number;
    }
  | {
      status: 'ambiguous';
      reason: string;
    };

/**
 * Checks whether a value is a non-empty preference value (non-empty string,
 * non-empty message array, or non-empty object).
 */
function isValidPreferenceFieldValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) {
    return (
      value.length > 0 &&
      value.every((item) => item !== null && typeof item === 'object' && !Array.isArray(item))
    );
  }
  if (typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>).length > 0;
  }
  return false;
}

/**
 * Detects whether a preference field value represents a multi-turn or role-tagged
 * conversation transcript (such as Anthropic HH-RLHF "Human: ... Assistant: ..."
 * or an array of role/content chat messages) rather than a single standalone response.
 */
export function looksLikeConversationTranscript(value: unknown): boolean {
  if (typeof value === 'string') {
    return (
      /(?:^|\r?\n)[ \t]*(?:Human|User):[ \t]*/.test(value) ||
      (/(?:^|\r?\n)[ \t]*Assistant:[ \t]*/.test(value) &&
        /(?:^|\r?\n)[ \t]*(?:Human|User):[ \t]*/.test(value))
    );
  }
  if (Array.isArray(value)) {
    return value.some(
      (item) => item && typeof item === 'object' && ('role' in item || 'from' in item)
    );
  }
  return false;
}

/**
 * Parses an HH-RLHF style string transcript into structured speaker turns.
 */
function parseTranscriptTurns(rawText: string): {
  turns: TranscriptTurn[];
  hasLeadingPreamble: boolean;
} {
  const normalized = rawText.replace(/\r\n/g, '\n');
  const turnMarkerRegex = /(?:^|\n)[ \t]*(Human|User|Assistant):[ \t]*/g;
  const matches: Array<{ label: string; markerStart: number; contentStart: number }> = [];

  let match: RegExpExecArray | null;
  while ((match = turnMarkerRegex.exec(normalized)) !== null) {
    matches.push({
      label: match[1],
      markerStart: match.index,
      contentStart: match.index + match[0].length,
    });
  }

  if (matches.length === 0) {
    return { turns: [], hasLeadingPreamble: normalized.trim().length > 0 };
  }

  const leadingText = normalized.slice(0, matches[0].markerStart).trim();
  const hasLeadingPreamble = leadingText.length > 0;

  const turns: TranscriptTurn[] = matches.map((m, idx) => {
    const endIdx = idx + 1 < matches.length ? matches[idx + 1].markerStart : normalized.length;
    const content = normalized.slice(m.contentStart, endIdx).trim();
    return {
      role: m.label === 'Assistant' ? 'assistant' : 'user',
      label: m.label,
      content,
    };
  });

  return { turns, hasLeadingPreamble };
}

/**
 * Extracts a shared input prompt and final assistant responses from a preference pair
 * (`chosen` and `rejected`) when unambiguous. Never invents an input or treats a full
 * conversation transcript as a single assistant response.
 */
export function extractPreferenceTranscript(
  rawChosen: unknown,
  rawRejected: unknown
): PreferenceExtractionResult {
  if (typeof rawChosen === 'string' && typeof rawRejected === 'string') {
    const chosenParsed = parseTranscriptTurns(rawChosen);
    const rejectedParsed = parseTranscriptTurns(rawRejected);

    if (chosenParsed.turns.length === 0 && rejectedParsed.turns.length === 0) {
      return {
        status: 'ambiguous',
        reason:
          "Preference record contains 'chosen' and 'rejected' without an 'input'/'prompt' field or structured 'Human:'/'Assistant:' conversation turns.",
      };
    }

    if (chosenParsed.hasLeadingPreamble || rejectedParsed.hasLeadingPreamble) {
      return {
        status: 'ambiguous',
        reason:
          "Preference transcript contains untagged text before the first 'Human:'/'Assistant:' turn marker.",
      };
    }

    if (chosenParsed.turns.length < 2 || rejectedParsed.turns.length < 2) {
      return {
        status: 'ambiguous',
        reason:
          "Preference transcript must contain at least one 'Human:' prompt turn and one final 'Assistant:' response turn in both 'chosen' and 'rejected'.",
      };
    }

    // Handle case where one final Assistant response quotes 'Human:'/'Assistant:' inline on a new line
    let chosenTurns = chosenParsed.turns;
    let rejectedTurns = rejectedParsed.turns;
    if (chosenTurns.length !== rejectedTurns.length) {
      const minLen = Math.min(chosenTurns.length, rejectedTurns.length);
      const splitIdx = minLen - 1;
      let prefixMatches = splitIdx >= 1;
      for (let i = 0; i < splitIdx && prefixMatches; i++) {
        if (
          chosenTurns[i].role !== rejectedTurns[i].role ||
          chosenTurns[i].content !== rejectedTurns[i].content
        ) {
          prefixMatches = false;
        }
      }
      if (
        prefixMatches &&
        chosenTurns[splitIdx].role === 'assistant' &&
        rejectedTurns[splitIdx].role === 'assistant' &&
        chosenTurns[splitIdx - 1].role === 'user'
      ) {
        const mergeTail = (turns: TranscriptTurn[], idx: number): TranscriptTurn[] => {
          if (turns.length <= idx + 1) return turns;
          const tailContent = turns
            .slice(idx)
            .map((t, k) => (k === 0 ? t.content : `${t.label}: ${t.content}`))
            .join('\n\n')
            .trim();
          return [
            ...turns.slice(0, idx),
            { role: 'assistant', label: turns[idx].label, content: tailContent },
          ];
        };
        chosenTurns = mergeTail(chosenTurns, splitIdx);
        rejectedTurns = mergeTail(rejectedTurns, splitIdx);
      } else {
        return {
          status: 'ambiguous',
          reason: `Preference transcripts have mismatched turn counts ('chosen' has ${chosenTurns.length} turns, 'rejected' has ${rejectedTurns.length} turns).`,
        };
      }
    }

    const lastIdx = chosenTurns.length - 1;

    if (chosenTurns[0].role !== 'user' || rejectedTurns[0].role !== 'user') {
      return {
        status: 'ambiguous',
        reason:
          "Preference transcript turns must start with 'Human:'/'User:' and end with an 'Assistant:' response.",
      };
    }

    if (chosenTurns[lastIdx].role !== 'assistant' || rejectedTurns[lastIdx].role !== 'assistant') {
      return {
        status: 'ambiguous',
        reason: "Preference transcript must end with an 'Assistant:' turn in both 'chosen' and 'rejected'.",
      };
    }

    if (chosenTurns[lastIdx - 1].role !== 'user' || !chosenTurns[lastIdx - 1].content) {
      return {
        status: 'ambiguous',
        reason: "Preference transcript must have a non-empty 'Human:'/'User:' turn immediately preceding the final 'Assistant:' response.",
      };
    }

    if (!chosenTurns[lastIdx].content) {
      return {
        status: 'ambiguous',
        reason: "Preference transcript contains an empty final 'Assistant:' response turn in 'chosen'.",
      };
    }

    // Verify all turns prior to the final assistant turn are identical between chosen and rejected
    for (let i = 0; i < lastIdx; i++) {
      if (
        chosenTurns[i].role !== rejectedTurns[i].role ||
        chosenTurns[i].content !== rejectedTurns[i].content
      ) {
        return {
          status: 'ambiguous',
          reason:
            "Preference transcripts diverge before the final 'Assistant:' turn; cannot unambiguously extract a single shared input prompt.",
        };
      }
    }

    const priorTurns = chosenTurns.slice(0, lastIdx);
    const input =
      priorTurns.length === 1
        ? priorTurns[0].content
        : priorTurns.map((t) => `${t.label}: ${t.content}`).join('\n\n');
    const lastUserTurn = priorTurns[priorTurns.length - 1].content;

    return {
      status: 'extracted',
      input,
      lastUserTurn,
      chosenResponse: chosenTurns[lastIdx].content,
      rejectedResponse: rejectedTurns[lastIdx].content,
      turnCount: chosenTurns.length,
    };
  }

  if (Array.isArray(rawChosen) && Array.isArray(rawRejected)) {
    if (rawChosen.length < 2 || rawChosen.length !== rawRejected.length) {
      return {
        status: 'ambiguous',
        reason:
          "Conversation array preference record must have matching turn counts (>= 2) in both 'chosen' and 'rejected'.",
      };
    }

    const normalizeMsg = (item: any): { role: string; content: string } | null => {
      if (!item || typeof item !== 'object') return null;
      const rawRole = typeof item.role === 'string' ? item.role : typeof item.from === 'string' ? item.from : '';
      const rawContent = typeof item.content === 'string' ? item.content : typeof item.value === 'string' ? item.value : '';
      const role = rawRole.trim().toLowerCase();
      const content = rawContent.replace(/\r\n/g, '\n').trim();
      if (!role || !content) return null;
      return {
        role: role === 'human' ? 'user' : role === 'gpt' || role === 'bot' ? 'assistant' : role,
        content,
      };
    };

    const chosenMsgs = rawChosen.map(normalizeMsg);
    const rejectedMsgs = rawRejected.map(normalizeMsg);

    if (chosenMsgs.some((m) => !m) || rejectedMsgs.some((m) => !m)) {
      return {
        status: 'ambiguous',
        reason: "Conversation array preference record contains malformed or empty message objects.",
      };
    }

    const validChosen = chosenMsgs as Array<{ role: string; content: string }>;
    const validRejected = rejectedMsgs as Array<{ role: string; content: string }>;
    const lastIdx = validChosen.length - 1;

    if (validChosen[lastIdx].role !== 'assistant' || validRejected[lastIdx].role !== 'assistant') {
      return {
        status: 'ambiguous',
        reason: "Conversation array preference record must end with an 'assistant' message in both 'chosen' and 'rejected'.",
      };
    }

    const priorChosen = validChosen.slice(0, lastIdx);
    if (!priorChosen.some((m) => m.role === 'user')) {
      return {
        status: 'ambiguous',
        reason: "Conversation array preference record must include at least one preceding 'user' message.",
      };
    }

    for (let i = 0; i < lastIdx; i++) {
      if (
        validChosen[i].role !== validRejected[i].role ||
        validChosen[i].content !== validRejected[i].content
      ) {
        return {
          status: 'ambiguous',
          reason:
            "Conversation array preference records diverge before the final 'assistant' message.",
        };
      }
    }

    const input =
      priorChosen.length === 1 && priorChosen[0].role === 'user'
        ? priorChosen[0].content
        : priorChosen
            .map((m) => `${m.role === 'user' ? 'Human' : m.role === 'assistant' ? 'Assistant' : m.role}: ${m.content}`)
            .join('\n\n');
    const lastUserMsg = [...priorChosen].reverse().find((m) => m.role === 'user')!;

    return {
      status: 'extracted',
      input,
      lastUserTurn: lastUserMsg.content,
      chosenResponse: validChosen[lastIdx].content,
      rejectedResponse: validRejected[lastIdx].content,
      turnCount: validChosen.length,
    };
  }

  return {
    status: 'ambiguous',
    reason:
      "Preference fields 'chosen' and 'rejected' could not be unambiguously decomposed into an input prompt and final assistant response.",
  };
}

/**
 * Evaluates compatibility of a normalized dataset with all RELIQ evaluators.
 */
export function computeEvaluatorCompatibility(cases: TestCase[]): DatasetEvaluatorCompatibility[] {
  const total = cases.length;
  const withExpected = cases.filter((c) => Boolean(c.expectedOutput && c.expectedOutput.trim())).length;
  const withContext = cases.filter((c) => Boolean(c.context && c.context.trim())).length;

  return VALID_EVALUATOR_TYPES.map((evaluatorType) => {
    const requiresExpectedOutput = REFERENCE_REQUIRED_EVALUATORS.has(evaluatorType);
    const requiresContext = false;

    let eligibleCasesCount = total;
    if (requiresExpectedOutput) {
      eligibleCasesCount = withExpected;
    } else if (evaluatorType === 'keyword_criteria') {
      eligibleCasesCount = cases.filter(
        (c) =>
          Boolean(c.expectedOutput && c.expectedOutput.trim()) ||
          Boolean(c.evaluatorConfig?.requiredKeywords && c.evaluatorConfig.requiredKeywords.length > 0) ||
          Boolean(c.evaluatorConfig?.forbiddenKeywords && c.evaluatorConfig.forbiddenKeywords.length > 0)
      ).length;
    }

    const ineligibleCasesCount = Math.max(0, total - eligibleCasesCount);
    const compatible = total > 0 && eligibleCasesCount > 0;

    let warning: string | undefined;
    if (total > 0 && ineligibleCasesCount > 0) {
      if (eligibleCasesCount === 0) {
        warning = `Evaluator '${evaluatorType}' requires expected_output reference, which is missing on all ${total} case(s). Select a reference-free evaluator (llm_judge, behavioral_safety, response_length, latency, json_validity) or map expected_output.`;
      } else {
        warning = `${ineligibleCasesCount} of ${total} case(s) lack expected_output and will skip '${evaluatorType}' unless evaluated by a reference-free metric.`;
      }
    }

    return {
      evaluatorType,
      requiresExpectedOutput,
      requiresContext,
      eligibleCasesCount,
      ineligibleCasesCount,
      compatible,
      warning,
    };
  });
}

export interface ParseAndValidateOptions {
  rawContent: string;
  filename?: string;
  format?: DatasetFormatType;
  fieldMapping?: DatasetFieldMapping;
  defaultCategory?: TestCaseCategory;
  defaultEvaluatorType?: EvaluatorType;
  defaultSeverity?: SeverityLevel;
  selectedEvaluators?: EvaluatorType[];
  maxBytes?: number;
  maxRecords?: number;
}

/**
 * Parses, maps, validates, and normalizes an uploaded dataset payload.
 * Never silently drops invalid rows; all errors and warnings include 1-indexed record numbers.
 */
export function parseAndValidateDataset(options: ParseAndValidateOptions): DatasetPreviewResult {
  const {
    rawContent,
    filename,
    defaultCategory = 'Instruction Following',
    defaultEvaluatorType,
    defaultSeverity = 'medium',
    selectedEvaluators = [],
    maxBytes = MAX_DATASET_FILE_BYTES,
    maxRecords = MAX_DATASET_RECORDS,
  } = options;

  const detectedFormat = options.format || detectDatasetFormat(rawContent || '', filename);
  const issues: DatasetValidationIssue[] = [];
  const contentHash = computeDatasetContentHash(rawContent || '');
  const emptyCompatSummary = {
    referenceEligibleCount: 0,
    referenceFreeCount: 0,
    contextEligibleCount: 0,
    incompatibleEvaluators: [] as EvaluatorType[],
    warnings: [] as string[],
  };

  // 1. Check empty payload
  if (!rawContent || typeof rawContent !== 'string' || rawContent.trim().length === 0) {
    issues.push({
      severity: 'error',
      code: 'EMPTY_FILE',
      message: 'Dataset file is empty. Provide at least 1 valid test case record.',
    });
    const mapping = options.fieldMapping || {};
    return {
      valid: false,
      format: detectedFormat,
      detectedFormat,
      detectedColumns: [],
      detectedFields: [],
      inferredMapping: mapping,
      appliedMapping: mapping,
      totalRecords: 0,
      validRecords: 0,
      validRecordsCount: 0,
      errorCount: 1,
      warningCount: 0,
      recordsWithExpectedOutput: 0,
      casesWithExpectedOutput: 0,
      recordsWithContext: 0,
      casesWithContext: 0,
      sampleRecords: [],
      normalizedCases: [],
      issues,
      evaluatorCompatibility: computeEvaluatorCompatibility([]),
      compatibility: emptyCompatSummary,
      contentHash,
    };
  }

  // 2. Check byte size limit
  const byteLength = typeof Buffer !== 'undefined' ? Buffer.byteLength(rawContent, 'utf8') : new Blob([rawContent]).size;
  if (byteLength > maxBytes) {
    issues.push({
      severity: 'error',
      code: 'FILE_TOO_LARGE',
      message: `Dataset payload (${(byteLength / (1024 * 1024)).toFixed(2)} MB) exceeds maximum allowed limit of ${(maxBytes / (1024 * 1024)).toFixed(1)} MB.`,
    });
    const mapping = options.fieldMapping || {};
    return {
      valid: false,
      format: detectedFormat,
      detectedFormat,
      detectedColumns: [],
      detectedFields: [],
      inferredMapping: mapping,
      appliedMapping: mapping,
      totalRecords: 0,
      validRecords: 0,
      validRecordsCount: 0,
      errorCount: 1,
      warningCount: 0,
      recordsWithExpectedOutput: 0,
      casesWithExpectedOutput: 0,
      recordsWithContext: 0,
      casesWithContext: 0,
      sampleRecords: [],
      normalizedCases: [],
      issues,
      evaluatorCompatibility: computeEvaluatorCompatibility([]),
      compatibility: emptyCompatSummary,
      contentHash,
    };
  }

  // 3. Parse raw records by format
  let rawRecords: Array<{ recordNumber: number; data: Record<string, any> }> = [];
  let suggestedName: string | undefined;
  let suggestedDescription: string | undefined;
  let suggestedVersion: string | undefined;

  if (detectedFormat === 'json') {
    try {
      const parsed = JSON.parse(rawContent.replace(/^\uFEFF/, ''));
      if (Array.isArray(parsed)) {
        rawRecords = parsed.map((item, idx) => ({
          recordNumber: idx + 1,
          data: item && typeof item === 'object' && !Array.isArray(item) ? item : { __invalidRecord: item },
        }));
      } else if (parsed && typeof parsed === 'object') {
        if (typeof parsed.name === 'string') suggestedName = parsed.name.trim();
        if (typeof parsed.description === 'string') suggestedDescription = parsed.description.trim();
        if (typeof parsed.version === 'string') suggestedVersion = parsed.version.trim();

        const arrayProp =
          parsed.cases ||
          parsed.records ||
          parsed.items ||
          parsed.scenarios ||
          parsed.data ||
          parsed.test_cases ||
          parsed.testCases;

        if (Array.isArray(arrayProp)) {
          rawRecords = arrayProp.map((item: any, idx: number) => ({
            recordNumber: idx + 1,
            data: item && typeof item === 'object' && !Array.isArray(item) ? item : { __invalidRecord: item },
          }));
        } else {
          issues.push({
            recordNumber: 1,
            severity: 'error',
            code: 'PARSE_ERROR',
            message:
              'JSON object must contain a "cases" (or "records" / "items" / "scenarios") array, or the root value must be a JSON array of test cases.',
          });
        }
      } else {
        issues.push({
          recordNumber: 1,
          severity: 'error',
          code: 'PARSE_ERROR',
          message: 'JSON root must be an array of test case objects or a dataset object containing a "cases" array.',
        });
      }
    } catch (err: any) {
      issues.push({
        recordNumber: 1,
        severity: 'error',
        code: 'PARSE_ERROR',
        message: `Malformed JSON syntax: ${err.message || 'Unable to parse JSON content'}.`,
      });
    }
  } else if (detectedFormat === 'jsonl' || detectedFormat === 'ndjson') {
    const lines = rawContent.replace(/^\uFEFF/, '').split(/\r?\n/);
    let recordNum = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue; // ignore blank lines
      recordNum++;
      try {
        const parsedLine = JSON.parse(line);
        if (!parsedLine || typeof parsedLine !== 'object' || Array.isArray(parsedLine)) {
          issues.push({
            recordNumber: recordNum,
            severity: 'error',
            code: 'PARSE_ERROR',
            message: `Record #${recordNum} (line ${i + 1}): JSONL line must be a JSON object, received ${Array.isArray(parsedLine) ? 'array' : typeof parsedLine}.`,
          });
          rawRecords.push({ recordNumber: recordNum, data: { __parseFailed: true } });
        } else {
          rawRecords.push({ recordNumber: recordNum, data: parsedLine });
        }
      } catch (err: any) {
        issues.push({
          recordNumber: recordNum,
          severity: 'error',
          code: 'PARSE_ERROR',
          message: `Record #${recordNum} (line ${i + 1}): Malformed JSON in JSONL — ${err.message}`,
        });
        rawRecords.push({ recordNumber: recordNum, data: { __parseFailed: true } });
      }
    }
  } else if (detectedFormat === 'csv') {
    const csvParsed = parseCsvRows(rawContent);
    issues.push(...csvParsed.issues);
    rawRecords = csvParsed.rows.map((r) => ({
      recordNumber: r.recordNumber,
      data: r.rawObj,
    }));
  }

  // Check if 0 records found and no parse error yet
  if (rawRecords.length === 0 && issues.length === 0) {
    issues.push({
      severity: 'error',
      code: 'EMPTY_FILE',
      message: 'Dataset contains 0 test case records.',
    });
  }

  // Check record count limit — cap to first maxRecords with a warning rather than blocking import
  if (rawRecords.length > maxRecords) {
    issues.push({
      severity: 'warning',
      code: 'TOO_MANY_RECORDS',
      message: `Dataset contains ${rawRecords.length} records, exceeding the maximum limit of ${maxRecords} scenarios per import. Only the first ${maxRecords} records will be imported.`,
    });
  }

  // Collect all detected field names
  const fieldSet = new Set<string>();
  for (const rec of rawRecords.slice(0, 100)) {
    if (rec.data && typeof rec.data === 'object' && !rec.data.__invalidRecord && !rec.data.__parseFailed) {
      for (const k of Object.keys(rec.data)) {
        fieldSet.add(k);
      }
    }
  }
  const detectedFields = Array.from(fieldSet);
  const appliedMapping = inferFieldMapping(detectedFields, options.fieldMapping);

  // Validate each record and build normalized TestCase objects
  const normalizedCases: TestCase[] = [];
  const seenCaseKeys = new Map<string, number>();
  let casesWithExpectedOutput = 0;
  let casesWithContext = 0;
  let missingExpectedOutputCount = 0;
  const nowIso = new Date().toISOString();

  const recordsToInspect = rawRecords.slice(0, maxRecords);

  for (const { recordNumber, data } of recordsToInspect) {
    if (!data || data.__parseFailed) {
      continue;
    }
    if ('__invalidRecord' in data) {
      issues.push({
        recordNumber,
        severity: 'error',
        code: 'PARSE_ERROR',
        message: `Record #${recordNumber}: Expected an object, received ${typeof data.__invalidRecord}.`,
      });
      continue;
    }

    const getVal = (mappedKey?: string, fallbackAliases: string[] = []): any => {
      if (mappedKey && mappedKey in data) {
        return data[mappedKey];
      }
      for (const alias of fallbackAliases) {
        if (alias in data) return data[alias];
      }
      return undefined;
    };

    const rawInput = getVal(appliedMapping.inputField, FIELD_ALIASES.inputField);
    const rawExpected = getVal(appliedMapping.expectedOutputField, FIELD_ALIASES.expectedOutputField);
    const rawRejected = getVal(appliedMapping.rejectedOutputField, FIELD_ALIASES.rejectedOutputField);
    const rawContext = getVal(appliedMapping.contextField, FIELD_ALIASES.contextField);
    const rawId = getVal(appliedMapping.idField, FIELD_ALIASES.idField);
    const rawName = getVal(appliedMapping.nameField, FIELD_ALIASES.nameField);
    const rawCategory = getVal(appliedMapping.categoryField, FIELD_ALIASES.categoryField);
    const rawTags = getVal(appliedMapping.tagsField, FIELD_ALIASES.tagsField);
    const rawMetadata = getVal(appliedMapping.metadataField, FIELD_ALIASES.metadataField);
    const rawEvaluator = getVal(appliedMapping.evaluatorTypeField, FIELD_ALIASES.evaluatorTypeField);
    const rawSeverity = getVal(appliedMapping.severityField, FIELD_ALIASES.severityField);

    const hasExplicitChosenKey =
      (Boolean(appliedMapping.expectedOutputField) &&
        PREFERENCE_CHOSEN_ALIASES.includes(appliedMapping.expectedOutputField!.toLowerCase()) &&
        appliedMapping.expectedOutputField! in data) ||
      PREFERENCE_CHOSEN_ALIASES.some((alias) => alias in data);

    const hasExplicitRejectedKey =
      Boolean(appliedMapping.rejectedOutputField && appliedMapping.rejectedOutputField in data) ||
      FIELD_ALIASES.rejectedOutputField.some((alias) => alias in data);

    const isPreferenceRecord = hasExplicitChosenKey || hasExplicitRejectedKey;

    const rawChosen = hasExplicitChosenKey
      ? getVal(
          appliedMapping.expectedOutputField &&
            PREFERENCE_CHOSEN_ALIASES.includes(appliedMapping.expectedOutputField.toLowerCase())
            ? appliedMapping.expectedOutputField
            : undefined,
          PREFERENCE_CHOSEN_ALIASES
        )
      : rawExpected;

    let inputStr = '';
    let expectedStr = '';
    let extractedRejectedResponse: string | undefined;
    let isAmbiguousPreference = false;
    let ambiguousReason = '';

    if (isPreferenceRecord) {
      // Validate that both preference fields ('chosen' and 'rejected') are present and non-empty
      const chosenValid = isValidPreferenceFieldValue(rawChosen);
      const rejectedValid = isValidPreferenceFieldValue(rawRejected);

      if (!chosenValid || !rejectedValid) {
        const offendingField = !chosenValid
          ? appliedMapping.expectedOutputField &&
            PREFERENCE_CHOSEN_ALIASES.includes(appliedMapping.expectedOutputField.toLowerCase())
            ? appliedMapping.expectedOutputField
            : 'chosen'
          : appliedMapping.rejectedOutputField || 'rejected';
        issues.push({
          recordNumber,
          field: offendingField,
          severity: 'error',
          code: 'MALFORMED_PREFERENCE_RECORD',
          message: `Record #${recordNumber}: Preference record requires both non-empty 'chosen' and 'rejected' fields (missing or invalid '${offendingField}').`,
        });
        continue;
      }

      const hasExplicitInputKey =
        Boolean(appliedMapping.inputField && appliedMapping.inputField in data) ||
        FIELD_ALIASES.inputField.some((alias) => alias in data);

      if (hasExplicitInputKey) {
        if (rawInput === undefined || rawInput === null) {
          issues.push({
            recordNumber,
            field: appliedMapping.inputField || 'input',
            severity: 'error',
            code: 'MISSING_INPUT',
            message: `Record #${recordNumber}: Missing required 'input' (or 'prompt'/'question') field.`,
          });
          continue;
        }

        const explicitInputStr =
          typeof rawInput === 'string'
            ? rawInput.trim()
            : typeof rawInput === 'object'
            ? JSON.stringify(rawInput)
            : String(rawInput).trim();

        if (!explicitInputStr) {
          issues.push({
            recordNumber,
            field: appliedMapping.inputField || 'input',
            severity: 'error',
            code: 'EMPTY_INPUT',
            message: `Record #${recordNumber}: 'input' field cannot be empty or whitespace-only.`,
          });
          continue;
        }

        if (looksLikeConversationTranscript(rawChosen) || looksLikeConversationTranscript(rawRejected)) {
          const extraction = extractPreferenceTranscript(rawChosen, rawRejected);
          const normalizedExplicit = explicitInputStr.replace(/\r\n/g, '\n').trim();
          if (
            extraction.status === 'extracted' &&
            (extraction.input === normalizedExplicit || extraction.lastUserTurn === normalizedExplicit)
          ) {
            inputStr = explicitInputStr;
            expectedStr = extraction.chosenResponse;
            extractedRejectedResponse = extraction.rejectedResponse;
          } else {
            inputStr = looksLikeConversationTranscript(explicitInputStr) ? '' : explicitInputStr;
            expectedStr = '';
            isAmbiguousPreference = true;
            ambiguousReason =
              extraction.status === 'ambiguous'
                ? extraction.reason
                : "Explicit 'input'/'prompt' field does not match the conversation prompt inside the 'chosen'/'rejected' transcript.";
          }
        } else {
          inputStr = explicitInputStr;
          expectedStr =
            typeof rawChosen === 'string'
              ? rawChosen.trim()
              : typeof rawChosen === 'object'
              ? JSON.stringify(rawChosen)
              : String(rawChosen).trim();
          extractedRejectedResponse =
            typeof rawRejected === 'string'
              ? rawRejected.trim()
              : typeof rawRejected === 'object'
              ? JSON.stringify(rawRejected)
              : String(rawRejected).trim();
        }
      } else {
        const extraction = extractPreferenceTranscript(rawChosen, rawRejected);
        if (extraction.status === 'extracted') {
          inputStr = extraction.input;
          expectedStr = extraction.chosenResponse;
          extractedRejectedResponse = extraction.rejectedResponse;
        } else {
          inputStr = '';
          expectedStr = '';
          isAmbiguousPreference = true;
          ambiguousReason = extraction.reason;
        }
      }
    } else {
      // 1. Validate Input (Required for standard records)
      if (rawInput === undefined || rawInput === null) {
        issues.push({
          recordNumber,
          field: appliedMapping.inputField || 'input',
          severity: 'error',
          code: 'MISSING_INPUT',
          message: `Record #${recordNumber}: Missing required 'input' (or 'prompt'/'question') field.`,
        });
        continue;
      }

      inputStr =
        typeof rawInput === 'string'
          ? rawInput.trim()
          : typeof rawInput === 'object'
          ? JSON.stringify(rawInput)
          : String(rawInput).trim();

      if (!inputStr) {
        issues.push({
          recordNumber,
          field: appliedMapping.inputField || 'input',
          severity: 'error',
          code: 'EMPTY_INPUT',
          message: `Record #${recordNumber}: 'input' field cannot be empty or whitespace-only.`,
        });
        continue;
      }

      // 2. Normalize Expected Output (Optional for reference-free evaluators)
      expectedStr =
        rawExpected === undefined || rawExpected === null
          ? ''
          : typeof rawExpected === 'string'
          ? rawExpected.trim()
          : typeof rawExpected === 'object'
          ? JSON.stringify(rawExpected)
          : String(rawExpected).trim();
    }

    // 3. Normalize Context (Optional)
    const contextStr =
      rawContext === undefined || rawContext === null
        ? undefined
        : typeof rawContext === 'string'
        ? rawContext.trim() || undefined
        : typeof rawContext === 'object'
        ? JSON.stringify(rawContext)
        : String(rawContext).trim() || undefined;

    // 4. Normalize ID / caseKey and check duplicates within file
    const candidateIdStr =
      rawId !== undefined && rawId !== null && !looksLikeConversationTranscript(rawId)
        ? String(rawId).trim()
        : '';
    const caseKey =
      candidateIdStr !== '' && candidateIdStr.length <= 128
        ? candidateIdStr
        : `case-${String(recordNumber).padStart(3, '0')}`;

    if (seenCaseKeys.has(caseKey)) {
      const prevRow = seenCaseKeys.get(caseKey)!;
      issues.push({
        recordNumber,
        field: appliedMapping.idField || 'id',
        severity: 'error',
        code: 'DUPLICATE_ID',
        message: `Record #${recordNumber}: Duplicate test case ID '${caseKey}' (already defined at Record #${prevRow}).`,
      });
      continue;
    }
    seenCaseKeys.set(caseKey, recordNumber);

    // 5. Security / Secret Pattern Check (scans input, expected, chosen, rejected, context, metadata)
    const chosenScanStr =
      rawChosen === undefined || rawChosen === null
        ? ''
        : typeof rawChosen === 'string'
        ? rawChosen
        : JSON.stringify(rawChosen);
    const rejectedScanStr =
      rawRejected === undefined || rawRejected === null
        ? ''
        : typeof rawRejected === 'string'
        ? rawRejected
        : JSON.stringify(rawRejected);
    const textToScan = `${inputStr}\n${expectedStr}\n${chosenScanStr}\n${rejectedScanStr}\n${contextStr || ''}\n${
      rawMetadata ? (typeof rawMetadata === 'string' ? rawMetadata : JSON.stringify(rawMetadata)) : ''
    }`;
    let detectedSecret = false;
    for (const pattern of UPLOAD_SECRET_PATTERNS) {
      if (pattern.test(textToScan)) {
        detectedSecret = true;
        issues.push({
          recordNumber,
          severity: 'error',
          code: 'SECRET_DETECTED',
          message: `Record #${recordNumber}: Potential live API key or private credential detected (matched pattern ${pattern.source}). Redact secrets before uploading.`,
        });
        break;
      }
    }
    if (detectedSecret) {
      continue;
    }

    if (isAmbiguousPreference) {
      issues.push({
        recordNumber,
        field: appliedMapping.expectedOutputField || 'chosen',
        severity: 'warning',
        code: 'AMBIGUOUS_PREFERENCE_RECORD',
        message: `Record #${recordNumber}: ${ambiguousReason} Preserved original 'chosen' and 'rejected' pair in metadata without inventing an input.`,
      });
    }

    // 6. Evaluator Type Resolution & Validation
    let evaluatorType: EvaluatorType =
      defaultEvaluatorType || (isPreferenceRecord ? 'llm_judge' : expectedStr ? 'normalized_text' : 'llm_judge');

    if (rawEvaluator !== undefined && rawEvaluator !== null && String(rawEvaluator).trim() !== '') {
      const candidateEval = String(rawEvaluator).trim().toLowerCase() as EvaluatorType;
      if (VALID_EVALUATOR_TYPES.includes(candidateEval)) {
        evaluatorType = candidateEval;
      } else {
        issues.push({
          recordNumber,
          field: appliedMapping.evaluatorTypeField || 'evaluator_type',
          severity: 'warning',
          code: 'INVALID_EVALUATOR',
          message: `Record #${recordNumber}: Unknown evaluator_type '${rawEvaluator}'. Defaulted to '${evaluatorType}'.`,
        });
      }
    }

    // Check expected_output vs evaluator requirement
    const selectedRequiresRef = selectedEvaluators.some((ev) => REFERENCE_REQUIRED_EVALUATORS.has(ev));
    if (!expectedStr) {
      if (!isAmbiguousPreference) {
        missingExpectedOutputCount++;
      }
      if (REFERENCE_REQUIRED_EVALUATORS.has(evaluatorType) || selectedRequiresRef) {
        const offendingEval = REFERENCE_REQUIRED_EVALUATORS.has(evaluatorType)
          ? evaluatorType
          : selectedEvaluators.find((ev) => REFERENCE_REQUIRED_EVALUATORS.has(ev))!;
        issues.push({
          recordNumber,
          field: appliedMapping.expectedOutputField || 'expected_output',
          severity: selectedRequiresRef ? 'error' : 'warning',
          code: 'EVALUATOR_INCOMPATIBILITY',
          message: `Record #${recordNumber}: Evaluator '${offendingEval}' requires 'expected_output', which is empty. Consider 'llm_judge', 'behavioral_safety', 'response_length', or 'json_validity', or provide 'expected_output'.`,
        });
      }
    } else {
      casesWithExpectedOutput++;
    }

    if (contextStr) {
      casesWithContext++;
    }

    // 7. Severity Resolution
    let severity: SeverityLevel = defaultSeverity;
    if (rawSeverity !== undefined && rawSeverity !== null && String(rawSeverity).trim() !== '') {
      const candidateSev = String(rawSeverity).trim().toLowerCase() as SeverityLevel;
      if (VALID_SEVERITIES.includes(candidateSev)) {
        severity = candidateSev;
      }
    }

    // 8. Category Resolution
    const category: TestCaseCategory =
      rawCategory !== undefined && rawCategory !== null && String(rawCategory).trim() !== ''
        ? (String(rawCategory).trim() as TestCaseCategory)
        : defaultCategory;

    // 9. Tags Resolution
    let tags: string[] = [];
    if (Array.isArray(rawTags)) {
      tags = rawTags.map((t) => String(t).trim()).filter(Boolean);
    } else if (typeof rawTags === 'string' && rawTags.trim()) {
      const trimmedTags = rawTags.trim();
      if (trimmedTags.startsWith('[')) {
        try {
          const parsedTags = JSON.parse(trimmedTags);
          if (Array.isArray(parsedTags)) {
            tags = parsedTags.map((t) => String(t).trim()).filter(Boolean);
          }
        } catch {
          tags = trimmedTags
            .split(/[,;|]/)
            .map((t) => t.trim())
            .filter(Boolean);
        }
      } else {
        tags = trimmedTags
          .split(/[,;|]/)
          .map((t) => t.trim())
          .filter(Boolean);
      }
    }

    // 10. Metadata Resolution (losslessly preserves original chosen and rejected values on preference records)
    let metadata: Record<string, any> | undefined;
    if (rawMetadata !== undefined && rawMetadata !== null && rawMetadata !== '') {
      if (typeof rawMetadata === 'object' && !Array.isArray(rawMetadata)) {
        metadata = { ...rawMetadata };
      } else if (typeof rawMetadata === 'string') {
        const trimmedMeta = rawMetadata.trim();
        if (trimmedMeta) {
          try {
            const parsedMeta = JSON.parse(trimmedMeta);
            if (parsedMeta && typeof parsedMeta === 'object' && !Array.isArray(parsedMeta)) {
              metadata = { ...parsedMeta };
            } else {
              metadata = { value: parsedMeta };
            }
          } catch {
            issues.push({
              recordNumber,
              field: appliedMapping.metadataField || 'metadata',
              severity: 'warning',
              code: 'INVALID_JSON_FIELD',
              message: `Record #${recordNumber}: 'metadata' string is not valid JSON; stored as raw string in metadata.raw.`,
            });
            metadata = { raw: trimmedMeta };
          }
        }
      }
    }

    if (isPreferenceRecord) {
      metadata = {
        ...(metadata || {}),
        chosen: rawChosen,
        rejected: rawRejected,
        ...(extractedRejectedResponse !== undefined ? { rejectedOutput: extractedRejectedResponse } : {}),
      };
    }

    // Preserve evaluatorConfig if present in JSON/JSONL record
    let evaluatorConfig: Record<string, any> | undefined;
    const rawEvalConfig = data.evaluator_config || data.evaluatorConfig || data.evaluation_criteria;
    if (rawEvalConfig && typeof rawEvalConfig === 'object' && !Array.isArray(rawEvalConfig)) {
      evaluatorConfig = rawEvalConfig;
    } else if (typeof rawEvalConfig === 'string' && rawEvalConfig.trim().startsWith('{')) {
      try {
        evaluatorConfig = JSON.parse(rawEvalConfig);
      } catch {
        // ignore
      }
    }

    // 11. Scenario Name
    const nameStr =
      rawName !== undefined && rawName !== null && String(rawName).trim() !== ''
        ? String(rawName).trim()
        : inputStr
        ? inputStr.length > 64
          ? `${inputStr.slice(0, 61)}...`
          : inputStr
        : `Preference Case #${recordNumber}`;

    normalizedCases.push({
      id: caseKey,
      caseKey,
      order: recordNumber,
      sourceRecordNumber: recordNumber,
      name: nameStr,
      title: nameStr,
      category,
      input: inputStr,
      prompt: inputStr,
      expectedOutput: expectedStr,
      expected_behavior: expectedStr,
      context: contextStr,
      evaluatorType,
      evaluatorConfig,
      tags,
      severity,
      metadata,
      createdAt: nowIso,
    });
  }

  if (missingExpectedOutputCount > 0 && normalizedCases.length > 0) {
    issues.push({
      severity: 'warning',
      code: 'MISSING_EXPECTED_OUTPUT',
      message: `${missingExpectedOutputCount} of ${normalizedCases.length} valid record(s) do not include 'expected_output'. Reference-free evaluators (LLM Judge, Behavioral Safety, Response Length, Latency, JSON Validity) are supported; reference-matching evaluators require 'expected_output'.`,
    });
  }

  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  const evaluatorCompatibility = computeEvaluatorCompatibility(normalizedCases);

  const incompatibleEvaluators: EvaluatorType[] = [];
  for (const ev of selectedEvaluators) {
    if (REFERENCE_REQUIRED_EVALUATORS.has(ev) && casesWithExpectedOutput < normalizedCases.length) {
      incompatibleEvaluators.push(ev);
    }
  }
  for (const tc of normalizedCases) {
    if (REFERENCE_REQUIRED_EVALUATORS.has(tc.evaluatorType) && !tc.expectedOutput) {
      if (!incompatibleEvaluators.includes(tc.evaluatorType)) {
        incompatibleEvaluators.push(tc.evaluatorType);
      }
    }
  }

  const compatibility = {
    referenceEligibleCount: casesWithExpectedOutput,
    referenceFreeCount: normalizedCases.length - casesWithExpectedOutput,
    contextEligibleCount: casesWithContext,
    incompatibleEvaluators,
    warnings: evaluatorCompatibility.filter((c) => c.warning).map((c) => c.warning!),
  };

  if (!suggestedName && filename) {
    suggestedName = filename
      .replace(/\.(json|jsonl|ndjson|csv)$/i, '')
      .replace(/[-_]+/g, ' ')
      .trim();
  }

  return {
    valid: errorCount === 0 && normalizedCases.length > 0,
    format: detectedFormat,
    detectedFormat,
    detectedColumns: detectedFields,
    detectedFields,
    inferredMapping: appliedMapping,
    appliedMapping,
    totalRecords: rawRecords.length,
    validRecords: normalizedCases.length,
    validRecordsCount: normalizedCases.length,
    errorCount,
    warningCount,
    recordsWithExpectedOutput: casesWithExpectedOutput,
    casesWithExpectedOutput,
    recordsWithContext: casesWithContext,
    casesWithContext,
    sampleRecords: normalizedCases.slice(0, 10),
    normalizedCases,
    issues,
    evaluatorCompatibility,
    compatibility,
    contentHash,
    suggestedName,
    suggestedDescription,
    suggestedVersion: suggestedVersion || '1.0.0',
  };
}

/**
 * Helper to bump a semantic version string (e.g. "1.0.0" -> "1.1.0").
 */
export function bumpDatasetVersion(version?: string): string {
  if (!version || !version.trim()) return '1.1.0';
  const parts = version.trim().replace(/^v/i, '').split('.');
  if (parts.length >= 2) {
    const major = parseInt(parts[0], 10) || 1;
    const minor = (parseInt(parts[1], 10) || 0) + 1;
    return `${major}.${minor}.0`;
  }
  return `${version.trim()}.1`;
}
