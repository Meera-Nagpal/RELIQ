/* ============================================================
   RELIQ — Datasets & Test Cases Management View
   
   Allows managing evaluation datasets and creating, editing,
   duplicating, filtering, and importing test cases.
   ============================================================ */

import React, { useState, useEffect } from 'react';
import {
  Dataset,
  EvaluatorType,
  SeverityLevel,
  TestCase,
  TestCaseCategory,
} from '../../domain/types';

interface DatasetsViewProps {
  datasets: Dataset[];
  activeDataset: Dataset | null;
  activeProjectId?: string;
  onSelectDataset: (datasetId: string) => void;
  onSaveDataset: (dataset: Dataset) => Promise<void>;
  onDeleteDataset: (datasetId: string) => Promise<void>;
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
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('All');

  // Modals
  const [isCaseModalOpen, setIsCaseModalOpen] = useState(false);
  const [editingCase, setEditingCase] = useState<TestCase | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [isNewDatasetModalOpen, setIsNewDatasetModalOpen] = useState(false);
  const [newDatasetName, setNewDatasetName] = useState('');
  const [newDatasetDesc, setNewDatasetDesc] = useState('');

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
  const [caseEvaluator, setCaseEvaluator] = useState<EvaluatorType>('normalized_text');
  const [caseSeverity, setCaseSeverity] = useState<SeverityLevel>('high');
  const [caseTags, setCaseTags] = useState('');

  if (!activeDataset && datasets.length > 0) {
    onSelectDataset(datasets[0].id);
  }

  const cases = activeDataset?.cases || [];

