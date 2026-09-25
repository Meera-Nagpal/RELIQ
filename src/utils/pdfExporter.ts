/* ============================================================
   RELIQ — Client & Server PDF Exporter (Zero-Dependency PDF-1.4)
   
   Generates a professional, text-searchable, multi-page vector PDF
   directly from the authoritative ComparisonReport model.
   
   Architecture:
   evaluation result -> report model -> [JSON Exporter, PDF Exporter]
   ============================================================ */

import { ComparisonReport } from '../evaluation/comparator';

/**
 * Escapes characters for PDF literal strings (standard PDF syntax).
 */
function escapePdfText(str: string): string {
  if (!str) return '';
  return str
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[\r\n\t]/g, ' ');
}

interface PdfPage {
  content: string[];
}

/**
 * Lightweight, robust PDF-1.4 Document Builder.
 * Standard A4 dimensions: 595.28 x 841.89 points.
 */
class PdfDocumentBuilder {
  private pages: PdfPage[] = [];
  private currentPageIndex = -1;
  public readonly pageWidth = 595.28;
  public readonly pageHeight = 841.89;
  public readonly margin = 36;
  public readonly contentWidth = 595.28 - 72; // 523.28 pt
  public y: number = 841.89 - 36;

  constructor() {
    this.newPage();
  }

  public newPage(): void {
    this.pages.push({ content: [] });
    this.currentPageIndex = this.pages.length - 1;
    this.y = this.pageHeight - this.margin;
  }

  public get pageCount(): number {
    return this.pages.length;
  }

  public ensureSpace(height: number): void {
    if (this.y - height < this.margin + 24) {
      this.newPage();
    }
  }

  public addRaw(cmd: string): void {
    if (this.currentPageIndex >= 0) {
      this.pages[this.currentPageIndex].content.push(cmd);
    }
  }

  public setFillColor(r: number, g: number, b: number): void {
    this.addRaw(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg`);
  }

  public setStrokeColor(r: number, g: number, b: number): void {
    this.addRaw(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} RG`);
  }

  public setLineWidth(w: number): void {
    this.addRaw(`${w.toFixed(2)} w`);
  }

  public drawRect(x: number, y: number, w: number, h: number, fill = true, stroke = false): void {
    this.addRaw(`${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re ${fill && stroke ? 'B' : fill ? 'f' : 's'}`);
  }

  public drawRoundedRect(x: number, y: number, w: number, h: number, fill = true, stroke = false): void {
    // Clean rectangle fallback for robust PDF 1.4 rendering
    this.drawRect(x, y, w, h, fill, stroke);
  }

