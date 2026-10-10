/* ============================================================
   RELIQ — Dataset Upload Panel & Subcomponents
   
   Supports browser-side pre-validation and full RELIQ import for:
   - JSON (.json): array of scenarios or object with cases/scenarios/items/data
   - JSON Lines (.jsonl): one JSON scenario per line
   - Newline-delimited JSON (.ndjson): one JSON scenario per line
   - CSV (.csv): RFC 4180 tabular scenarios with input, expected_output, context, category
   
   Visual palette:
   - Background: dark charcoal (#111315)
   - Panels: slightly lighter charcoal (#191B1C)
   - Primary text: bone white (#E8E4D9)
   - Secondary text: muted grey (#A4A49D)
   - Borders: subtle neutral grey (#343638)
   - Accent: subdued warm bone (#D6D2C5) & RELIQ signal (#FF6B35)
   ============================================================ */

import React, { useId, useMemo, useRef, useState } from 'react';
import {
  Dataset,
  DatasetFieldMapping,
  DatasetFormatType,
  DatasetImportConflictResolution,
  DatasetPreviewResult,
  DatasetValidationIssue,
  TestCase,
} from '../../domain/types';
import {
  MAX_DATASET_FILE_BYTES,
  MAX_DATASET_RECORDS,
  detectDatasetFormat,
  parseAndValidateDataset,
} from '../../data/datasetImporter';
import { getDatasetTemplate } from '../../data/benchmarkRegistry';
import { apiRepository } from '../../services/apiRepository';

export type UploadPanelState =
  | 'empty'
  | 'dragging'
  | 'parsing'
  | 'valid'
  | 'valid_with_warnings'
  | 'invalid'
  | 'importing'
  | 'imported';

const ACCEPTED_EXTENSIONS = ['.json', '.jsonl', '.ndjson', '.csv'] as const;

export const SUPPORTED_DATASET_FORMATS: Array<{
  typeLabel: string;
  extension: string;
  formatKey: DatasetFormatType;
  description: string;
}> = [
  {
    typeLabel: 'JSON',
    extension: '.json',
    formatKey: 'json',
    description: 'An array of test scenarios or an object containing cases, scenarios, items, or data',
  },
  {
    typeLabel: 'JSON Lines',
    extension: '.jsonl',
    formatKey: 'jsonl',
    description: 'One JSON scenario per line',
  },
  {
    typeLabel: 'Newline-delimited JSON',
    extension: '.ndjson',
    formatKey: 'ndjson',
    description: 'Same basic format as JSONL',
  },
  {
    typeLabel: 'CSV',
    extension: '.csv',
    formatKey: 'csv',
    description: 'Tabular scenarios with columns such as input, expected_output, context, and category',
  },
];

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function getExtensionFromFilename(filename: string): string {
  const trimmed = filename.trim().toLowerCase();
  const lastDot = trimmed.lastIndexOf('.');
  if (lastDot === -1) return '';
  return trimmed.slice(lastDot);
}

/* ── 1. FileDropZone ── */
export interface FileDropZoneProps {
  isDragging: boolean;
  disabled?: boolean;
  onDragEnter: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onChooseFileClick: () => void;
  onLoadSampleTemplate?: (format: DatasetFormatType) => void;
}

