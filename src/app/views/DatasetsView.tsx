/* ============================================================
   RELIQ — Datasets & Test Cases Management View (Phase 1A + 1D)
   
   Supports:
   - Built-in Benchmark Registry vs User-Uploaded Datasets distinction
   - Multi-format Dataset Import Wizard (.json, .jsonl, .ndjson, .csv)
   - Interactive Field Mapping & Downloadable Templates
   - Row-by-Row Validation Report (zero silent row drops)
   - Evaluator / Metric Compatibility & Reference-Free Support
   - Versioning & Duplicate-Name Conflict Resolution
   ============================================================ */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Dataset,
  DatasetFieldMapping,
  DatasetFormatType,
  DatasetImportConflictResolution,
  DatasetPreviewResult,
  EvaluatorType,
  SeverityLevel,
  TestCase,
  TestCaseCategory,
} from '../../domain/types';
import { parseAndValidateDataset } from '../../data/datasetImporter';
import { getDatasetTemplate, isBuiltinDatasetId } from '../../data/benchmarkRegistry';
import { apiRepository } from '../../services/apiRepository';
import { DatasetUploadPanel } from '../components/DatasetUploadPanel';

interface DatasetsViewProps {
  datasets: Dataset[];
  activeDataset: Dataset | null;
  activeProjectId?: string;
  onSelectDataset: (datasetId: string) => void;
  onSaveDataset: (dataset: Dataset) => Promise<void>;
  onDeleteDataset: (datasetId: string) => Promise<void>;
  onDatasetImported?: (dataset: Dataset) => Promise<void>;
}

const CATEGORIES: TestCaseCategory[] = [
  'Tool Calling',
  'Policy Gate',
  'Retrieval',
  'Safety',
  'Structured Output',
  'Multi-turn',
  'Edge Cases',
];