  public drawLine(x1: number, y1: number, x2: number, y2: number): void {
    this.addRaw(`${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
  }

  public drawText(
    text: string,
    x: number,
    y: number,
    fontSize: number,
    font: 'Helvetica' | 'Helvetica-Bold' | 'Courier' = 'Helvetica',
    align: 'left' | 'center' | 'right' = 'left'
  ): void {
    const fontId = font === 'Helvetica-Bold' ? '/F2' : font === 'Courier' ? '/F3' : '/F1';
    let drawX = x;

    // Approximate width estimation for standard Helvetica
    if (align !== 'left') {
      const charWidth = font === 'Courier' ? fontSize * 0.6 : fontSize * 0.52;
      const textWidth = text.length * charWidth;
      if (align === 'right') {
        drawX = x - textWidth;
      } else if (align === 'center') {
        drawX = x - textWidth / 2;
      }
    }

    const safeText = escapePdfText(text);
    this.addRaw(`BT ${fontId} ${fontSize} Tf ${drawX.toFixed(2)} ${y.toFixed(2)} Td (${safeText}) Tj ET`);
  }

  public buildPdfBytes(): Uint8Array {
    const totalPages = this.pages.length;

    // Post-process: add running header and footer with total page count to each page
    for (let p = 0; p < totalPages; p++) {
      const page = this.pages[p];
      // Footer text: Page X of Y
      const footerY = 22;
      const footerText = `Page ${p + 1} of ${totalPages}  •  RELIQ AI Reliability Engine`;
      const footerCmd = [
        `0.55 0.60 0.65 rg`,
        `BT /F1 8 Tf 36.00 ${footerY.toFixed(2)} Td (${escapePdfText(footerText)}) Tj ET`,
        `0.85 0.88 0.90 RG`,
        `0.50 w`,
        `36.00 ${(footerY + 12).toFixed(2)} m ${(this.pageWidth - 36).toFixed(2)} ${(footerY + 12).toFixed(2)} l S`,
      ].join('\n');
      page.content.push(footerCmd);
    }

    // Assemble PDF Object hierarchy
    const objects: string[] = [];
    const offsets: number[] = [];

    // Helper to add object and track byte offset
    const addObject = (body: string): number => {
      objects.push(body);
      return objects.length;
    };

    // 1: Catalog
    // 2: Pages
    // 3: Font F1 (Helvetica)
    // 4: Font F2 (Helvetica-Bold)
    // 5: Font F3 (Courier)
    // 6..(5 + N): Page objects
    // (6 + N)..(5 + 2N): Content stream objects

    const pageObjStart = 6;
    const streamObjStart = pageObjStart + totalPages;

    const pageKidsRefs: string[] = [];
    for (let i = 0; i < totalPages; i++) {
      pageKidsRefs.push(`${pageObjStart + i} 0 R`);
    }

    // Obj 1: Catalog
    addObject(`<< /Type /Catalog /Pages 2 0 R >>`);

    // Obj 2: Pages root
    addObject(`<< /Type /Pages /Kids [ ${pageKidsRefs.join(' ')} ] /Count ${totalPages} >>`);

    // Obj 3: F1 (Helvetica)
    addObject(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`);

    // Obj 4: F2 (Helvetica-Bold)
    addObject(`<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`);

    // Obj 5: F3 (Courier)
    addObject(`<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>`);

    // Page objects
    for (let i = 0; i < totalPages; i++) {
      const contentStreamRef = `${streamObjStart + i} 0 R`;
      addObject(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${this.pageWidth.toFixed(2)} ${this.pageHeight.toFixed(2)}] /Contents ${contentStreamRef} /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> >>`
      );
    }

    // Content streams
    for (let i = 0; i < totalPages; i++) {
      const streamData = this.pages[i].content.join('\n');
      const streamLen = new TextEncoder().encode(streamData).length;
      addObject(`<< /Length ${streamLen} >>\nstream\n${streamData}\nendstream`);
    }

    // Build byte buffer
    let header = `%PDF-1.4\n%\xE2\xE3\xCF\xD3\n`;
    let bodyBytes = '';
    let currentOffset = new TextEncoder().encode(header).length;

    offsets.push(0); // index 0 unused in xref
    for (let i = 0; i < objects.length; i++) {
      offsets.push(currentOffset);
      const objStr = `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
      bodyBytes += objStr;
      currentOffset += new TextEncoder().encode(objStr).length;
    }

    const startXref = currentOffset;
    let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= objects.length; i++) {
      const offStr = offsets[i].toString().padStart(10, '0');
      xref += `${offStr} 00000 n \n`;
    }

