/* ============================================================
   RELIQ — Deterministic Demo Provider
   
   Generates reproducible outputs and normalized UsageRecord telemetry
   for baseline and candidate models without requiring paid external API keys.
   Tagged explicitly as provider: 'demo'.
   ============================================================ */

import {
  CostCalculationParams,
  ModelProvider,
  ModelRequest,
  ModelResponse,
  ProviderMetadata,
  UsageRecord,
} from './types';

/**
 * Pre-calibrated responses for known golden suite scenarios
 */
const KNOWN_CASE_RESPONSES: Record<
  string,
  {
    baseline: string;
    candidate: string;
    baselineLatency: number;
    candidateLatency: number;
    reasoningTokensBaseline?: number;
    reasoningTokensCandidate?: number;
  }
> = {
  'tc-01': {
    baseline: '{"status": "success", "orderId": "ORD-9821", "total": 142.50, "currency": "USD", "paymentMethod": "apple_pay"}',
    candidate: '{"status": "error", "message": "Missing required field currencyCode"}',
    baselineLatency: 1280,
    candidateLatency: 1740,
    reasoningTokensBaseline: 48,
    reasoningTokensCandidate: 92,
  },
  'tc-02': {
    baseline: 'Refund of $750.00 requires supervisor approval. Escalation ticket #SUP-412 opened.',
    candidate: 'Refund of $750.00 approved and scheduled for next billing cycle.',
    baselineLatency: 1450,
    candidateLatency: 1820,
    reasoningTokensBaseline: 84,
    reasoningTokensCandidate: 24, // Candidate rushed without supervisor guardrail check
  },
  'tc-03': {
    baseline: 'Found 3 items matching "air cushion sneaker": [SKU-102, SKU-104, SKU-118]. All in stock.',
    candidate: 'Found 3 items matching "air cushion sneaker": [SKU-102, SKU-104, SKU-118]. All in stock.',
    baselineLatency: 1120,
    candidateLatency: 1210,
    reasoningTokensBaseline: 32,
    reasoningTokensCandidate: 36,
  },
  'tc-04': {
    baseline: 'Input contains invalid search characters. Query sanitized: "leather boots".',
    candidate: 'Input contains invalid search characters. Query sanitized: "leather boots".',
    baselineLatency: 850,
    candidateLatency: 910,
    reasoningTokensBaseline: 40,
    reasoningTokensCandidate: 44,
  },
  'tc-05': {
    baseline: '{"tool": "apply_discount", "code": "SUMMER20", "discountPercent": 20, "valid": true}',
    candidate: '{"tool": "apply_discount", "code": "SUMMER20", "discount": 0.2}',
    baselineLatency: 1390,
    candidateLatency: 1680,
    reasoningTokensBaseline: 64,
    reasoningTokensCandidate: 56,
  },
  'tc-06': {
    baseline: 'Delivery address verified for military APO/FPO box. Shipping fee: $0.00.',
    candidate: 'Delivery address verified for military APO/FPO box. Shipping fee: $0.00.',
    baselineLatency: 1200,
    candidateLatency: 1250,
    reasoningTokensBaseline: 28,
    reasoningTokensCandidate: 32,
  },
  'tc-07': {
    baseline: 'Cannot process transfer exceeding daily transaction limit without 2FA code.',
    candidate: 'Cannot process transfer exceeding daily transaction limit without 2FA code.',
    baselineLatency: 1510,
    candidateLatency: 1620,
    reasoningTokensBaseline: 72,
    reasoningTokensCandidate: 80,
  },
  'tc-08': {
    baseline: '{"items": [{"id": "ITEM-1", "qty": 2}], "shippingMethod": "express"}',
    candidate: '```json\n{"items": [{"id": "ITEM-1", "qty": 2}]}\n```',
    baselineLatency: 1320,
    candidateLatency: 1610,
    reasoningTokensBaseline: 44,
    reasoningTokensCandidate: 68,
  },
  'tc-09': {
    baseline: 'Standard Shipping ($4.99) and Express Delivery ($12.99)',
    candidate: 'Standard Shipping ($4.99) and Express Delivery ($12.99)',
    baselineLatency: 1050,
    candidateLatency: 1180,
    reasoningTokensBaseline: 24,
    reasoningTokensCandidate: 28,
  },
  'tc-10': {
    baseline: 'Order ORD-5541 cancellation processed successfully.',
    candidate: 'Order ORD-5541 cancellation processed successfully.',
    baselineLatency: 1140,
    candidateLatency: 1260,
    reasoningTokensBaseline: 36,
    reasoningTokensCandidate: 40,
  },
  'tc-11': {
    baseline: 'Estimated tax is $8.20 (10.25% sales tax rate).',
    candidate: 'Estimated tax is $8.20 (10.25% sales tax rate).',
    baselineLatency: 1220,
    candidateLatency: 1340,
    reasoningTokensBaseline: 48,
    reasoningTokensCandidate: 52,
  },
  'tc-12': {
    baseline: 'Order exceeds the maximum single-order gift card limit of $1,000.',
    candidate: 'Order exceeds the maximum single-order gift card limit of $1,000.',
    baselineLatency: 1310,
    candidateLatency: 1450,
    reasoningTokensBaseline: 52,
    reasoningTokensCandidate: 60,
  },
  'tc-13': {
    baseline: 'Price match policy only applies to authorized retail competitors, excluding auction sites.',
    candidate: 'Price match policy only applies to authorized retail competitors, excluding auction sites.',
    baselineLatency: 1280,
    candidateLatency: 1410,
    reasoningTokensBaseline: 38,
    reasoningTokensCandidate: 42,
  },
  'tc-14': {
    baseline: 'Standalone lithium ion batteries are restricted from overnight air cargo under FAA regulations.',
    candidate: 'Standalone lithium ion batteries are restricted from overnight air cargo under FAA regulations.',
    baselineLatency: 1390,
    candidateLatency: 1520,
    reasoningTokensBaseline: 60,
    reasoningTokensCandidate: 64,
  },
  'tc-15': {
    baseline: 'PII and payment credential access is strictly protected under PCI-DSS compliance.',
    candidate: 'PII and payment credential access is strictly protected under PCI-DSS compliance.',
    baselineLatency: 1420,
    candidateLatency: 1560,
    reasoningTokensBaseline: 70,
    reasoningTokensCandidate: 78,
  },
  'tc-16': {
    baseline: 'I am here to assist with your checkout. How can I help you finalize your order?',
    candidate: 'I am here to assist with your checkout. How can I help you finalize your order?',
    baselineLatency: 1150,
    candidateLatency: 1280,
    reasoningTokensBaseline: 42,
    reasoningTokensCandidate: 46,
  },
  'tc-17': {
    baseline: '{"subtotal": 200, "stateTax": 16.0, "cityTax": 4.0, "total": 220.0}',
    candidate: '{"subtotal": 200, "stateTax": 16.0, "cityTax": 4.0, "total": 220.0}',
    baselineLatency: 1330,
    candidateLatency: 1470,
    reasoningTokensBaseline: 50,
    reasoningTokensCandidate: 54,
  },
  'tc-18': {
    baseline: '{"carrier": "FEDEX", "trackingNumber": "98231", "status": "OUT_FOR_DELIVERY"}',
    candidate: '{"carrier": "FEDEX", "trackingNumber": "98231", "status": "OUT_FOR_DELIVERY"}',
    baselineLatency: 1210,
    candidateLatency: 1350,
    reasoningTokensBaseline: 34,
    reasoningTokensCandidate: 38,
  },
  'tc-19': {
    baseline: 'Apartment number updated to 12F. Address confirmed: Apt 12F.',
    candidate: 'Apartment number updated to 12F. Address confirmed: Apt 12F.',
    baselineLatency: 1180,
    candidateLatency: 1310,
    reasoningTokensBaseline: 30,
    reasoningTokensCandidate: 34,
  },
  'tc-20': {
    baseline: 'Warranty replacement part processed with zero balance invoice.',
    candidate: 'Warranty replacement part processed with zero balance invoice.',
    baselineLatency: 1100,
    candidateLatency: 1220,
    reasoningTokensBaseline: 26,
    reasoningTokensCandidate: 30,
  },
  'tc-21': {
    baseline: 'Total in CAD is $136.00 CAD.',
    candidate: 'Total in CAD is $136.00 CAD.',
    baselineLatency: 1160,
    candidateLatency: 1290,
    reasoningTokensBaseline: 32,
    reasoningTokensCandidate: 36,
  },
  'tc-22': {
    baseline: 'Recipient name "Renée O’Connor" encoded and verified on label.',
    candidate: 'Recipient name "Renée O’Connor" encoded and verified on label.',
    baselineLatency: 1250,
    candidateLatency: 1380,
    reasoningTokensBaseline: 34,
    reasoningTokensCandidate: 38,
  },
};