  // Filter cases
  const filteredCases = cases.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.input.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || c.category === selectedCategory;
    const matchesSeverity = selectedSeverity === 'All' || c.severity === selectedSeverity;
    return matchesSearch && matchesCategory && matchesSeverity;
  });

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
        evaluatorType: caseEvaluator,
        severity: caseSeverity,
        tags: tagsArray,
        createdAt: new Date().toISOString(),
      };
      await onSaveDataset({ ...activeDataset, cases: [newCase, ...activeDataset.cases] });
    }
    setIsCaseModalOpen(false);
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeDataset || !importText.trim()) return;

    try {
      const parsed = JSON.parse(importText);
      if (!Array.isArray(parsed)) {
        alert('Invalid JSON: Must be an array of test cases.');
        return;
      }

      const newCases: TestCase[] = parsed.map((item, i) => ({
        id: item.id || `tc-imp-${Date.now().toString(36)}-${i}`,
        name: item.name || `Imported Case #${i + 1}`,
        category: (item.category as TestCaseCategory) || 'Edge Cases',
        input: item.input || '',
        expectedOutput: item.expectedOutput || item.expected || '',
        evaluatorType: (item.evaluatorType as EvaluatorType) || 'normalized_text',
        severity: (item.severity as SeverityLevel) || 'medium',
        tags: Array.isArray(item.tags) ? item.tags : ['imported'],
        createdAt: new Date().toISOString(),
      }));

      await onSaveDataset({
        ...activeDataset,
        cases: [...newCases, ...activeDataset.cases],
      });
      setIsImportModalOpen(false);
      setImportText('');
    } catch (err: any) {
      alert(`Failed to parse JSON import: ${err.message}`);
    }
  };

  const handleCreateDataset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDatasetName.trim()) return;

    const targetProjectId = activeProjectId || activeDataset?.projectId || 'default';
    const newDs: Dataset = {
      id: `ds-${Date.now().toString(36)}`,
      projectId: targetProjectId,
      name: newDatasetName.trim(),
      description: newDatasetDesc.trim(),
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '1280px' }}>
      {/* ── Top Bar: Title & Dataset Selector ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: '0.75rem', letterSpacing: '0.2em', color: 'var(--accent, #FF6B35)', fontWeight: 600, textTransform: 'uppercase' }}>
            TEST SUITES // DATASETS
          </div>
          <h1 style={{ fontSize: '2rem', fontWeight: 800, color: '#FFFFFF', margin: '0.3rem 0 0.4rem 0' }}>
            Evaluation Datasets
          </h1>
          <p style={{ color: '#8899AA', fontSize: '0.9rem', margin: 0 }}>
            Curate test scenarios, tool input schemas, expected outputs, and deterministic evaluation assertions.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.8rem' }}>
          <button
            onClick={() => setIsImportModalOpen(true)}
            style={{
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#ECECEC',
              padding: '0.6rem 1.1rem',
              borderRadius: '6px',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ↑ Import JSON
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

      {/* ── Dataset Tabs & Actions ── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#161B22',
          padding: '0.8rem 1.2rem',
          borderRadius: '8px',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <span style={{ fontSize: '0.8rem', color: '#888888', textTransform: 'uppercase' }}>Active Suite:</span>
          {datasets.map((d) => (
            <button
              key={d.id}
              onClick={() => onSelectDataset(d.id)}
              style={{
                background: d.id === activeDataset?.id ? 'rgba(255, 107, 53, 0.15)' : 'transparent',
                border: d.id === activeDataset?.id ? '1px solid var(--accent, #FF6B35)' : '1px solid transparent',
                color: d.id === activeDataset?.id ? '#FFFFFF' : '#8899A6',
                padding: '0.4rem 0.8rem',
                borderRadius: '6px',
                fontSize: '0.85rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {d.name} ({d.cases.length})
            </button>
          ))}
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
            + New Suite
          </button>
        </div>

        {activeDataset && datasets.length > 1 && (
          <button
            onClick={() => {
              if (confirm(`Delete dataset "${activeDataset.name}"?`)) {
                onDeleteDataset(activeDataset.id);
              }
            }}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#FF4422',
              fontSize: '0.78rem',
              cursor: 'pointer',
            }}
          >
            Delete Suite
          </button>
        )}
      </div>

      {/* ── Filters & Search ── */}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        {/* Search Input */}
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

        {/* Category Dropdown */}
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

        {/* Severity Dropdown */}
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
              gridTemplateColumns: '80px 1.5fr 120px 1.6fr 110px 120px',
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
                  Create a dataset suite to start organizing and evaluating test cases.
                </p>
                <button
                  onClick={() => setIsNewDatasetModalOpen(true)}
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
                  + Create First Suite
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
                  Add your first test case or import from JSON.
                </p>
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
            ) : (
              'No test cases found matching your active filters or search query.'
            )}
          </div>
        ) : (
          filteredCases.map((tc) => {
            const isCrit = tc.severity === 'critical';
            return (
              <div
                key={tc.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '80px 1.5fr 120px 1.6fr 110px 120px',
                  padding: '0.9rem 1.2rem',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.04)',
                  fontSize: '0.82rem',
                  alignItems: 'center',
                }}
              >
                <div style={{ fontFamily: 'monospace', color: '#4DA6FF', fontWeight: 600 }}>
                  {tc.id}
                </div>
                <div>
                  <div style={{ color: '#FFFFFF', fontWeight: 600 }}>{tc.name}</div>
                  {isCrit && (
                    <span style={{ fontSize: '0.65rem', color: '#FF4422', fontWeight: 700, letterSpacing: '0.05em' }}>
                      CRITICAL GATE
                    </span>
                  )}
                </div>
                <div>
                  <span
                    style={{
                      padding: '0.2rem 0.5rem',
                      borderRadius: '4px',
                      background: 'rgba(255, 255, 255, 0.06)',
                      fontSize: '0.72rem',
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
                  }}
                  title={tc.input}
                >
                  {tc.input}
                </div>
                <div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--accent, #FF6B35)', fontFamily: 'monospace' }}>
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
                      padding: '0.3rem 0.55rem',
                      borderRadius: '4px',
                      fontSize: '0.72rem',
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
                      padding: '0.3rem 0.55rem',
                      borderRadius: '4px',
                      fontSize: '0.72rem',
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
                      padding: '0.3rem 0.55rem',
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
              maxWidth: '600px',
              maxHeight: '90vh',
              overflowY: 'auto',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.8)',
            }}
          >
            <h3 style={{ margin: '0 0 1.2rem 0', color: '#FFFFFF' }}>
              {editingCase ? `Edit Test Case (${editingCase.id})` : 'Add New Test Case'}
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
                    <option value="normalized_text">Normalized Text</option>
                    <option value="keyword_criteria">Keyword / Criteria</option>
                    <option value="json_validity">JSON Validity</option>
                    <option value="exact_match">Exact Match</option>
                    <option value="response_length">Response Length</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#888888', marginBottom: '0.3rem' }}>
                  User / Agent Input
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
                  Expected Output Reference
                </label>
                <textarea
                  rows={3}
                  required
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

      {/* ── Modal: Import JSON Test Cases ── */}
      {isImportModalOpen && (
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
              maxWidth: '560px',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.8)',
            }}
          >
            <h3 style={{ margin: '0 0 0.8rem 0', color: '#FFFFFF' }}>Import Test Cases (JSON Array)</h3>
            <p style={{ color: '#888888', fontSize: '0.82rem', margin: '0 0 1rem 0' }}>
              Paste a JSON array containing objects with <code>name</code>, <code>input</code>, and <code>expectedOutput</code>.
            </p>

            <form onSubmit={handleImportSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <textarea
                rows={8}
                required
                placeholder='[{"name": "Tax test", "category": "Tool Calling", "input": "Calculate tax for $50", "expectedOutput": "Tax is $4.50"}]'
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.7rem',
                  background: '#0D1117',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '6px',
                  color: '#FFFFFF',
                  fontFamily: 'monospace',
                  fontSize: '0.82rem',
                  boxSizing: 'border-box',
                }}
              />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.8rem' }}>
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
                  Import Cases
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: New Dataset ── */}
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
            <h3 style={{ margin: '0 0 1rem 0', color: '#FFFFFF' }}>Create New Dataset</h3>
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