export const DatasetsView: React.FC<DatasetsViewProps> = ({
  datasets,
  activeDataset,
  activeProjectId,
  onSelectDataset,
  onSaveDataset,
  onDeleteDataset,
  onDatasetImported,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('All');

  // Modals
  const [isCaseModalOpen, setIsCaseModalOpen] = useState(false);
  const [editingCase, setEditingCase] = useState<TestCase | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isNewDatasetModalOpen, setIsNewDatasetModalOpen] = useState(false);
  const [newDatasetName, setNewDatasetName] = useState('');
  const [newDatasetDesc, setNewDatasetDesc] = useState('');

  // Import Wizard states
  const [importDatasetName, setImportDatasetName] = useState('');
  const [importDatasetDesc, setImportDatasetDesc] = useState('');
  const [importVersion, setImportVersion] = useState('1.0.0');
  const [importFilename, setImportFilename] = useState<string>('');
  const [importFormat, setImportFormat] = useState<DatasetFormatType | 'auto'>('auto');
  const [importText, setImportText] = useState('');
  const [importDefaultCategory, setImportDefaultCategory] = useState<TestCaseCategory>('Tool Calling');
  const [importDefaultEvaluator, setImportDefaultEvaluator] = useState<EvaluatorType>('keyword_criteria');
  const [importDefaultSeverity, setImportDefaultSeverity] = useState<SeverityLevel>('medium');
  const [conflictResolution, setConflictResolution] = useState<DatasetImportConflictResolution>('new_version');
  const [customResolvedName, setCustomResolvedName] = useState('');
  const [fieldMapping, setFieldMapping] = useState<DatasetFieldMapping>({});
  const [showFieldMapping, setShowFieldMapping] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Close modals on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isCaseModalOpen) setIsCaseModalOpen(false);
        if (isImportModalOpen) setIsImportModalOpen(false);
        if (isNewDatasetModalOpen) setIsNewDatasetModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCaseModalOpen, isImportModalOpen, isNewDatasetModalOpen]);

  // Form states for test case
  const [caseName, setCaseName] = useState('');
  const [caseCategory, setCaseCategory] = useState<TestCaseCategory>('Tool Calling');
  const [caseInput, setCaseInput] = useState('');
  const [caseExpected, setCaseExpected] = useState('');
  const [caseContext, setCaseContext] = useState('');
  const [caseEvaluator, setCaseEvaluator] = useState<EvaluatorType>('normalized_text');
  const [caseSeverity, setCaseSeverity] = useState<SeverityLevel>('high');
  const [caseTags, setCaseTags] = useState('');

  useEffect(() => {
    if (!activeDataset && datasets.length > 0) {
      onSelectDataset(datasets[0].id);
    }
  }, [activeDataset, datasets, onSelectDataset]);

  const cases = activeDataset?.cases || [];
  const isActiveBuiltin = Boolean(
    activeDataset &&
      (activeDataset.sourceType === 'builtin' ||
        activeDataset.isImmutable ||
        isBuiltinDatasetId(activeDataset.id))
  );

  // Compute dataset-level reference vs reference-free stats
  const activeDatasetStats = useMemo(() => {
    const total = cases.length;
    const withExpected = cases.filter((c) => Boolean(c.expectedOutput && c.expectedOutput.trim())).length;
    const withContext = cases.filter(
      (c) =>
        Boolean(c.context && c.context.trim()) ||
        Boolean(typeof c.metadata?.context === 'string' && c.metadata.context.trim())
    ).length;
    return {
      total,
      withExpected,
      referenceFreeOnly: total - withExpected,
      withContext,
    };
  }, [cases]);

  // Live local preview of import content (instant feedback while typing or mapping fields)
  const importPreview: DatasetPreviewResult | null = useMemo(() => {
    if (!importText.trim()) return null;
    try {
      return parseAndValidateDataset({
        rawContent: importText,
        filename: importFilename || undefined,
        format: importFormat === 'auto' ? undefined : importFormat,
        fieldMapping,
        defaultCategory: importDefaultCategory,
        defaultEvaluatorType: importDefaultEvaluator,
        defaultSeverity: importDefaultSeverity,
      });
    } catch (err: any) {
      return null;
    }
  }, [
    importText,
    importFilename,
    importFormat,
    fieldMapping,
    importDefaultCategory,
    importDefaultEvaluator,
    importDefaultSeverity,
  ]);

  // Check if importDatasetName collides with an existing dataset
  const existingCollidingDataset = useMemo(() => {
    if (!importDatasetName.trim()) return null;
    const lower = importDatasetName.trim().toLowerCase();
    return datasets.find((d) => d.name.trim().toLowerCase() === lower) || null;
  }, [datasets, importDatasetName]);

  // Filter and sort cases in ascending order
  const filteredCases = cases
    .filter((c) => {
      const matchesSearch =
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.input.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (c.caseKey && c.caseKey.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesCategory = selectedCategory === 'All' || c.category === selectedCategory;
      const matchesSeverity = selectedSeverity === 'All' || c.severity === selectedSeverity;
      return matchesSearch && matchesCategory && matchesSeverity;
    })
    .sort((a, b) => {
      const ordA =
        typeof a.order === 'number'
          ? a.order
          : typeof a.sourceRecordNumber === 'number'
          ? a.sourceRecordNumber
          : parseInt(String(a.id || '').replace(/\D+/g, ''), 10) || 0;
      const ordB =
        typeof b.order === 'number'
          ? b.order
          : typeof b.sourceRecordNumber === 'number'
          ? b.sourceRecordNumber
          : parseInt(String(b.id || '').replace(/\D+/g, ''), 10) || 0;
      if (ordA !== ordB) return ordA - ordB;
      return String(a.id || '').localeCompare(String(b.id || ''), undefined, { numeric: true });
    });

  const sortedCases = filteredCases;

  const handleOpenAddCase = () => {
    if (!activeDataset) {
      setIsNewDatasetModalOpen(true);
      return;
    }
    setEditingCase(null);
    setCaseName('');
    setCaseCategory('Tool Calling');
    setCaseInput('');
    setCaseExpected('');
    setCaseContext('');
    setCaseEvaluator('normalized_text');
    setCaseSeverity('high');
    setCaseTags('');
    setIsCaseModalOpen(true);
  };

  const handleOpenEditCase = (c: TestCase) => {
    setEditingCase(c);
    setCaseName(c.name);
    setCaseCategory(c.category);
    setCaseInput(c.input);
    setCaseExpected(c.expectedOutput);
    setCaseContext(c.context || '');
    setCaseEvaluator(c.evaluatorType);
    setCaseSeverity(c.severity);
    setCaseTags(c.tags.join(', '));
    setIsCaseModalOpen(true);
  };

  const handleDuplicateCase = async (c: TestCase) => {
    if (!activeDataset) return;
    const newCase: TestCase = {
      ...c,
      id: `tc-${Date.now().toString(36).slice(-4)}`,
      name: `${c.name} (Copy)`,
      createdAt: new Date().toISOString(),
    };
    const updatedCases = [newCase, ...activeDataset.cases];
    await onSaveDataset({ ...activeDataset, cases: updatedCases });
  };

  const handleDeleteCase = async (caseId: string) => {
    if (!activeDataset) return;
    if (confirm('Delete this test case?')) {
      const updatedCases = activeDataset.cases.filter((c) => c.id !== caseId);
      await onSaveDataset({ ...activeDataset, cases: updatedCases });
    }
  };

  const handleSaveCase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDataset || !caseName.trim()) return;

    const tagsArray = caseTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    if (editingCase) {
      const updatedCases = activeDataset.cases.map((c) =>
        c.id === editingCase.id
          ? {
              ...c,
              name: caseName.trim(),
              category: caseCategory,
              input: caseInput.trim(),
              expectedOutput: caseExpected.trim(),
              context: caseContext.trim() || undefined,
              evaluatorType: caseEvaluator,
              severity: caseSeverity,
              tags: tagsArray,
            }
          : c
      );
      await onSaveDataset({ ...activeDataset, cases: updatedCases });
    } else {
      const newCase: TestCase = {
        id: `tc-${Date.now().toString(36).slice(-4)}`,
        name: caseName.trim(),
        category: caseCategory,
        input: caseInput.trim(),
        expectedOutput: caseExpected.trim(),
        context: caseContext.trim() || undefined,
        evaluatorType: caseEvaluator,
        severity: caseSeverity,
        tags: tagsArray,
        createdAt: new Date().toISOString(),
      };
      await onSaveDataset({ ...activeDataset, cases: [newCase, ...activeDataset.cases] });
    }
    setIsCaseModalOpen(false);
  };

  const handleOpenImportWizard = () => {
    setImportError(null);
    setImportDatasetName('');
    setImportDatasetDesc('');
    setImportVersion('1.0.0');
    setImportFilename('');
    setImportFormat('auto');
    setImportText('');
    setFieldMapping({});
    setShowFieldMapping(false);
    setConflictResolution('new_version');
    setCustomResolvedName('');
    setIsImportModalOpen(true);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    setImportFilename(file.name);

    // Infer dataset name from filename if not already filled
    if (!importDatasetName.trim()) {
      const baseName = file.name.replace(/\.(json|jsonl|ndjson|csv)$/i, '').replace(/[-_]+/g, ' ');
      setImportDatasetName(
        baseName.replace(/\b\w/g, (l) => l.toUpperCase())
      );
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = typeof ev.target?.result === 'string' ? ev.target.result : '';
      setImportText(content);
    };
    reader.onerror = () => {
      setImportError('Failed to read selected file from disk.');
    };
    reader.readAsText(file);
  };

  const handleDownloadTemplate = (format: 'json' | 'jsonl' | 'csv') => {
    const tpl = getDatasetTemplate(format);
    const mimeType =
      format === 'csv'
        ? 'text/csv;charset=utf-8;'
        : format === 'jsonl'
        ? 'application/x-ndjson;charset=utf-8;'
        : 'application/json;charset=utf-8;';
    const blob = new Blob([tpl.content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', tpl.filename || `reliq-dataset-template.${format}`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleLoadTemplateIntoEditor = (format: 'json' | 'jsonl' | 'csv') => {
    const tpl = getDatasetTemplate(format);
    setImportFormat(format);
    setImportFilename(tpl.filename || `sample-dataset.${format}`);
    if (!importDatasetName.trim()) {
      setImportDatasetName(`Sample ${format.toUpperCase()} Evaluation Suite`);
    }
    setImportText(tpl.content);
    setImportError(null);
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importDatasetName.trim()) {
      setImportError('Please provide a Dataset Name before importing.');
      return;
    }
    if (!importText.trim()) {
      setImportError('Please upload a file or paste dataset records to import.');
      return;
    }
    if (importPreview && !importPreview.valid) {
      setImportError(
        `Cannot import dataset: ${importPreview.errorCount} validation error(s) must be resolved first.`
      );
      return;
    }

    setIsImporting(true);
    setImportError(null);

    try {
      const targetProjectId = activeProjectId || activeDataset?.projectId || 'proj-checkout-agent';
      const result = await apiRepository.importDataset({
        projectId: targetProjectId,
        name: importDatasetName.trim(),
        description: importDatasetDesc.trim(),
        version: importVersion.trim() || '1.0.0',
        sourceFilename: importFilename || undefined,
        format: importFormat === 'auto' ? undefined : importFormat,
        rawContent: importText,
        fieldMapping,
        defaultCategory: importDefaultCategory,
        defaultEvaluatorType: importDefaultEvaluator,
        defaultSeverity: importDefaultSeverity,
        conflictResolution,
        customResolvedName: customResolvedName.trim() || undefined,
      });

      if (onDatasetImported) {
        await onDatasetImported(result.dataset);
      } else {
        await onSaveDataset(result.dataset);
        onSelectDataset(result.dataset.id);
      }

      setIsImportModalOpen(false);
      setImportText('');
    } catch (err: any) {
      setImportError(err.message || 'Failed to import dataset.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleCreateDataset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDatasetName.trim()) return;

    const targetProjectId = activeProjectId || activeDataset?.projectId || 'proj-checkout-agent';
    const newDs: Dataset = {
      id: `ds-${Date.now().toString(36)}`,
      projectId: targetProjectId,
      name: newDatasetName.trim(),
      description: newDatasetDesc.trim(),
      sourceType: 'upload',
      version: '1.0.0',
      status: 'active',
      cases: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await onSaveDataset(newDs);
    onSelectDataset(newDs.id);
    setIsNewDatasetModalOpen(false);
    setNewDatasetName('');
    setNewDatasetDesc('');
  };

  const isReferenceFreeEvaluator = (ev: EvaluatorType) =>
    ['behavioral_safety', 'llm_judge', 'response_length', 'latency', 'json_validity'].includes(ev);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '1280px' }}>
      {/* ── Top Bar: Title & Dataset Actions ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ fontSize: '0.75rem', letterSpacing: '0.2em', color: 'var(--accent, #FF6B35)', fontWeight: 600, textTransform: 'uppercase' }}>
            TEST SUITES // BENCHMARK REGISTRY & USER DATASETS
          </div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#FFFFFF', margin: '0.3rem 0 0.4rem 0' }}>
            Evaluation Datasets
          </h1>
          <p style={{ color: '#8899AA', fontSize: '0.9rem', margin: 0 }}>
            Evaluate models against immutable built-in benchmarks or import your own datasets (<code>.json</code>, <code>.jsonl</code>, <code>.ndjson</code>, <code>.csv</code>).
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
          <button
            onClick={handleOpenImportWizard}
            style={{
              background: '#191B1C',
              border: '1px solid #343638',
              color: '#E8E4D9',
              padding: '0.6rem 1.15rem',
              borderRadius: '6px',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ↑ Advanced Import / Paste Raw (.json / .jsonl / .ndjson / .csv)
          </button>
          <button
            onClick={handleOpenAddCase}
            style={{
              background: 'var(--accent, #FF6B35)',
              color: '#000000',
              border: 'none',
              padding: '0.6rem 1.3rem',
              borderRadius: '6px',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 2px 10px rgba(255, 107, 53, 0.3)',
            }}
          >
            + Add Test Case
          </button>
        </div>
      </div>

      {/* ── Inline Dataset Upload Panel (.json, .jsonl, .ndjson, .csv) ── */}
      <DatasetUploadPanel
        projectId={activeProjectId || activeDataset?.projectId || 'proj-checkout-agent'}
        existingDatasets={datasets}
        onDatasetImported={async (importedDs) => {
          if (onDatasetImported) {
            await onDatasetImported(importedDs);
          } else {
            await onSaveDataset(importedDs);
            onSelectDataset(importedDs.id);
          }
        }}
      />

      {/* ── Dataset Tabs & Actions ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.8rem',
          background: '#161B22',
          padding: '0.8rem 1.2rem',
          borderRadius: '8px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.78rem', color: '#888888', textTransform: 'uppercase', fontWeight: 600 }}>
            Suites ({datasets.length}):
          </span>
          {datasets.map((d) => {
            const isBuiltin = d.sourceType === 'builtin' || d.isImmutable || isBuiltinDatasetId(d.id);
            const isSelected = d.id === activeDataset?.id;
            return (
              <button
                key={d.id}
                onClick={() => onSelectDataset(d.id)}
                style={{
                  background: isSelected ? 'rgba(255, 107, 53, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                  border: isSelected
                    ? '1px solid var(--accent, #FF6B35)'
                    : '1px solid rgba(255, 255, 255, 0.08)',
                  color: isSelected ? '#FFFFFF' : '#99AABB',
                  padding: '0.45rem 0.85rem',
                  borderRadius: '6px',
                  fontSize: '0.83rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                }}
              >
                <span>{d.name}</span>
                <span
                  style={{
                    fontSize: '0.66rem',
                    padding: '0.1rem 0.38rem',
                    borderRadius: '4px',
                    fontWeight: 700,
                    background: isBuiltin ? 'rgba(46, 204, 113, 0.16)' : 'rgba(77, 166, 255, 0.18)',
                    color: isBuiltin ? '#2ECC71' : '#4DA6FF',
                  }}
                >
                  {isBuiltin ? 'BUILT-IN' : 'UPLOAD'}
                </span>
                <span style={{ fontSize: '0.74rem', color: '#8899AA', fontFamily: 'monospace' }}>
                  v{d.version || '1.0.0'} ({d.cases.length})
                </span>
              </button>
            );
          })}
          <button
            onClick={() => setIsNewDatasetModalOpen(true)}
            style={{
              background: 'transparent',
              border: '1px dashed rgba(255, 255, 255, 0.2)',
              color: '#AAAAAA',
              padding: '0.4rem 0.7rem',
              borderRadius: '6px',
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            + New Empty Suite
          </button>
        </div>

        {activeDataset && !isActiveBuiltin && datasets.length > 1 && (
          <button
            onClick={() => {
              if (confirm(`Delete user dataset "${activeDataset.name}"?`)) {
                onDeleteDataset(activeDataset.id);
              }
            }}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255, 68, 34, 0.3)',
              borderRadius: '5px',
              padding: '0.35rem 0.75rem',
              color: '#FF4422',
              fontSize: '0.76rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Delete Dataset
          </button>
        )}
      </div>

      {/* ── Active Dataset Provenance & Metric Compatibility Banner ── */}
      {activeDataset && (
        <div
          style={{
            background: '#12171E',
            border: isActiveBuiltin
              ? '1px solid rgba(46, 204, 113, 0.25)'
              : '1px solid rgba(77, 166, 255, 0.25)',
            borderRadius: '8px',
            padding: '0.9rem 1.2rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  padding: '0.2rem 0.55rem',
                  borderRadius: '4px',
                  background: isActiveBuiltin ? 'rgba(46, 204, 113, 0.16)' : 'rgba(77, 166, 255, 0.18)',
                  color: isActiveBuiltin ? '#2ECC71' : '#4DA6FF',
                  border: isActiveBuiltin
                    ? '1px solid rgba(46, 204, 113, 0.35)'
                    : '1px solid rgba(77, 166, 255, 0.35)',
                }}
              >
                {isActiveBuiltin ? 'BUILT-IN BENCHMARK (IMMUTABLE)' : 'USER-UPLOADED DATASET'}
              </span>
              <span
                style={{
                  fontSize: '0.74rem',
                  fontFamily: 'monospace',
                  color: '#ECECEC',
                  background: 'rgba(255, 255, 255, 0.06)',
                  padding: '0.18rem 0.5rem',
                  borderRadius: '4px',
                }}
              >
                v{activeDataset.version || '1.0.0'}
              </span>
              <span
                style={{
                  fontSize: '0.72rem',
                  textTransform: 'uppercase',
                  color: '#3FB950',
                  fontWeight: 700,
                }}
              >
                ● {activeDataset.status || 'active'}
              </span>
              {activeDataset.sourceFilename && (
                <span style={{ fontSize: '0.76rem', color: '#8899AA', fontFamily: 'monospace' }}>
                  Source: {activeDataset.sourceFilename}
                </span>
              )}
            </div>
            <div style={{ fontSize: '0.84rem', color: '#99AABB' }}>
              {activeDataset.description || 'Evaluation scenario suite.'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '1.2rem', flexWrap: 'wrap', fontSize: '0.78rem' }}>
            <div>
              <span style={{ color: '#778899', display: 'block', fontSize: '0.68rem', textTransform: 'uppercase' }}>
                Total Scenarios
              </span>
              <strong style={{ color: '#FFFFFF', fontSize: '0.95rem' }}>{activeDatasetStats.total}</strong>
            </div>
            <div>
              <span style={{ color: '#778899', display: 'block', fontSize: '0.68rem', textTransform: 'uppercase' }}>
                Reference-Based Eligible
              </span>
              <strong style={{ color: '#2ECC71', fontSize: '0.95rem' }}>
                {activeDatasetStats.withExpected}/{activeDatasetStats.total}
              </strong>
            </div>
            <div>
              <span style={{ color: '#778899', display: 'block', fontSize: '0.68rem', textTransform: 'uppercase' }}>
                Reference-Free Eligible
              </span>
              <strong style={{ color: '#4DA6FF', fontSize: '0.95rem' }}>
                {activeDatasetStats.total}/{activeDatasetStats.total}
              </strong>
            </div>
            <div>
              <span style={{ color: '#778899', display: 'block', fontSize: '0.68rem', textTransform: 'uppercase' }}>
                Groundedness Context
              </span>
              <strong style={{ color: '#FFAA44', fontSize: '0.95rem' }}>
                {activeDatasetStats.withContext + activeDatasetStats.withExpected > 0
                  ? `${Math.max(activeDatasetStats.withContext, activeDatasetStats.withExpected)} cases`
                  : 'N/A'}
              </strong>
            </div>
          </div>
        </div>
      )}

      {/* ── Filters & Search ── */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <input
            type="text"
            placeholder="Search test case name, input query, or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '0.65rem 1rem',
              background: '#161B22',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '6px',
              color: '#FFFFFF',
              fontSize: '0.85rem',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          style={{
            padding: '0.65rem 0.9rem',
            background: '#161B22',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '6px',
            color: '#FFFFFF',
            fontSize: '0.82rem',
          }}
        >
          <option value="All">All Categories ({cases.length})</option>
          {CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>

        <select
          value={selectedSeverity}
          onChange={(e) => setSelectedSeverity(e.target.value)}
          style={{
            padding: '0.65rem 0.9rem',
            background: '#161B22',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '6px',
            color: '#FFFFFF',
            fontSize: '0.82rem',
          }}
        >
          <option value="All">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      {/* ── Test Cases Table ── */}
      <div
        style={{
          background: '#161B22',
          borderRadius: '10px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          overflowX: 'auto',
        }}
      >
        <div style={{ minWidth: '780px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '95px 1.5fr 120px 1.6fr 125px 120px',
              padding: '0.8rem 1.2rem',
              background: '#0D1117',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              fontSize: '0.75rem',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: '#888888',
              fontWeight: 600,
            }}
          >
            <div>ID</div>
            <div>Scenario Name</div>
            <div>Category</div>
            <div>Input Sample</div>
            <div>Evaluator</div>
            <div style={{ textAlign: 'right' }}>Actions</div>
          </div>

          {filteredCases.length === 0 ? (
            <div style={{ padding: '3.5rem 2rem', textAlign: 'center', color: '#888888', fontSize: '0.9rem' }}>
              {datasets.length === 0 ? (
                <div>
                  <p style={{ color: '#CCCCCC', fontSize: '1rem', fontWeight: 600, margin: '0 0 0.5rem 0' }}>
                    No evaluation datasets found in this project.
                  </p>
                  <p style={{ margin: '0 0 1.2rem 0', color: '#8899AA' }}>
                    Create a dataset suite or import a file (.json, .jsonl, .csv) to start evaluating models.
                  </p>
                  <button
                    onClick={handleOpenImportWizard}
                    style={{
                      background: 'var(--accent, #FF6B35)',
                      color: '#000000',
                      border: 'none',
                      padding: '0.6rem 1.4rem',
                      borderRadius: '6px',
                      fontWeight: 700,
                      fontSize: '0.85rem',
                      cursor: 'pointer',
                    }}
                  >
                    ↑ Import First Dataset
                  </button>
                </div>
              ) : !activeDataset ? (
                'Select a test suite from the tabs above.'
              ) : activeDataset.cases.length === 0 ? (
                <div>
                  <p style={{ color: '#CCCCCC', fontSize: '1rem', fontWeight: 600, margin: '0 0 0.5rem 0' }}>
                    This test suite is currently empty.
                  </p>
                  <p style={{ margin: '0 0 1.2rem 0', color: '#8899AA' }}>
                    Add your first test case manually or import a dataset file.
                  </p>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '0.8rem' }}>
                    <button
                      onClick={handleOpenImportWizard}
                      style={{
                        background: 'rgba(77, 166, 255, 0.16)',
                        color: '#4DA6FF',
                        border: '1px solid rgba(77, 166, 255, 0.4)',
                        padding: '0.55rem 1.2rem',
                        borderRadius: '6px',
                        fontWeight: 700,
                        fontSize: '0.82rem',
                        cursor: 'pointer',
                      }}
                    >
                      ↑ Import File (.json / .jsonl / .csv)
                    </button>
                    <button
                      onClick={handleOpenAddCase}
                      style={{
                        background: 'var(--accent, #FF6B35)',
                        color: '#000000',
                        border: 'none',
                        padding: '0.55rem 1.2rem',
                        borderRadius: '6px',
                        fontWeight: 700,
                        fontSize: '0.82rem',
                        cursor: 'pointer',
                      }}
                    >
                      + Add Test Case
                    </button>
                  </div>
                </div>
              ) : (
                'No test cases found matching your active filters or search query.'
              )}
            </div>
          ) : (
            sortedCases.map((tc) => {
              const isCrit = tc.severity === 'critical';
              const displayId = tc.caseKey || tc.id;
              const hasExpected = Boolean(tc.expectedOutput && tc.expectedOutput.trim());
              return (
                <div
                  key={tc.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '95px 1.5fr 120px 1.6fr 125px 120px',
                    padding: '0.95rem 1.2rem',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                    fontSize: '0.94rem',
                    alignItems: 'center',
                  }}
                >
                  <div
                    style={{
                      fontFamily: 'monospace',
                      color: '#4DA6FF',
                      fontWeight: 600,
                      fontSize: '0.86rem',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={displayId}
                  >
                    {displayId}
                  </div>
                  <div>
                    <div style={{ color: '#FFFFFF', fontWeight: 600, fontSize: '0.95rem' }}>{tc.name}</div>
                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', marginTop: '0.15rem' }}>
                      {isCrit && (
                        <span style={{ fontSize: '0.68rem', color: '#FF4422', fontWeight: 700, letterSpacing: '0.05em' }}>
                          CRITICAL GATE
                        </span>
                      )}
                      {!hasExpected && (
                        <span style={{ fontSize: '0.66rem', color: '#4DA6FF', fontWeight: 600 }}>
                          REFERENCE-FREE
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <span
                      style={{
                        padding: '0.25rem 0.55rem',
                        borderRadius: '4px',
                        background: 'rgba(255, 255, 255, 0.06)',
                        fontSize: '0.8rem',
                        color: '#CCCCCC',
                      }}
                    >
                      {tc.category}
                    </span>
                  </div>
                  <div
                    style={{
                      color: '#8899A6',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      paddingRight: '1rem',
                      fontSize: '0.9rem',
                    }}
                    title={tc.input}
                  >
                    {tc.input}
                  </div>
                  <div>
                    <span style={{ fontSize: '0.8rem', color: 'var(--accent, #FF6B35)', fontFamily: 'monospace' }}>
                      {tc.evaluatorType}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.4rem' }}>
                    <button
                      onClick={() => handleOpenEditCase(tc)}
                      style={{
                        background: 'transparent',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        color: '#CCCCCC',
                        padding: '0.35rem 0.6rem',
                        borderRadius: '4px',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDuplicateCase(tc)}
                      title="Duplicate test case"
                      style={{
                        background: 'transparent',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        color: '#AAAAAA',
                        padding: '0.35rem 0.6rem',
                        borderRadius: '4px',
                        fontSize: '0.8rem',
                        cursor: 'pointer',
                      }}
                    >
                      Copy
                    </button>
                    <button
                      onClick={() => handleDeleteCase(tc.id)}
                      title="Delete test case"
                      style={{
                        background: 'transparent',
                        border: '1px solid rgba(255, 34, 0, 0.2)',
                        color: '#FF4422',
                        padding: '0.35rem 0.6rem',
                        borderRadius: '4px',
                        fontSize: '0.72rem',
                        cursor: 'pointer',
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Modal: Add / Edit Test Case ── */}
      {isCaseModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div
            style={{
              background: '#161B22',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '12px',
              padding: '2rem',
              width: '100%',
              maxWidth: '620px',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.8)',
            }}
          >
            <h3 style={{ margin: '0 0 1.2rem 0', color: '#FFFFFF' }}>
              {editingCase ? `Edit Test Case (${editingCase.caseKey || editingCase.id})` : 'Add New Test Case'}
            </h3>

            <form onSubmit={handleSaveCase} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#888888', marginBottom: '0.3rem' }}>
                  Scenario Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Multi-item cart discount calculation"
                  value={caseName}
                  onChange={(e) => setCaseName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.6rem',
                    background: '#0D1117',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: '#FFFFFF',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#888888', marginBottom: '0.3rem' }}>
                    Category
                  </label>
                  <select
                    value={caseCategory}
                    onChange={(e) => setCaseCategory(e.target.value as TestCaseCategory)}
                    style={{
                      width: '100%',
                      padding: '0.6rem',
                      background: '#0D1117',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '6px',
                      color: '#FFFFFF',
                      boxSizing: 'border-box',
                    }}
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#888888', marginBottom: '0.3rem' }}>
                    Evaluator Type
                  </label>
                  <select
                    value={caseEvaluator}
                    onChange={(e) => setCaseEvaluator(e.target.value as EvaluatorType)}
                    style={{
                      width: '100%',
                      padding: '0.6rem',
                      background: '#0D1117',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '6px',
                      color: '#FFFFFF',
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value="normalized_text">Normalized Text (Reference Required)</option>
                    <option value="keyword_criteria">Keyword / Criteria</option>
                    <option value="exact_match">Exact Match (Reference Required)</option>
                    <option value="semantic_similarity">Semantic Similarity (Reference Required)</option>
                    <option value="behavioral_safety">Behavioral Safety (Reference-Free Eligible)</option>
                    <option value="llm_judge">LLM Judge Rubric (Reference-Free Eligible)</option>
                    <option value="json_validity">JSON Validity (Reference-Free Eligible)</option>
                    <option value="response_length">Response Length (Reference-Free Eligible)</option>
                    <option value="latency">Latency Threshold (Reference-Free Eligible)</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#888888', marginBottom: '0.3rem' }}>
                  User / Agent Input (Required)
                </label>
                <textarea
                  rows={3}
                  required
                  placeholder="Input prompt, conversation turn, or tool arguments..."
                  value={caseInput}
                  onChange={(e) => setCaseInput(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.6rem',
                    background: '#0D1117',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: '#FFFFFF',
                    boxSizing: 'border-box',
                    resize: 'vertical',
                    fontFamily: 'monospace',
                    fontSize: '0.85rem',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#888888', marginBottom: '0.3rem' }}>
                  Expected Output Reference {isReferenceFreeEvaluator(caseEvaluator) ? '(Optional for this evaluator)' : '(Required)'}
                </label>
                <textarea
                  rows={2}
                  required={!isReferenceFreeEvaluator(caseEvaluator)}
                  placeholder="Expected response, JSON object, or mandatory keywords..."
                  value={caseExpected}
                  onChange={(e) => setCaseExpected(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.6rem',
                    background: '#0D1117',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: '#FFFFFF',
                    boxSizing: 'border-box',
                    resize: 'vertical',
                    fontFamily: 'monospace',
                    fontSize: '0.85rem',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#888888', marginBottom: '0.3rem' }}>
                  Grounding Context (Optional — used by Factuality / Groundedness Evaluator)
                </label>
                <textarea
                  rows={2}
                  placeholder="Optional policy rules, retrieved document snippets, or factual constraints..."
                  value={caseContext}
                  onChange={(e) => setCaseContext(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.6rem',
                    background: '#0D1117',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: '#FFFFFF',
                    boxSizing: 'border-box',
                    resize: 'vertical',
                    fontFamily: 'monospace',
                    fontSize: '0.85rem',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#888888', marginBottom: '0.3rem' }}>
                    Severity Level
                  </label>
                  <select
                    value={caseSeverity}
                    onChange={(e) => setCaseSeverity(e.target.value as SeverityLevel)}
                    style={{
                      width: '100%',
                      padding: '0.6rem',
                      background: '#0D1117',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '6px',
                      color: '#FFFFFF',
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value="critical">Critical (Blocks Release)</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#888888', marginBottom: '0.3rem' }}>
                    Tags (comma separated)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. payment, apple-pay, refunds"
                    value={caseTags}
                    onChange={(e) => setCaseTags(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.6rem',
                      background: '#0D1117',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '6px',
                      color: '#FFFFFF',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.8rem', marginTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setIsCaseModalOpen(false)}
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#CCCCCC',
                    padding: '0.6rem 1.2rem',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    background: 'var(--accent, #FF6B35)',
                    color: '#000000',
                    border: 'none',
                    padding: '0.6rem 1.4rem',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {editingCase ? 'Update Test Case' : 'Save Test Case'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Multi-Format Dataset Import & Validation Wizard ── */}
      {isImportModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div
            style={{
              background: '#161B22',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '12px',
              padding: '1.8rem 2rem',
              width: '100%',
              maxWidth: '880px',
              maxHeight: '92vh',
              overflowY: 'auto',
              boxShadow: '0 24px 48px rgba(0, 0, 0, 0.85)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.2rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '0.7rem', color: '#4DA6FF', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                  DATASET INGESTION & VALIDATION PIPELINE
                </div>
                <h3 style={{ margin: '0.2rem 0 0.3rem 0', color: '#FFFFFF', fontSize: '1.3rem' }}>
                  Import User Dataset (.json, .jsonl, .csv)
                </h3>
                <p style={{ color: '#8899AA', fontSize: '0.82rem', margin: 0 }}>
                  Upload a file or paste records. Canonical schema: <code>id</code>, <code>input</code> (required), optional <code>expected_output</code>, <code>context</code>, <code>tags</code>, <code>metadata</code>.
                </p>
              </div>
              <button
                onClick={() => setIsImportModalOpen(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#8899AA',
                  fontSize: '1.2rem',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            {/* Downloadable Templates Bar */}
            <div
              style={{
                background: '#0D1117',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '8px',
                padding: '0.75rem 1rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '0.6rem',
              }}
            >
              <span style={{ fontSize: '0.78rem', color: '#99AABB', fontWeight: 600 }}>
                Sample Templates (Load or Download):
              </span>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {(['json', 'jsonl', 'csv'] as const).map((fmt) => (
                  <div key={fmt} style={{ display: 'inline-flex', gap: '0.25rem' }}>
                    <button
                      type="button"
                      onClick={() => handleLoadTemplateIntoEditor(fmt)}
                      style={{
                        background: 'rgba(255, 255, 255, 0.06)',
                        border: '1px solid rgba(255, 255, 255, 0.14)',
                        color: '#ECECEC',
                        padding: '0.3rem 0.6rem',
                        borderRadius: '4px',
                        fontSize: '0.74rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Load .{fmt.toUpperCase()} Sample
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadTemplate(fmt)}
                      title={`Download .${fmt} template file`}
                      style={{
                        background: 'rgba(77, 166, 255, 0.12)',
                        border: '1px solid rgba(77, 166, 255, 0.3)',
                        color: '#4DA6FF',
                        padding: '0.3rem 0.5rem',
                        borderRadius: '4px',
                        fontSize: '0.74rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      ↓
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {importError && (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.14)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  borderRadius: '6px',
                  padding: '0.75rem 1rem',
                  color: '#FF6B6B',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                }}
              >
                ⚠️ {importError}
              </div>
            )}

            <form onSubmit={handleImportSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Row 1: Dataset Name, Version, File Upload */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 0.7fr 1.2fr', gap: '0.9rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: '#AAAAAA', marginBottom: '0.3rem', fontWeight: 600 }}>
                    Dataset Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Customer Support Triage Suite"
                    value={importDatasetName}
                    onChange={(e) => setImportDatasetName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.55rem 0.75rem',
                      background: '#0D1117',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '6px',
                      color: '#FFFFFF',
                      fontSize: '0.84rem',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: '#AAAAAA', marginBottom: '0.3rem', fontWeight: 600 }}>
                    Version Tag
                  </label>
                  <input
                    type="text"
                    placeholder="1.0.0"
                    value={importVersion}
                    onChange={(e) => setImportVersion(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.55rem 0.75rem',
                      background: '#0D1117',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '6px',
                      color: '#FFFFFF',
                      fontFamily: 'monospace',
                      fontSize: '0.84rem',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: '#AAAAAA', marginBottom: '0.3rem', fontWeight: 600 }}>
                    Upload File (.json, .jsonl, .csv)
                  </label>
                  <input
                    type="file"
                    accept=".json,.jsonl,.ndjson,.csv,application/json,text/csv,text/plain"
                    onChange={handleFileUpload}
                    style={{
                      width: '100%',
                      padding: '0.42rem 0.6rem',
                      background: '#0D1117',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '6px',
                      color: '#CCCCCC',
                      fontSize: '0.78rem',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>

              {/* Duplicate Name Conflict Warning & Resolution Selector */}
              {existingCollidingDataset && (
                <div
                  style={{
                    background: 'rgba(255, 170, 68, 0.1)',
                    border: '1px solid rgba(255, 170, 68, 0.35)',
                    borderRadius: '8px',
                    padding: '0.75rem 1rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.8rem',
                  }}
                >
                  <div style={{ fontSize: '0.8rem', color: '#FFAA44' }}>
                    <strong>Name Conflict Detected:</strong> Dataset <code>"{existingCollidingDataset.name}"</code> (v{existingCollidingDataset.version || '1.0.0'}) already exists.
                    {existingCollidingDataset.sourceType === 'builtin'
                      ? ' Built-in benchmarks cannot be overwritten — a renamed user dataset will be created.'
                      : ' Choose how to resolve:'}
                  </div>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <select
                      value={conflictResolution}
                      onChange={(e) => setConflictResolution(e.target.value as DatasetImportConflictResolution)}
                      style={{
                        padding: '0.4rem 0.65rem',
                        background: '#0D1117',
                        border: '1px solid rgba(255, 170, 68, 0.4)',
                        borderRadius: '4px',
                        color: '#FFFFFF',
                        fontSize: '0.78rem',
                      }}
                    >
                      <option value="new_version">Create New Version (Auto-Bump Version)</option>
                      <option value="rename">Save Under Renamed Suite</option>
                      <option value="error">Block Import on Duplicate Name</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Row 2: Description & Default Evaluator */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 0.8fr', gap: '0.9rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: '#AAAAAA', marginBottom: '0.3rem' }}>
                    Description (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Describe dataset purpose, domain, or source..."
                    value={importDatasetDesc}
                    onChange={(e) => setImportDatasetDesc(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.52rem 0.75rem',
                      background: '#0D1117',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '6px',
                      color: '#FFFFFF',
                      fontSize: '0.82rem',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: '#AAAAAA', marginBottom: '0.3rem' }}>
                    Default Evaluator (if omitted per row)
                  </label>
                  <select
                    value={importDefaultEvaluator}
                    onChange={(e) => setImportDefaultEvaluator(e.target.value as EvaluatorType)}
                    style={{
                      width: '100%',
                      padding: '0.52rem 0.75rem',
                      background: '#0D1117',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '6px',
                      color: '#FFFFFF',
                      fontSize: '0.82rem',
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value="keyword_criteria">keyword_criteria (Default)</option>
                    <option value="normalized_text">normalized_text (Reference Required)</option>
                    <option value="exact_match">exact_match (Reference Required)</option>
                    <option value="semantic_similarity">semantic_similarity (Reference Required)</option>
                    <option value="behavioral_safety">behavioral_safety (Reference-Free)</option>
                    <option value="llm_judge">llm_judge (Reference-Free Eligible)</option>
                    <option value="json_validity">json_validity (Reference-Free)</option>
                    <option value="response_length">response_length (Reference-Free)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: '#AAAAAA', marginBottom: '0.3rem' }}>
                    Format Override
                  </label>
                  <select
                    value={importFormat}
                    onChange={(e) => setImportFormat(e.target.value as any)}
                    style={{
                      width: '100%',
                      padding: '0.52rem 0.75rem',
                      background: '#0D1117',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '6px',
                      color: '#FFFFFF',
                      fontSize: '0.82rem',
                      boxSizing: 'border-box',
                    }}
                  >
                    <option value="auto">Auto-Detect ({importPreview?.format?.toUpperCase() || 'JSON/JSONL/CSV'})</option>
                    <option value="json">JSON (.json)</option>
                    <option value="jsonl">JSON Lines (.jsonl / .ndjson)</option>
                    <option value="csv">CSV (.csv)</option>
                  </select>
                </div>
              </div>

              {/* Collapsible Field Mapping Section */}
              {importPreview && importPreview.detectedColumns.length > 0 && (
                <div
                  style={{
                    background: '#0D1117',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '8px',
                    padding: '0.75rem 1rem',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      cursor: 'pointer',
                    }}
                    onClick={() => setShowFieldMapping(!showFieldMapping)}
                  >
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#ECECEC' }}>
                      ⇄ Field Mapping ({importPreview.detectedColumns.length} source fields detected:{' '}
                      <code style={{ color: '#4DA6FF' }}>{importPreview.detectedColumns.slice(0, 6).join(', ')}</code>)
                    </span>
                    <span style={{ fontSize: '0.76rem', color: '#4DA6FF', fontWeight: 600 }}>
                      {showFieldMapping ? 'Hide Mapping ▲' : 'Customize Mapping ▼'}
                    </span>
                  </div>

                  {showFieldMapping && (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                        gap: '0.75rem',
                        marginTop: '0.8rem',
                        paddingTop: '0.8rem',
                        borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                      }}
                    >
                      {(
                        [
                          { key: 'inputField', label: 'Input / Prompt Field *' },
                          { key: 'expectedOutputField', label: 'Expected Output Field' },
                          { key: 'contextField', label: 'Context Field' },
                          { key: 'idField', label: 'Case ID Field' },
                          { key: 'nameField', label: 'Scenario Name Field' },
                          { key: 'categoryField', label: 'Category Field' },
                          { key: 'evaluatorTypeField', label: 'Evaluator Type Field' },
                          { key: 'tagsField', label: 'Tags Field' },
                        ] as const
                      ).map(({ key, label }) => (
                        <div key={key}>
                          <label style={{ display: 'block', fontSize: '0.72rem', color: '#8899AA', marginBottom: '0.2rem' }}>
                            {label}
                          </label>
                          <select
                            value={(fieldMapping as any)[key] || (importPreview.inferredMapping as any)[key] || ''}
                            onChange={(e) =>
                              setFieldMapping((prev) => ({
                                ...prev,
                                [key]: e.target.value || undefined,
                              }))
                            }
                            style={{
                              width: '100%',
                              padding: '0.4rem 0.55rem',
                              background: '#161B22',
                              border: '1px solid rgba(255, 255, 255, 0.14)',
                              borderRadius: '4px',
                              color: '#FFFFFF',
                              fontSize: '0.76rem',
                            }}
                          >
                            <option value="">-- None / Default --</option>
                            {importPreview.detectedColumns.map((col) => (
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

              {/* Raw Content Editor */}
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#AAAAAA', marginBottom: '0.3rem', fontWeight: 600 }}>
                  Dataset Payload (Paste JSON Array, JSONL lines, or CSV rows — or upload file above)
                </label>
                <textarea
                  rows={6}
                  required
                  placeholder='[{"id": "case-1", "input": "Refund order #1024", "expected_output": "Refund processed for order #1024"}]'
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.65rem',
                    background: '#0D1117',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: '#FFFFFF',
                    fontFamily: 'monospace',
                    fontSize: '0.8rem',
                    boxSizing: 'border-box',
                    resize: 'vertical',
                  }}
                />
              </div>

              {/* Live Validation & Preview Panel */}
              {importPreview && (
                <div
                  style={{
                    background: '#0D1117',
                    border: importPreview.valid
                      ? '1px solid rgba(46, 204, 113, 0.35)'
                      : '1px solid rgba(239, 68, 68, 0.45)',
                    borderRadius: '8px',
                    padding: '0.9rem 1.1rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.8rem',
                  }}
                >
                  {/* Summary Metrics Bar */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.6rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 800,
                          padding: '0.2rem 0.55rem',
                          borderRadius: '4px',
                          background: importPreview.valid ? 'rgba(46, 204, 113, 0.18)' : 'rgba(239, 68, 68, 0.2)',
                          color: importPreview.valid ? '#2ECC71' : '#FF6B6B',
                        }}
                      >
                        {importPreview.valid ? '✓ VALIDATION PASSED' : '✕ VALIDATION FAILED'}
                      </span>
                      <span style={{ fontSize: '0.78rem', color: '#8899AA', fontFamily: 'monospace' }}>
                        Format: {importPreview.format.toUpperCase()}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', fontSize: '0.78rem' }}>
                      <span>
                        Total Rows: <strong style={{ color: '#FFFFFF' }}>{importPreview.totalRecords}</strong>
                      </span>
                      <span>
                        Valid: <strong style={{ color: '#2ECC71' }}>{importPreview.validRecords}</strong>
                      </span>
                      <span>
                        Errors: <strong style={{ color: importPreview.errorCount > 0 ? '#FF5555' : '#8899AA' }}>{importPreview.errorCount}</strong>
                      </span>
                      <span>
                        Warnings: <strong style={{ color: importPreview.warningCount > 0 ? '#FFAA44' : '#8899AA' }}>{importPreview.warningCount}</strong>
                      </span>
                      <span>
                        With Reference: <strong style={{ color: '#4DA6FF' }}>{importPreview.recordsWithExpectedOutput}/{importPreview.validRecords}</strong>
                      </span>
                    </div>
                  </div>

                  {/* Row-by-Row Validation Issues (Errors & Warnings) */}
                  {importPreview.issues.length > 0 && (
                    <div
                      style={{
                        maxHeight: '140px',
                        overflowY: 'auto',
                        background: 'rgba(0, 0, 0, 0.35)',
                        borderRadius: '6px',
                        padding: '0.6rem 0.8rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.35rem',
                      }}
                    >
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#CCCCCC', textTransform: 'uppercase' }}>
                        Row-by-Row Validation Diagnostics ({importPreview.issues.length}):
                      </div>
                      {importPreview.issues.slice(0, 25).map((iss, idx) => (
                        <div
                          key={idx}
                          style={{
                            fontSize: '0.76rem',
                            fontFamily: 'monospace',
                            color: iss.severity === 'error' ? '#FF6B6B' : '#FFBB55',
                          }}
                        >
                          [{iss.severity.toUpperCase()}] {(iss.recordNumber ?? 0) > 0 ? `Row #${iss.recordNumber}` : 'File'}{' '}
                          {iss.field ? `(${iss.field})` : ''}: {iss.message}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Sample Normalized Records Preview Table */}
                  {importPreview.sampleRecords.length > 0 && (
                    <div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#8899AA', textTransform: 'uppercase', marginBottom: '0.4rem' }}>
                        Normalized Preview (First {Math.min(5, importPreview.sampleRecords.length)} of {importPreview.validRecords} Valid Records):
                      </div>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: '#8899AA', textAlign: 'left' }}>
                              <th style={{ padding: '0.35rem 0.5rem' }}>Row</th>
                              <th style={{ padding: '0.35rem 0.5rem' }}>ID</th>
                              <th style={{ padding: '0.35rem 0.5rem' }}>Input Prompt</th>
                              <th style={{ padding: '0.35rem 0.5rem' }}>Expected Output</th>
                              <th style={{ padding: '0.35rem 0.5rem' }}>Evaluator</th>
                            </tr>
                          </thead>
                          <tbody>
                            {importPreview.sampleRecords.slice(0, 5).map((rec, i) => (
                              <tr key={i} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)', color: '#ECECEC' }}>
                                <td style={{ padding: '0.35rem 0.5rem', fontFamily: 'monospace', color: '#8899AA' }}>
                                  #{rec.sourceRecordNumber || i + 1}
                                </td>
                                <td style={{ padding: '0.35rem 0.5rem', fontFamily: 'monospace', color: '#4DA6FF' }}>
                                  {rec.caseKey || rec.id}
                                </td>
                                <td
                                  style={{
                                    padding: '0.35rem 0.5rem',
                                    maxWidth: '240px',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                  }}
                                  title={rec.input}
                                >
                                  {rec.input}
                                </td>
                                <td
                                  style={{
                                    padding: '0.35rem 0.5rem',
                                    maxWidth: '220px',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    color: rec.expectedOutput ? '#2ECC71' : '#8899AA',
                                  }}
                                  title={rec.expectedOutput || '(Reference-free)'}
                                >
                                  {rec.expectedOutput || '(Reference-free — none)'}
                                </td>
                                <td style={{ padding: '0.35rem 0.5rem', fontFamily: 'monospace', color: 'var(--accent, #FF6B35)' }}>
                                  {rec.evaluatorType}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.8rem', marginTop: '0.4rem' }}>
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(false)}
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#CCCCCC',
                    padding: '0.6rem 1.2rem',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isImporting || !importDatasetName.trim() || !importText.trim() || Boolean(importPreview && !importPreview.valid)}
                  style={{
                    background:
                      isImporting || !importDatasetName.trim() || !importText.trim() || Boolean(importPreview && !importPreview.valid)
                        ? '#333A42'
                        : 'var(--accent, #FF6B35)',
                    color:
                      isImporting || !importDatasetName.trim() || !importText.trim() || Boolean(importPreview && !importPreview.valid)
                        ? '#778899'
                        : '#000000',
                    border: 'none',
                    padding: '0.6rem 1.5rem',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    cursor:
                      isImporting || !importDatasetName.trim() || !importText.trim() || Boolean(importPreview && !importPreview.valid)
                        ? 'not-allowed'
                        : 'pointer',
                  }}
                >
                  {isImporting
                    ? 'Importing Dataset...'
                    : `Confirm & Import Dataset (${importPreview?.validRecords ?? 0} Cases)`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: New Empty Dataset ── */}
      {isNewDatasetModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '1rem',
          }}
        >
          <div
            style={{
              background: '#161B22',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '12px',
              padding: '2rem',
              width: '100%',
              maxWidth: '460px',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.8)',
            }}
          >
            <h3 style={{ margin: '0 0 1rem 0', color: '#FFFFFF' }}>Create New Empty Dataset</h3>
            <form onSubmit={handleCreateDataset} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#888888', marginBottom: '0.3rem' }}>
                  Dataset Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Edge Cases & Safety Scenarios"
                  value={newDatasetName}
                  onChange={(e) => setNewDatasetName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.6rem',
                    background: '#0D1117',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: '#FFFFFF',
                    boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#888888', marginBottom: '0.3rem' }}>
                  Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Describe dataset scope..."
                  value={newDatasetDesc}
                  onChange={(e) => setNewDatasetDesc(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.6rem',
                    background: '#0D1117',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '6px',
                    color: '#FFFFFF',
                    boxSizing: 'border-box',
                    resize: 'none',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.8rem' }}>
                <button
                  type="button"
                  onClick={() => setIsNewDatasetModalOpen(false)}
                  style={{
                    background: 'transparent',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    color: '#CCCCCC',
                    padding: '0.6rem 1.2rem',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    background: 'var(--accent, #FF6B35)',
                    color: '#000000',
                    border: 'none',
                    padding: '0.6rem 1.4rem',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  Create Dataset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