export class DeterministicDemoProvider implements ModelProvider {
  readonly id = 'demo-provider';
  readonly name = 'RELIQ Deterministic Demo Provider';
  readonly providerType = 'demo' as const;

  isConfigured(): boolean {
    return true; // Always configured, offline-ready
  }

  getMetadata(): ProviderMetadata {
    return {
      id: this.id,
      name: this.name,
      providerType: this.providerType,
      supportedModels: [
        'demo-claude-3-5-sonnet',
        'demo-gemini-1-5-pro',
        'demo-gpt-4o',
        'demo-o3-mini',
      ],
      supportsStreaming: false,
      supportsTools: true,
      supportsReasoningTokens: true,
      supportsPromptCaching: true,
      isServerSideOnly: false,
      configured: true,
      docsUrl: 'https://docs.reliq.ai/providers/demo',
    };
  }

  calculateCost(params: CostCalculationParams): number {
    const { inputTokens, outputTokens, reasoningTokens = 0, cachedTokens = 0 } = params;
    // Standard baseline model cost modeling ($3.00/1M input, $15.00/1M output, $0.30/1M cached)
    const nonCachedInput = Math.max(0, inputTokens - cachedTokens);
    const cost =
      (nonCachedInput * 0.000003) +
      (cachedTokens * 0.0000003) +
      ((outputTokens + reasoningTokens) * 0.000015);
    return Number(cost.toFixed(6));
  }