export const FileDropZone: React.FC<FileDropZoneProps> = ({
  isDragging,
  disabled,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
  onChooseFileClick,
  onLoadSampleTemplate,
}) => {
  return (
    <div
      role="region"
      aria-label="Dataset file drop zone"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        background: isDragging ? 'rgba(214, 210, 197, 0.07)' : '#111315',
        border: isDragging ? '1px dashed #E8E4D9' : '1px dashed #343638',
        borderRadius: '8px',
        padding: '1.6rem 1.25rem',
        textAlign: 'center',
        transition: 'border-color 0.15s ease, background-color 0.15s ease',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.65rem',
      }}
    >
      {/* File Upload Icon */}
      <div
        aria-hidden="true"
        style={{
          width: '38px',
          height: '38px',
          borderRadius: '6px',
          background: '#191B1C',
          border: '1px solid #343638',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: isDragging ? '#E8E4D9' : '#A4A49D',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      </div>

      <div>
        <div
          style={{
            fontSize: '0.92rem',
            fontWeight: 600,
            color: '#E8E4D9',
            letterSpacing: '-0.01em',
          }}
        >
          {isDragging ? 'Release file to parse dataset' : 'Drop a dataset file here'}
        </div>
        <div
          style={{
            fontSize: '0.78rem',
            color: '#A4A49D',
            marginTop: '0.2rem',
          }}
        >
          or choose a file from your computer
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', justifyContent: 'center', marginTop: '0.15rem' }}>
        <button
          type="button"
          disabled={disabled}
          onClick={onChooseFileClick}
          style={{
            background: '#D6D2C5',
            color: '#111315',
            border: '1px solid #D6D2C5',
            borderRadius: '5px',
            padding: '0.45rem 0.95rem',
            fontSize: '0.78rem',
            fontWeight: 600,
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.6 : 1,
          }}
        >
          Choose dataset
        </button>
      </div>

      {/* Format labels */}
      <div
        aria-label="Accepted dataset formats"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          flexWrap: 'wrap',
          justifyContent: 'center',
          marginTop: '0.25rem',
        }}
      >
        {(['JSON', 'JSONL', 'NDJSON', 'CSV'] as const).map((fmt) => (
          <span
            key={fmt}
            style={{
              fontSize: '0.68rem',
              fontFamily: 'monospace',
              fontWeight: 600,
              color: '#D6D2C5',
              background: '#191B1C',
              border: '1px solid #343638',
              borderRadius: '4px',
              padding: '0.14rem 0.45rem',
              letterSpacing: '0.03em',
            }}
          >
            {fmt}
          </span>
        ))}
      </div>

      {/* Limits */}
      <div style={{ fontSize: '0.72rem', color: '#A4A49D' }}>
        Maximum 5 MB · Up to 500 scenarios
      </div>

      {/* Optional quick sample loaders for testing */}
      {onLoadSampleTemplate && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            flexWrap: 'wrap',
            justifyContent: 'center',
            marginTop: '0.25rem',
            paddingTop: '0.55rem',
            borderTop: '1px solid rgba(52, 54, 56, 0.6)',
            fontSize: '0.7rem',
            color: '#A4A49D',
          }}
        >
          <span>Load sample file:</span>
          {(['json', 'jsonl', 'ndjson', 'csv'] as DatasetFormatType[]).map((fmt) => (
            <button
              key={fmt}
              type="button"
              onClick={() => onLoadSampleTemplate(fmt)}
              style={{
                background: 'transparent',
                border: '1px solid #343638',
                color: '#E8E4D9',
                borderRadius: '4px',
                padding: '0.12rem 0.42rem',
                fontSize: '0.68rem',
                fontFamily: 'monospace',
                cursor: 'pointer',
              }}
            >
              .{fmt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

/* ── 2. FileSummary ── */
export interface FileSummaryProps {
  filename: string;
  fileSizeBytes: number;
  detectedFormat: string;
  validationState: 'parsing' | 'valid' | 'valid_with_warnings' | 'invalid';
  disabled?: boolean;
  onReplaceFile: () => void;
  onRemoveFile: () => void;
}

export const FileSummary: React.FC<FileSummaryProps> = ({
  filename,
  fileSizeBytes,
  detectedFormat,
  validationState,
  disabled,
  onReplaceFile,
  onRemoveFile,
}) => {
  const statusBadge = useMemo(() => {
    if (validationState === 'parsing') {
      return { label: '⋯ Parsing file', color: '#D6D2C5', bg: 'rgba(214, 210, 197, 0.1)', border: '#343638' };
    }
    if (validationState === 'valid') {
      return { label: '✓ Valid file', color: '#3FB950', bg: 'rgba(63, 185, 80, 0.12)', border: 'rgba(63, 185, 80, 0.35)' };
    }
    if (validationState === 'valid_with_warnings') {
      return { label: '⚠ Valid with warnings', color: '#D29922', bg: 'rgba(210, 153, 34, 0.12)', border: 'rgba(210, 153, 34, 0.35)' };
    }
    return { label: '✕ Invalid file', color: '#F85149', bg: 'rgba(248, 81, 73, 0.12)', border: 'rgba(248, 81, 73, 0.38)' };
  }, [validationState]);

  return (
    <div
      style={{
        background: '#111315',
        border: '1px solid #343638',
        borderRadius: '6px',
        padding: '0.75rem 0.95rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.75rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
        <div
          aria-hidden="true"
          style={{
            padding: '0.35rem 0.5rem',
            borderRadius: '4px',
            background: '#191B1C',
            border: '1px solid #343638',
            fontFamily: 'monospace',
            fontSize: '0.7rem',
            fontWeight: 700,
            color: '#D6D2C5',
            textTransform: 'uppercase',
          }}
        >
          {detectedFormat || 'FILE'}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span
              style={{
                fontSize: '0.84rem',
                fontWeight: 600,
                color: '#E8E4D9',
                fontFamily: 'monospace',
                wordBreak: 'break-all',
              }}
            >
              {filename}
            </span>
            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: 600,
                padding: '0.1rem 0.45rem',
                borderRadius: '4px',
                color: statusBadge.color,
                background: statusBadge.bg,
                border: `1px solid ${statusBadge.border}`,
              }}
            >
              {statusBadge.label}
            </span>
          </div>
          <div style={{ fontSize: '0.73rem', color: '#A4A49D', marginTop: '0.15rem' }}>
            Size: {formatFileSize(fileSizeBytes)} · Detected format: <strong style={{ color: '#E8E4D9', textTransform: 'uppercase' }}>{detectedFormat}</strong>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
        <button
          type="button"
          disabled={disabled}
          onClick={onReplaceFile}
          style={{
            background: '#191B1C',
            border: '1px solid #343638',
            color: '#E8E4D9',
            borderRadius: '4px',
            padding: '0.35rem 0.65rem',
            fontSize: '0.74rem',
            fontWeight: 500,
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
        >
          Replace file
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onRemoveFile}
          style={{
            background: 'transparent',
            border: '1px solid #343638',
            color: '#A4A49D',
            borderRadius: '4px',
            padding: '0.35rem 0.65rem',
            fontSize: '0.74rem',
            fontWeight: 500,
            cursor: disabled ? 'not-allowed' : 'pointer',
          }}
        >
          Remove file
        </button>
      </div>
    </div>
  );
};

/* ── 3. ValidationSummary ── */
export interface ValidationSummaryProps {
  preview: DatasetPreviewResult;
  topLevelError?: string | null;
  fieldMapping: DatasetFieldMapping;
  onUpdateFieldMapping: (next: DatasetFieldMapping) => void;
}

export const ValidationSummary: React.FC<ValidationSummaryProps> = ({
  preview,
  topLevelError,
  fieldMapping,
  onUpdateFieldMapping,
}) => {
  const isPreferenceDataset = Boolean(
    preview.appliedMapping.expectedOutputField &&
      preview.appliedMapping.rejectedOutputField
  );
  const missingInputHeader =
    preview.detectedFields.length > 0 &&
    !preview.appliedMapping.inputField &&
    !isPreferenceDataset;
  const [inspectHeadersOpen, setInspectHeadersOpen] = useState(false);

  const errors = useMemo(
    () => preview.issues.filter((i) => i.severity === 'error'),
    [preview.issues]
  );
  const warnings = useMemo(
    () => preview.issues.filter((i) => i.severity === 'warning'),
    [preview.issues]
  );

  const inspectedRecordsCount = Math.min(preview.totalRecords, MAX_DATASET_RECORDS);
  const invalidRecordsCount = Math.max(
    0,
    inspectedRecordsCount - preview.validRecordsCount
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Metric Counters */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(135px, 1fr))',
          gap: '0.55rem',
        }}
      >
        <div
          style={{
            background: '#111315',
            border: '1px solid #343638',
            borderRadius: '6px',
            padding: '0.6rem 0.75rem',
          }}
        >
          <div style={{ fontSize: '0.68rem', color: '#A4A49D', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Total records detected
          </div>
          <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#E8E4D9', fontFamily: 'monospace', marginTop: '0.15rem' }}>
            {preview.totalRecords}
          </div>
        </div>

        <div
          style={{
            background: '#111315',
            border: '1px solid #343638',
            borderRadius: '6px',
            padding: '0.6rem 0.75rem',
          }}
        >
          <div style={{ fontSize: '0.68rem', color: '#A4A49D', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Valid scenarios
          </div>
          <div
            style={{
              fontSize: '1.05rem',
              fontWeight: 700,
              color: preview.validRecordsCount > 0 ? '#3FB950' : '#F85149',
              fontFamily: 'monospace',
              marginTop: '0.15rem',
            }}
          >
            {preview.validRecordsCount}
          </div>
        </div>

        <div
          style={{
            background: '#111315',
            border: '1px solid #343638',
            borderRadius: '6px',
            padding: '0.6rem 0.75rem',
          }}
        >
          <div style={{ fontSize: '0.68rem', color: '#A4A49D', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Invalid records
          </div>
          <div
            style={{
              fontSize: '1.05rem',
              fontWeight: 700,
              color: invalidRecordsCount > 0 || errors.length > 0 ? '#F85149' : '#E8E4D9',
              fontFamily: 'monospace',
              marginTop: '0.15rem',
            }}
          >
            {Math.max(
              invalidRecordsCount,
              errors.length > 0 && preview.validRecordsCount === 0
                ? inspectedRecordsCount || 1
                : invalidRecordsCount
            )}
          </div>
        </div>

        <div
          style={{
            background: '#111315',
            border: '1px solid #343638',
            borderRadius: '6px',
            padding: '0.6rem 0.75rem',
          }}
        >
          <div style={{ fontSize: '0.68rem', color: '#A4A49D', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Warnings
          </div>
          <div
            style={{
              fontSize: '1.05rem',
              fontWeight: 700,
              color: warnings.length > 0 ? '#D29922' : '#A4A49D',
              fontFamily: 'monospace',
              marginTop: '0.15rem',
            }}
          >
            {warnings.length}
          </div>
        </div>
      </div>

      {/* Explicit Undetected Input Field Alert + Header Inspector */}
      {missingInputHeader && (
        <div
          role="alert"
          style={{
            background: 'rgba(248, 81, 73, 0.1)',
            border: '1px solid rgba(248, 81, 73, 0.4)',
            borderRadius: '6px',
            padding: '0.75rem 0.9rem',
            color: '#E8E4D9',
            fontSize: '0.78rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.45rem',
          }}
        >
          <div style={{ fontWeight: 600, color: '#F85149' }}>
            ✕ Required input field could not be detected automatically
          </div>
          <div style={{ color: '#A4A49D' }}>
            Expected a column or key named <code>input</code>, <code>prompt</code>, <code>question</code>, <code>query</code>, or <code>user_message</code>.
            Detected headers: <code>{preview.detectedFields.join(', ') || 'none'}</code>. Select the input column below to map your file.
          </div>
        </div>
      )}

      {/* Header Mapping Inspector Bar */}
      {preview.detectedFields.length > 0 && (
        <div
          style={{
            background: '#111315',
            border: '1px solid #343638',
            borderRadius: '6px',
            padding: '0.6rem 0.85rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ fontSize: '0.74rem', color: '#A4A49D' }}>
              Detected fields ({preview.detectedFields.length}):{' '}
              <span style={{ color: '#E8E4D9', fontFamily: 'monospace' }}>
                {preview.detectedFields.join(', ')}
              </span>
              {isPreferenceDataset && !preview.appliedMapping.inputField ? (
                <span style={{ color: '#3FB950', marginLeft: '0.5rem', fontSize: '0.7rem' }}>
                  (Preference pair detected — prompts &amp; responses extracted from turns)
                </span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setInspectHeadersOpen((v) => !v)}
              style={{
                background: 'transparent',
                border: '1px solid #343638',
                color: '#D6D2C5',
                borderRadius: '4px',
                padding: '0.2rem 0.55rem',
                fontSize: '0.72rem',
                cursor: 'pointer',
              }}
            >
              {inspectHeadersOpen || missingInputHeader ? 'Hide column mapping' : 'Inspect & map headers'}
            </button>
          </div>

          {(inspectHeadersOpen || missingInputHeader) && (
            <div
              style={{
                marginTop: '0.65rem',
                paddingTop: '0.65rem',
                borderTop: '1px solid #343638',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: '0.6rem',
              }}
            >
              {(
                [
                  {
                    key: 'inputField',
                    label: isPreferenceDataset
                      ? 'Input / Prompt (Auto-extracted)'
                      : 'Input / Prompt (Required)',
                  },
                  {
                    key: 'expectedOutputField',
                    label: isPreferenceDataset ? 'Chosen / Expected Output' : 'Expected Output',
                  },
                  { key: 'rejectedOutputField', label: 'Rejected Output (Preference)' },
                  { key: 'idField', label: 'Scenario ID' },
                  { key: 'contextField', label: 'Context' },
                  { key: 'categoryField', label: 'Category' },
                ] as Array<{ key: keyof DatasetFieldMapping; label: string }>
              ).map(({ key, label }) => (
                <div key={key}>
                  <label style={{ display: 'block', fontSize: '0.68rem', color: '#A4A49D', marginBottom: '0.2rem' }}>
                    {label}
                  </label>
                  <select
                    value={fieldMapping[key] || preview.appliedMapping[key] || ''}
                    onChange={(e) =>
                      onUpdateFieldMapping({
                        ...fieldMapping,
                        [key]: e.target.value || undefined,
                      })
                    }
                    style={{
                      width: '100%',
                      background: '#191B1C',
                      border: '1px solid #343638',
                      borderRadius: '4px',
                      color: '#E8E4D9',
                      padding: '0.32rem 0.45rem',
                      fontSize: '0.74rem',
                    }}
                  >
                    <option value="">-- Not mapped --</option>
                    {preview.detectedFields.map((col) => (
                      <option key={col} value={col}>
                        {col}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Separate Validation Errors List */}
      {(topLevelError || errors.length > 0) && (
        <div
          role="alert"
          style={{
            background: 'rgba(248, 81, 73, 0.08)',
            border: '1px solid rgba(248, 81, 73, 0.35)',
            borderRadius: '6px',
            padding: '0.7rem 0.9rem',
          }}
        >
          <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#F85149', marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            ✕ Validation Errors ({errors.length + (topLevelError ? 1 : 0)})
          </div>
          <ul style={{ margin: 0, paddingLeft: '1.1rem', color: '#E8E4D9', fontSize: '0.76rem', display: 'flex', flexDirection: 'column', gap: '0.25rem', maxHeight: '130px', overflowY: 'auto' }}>
            {topLevelError && <li>{topLevelError}</li>}
            {errors.slice(0, 15).map((issue: DatasetValidationIssue, idx: number) => (
              <li key={idx}>
                {issue.recordNumber ? (
                  <strong style={{ fontFamily: 'monospace', color: '#F85149' }}>
                    [Row {issue.recordNumber}]{' '}
                  </strong>
                ) : null}
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Separate Validation Warnings List */}
      {warnings.length > 0 && (
        <div
          style={{
            background: 'rgba(210, 153, 34, 0.08)',
            border: '1px solid rgba(210, 153, 34, 0.32)',
            borderRadius: '6px',
            padding: '0.65rem 0.9rem',
          }}
        >
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#D29922', marginBottom: '0.3rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            ⚠ Warnings ({warnings.length})
          </div>
          <ul style={{ margin: 0, paddingLeft: '1.1rem', color: '#E8E4D9', fontSize: '0.74rem', display: 'flex', flexDirection: 'column', gap: '0.2rem', maxHeight: '100px', overflowY: 'auto' }}>
            {warnings.slice(0, 8).map((issue: DatasetValidationIssue, idx: number) => (
              <li key={idx}>
                {issue.recordNumber ? (
                  <strong style={{ fontFamily: 'monospace', color: '#D29922' }}>
                    [Row {issue.recordNumber}]{' '}
                  </strong>
                ) : null}
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

/* ── 4. ScenarioPreviewTable ── */
export interface ScenarioPreviewTableProps {
  cases: TestCase[];
  issues: DatasetValidationIssue[];
  totalValidCount: number;
}

export const ScenarioPreviewTable: React.FC<ScenarioPreviewTableProps> = ({
  cases,
  issues,
  totalValidCount,
}) => {
  if (cases.length === 0) return null;

  const previewSlice = cases.slice(0, 5);

  const getRowStatus = (recordNum?: number, expectedOutput?: string) => {
    const rowIssues = issues.filter((i) => i.recordNumber === recordNum);
    if (rowIssues.some((i) => i.severity === 'error')) {
      return { label: '✕ Invalid', color: '#F85149' };
    }
    if (rowIssues.some((i) => i.severity === 'warning') || !expectedOutput) {
      return { label: '⚠ Ref-free', color: '#D29922' };
    }
    return { label: '✓ Valid', color: '#3FB950' };
  };

  return (
    <div
      style={{
        background: '#111315',
        border: '1px solid #343638',
        borderRadius: '6px',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '0.5rem 0.8rem',
          borderBottom: '1px solid #343638',
          background: '#191B1C',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.72rem',
          color: '#A4A49D',
        }}
      >
        <span style={{ fontWeight: 600, color: '#E8E4D9' }}>
          Scenario Preview (first {previewSlice.length} of {totalValidCount} valid scenarios)
        </span>
        <span>Browser pre-validation · Verified again on server import</span>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '0.75rem',
            textAlign: 'left',
          }}
        >
          <thead>
            <tr style={{ borderBottom: '1px solid #343638', color: '#A4A49D' }}>
              <th style={{ padding: '0.45rem 0.65rem', fontWeight: 600 }}>ID</th>
              <th style={{ padding: '0.45rem 0.65rem', fontWeight: 600 }}>Input</th>
              <th style={{ padding: '0.45rem 0.65rem', fontWeight: 600 }}>Expected output</th>
              <th style={{ padding: '0.45rem 0.65rem', fontWeight: 600 }}>Category</th>
              <th style={{ padding: '0.45rem 0.65rem', fontWeight: 600 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {previewSlice.map((tc) => {
              const st = getRowStatus(tc.sourceRecordNumber ?? tc.order, tc.expectedOutput);
              return (
                <tr key={tc.id} style={{ borderBottom: '1px solid rgba(52, 54, 56, 0.5)' }}>
                  <td
                    style={{
                      padding: '0.45rem 0.65rem',
                      fontFamily: 'monospace',
                      color: '#D6D2C5',
                      maxWidth: '140px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={tc.caseKey || tc.id}
                  >
                    {tc.caseKey || tc.id}
                  </td>
                  <td
                    style={{
                      padding: '0.45rem 0.65rem',
                      color: '#E8E4D9',
                      maxWidth: '280px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={tc.input}
                  >
                    {tc.input}
                  </td>
                  <td
                    style={{
                      padding: '0.45rem 0.65rem',
                      color: tc.expectedOutput ? '#A4A49D' : '#6E706A',
                      maxWidth: '240px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontStyle: tc.expectedOutput ? 'normal' : 'italic',
                    }}
                    title={tc.expectedOutput || 'Reference-free scenario'}
                  >
                    {tc.expectedOutput || '— (reference-free)'}
                  </td>
                  <td style={{ padding: '0.45rem 0.65rem', color: '#A4A49D', whiteSpace: 'nowrap' }}>
                    {tc.category}
                  </td>
                  <td
                    style={{
                      padding: '0.45rem 0.65rem',
                      fontFamily: 'monospace',
                      fontWeight: 600,
                      color: st.color,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {st.label}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* ── 5. ImportResult ── */
export interface ImportResultProps {
  datasetName: string;
  scenarioCount: number;
  version: string;
  format: string;
  persistedToServer: boolean;
  onReset: () => void;
}

export const ImportResult: React.FC<ImportResultProps> = ({
  datasetName,
  scenarioCount,
  version,
  format,
  persistedToServer,
  onReset,
}) => {
  return (
    <div
      role="status"
      style={{
        background: '#111315',
        border: '1px solid rgba(63, 185, 80, 0.4)',
        borderRadius: '6px',
        padding: '0.9rem 1.1rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.8rem',
      }}
    >
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: '0.72rem',
              fontWeight: 700,
              padding: '0.14rem 0.5rem',
              borderRadius: '4px',
              background: 'rgba(63, 185, 80, 0.14)',
              color: '#3FB950',
              border: '1px solid rgba(63, 185, 80, 0.35)',
            }}
          >
            {persistedToServer ? '✓ Dataset imported & active' : '✓ Prototype import complete'}
          </span>
          <strong style={{ fontSize: '0.88rem', color: '#E8E4D9' }}>{datasetName}</strong>
          <span style={{ fontSize: '0.74rem', fontFamily: 'monospace', color: '#A4A49D' }}>
            v{version} · {format.toUpperCase()} · {scenarioCount} scenario{scenarioCount === 1 ? '' : 's'}
          </span>
        </div>
        <div style={{ fontSize: '0.74rem', color: '#A4A49D', marginTop: '0.25rem' }}>
          {persistedToServer
            ? `Validated in browser and persisted to RELIQ dataset registry (${scenarioCount} scenarios ready for evaluation).`
            : `Prototype import complete: parsed ${scenarioCount} scenarios in the browser only (no external server persistence).`}
        </div>
      </div>

      <button
        type="button"
        onClick={onReset}
        style={{
          background: '#191B1C',
          border: '1px solid #343638',
          color: '#E8E4D9',
          borderRadius: '4px',
          padding: '0.38rem 0.75rem',
          fontSize: '0.74rem',
          fontWeight: 500,
          cursor: 'pointer',
        }}
      >
        Import another file
      </button>
    </div>
  );
};

/* ── 6. Main DatasetUploadPanel ── */
export interface DatasetUploadPanelProps {
  projectId?: string;
  existingDatasets?: Dataset[];
  onDatasetImported?: (dataset: Dataset) => Promise<void> | void;
  defaultCollapsed?: boolean;
  prototypeOnly?: boolean;
}

export const DatasetUploadPanel: React.FC<DatasetUploadPanelProps> = ({
  projectId = 'proj-checkout-agent',
  existingDatasets = [],
  onDatasetImported,
  defaultCollapsed = false,
  prototypeOnly = false,
}) => {
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [showFormatSpec, setShowFormatSpec] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const [selectedFile, setSelectedFile] = useState<{
    name: string;
    size: number;
    rawContent: string;
    detectedFormat: DatasetFormatType;
  } | null>(null);

  const [datasetName, setDatasetName] = useState('');
  const [conflictResolution, setConflictResolution] =
    useState<DatasetImportConflictResolution>('new_version');
  const [fieldMapping, setFieldMapping] = useState<DatasetFieldMapping>({});
  const [topLevelError, setTopLevelError] = useState<string | null>(null);

  const [importedSummary, setImportedSummary] = useState<{
    datasetName: string;
    scenarioCount: number;
    version: string;
    format: string;
    persistedToServer: boolean;
  } | null>(null);

  // Compute live validation preview in the browser
  const preview: DatasetPreviewResult | null = useMemo(() => {
    if (!selectedFile) return null;
    return parseAndValidateDataset({
      rawContent: selectedFile.rawContent,
      filename: selectedFile.name,
      format: selectedFile.detectedFormat,
      fieldMapping,
      maxBytes: MAX_DATASET_FILE_BYTES,
      maxRecords: MAX_DATASET_RECORDS,
    });
  }, [selectedFile, fieldMapping]);

  const collidingExisting = useMemo(() => {
    if (!datasetName.trim()) return null;
    const lower = datasetName.trim().toLowerCase();
    return existingDatasets.find((d) => d.name.trim().toLowerCase() === lower) || null;
  }, [existingDatasets, datasetName]);

  const panelState: UploadPanelState = useMemo(() => {
    if (importedSummary) return 'imported';
    if (isImporting) return 'importing';
    if (isParsing) return 'parsing';
    if (!selectedFile) return isDragging ? 'dragging' : 'empty';
    if (topLevelError || !preview || !preview.valid || preview.validRecordsCount === 0) {
      return 'invalid';
    }
    if (preview.warningCount > 0) {
      return 'valid_with_warnings';
    }
    return 'valid';
  }, [importedSummary, isImporting, isParsing, selectedFile, isDragging, topLevelError, preview]);

  const processFileObject = (file: File) => {
    setImportedSummary(null);
    setTopLevelError(null);
    setFieldMapping({});

    const ext = getExtensionFromFilename(file.name);
    if (!ACCEPTED_EXTENSIONS.includes(ext as any)) {
      setSelectedFile({
        name: file.name,
        size: file.size,
        rawContent: '',
        detectedFormat: 'json',
      });
      setTopLevelError(
        `Unsupported file extension '${ext || 'none'}'. Accepted extensions: .json, .jsonl, .ndjson, .csv.`
      );
      return;
    }

    if (file.size > MAX_DATASET_FILE_BYTES) {
      setSelectedFile({
        name: file.name,
        size: file.size,
        rawContent: '',
        detectedFormat: detectDatasetFormat('', file.name),
      });
      setTopLevelError(
        `File size (${formatFileSize(file.size)}) exceeds the 5 MB maximum limit.`
      );
      return;
    }

    setIsParsing(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = typeof ev.target?.result === 'string' ? ev.target.result : '';
      const fmt = detectDatasetFormat(content, file.name);
      setSelectedFile({
        name: file.name,
        size: file.size,
        rawContent: content,
        detectedFormat: fmt,
      });
      const baseName = file.name
        .replace(/\.(json|jsonl|ndjson|csv)$/i, '')
        .replace(/[-_]+/g, ' ')
        .trim();
      setDatasetName(baseName ? baseName.replace(/\b\w/g, (c) => c.toUpperCase()) : 'Custom Evaluation Dataset');
      setIsParsing(false);
    };
    reader.onerror = () => {
      setTopLevelError('Failed to read file from disk.');
      setIsParsing(false);
    };
    reader.readAsText(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFileObject(file);
    }
    e.target.value = '';
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isImporting && !isParsing) setIsDragging(true);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isImporting && !isParsing) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (isImporting || isParsing) return;
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFileObject(file);
    }
  };

  const handleTriggerFilePicker = () => {
    if (isImporting || isParsing) return;
    fileInputRef.current?.click();
  };

  const handleRemoveFile = () => {
    if (isImporting) return;
    setSelectedFile(null);
    setTopLevelError(null);
    setFieldMapping({});
    setImportedSummary(null);
    setDatasetName('');
  };

  const handleLoadSampleTemplate = (format: DatasetFormatType) => {
    const tpl = getDatasetTemplate(format);
    const bytes = new Blob([tpl.content]).size;
    setImportedSummary(null);
    setTopLevelError(null);
    setFieldMapping({});
    setSelectedFile({
      name: tpl.filename,
      size: bytes,
      rawContent: tpl.content,
      detectedFormat: format,
    });
    setDatasetName(`Customer Support (${format.toUpperCase()})`);
  };

  const handleDownloadTemplate = (format: DatasetFormatType) => {
    const tpl = getDatasetTemplate(format);
    const blob = new Blob([tpl.content], { type: `${tpl.mimeType};charset=utf-8;` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = tpl.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportDataset = async () => {
    if (!selectedFile || !preview || !preview.valid || preview.validRecordsCount === 0 || topLevelError) {
      return;
    }
    const finalName = datasetName.trim() || selectedFile.name.replace(/\.(json|jsonl|ndjson|csv)$/i, '');
    if (!finalName) {
      setTopLevelError('Please enter a name for the dataset.');
      return;
    }

    setIsImporting(true);
    setTopLevelError(null);

    try {
      if (!prototypeOnly) {
        let payloadContent = selectedFile.rawContent;
        if (preview.totalRecords > MAX_DATASET_RECORDS) {
          if (selectedFile.detectedFormat === 'jsonl' || selectedFile.detectedFormat === 'ndjson') {
            const nonEmptyLines: string[] = [];
            for (const line of selectedFile.rawContent.replace(/^\uFEFF/, '').split(/\r?\n/)) {
              if (line.trim()) {
                nonEmptyLines.push(line);
                if (nonEmptyLines.length >= MAX_DATASET_RECORDS) break;
              }
            }
            payloadContent = nonEmptyLines.join('\n');
          } else if (selectedFile.detectedFormat === 'json') {
            try {
              const parsed = JSON.parse(selectedFile.rawContent.replace(/^\uFEFF/, ''));
              if (Array.isArray(parsed)) {
                payloadContent = JSON.stringify(parsed.slice(0, MAX_DATASET_RECORDS));
              }
            } catch {
              // keep original payloadContent
            }
          }
        }

        const result = await apiRepository.importDataset({
          projectId,
          name: finalName,
          description: `Imported from ${selectedFile.name} (${preview.validRecordsCount} scenarios)`,
          version: '1.0.0',
          sourceFilename: selectedFile.name,
          format: selectedFile.detectedFormat,
          rawContent: payloadContent,
          fieldMapping,
          conflictResolution,
        });

        if (onDatasetImported) {
          await onDatasetImported(result.dataset);
        }

        setImportedSummary({
          datasetName: result.dataset.name,
          scenarioCount: result.dataset.cases?.length || preview.validRecordsCount,
          version: result.dataset.version || '1.0.0',
          format: selectedFile.detectedFormat,
          persistedToServer: true,
        });
      } else {
        const localDataset: Dataset = {
          id: `ds-local-${Date.now().toString(36)}`,
          projectId,
          name: finalName,
          description: `Browser-parsed from ${selectedFile.name}`,
          sourceType: 'upload',
          version: '1.0.0',
          status: 'active',
          sourceFilename: selectedFile.name,
          contentHash: preview.contentHash,
          cases: preview.normalizedCases,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        if (onDatasetImported) {
          await onDatasetImported(localDataset);
        }
        setImportedSummary({
          datasetName: finalName,
          scenarioCount: preview.validRecordsCount,
          version: '1.0.0',
          format: selectedFile.detectedFormat,
          persistedToServer: false,
        });
      }
    } catch (err: any) {
      setTopLevelError(err.message || 'Dataset import failed.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <section
      aria-label="Import dataset"
      style={{
        background: '#191B1C',
        border: '1px solid #343638',
        borderRadius: '8px',
        padding: '1.1rem 1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.9rem',
      }}
    >
      {/* Hidden Accessible File Input */}
      <input
        id={fileInputId}
        ref={fileInputRef}
        type="file"
        accept=".json,.jsonl,.ndjson,.csv,application/json,text/csv"
        onChange={handleFileInputChange}
        style={{ display: 'none' }}
        aria-label="Choose dataset file (.json, .jsonl, .ndjson, .csv)"
      />

      {/* Panel Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.6rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#E8E4D9', letterSpacing: '-0.01em' }}>
              Import dataset
            </h4>
            <span
              style={{
                fontSize: '0.66rem',
                fontFamily: 'monospace',
                padding: '0.1rem 0.42rem',
                borderRadius: '4px',
                background: '#111315',
                border: '1px solid #343638',
                color: '#D6D2C5',
              }}
            >
              .json · .jsonl · .ndjson · .csv
            </span>
          </div>
          <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.78rem', color: '#A4A49D' }}>
            Add a dataset to evaluate model behavior.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setShowFormatSpec((v) => !v)}
            style={{
              background: '#111315',
              border: '1px solid #343638',
              color: '#D6D2C5',
              borderRadius: '4px',
              padding: '0.32rem 0.65rem',
              fontSize: '0.72rem',
              cursor: 'pointer',
            }}
          >
            {showFormatSpec ? 'Hide format guide' : 'Accepted file types'}
          </button>
          <button
            type="button"
            onClick={() => setIsCollapsed((v) => !v)}
            style={{
              background: 'transparent',
              border: '1px solid #343638',
              color: '#A4A49D',
              borderRadius: '4px',
              padding: '0.32rem 0.65rem',
              fontSize: '0.72rem',
              cursor: 'pointer',
            }}
          >
            {isCollapsed ? 'Expand uploader ▾' : 'Collapse ▴'}
          </button>
        </div>
      </div>

      {/* Supported File Types Table (JSON, JSONL, NDJSON, CSV) */}
      {showFormatSpec && (
        <div
          style={{
            background: '#111315',
            border: '1px solid #343638',
            borderRadius: '6px',
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #343638', background: '#191B1C', color: '#A4A49D' }}>
                <th style={{ padding: '0.45rem 0.75rem', fontWeight: 600 }}>File type</th>
                <th style={{ padding: '0.45rem 0.75rem', fontWeight: 600 }}>Extension</th>
                <th style={{ padding: '0.45rem 0.75rem', fontWeight: 600 }}>What it contains</th>
                <th style={{ padding: '0.45rem 0.75rem', fontWeight: 600, textAlign: 'right' }}>Template</th>
              </tr>
            </thead>
            <tbody>
              {SUPPORTED_DATASET_FORMATS.map((f) => (
                <tr key={f.extension} style={{ borderBottom: '1px solid rgba(52, 54, 56, 0.5)' }}>
                  <td style={{ padding: '0.45rem 0.75rem', color: '#E8E4D9', fontWeight: 600 }}>{f.typeLabel}</td>
                  <td style={{ padding: '0.45rem 0.75rem', fontFamily: 'monospace', color: '#D6D2C5' }}>{f.extension}</td>
                  <td style={{ padding: '0.45rem 0.75rem', color: '#A4A49D' }}>{f.description}</td>
                  <td style={{ padding: '0.45rem 0.75rem', textAlign: 'right' }}>
                    <button
                      type="button"
                      onClick={() => handleDownloadTemplate(f.formatKey)}
                      style={{
                        background: 'transparent',
                        border: '1px solid #343638',
                        color: '#D6D2C5',
                        borderRadius: '4px',
                        padding: '0.15rem 0.45rem',
                        fontSize: '0.68rem',
                        fontFamily: 'monospace',
                        cursor: 'pointer',
                      }}
                    >
                      ↓ {f.extension}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isCollapsed && (
        <>
          {/* Imported Success State */}
          {panelState === 'imported' && importedSummary ? (
            <ImportResult
              datasetName={importedSummary.datasetName}
              scenarioCount={importedSummary.scenarioCount}
              version={importedSummary.version}
              format={importedSummary.format}
              persistedToServer={importedSummary.persistedToServer}
              onReset={handleRemoveFile}
            />
          ) : !selectedFile ? (
            /* Empty / Dragging State */
            <FileDropZone
              isDragging={isDragging}
              disabled={isImporting || isParsing}
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onChooseFileClick={handleTriggerFilePicker}
              onLoadSampleTemplate={handleLoadSampleTemplate}
            />
          ) : (
            /* Selected File + Validation Preview + Import Action */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              <FileSummary
                filename={selectedFile.name}
                fileSizeBytes={selectedFile.size}
                detectedFormat={selectedFile.detectedFormat}
                validationState={
                  panelState === 'parsing'
                    ? 'parsing'
                    : panelState === 'valid'
                    ? 'valid'
                    : panelState === 'valid_with_warnings'
                    ? 'valid_with_warnings'
                    : 'invalid'
                }
                disabled={isImporting}
                onReplaceFile={handleTriggerFilePicker}
                onRemoveFile={handleRemoveFile}
              />

              {preview && (
                <>
                  <ValidationSummary
                    preview={preview}
                    topLevelError={topLevelError}
                    fieldMapping={fieldMapping}
                    onUpdateFieldMapping={setFieldMapping}
                  />

                  <ScenarioPreviewTable
                    cases={preview.normalizedCases}
                    issues={preview.issues}
                    totalValidCount={preview.validRecordsCount}
                  />
                </>
              )}

              {/* Dataset Name & Import Action Footer */}
              <div
                style={{
                  background: '#111315',
                  border: '1px solid #343638',
                  borderRadius: '6px',
                  padding: '0.75rem 0.9rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-end',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                }}
              >
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', flex: 1, minWidth: '220px' }}>
                  <div style={{ flex: 1, minWidth: '180px' }}>
                    <label
                      style={{
                        display: 'block',
                        fontSize: '0.7rem',
                        color: '#A4A49D',
                        marginBottom: '0.25rem',
                      }}
                    >
                      Dataset name
                    </label>
                    <input
                      type="text"
                      value={datasetName}
                      onChange={(e) => setDatasetName(e.target.value)}
                      disabled={isImporting}
                      placeholder="e.g. Customer Support Suite"
                      style={{
                        width: '100%',
                        boxSizing: 'border-box',
                        background: '#191B1C',
                        border: '1px solid #343638',
                        borderRadius: '4px',
                        color: '#E8E4D9',
                        padding: '0.42rem 0.6rem',
                        fontSize: '0.8rem',
                      }}
                    />
                  </div>

                  {collidingExisting && (
                    <div style={{ minWidth: '180px' }}>
                      <label
                        style={{
                          display: 'block',
                          fontSize: '0.7rem',
                          color: '#D29922',
                          marginBottom: '0.25rem',
                        }}
                      >
                        Name exists (v{collidingExisting.version || '1.0.0'})
                      </label>
                      <select
                        value={conflictResolution}
                        onChange={(e) =>
                          setConflictResolution(e.target.value as DatasetImportConflictResolution)
                        }
                        disabled={isImporting}
                        style={{
                          width: '100%',
                          background: '#191B1C',
                          border: '1px solid #343638',
                          borderRadius: '4px',
                          color: '#E8E4D9',
                          padding: '0.42rem 0.6rem',
                          fontSize: '0.78rem',
                        }}
                      >
                        <option value="new_version">Create new version</option>
                        <option value="rename">Auto-rename copy</option>
                      </select>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  disabled={
                    isImporting ||
                    isParsing ||
                    !preview ||
                    !preview.valid ||
                    preview.validRecordsCount === 0 ||
                    Boolean(topLevelError)
                  }
                  onClick={handleImportDataset}
                  style={{
                    background:
                      !preview || !preview.valid || preview.validRecordsCount === 0 || Boolean(topLevelError)
                        ? '#343638'
                        : '#D6D2C5',
                    color:
                      !preview || !preview.valid || preview.validRecordsCount === 0 || Boolean(topLevelError)
                        ? '#A4A49D'
                        : '#111315',
                    border: 'none',
                    borderRadius: '5px',
                    padding: '0.48rem 1.05rem',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    cursor:
                      isImporting ||
                      isParsing ||
                      !preview ||
                      !preview.valid ||
                      preview.validRecordsCount === 0 ||
                      Boolean(topLevelError)
                        ? 'not-allowed'
                        : 'pointer',
                  }}
                >
                  {isImporting
                    ? 'Importing...'
                    : `Import dataset (${preview?.validRecordsCount ?? 0} scenarios)`}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
};