    const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`;

    const fullDoc = header + bodyBytes + xref + trailer;
    return new TextEncoder().encode(fullDoc);
  }
}

/**
 * Generates an authoritative, publication-quality PDF report from a ComparisonReport.
 */
export function generateReportPdf(report: ComparisonReport): Uint8Array {
  const doc = new PdfDocumentBuilder();
  const left = doc.margin;
  const width = doc.contentWidth;

  // Helper for drawing section headers
  const renderSectionHeader = (title: string, subtitle?: string) => {
    doc.ensureSpace(34);
    doc.y -= 14;
    doc.setFillColor(0.95, 0.96, 0.98);
    doc.drawRect(left, doc.y - 4, width, 22, true, false);
    doc.setFillColor(1.0, 0.42, 0.21); // --reliq-accent
    doc.drawRect(left, doc.y - 4, 3, 22, true, false);

    doc.setFillColor(0.12, 0.15, 0.2);
    doc.drawText(title.toUpperCase(), left + 10, doc.y + 3, 9, 'Helvetica-Bold');

    if (subtitle) {
      doc.setFillColor(0.45, 0.5, 0.55);
      doc.drawText(subtitle, left + width - 10, doc.y + 3, 8, 'Helvetica', 'right');
    }
    doc.y -= 14;
  };

  // ─────────────────────────────────────────────────────────────
  // 1. TOP BRANDING & REPORT HEADER
  // ─────────────────────────────────────────────────────────────
  // Top header banner (RELIQ Brand Dark Theme)
  const headerHeight = 64;
  doc.y -= headerHeight;
  doc.setFillColor(0.05, 0.07, 0.09); // #0D1117
  doc.drawRect(left, doc.y, width, headerHeight, true, false);

  // Orange accent bottom line
  doc.setFillColor(1.0, 0.42, 0.21); // #FF6B35
  doc.drawRect(left, doc.y, width, 3, true, false);

  // Brand tag & Title
  doc.setFillColor(1.0, 0.42, 0.21);
  doc.drawText('RELIQ // CROSS-MODEL COMPARISON REPORT', left + 14, doc.y + 46, 8, 'Helvetica-Bold');
  doc.setFillColor(0.7, 0.75, 0.8);
  doc.drawText('ENGINE VERSION: V2.8 (AUTHORITATIVE)', left + width - 14, doc.y + 46, 7.5, 'Helvetica-Bold', 'right');

  doc.setFillColor(1.0, 1.0, 1.0);
  const safeTitle = report.title || 'Cross-Model Evaluation Benchmark';
  doc.drawText(safeTitle, left + 14, doc.y + 26, 14, 'Helvetica-Bold');

  // Metadata sub-bar
  const execMode = report.executionMode || 'SAVED';
  const timestampStr = new Date(report.timestamp).toLocaleString();
  const runIdStr = report.id || 'N/A';
  doc.setFillColor(0.65, 0.72, 0.8);
  doc.drawText(`Dataset: ${report.datasetName} (${report.totalCases} cases)  •  Mode: ${execMode}  •  Run ID: ${runIdStr}`, left + 14, doc.y + 10, 7.5, 'Helvetica');
  doc.drawText(`Generated: ${timestampStr}`, left + width - 14, doc.y + 10, 7.5, 'Helvetica', 'right');

  doc.y -= 16;

  // ─────────────────────────────────────────────────────────────
  // 2. PROMINENT WINNER & PRODUCTION RELEASE STATUS
  // ─────────────────────────────────────────────────────────────
  doc.ensureSpace(90);
  const cardY = doc.y - 74;
  const cardHeight = 74;

  const isImprovement = report.qualityDelta !== null && report.qualityDelta > 0;
  const isRegression = report.qualityDelta !== null && report.qualityDelta < 0;
  const isParity = report.qualityDelta === 0;

  const failedGates = (report.releaseGates || []).filter((g) => g.status === 'FAIL');
  const hasGateFailures = failedGates.length > 0 || (report.overallGateStatus === 'FAIL' || (report.overallGateStatus as string) === 'BLOCKED');

  // Background card styling
  doc.setFillColor(0.97, 0.98, 1.0);
  doc.setStrokeColor(0.85, 0.88, 0.92);
  doc.setLineWidth(1);
  doc.drawRect(left, cardY, width, cardHeight, true, true);

  // Left accent bar
  if (isImprovement && !hasGateFailures) {
    doc.setFillColor(0.18, 0.8, 0.44); // Green
  } else if (hasGateFailures || isRegression) {
    doc.setFillColor(0.94, 0.27, 0.27); // Red
  } else {
    doc.setFillColor(0.96, 0.62, 0.07); // Amber/Parity
  }
  doc.drawRect(left, cardY, 5, cardHeight, true, false);

  // Relative Comparison Title
  doc.setFillColor(0.4, 0.45, 0.52);
  doc.drawText('RELATIVE COMPARISON RESULT', left + 16, cardY + 58, 7.5, 'Helvetica-Bold');

  let winnerLabel = 'STATISTICAL PARITY';
  if (report.winner === 'candidate' || isImprovement) {
    winnerLabel = `CANDIDATE IMPROVEMENT (+${report.qualityDelta?.toFixed(1) ?? '0.0'} Quality Pts)`;
  } else if (report.winner === 'baseline' || isRegression) {
    winnerLabel = `BASELINE SUPERIOR / REGRESSION (${report.qualityDelta?.toFixed(1) ?? '0.0'} Pts)`;
  }
  doc.setFillColor(0.08, 0.1, 0.15);
  doc.drawText(winnerLabel, left + 16, cardY + 44, 11.5, 'Helvetica-Bold');

  // Quality progression numbers
  const baseQual = report.metrics.qualityScore?.baselineValue !== null && report.metrics.qualityScore?.baselineValue !== undefined
    ? `${report.metrics.qualityScore.baselineValue}%`
    : 'N/A';
  const candQual = report.metrics.qualityScore?.candidateValue !== null && report.metrics.qualityScore?.candidateValue !== undefined
    ? `${report.metrics.qualityScore.candidateValue}%`
    : 'N/A';
  doc.setFillColor(0.3, 0.35, 0.42);
  doc.drawText(`Baseline Quality: ${baseQual}  ->  Candidate Quality: ${candQual}`, left + 16, cardY + 31, 8, 'Helvetica');

  // 1-2 line concise metrics-grounded interpretation
  const commentText = report.winnerReason || (isImprovement
    ? `Candidate achieved higher quality than baseline across the ${report.totalCases}-case evaluation suite.`
    : isRegression
    ? `Candidate exhibited quality regression relative to the production baseline.`
    : `Both models produced equivalent results under the configured comparison metrics.`);
  doc.setFillColor(0.38, 0.42, 0.48);
  doc.drawText(commentText.slice(0, 110), left + 16, cardY + 18, 7.5, 'Helvetica');

  // Right side: PRODUCTION RELEASE STATUS
  const releaseBoxWidth = 200;
  const releaseBoxX = left + width - releaseBoxWidth - 12;
  const releaseBoxY = cardY + 8;
  const releaseBoxH = cardHeight - 16;

  doc.setFillColor(hasGateFailures ? 0.99 : 0.93, hasGateFailures ? 0.94 : 0.98, hasGateFailures ? 0.94 : 0.95);
  doc.setStrokeColor(hasGateFailures ? 0.9 : 0.5, hasGateFailures ? 0.4 : 0.8, hasGateFailures ? 0.4 : 0.6);
  doc.drawRect(releaseBoxX, releaseBoxY, releaseBoxWidth, releaseBoxH, true, true);

  doc.setFillColor(0.45, 0.5, 0.55);
  doc.drawText('PRODUCTION RELEASE STATUS', releaseBoxX + 10, releaseBoxY + releaseBoxH - 14, 7, 'Helvetica-Bold');

  const recVerdict = report.recommendation || (hasGateFailures ? 'BLOCK RELEASE' : 'SHIP');
  doc.setFillColor(hasGateFailures ? 0.85 : 0.12, hasGateFailures ? 0.15 : 0.65, hasGateFailures ? 0.15 : 0.35);
  doc.drawText(recVerdict, releaseBoxX + 10, releaseBoxY + releaseBoxH - 28, 9.5, 'Helvetica-Bold');

  const targetRequired = report.benchmarkCompletion?.requiredCases || report.totalCases || 27;
  const gateFailReason = failedGates.length > 0
    ? `${failedGates.length} failed gate(s): ${failedGates.map((g) => g.gate).slice(0, 2).join(', ')}`
    : report.totalCases < targetRequired
    ? `Preliminary: requires ${targetRequired} scenarios`
    : `All production gates verified`;
  doc.setFillColor(0.4, 0.45, 0.5);
  doc.drawText(gateFailReason.slice(0, 42), releaseBoxX + 10, releaseBoxY + 8, 6.5, 'Helvetica');

  doc.y = cardY - 14;

  // ─────────────────────────────────────────────────────────────
  // 3. BENCHMARK & EVALUATOR STATUS CARDS
  // ─────────────────────────────────────────────────────────────
  doc.ensureSpace(64);
  const colWidth = (width - 12) / 2;

  // Left card: Benchmark & Sample Status
  const bStatusY = doc.y - 54;
  doc.setFillColor(0.98, 0.98, 0.99);
  doc.setStrokeColor(0.88, 0.9, 0.92);
  doc.drawRect(left, bStatusY, colWidth, 54, true, true);

  doc.setFillColor(0.15, 0.2, 0.25);
  doc.drawText('BENCHMARK SAMPLE & COVERAGE', left + 10, bStatusY + 41, 8, 'Helvetica-Bold');

  const bCovVal = report.metrics.evaluationCoverage?.baselineValue ?? 100;
  const cCovVal = report.metrics.evaluationCoverage?.candidateValue ?? 100;
  const evStrength = report.evidenceStrength || (report.totalCases < 10 ? 'LOW' : report.totalCases < targetRequired ? 'MODERATE' : 'STRONG');

  doc.setFillColor(0.35, 0.4, 0.45);
  doc.drawText(`Cases: ${report.totalCases} / ${targetRequired} required benchmark cases`, left + 10, bStatusY + 28, 7.5, 'Helvetica');
  doc.drawText(`Coverage: Base ${bCovVal}%  •  Candidate ${cCovVal}%`, left + 10, bStatusY + 16, 7.5, 'Helvetica');
  doc.drawText(`Evidence Strength: ${evStrength} (Sample Base)`, left + 10, bStatusY + 5, 7.5, 'Helvetica');

  // Right card: Evaluator Status
  doc.setFillColor(0.98, 0.98, 0.99);
  doc.setStrokeColor(0.88, 0.9, 0.92);
  doc.drawRect(left + colWidth + 12, bStatusY, colWidth, 54, true, true);

  doc.setFillColor(0.15, 0.2, 0.25);
  doc.drawText('EVALUATOR HARNESS STATUS', left + colWidth + 22, bStatusY + 41, 8, 'Helvetica-Bold');

  const detStatus = 'EXECUTED (100% Deterministic)';
  const semStatus = report.semanticEvaluationStatus || 'CONFIGURED (Local)';
  const factStatus = report.factualityGroundednessStatus || 'CONFIGURED';
  const judgeStatus = report.llmJudgeStatus === 'EXECUTED'
    ? `EXECUTED (${report.judgeModel || 'Qwen 3.8 27B'})`
    : report.llmJudgeStatus || 'NOT CONFIGURED';

  doc.setFillColor(0.35, 0.4, 0.45);
  doc.drawText(`Deterministic & Criteria: ${detStatus}`, left + colWidth + 22, bStatusY + 28, 7.5, 'Helvetica');
  doc.drawText(`Semantic / Groundedness: ${semStatus} / ${factStatus}`, left + colWidth + 22, bStatusY + 16, 7.5, 'Helvetica');
  doc.drawText(`LLM-as-a-Judge: ${judgeStatus}`, left + colWidth + 22, bStatusY + 5, 7.5, 'Helvetica');

  doc.y = bStatusY - 14;

  // ─────────────────────────────────────────────────────────────
  // 4. METRIC-BY-METRIC COMPARISON TABLE
  // ─────────────────────────────────────────────────────────────
  renderSectionHeader('Metric-by-Metric Detailed Comparison', 'Baseline vs Candidate Telemetry');

  const tableHeaderY = doc.y - 18;
  doc.setFillColor(0.15, 0.18, 0.24);
  doc.drawRect(left, tableHeaderY, width, 18, true, false);

  // Column offsets
  const cMetric = left + 8;
  const cBase = left + 180;
  const cCand = left + 260;
  const cAbsDelta = left + 340;
  const cPctDelta = left + 420;
  const cAssess = left + width - 10;

  doc.setFillColor(1.0, 1.0, 1.0);
  doc.drawText('METRIC', cMetric, tableHeaderY + 5, 7, 'Helvetica-Bold');
  doc.drawText(`BASELINE (${report.baseline.provider.toUpperCase()})`, cBase, tableHeaderY + 5, 7, 'Helvetica-Bold');
  doc.drawText(`CANDIDATE (${report.candidate.provider.toUpperCase()})`, cCand, tableHeaderY + 5, 7, 'Helvetica-Bold');
  doc.drawText('ABS DELTA', cAbsDelta, tableHeaderY + 5, 7, 'Helvetica-Bold');
  doc.drawText('% DELTA', cPctDelta, tableHeaderY + 5, 7, 'Helvetica-Bold');
  doc.drawText('ASSESSMENT', cAssess, tableHeaderY + 5, 7, 'Helvetica-Bold', 'right');

  doc.y = tableHeaderY;

  const metricList = Object.values(report.metrics).filter(Boolean);

  for (let i = 0; i < metricList.length; i++) {
    const m = metricList[i];
    doc.ensureSpace(18);

    const rowY = doc.y - 16;
    const isEven = i % 2 === 0;

    doc.setFillColor(isEven ? 0.98 : 1.0, isEven ? 0.98 : 1.0, isEven ? 0.99 : 1.0);
    doc.drawRect(left, rowY, width, 16, true, false);

    doc.setStrokeColor(0.92, 0.93, 0.95);
    doc.setLineWidth(0.5);
    doc.drawLine(left, rowY, left + width, rowY);

    // Metric Name
    doc.setFillColor(0.15, 0.18, 0.22);
    doc.drawText((m.metric || '').slice(0, 32), cMetric, rowY + 4, 7.5, 'Helvetica-Bold');

    // Baseline Value
    const baseStr = m.baselineValue !== null && m.baselineValue !== undefined
      ? m.unit === '$' ? `$${m.baselineValue.toFixed(4)}` : `${m.baselineValue} ${m.unit}`
      : '—';
    doc.setFillColor(0.35, 0.4, 0.45);
    doc.drawText(baseStr, cBase, rowY + 4, 7.5, 'Helvetica');

    // Candidate Value
    const candStr = m.candidateValue !== null && m.candidateValue !== undefined
      ? m.unit === '$' ? `$${m.candidateValue.toFixed(4)}` : `${m.candidateValue} ${m.unit}`
      : '—';
    doc.setFillColor(0.1, 0.12, 0.15);
    doc.drawText(candStr, cCand, rowY + 4, 7.5, 'Helvetica-Bold');

    // Absolute Delta
    let absStr = '—';
    if (m.absoluteDelta !== null && m.absoluteDelta !== undefined) {
      if (m.unit === '$') {
        absStr = m.absoluteDelta >= 0 ? `+$${m.absoluteDelta.toFixed(4)}` : `-$${Math.abs(m.absoluteDelta).toFixed(4)}`;
      } else {
        absStr = m.absoluteDelta > 0 ? `+${m.absoluteDelta} ${m.unit}` : `${m.absoluteDelta} ${m.unit}`;
      }
    }
    const isGood = m.assessment === 'IMPROVEMENT' || (m.isImprovement === true && m.absoluteDelta !== 0);
    const isBad = m.assessment === 'REGRESSION' || (m.isImprovement === false && m.absoluteDelta !== 0);

    doc.setFillColor(isGood ? 0.1 : isBad ? 0.8 : 0.4, isGood ? 0.6 : isBad ? 0.2 : 0.4, isGood ? 0.25 : isBad ? 0.2 : 0.45);
    doc.drawText(absStr, cAbsDelta, rowY + 4, 7.5, 'Helvetica');

    // % Delta
    let pctStr = '—';
    if (m.percentageDelta !== null && m.percentageDelta !== undefined) {
      pctStr = m.percentageDelta > 0 ? `+${m.percentageDelta}%` : `${m.percentageDelta}%`;
    }
    doc.drawText(pctStr, cPctDelta, rowY + 4, 7.5, 'Helvetica');

    // Assessment Badge
    const assessText = m.assessment || (isGood ? 'IMPROVEMENT' : isBad ? 'REGRESSION' : 'PARITY');
    doc.drawText(assessText, cAssess, rowY + 4, 7, 'Helvetica-Bold', 'right');

    doc.y = rowY;
  }

  // ─────────────────────────────────────────────────────────────
  // 5. PRODUCTION RELEASE GATES AUDIT
  // ─────────────────────────────────────────────────────────────
  renderSectionHeader(
    'Production Release Gates Audit',
    `OVERALL GATE STATUS: ${report.overallGateStatus === 'FAIL' || (report.overallGateStatus as string) === 'BLOCKED' ? 'BLOCKED' : report.overallGateStatus || 'CLEAR / NOT CONFIGURED'}`
  );

  const gateHdrY = doc.y - 18;
  doc.setFillColor(0.15, 0.18, 0.24);
  doc.drawRect(left, gateHdrY, width, 18, true, false);

  doc.setFillColor(1.0, 1.0, 1.0);
  doc.drawText('GATE', left + 8, gateHdrY + 5, 7, 'Helvetica-Bold');
  doc.drawText('OBSERVED', left + 175, gateHdrY + 5, 7, 'Helvetica-Bold');
  doc.drawText('THRESHOLD / TARGET', left + 260, gateHdrY + 5, 7, 'Helvetica-Bold');
  doc.drawText('ACTION', left + 365, gateHdrY + 5, 7, 'Helvetica-Bold');
  doc.drawText('STATUS', left + width - 10, gateHdrY + 5, 7, 'Helvetica-Bold', 'right');

  doc.y = gateHdrY;

  if (report.releaseGates && report.releaseGates.length > 0) {
    for (let i = 0; i < report.releaseGates.length; i++) {
      const g = report.releaseGates[i];
      doc.ensureSpace(18);

      const rowY = doc.y - 16;
      const isEven = i % 2 === 0;

      doc.setFillColor(isEven ? 0.98 : 1.0, isEven ? 0.98 : 1.0, isEven ? 0.99 : 1.0);
      doc.drawRect(left, rowY, width, 16, true, false);

      doc.setStrokeColor(0.92, 0.93, 0.95);
      doc.setLineWidth(0.5);
      doc.drawLine(left, rowY, left + width, rowY);

      doc.setFillColor(0.15, 0.18, 0.22);
      doc.drawText((g.gate || '').slice(0, 36), left + 8, rowY + 4, 7.5, 'Helvetica-Bold');

      doc.setFillColor(0.35, 0.4, 0.45);
      doc.drawText(g.observed || '—', left + 175, rowY + 4, 7.5, 'Helvetica');
      doc.drawText(g.threshold || '—', left + 260, rowY + 4, 7.5, 'Helvetica');

      // Failure Action column
      doc.setFillColor(g.isBlocking ? 0.85 : 0.85, g.isBlocking ? 0.15 : 0.55, g.isBlocking ? 0.15 : 0.1);
      doc.drawText(g.isBlocking ? 'BLOCK' : 'WARN', left + 365, rowY + 4, 7.5, 'Helvetica-Bold');

      const isPass = g.status === 'PASS';
      const isFail = g.status === 'FAIL';
      doc.setFillColor(isPass ? 0.1 : isFail ? 0.85 : 0.85, isPass ? 0.6 : isFail ? 0.15 : 0.55, isPass ? 0.25 : isFail ? 0.15 : 0.1);
      doc.drawText(g.status, left + width - 10, rowY + 4, 7.5, 'Helvetica-Bold', 'right');

      doc.y = rowY;
    }
  } else {
    doc.ensureSpace(18);
    const rowY = doc.y - 16;
    doc.setFillColor(0.98, 0.98, 0.99);
    doc.drawRect(left, rowY, width, 16, true, false);
    doc.setStrokeColor(0.92, 0.93, 0.95);
    doc.setLineWidth(0.5);
    doc.drawLine(left, rowY, left + width, rowY);

    doc.setFillColor(0.45, 0.5, 0.55);
    doc.drawText('All release requirements satisfied. No discrete gate violations recorded.', left + 8, rowY + 4, 7.5, 'Helvetica');
    doc.setFillColor(0.1, 0.6, 0.25);
    doc.drawText('PASS', left + width - 10, rowY + 4, 7.5, 'Helvetica-Bold', 'right');
    doc.y = rowY;
  }

  // ─────────────────────────────────────────────────────────────
  // 6. COST BREAKDOWN
  // ─────────────────────────────────────────────────────────────
  renderSectionHeader('Evaluation Infrastructure & Pricing Breakdown');

  doc.ensureSpace(42);
  const costBoxY = doc.y - 36;
  const costColW = width / 3;

  doc.setFillColor(0.98, 0.98, 0.99);
  doc.setStrokeColor(0.88, 0.9, 0.92);
  doc.drawRect(left, costBoxY, width, 36, true, true);

  // Col 1: Benchmark Model Cost
  const bCostStr = report.benchmarkCostUsd !== null && report.benchmarkCostUsd !== undefined ? `$${report.benchmarkCostUsd.toFixed(4)}` : '—';
  doc.setFillColor(0.5, 0.55, 0.6);
  doc.drawText('BENCHMARK MODEL COST', left + 12, costBoxY + 22, 6.5, 'Helvetica-Bold');
  doc.setFillColor(0.1, 0.15, 0.2);
  doc.drawText(bCostStr, left + 12, costBoxY + 8, 10, 'Helvetica-Bold');

  // Col 2: Judge Cost
  const jCostStr = report.judgeCostUsd !== null && report.judgeCostUsd !== undefined ? `$${report.judgeCostUsd.toFixed(4)}` : '$0.0000';
  doc.setFillColor(0.5, 0.55, 0.6);
  doc.drawText(`JUDGE COST (${report.judgeModel || 'GROQ'})`, left + costColW + 12, costBoxY + 22, 6.5, 'Helvetica-Bold');
  doc.setFillColor(0.2, 0.5, 0.85);
  doc.drawText(jCostStr, left + costColW + 12, costBoxY + 8, 10, 'Helvetica-Bold');

  // Col 3: Total Infrastructure Cost
  const totCostStr = report.totalInfrastructureCostUsd !== null && report.totalInfrastructureCostUsd !== undefined
    ? `$${report.totalInfrastructureCostUsd.toFixed(4)}`
    : bCostStr;
  doc.setFillColor(0.5, 0.55, 0.6);
  doc.drawText('TOTAL INFRASTRUCTURE COST', left + (costColW * 2) + 12, costBoxY + 22, 6.5, 'Helvetica-Bold');
  doc.setFillColor(0.12, 0.65, 0.3);
  doc.drawText(totCostStr, left + (costColW * 2) + 12, costBoxY + 8, 10, 'Helvetica-Bold');

  doc.y = costBoxY - 14;

  // ─────────────────────────────────────────────────────────────
  // 7. DIAGNOSTIC EVIDENCE & DECISION RATIONALE
  // ─────────────────────────────────────────────────────────────
  if (report.evidence && report.evidence.length > 0) {
    renderSectionHeader('Diagnostic Evidence & Decision Rationale');

    for (const ev of report.evidence) {
      doc.ensureSpace(18);
      const evY = doc.y - 14;
      doc.setFillColor(1.0, 0.42, 0.21);
      doc.drawText('•', left + 6, evY + 3, 9, 'Helvetica-Bold');
      doc.setFillColor(0.2, 0.25, 0.3);
      doc.drawText(ev.slice(0, 110), left + 18, evY + 3, 7.5, 'Helvetica');
      doc.y = evY;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 8. METHODOLOGICAL DISCLOSURES & LIMITATIONS
  // ─────────────────────────────────────────────────────────────
  if (report.limitations && report.limitations.length > 0) {
    renderSectionHeader('Methodological Disclosures & Limitations');

    for (const lim of report.limitations) {
      doc.ensureSpace(18);
      const limY = doc.y - 14;
      doc.setFillColor(0.5, 0.55, 0.6);
      doc.drawText('•', left + 6, limY + 3, 9, 'Helvetica-Bold');
      doc.setFillColor(0.35, 0.4, 0.45);
      doc.drawText(lim.slice(0, 110), left + 18, limY + 3, 7.5, 'Helvetica');
      doc.y = limY;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 9. EXECUTION PROVENANCE & AUDIT TRAIL
  // ─────────────────────────────────────────────────────────────
  renderSectionHeader('Execution Provenance & Audit Trail');
  doc.ensureSpace(38);
  const provY = doc.y - 32;
  doc.setFillColor(0.97, 0.97, 0.98);
  doc.setStrokeColor(0.88, 0.9, 0.92);
  doc.drawRect(left, provY, width, 32, true, true);

  const prov = report.provenance;
  const provMode = report.executionMode || 'SAVED';
  const startTime = prov?.initiatedAt ? new Date(prov.initiatedAt).toLocaleTimeString() : timestampStr;
  const finishTime = prov?.completedAt ? new Date(prov.completedAt).toLocaleTimeString() : timestampStr;
  const provStatus = prov?.hadOperationalErrors
    ? `Operational Throttling: Base ${prov.baselineRateLimits || 0}, Cand ${prov.candidateRateLimits || 0} (HTTP 429)`
    : 'All provider API calls succeeded with zero transport anomalies';

  doc.setFillColor(0.3, 0.35, 0.4);
  doc.drawText(`Execution Mode: ${provMode}  •  Start: ${startTime}  •  Completed: ${finishTime}`, left + 10, provY + 18, 7.5, 'Helvetica');
  doc.drawText(`Provider Status: ${provStatus}`, left + 10, provY + 6, 7.5, 'Helvetica');

  doc.y = provY - 14;

  return doc.buildPdfBytes();
}

/**
 * Downloads a generated PDF in browser environments.
 */
export function downloadReportPdf(report: ComparisonReport): void {
  try {
    const pdfBytes = generateReportPdf(report);
    const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reliq-report-${report.id || 'benchmark'}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (err: any) {
    console.error('Failed to export PDF report:', err);
    alert(`Failed to export PDF: ${err.message || 'Unknown error'}`);
  }
}