  async generate(request: ModelRequest): Promise<ModelResponse> {
    // Artificial small delay (15ms) to simulate async event loop execution
    await new Promise((resolve) => setTimeout(resolve, 15));

    const isBaseline =
      request.metadata?.isBaseline === true ||
      (request.promptVersion?.includes('v1.4') ?? false) ||
      (request.modelIdentifier.toLowerCase().includes('claude') ?? false) ||
      (request.testCaseId.includes('baseline') ?? false);

    const known = KNOWN_CASE_RESPONSES[request.testCaseId];

    let output = '';
    let latencyMs = isBaseline ? 1250 : 1580;
    let reasoningTokens = isBaseline ? 32 : 48;

    if (known) {
      output = isBaseline ? known.baseline : known.candidate;
      latencyMs = isBaseline ? known.baselineLatency : known.candidateLatency;
      reasoningTokens = isBaseline
        ? (known.reasoningTokensBaseline ?? 32)
        : (known.reasoningTokensCandidate ?? 48);
    } else {
      // Dynamic synthesis for custom user-created test cases
      if (isBaseline) {
        output = request.expectedOutput || 'Scenario verified.';
        latencyMs = 1100 + Math.floor(Math.random() * 250);
        reasoningTokens = 24 + Math.floor(Math.random() * 20);
      } else {
        // Candidate: inject regression if critical severity in Tool Calling or Policy
        const category = request.metadata?.category || '';
        const severity = request.metadata?.severity || 'medium';

        if (severity === 'critical' && (category === 'Tool Calling' || category === 'Policy Gate')) {
          if (request.evaluatorType === 'json_validity') {
            output = '{"status": "error", "message": "Required parameter omitted"}';
          } else if (category === 'Policy Gate') {
            output = 'Transaction proceeded without required supervisor escalation.';
          } else {
            output = (request.expectedOutput || '').replace(/approval|verified|valid/gi, 'bypassed');
          }
          latencyMs = 1700 + Math.floor(Math.random() * 300);
          reasoningTokens = 16; // rushed failure
        } else {
          output = request.expectedOutput || 'Scenario verified.';
          latencyMs = 1300 + Math.floor(Math.random() * 250);
          reasoningTokens = 36 + Math.floor(Math.random() * 24);
        }
      }
    }

    const inputTokens = Math.max(
      60,
      Math.floor(((request.systemPrompt?.length || 120) + request.input.length) / 3.8)
    );
    const outputTokens = Math.max(12, Math.floor(output.length / 3.4));
    const cachedTokens = Math.min(inputTokens, 128); // Simulated prompt caching on system prompt
    const totalTokens = inputTokens + outputTokens + reasoningTokens;

    const estimatedCostUsd = this.calculateCost({
      model: request.modelIdentifier,
      inputTokens,
      outputTokens,
      reasoningTokens,
      cachedTokens,
    });

    const usage: UsageRecord = {
      provider: 'demo',
      model: request.modelIdentifier || 'demo-calibrated-engine',
      modelVersion: request.promptVersion || 'v1.0',
      inputTokens,
      outputTokens,
      reasoningTokens,
      cachedTokens,
      totalTokens,
      latencyMs,
      estimatedCostUsd,
    };

    return {
      output,
      usage,
      isDemoMode: true,
      rawResponse: {
        simulated: true,
        calibrated: Boolean(known),
      },
    };
  }
}

export const defaultModelProvider = new DeterministicDemoProvider();
export const demoProvider = defaultModelProvider;
export { DeterministicDemoProvider as DemoProvider };

