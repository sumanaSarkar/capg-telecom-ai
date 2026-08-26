import { Injectable, Logger } from '@nestjs/common';
import { TELECOM_SERVICE_CATALOG } from '../llm/telecom-agent-config';
import { FeatureFlagsService } from './feature-flags.service';

export interface RagSnippet {
  content: string;
  source: string;
  score: number;
}

// Small built-in FAQ knowledge base used as the in-memory fallback vector store.
const FAQ_KNOWLEDGE_BASE: { content: string; source: string }[] = [
  {
    content: 'To activate international roaming, enable it from the Roaming tab or ask Telly to "enable roaming". Roaming packages cover data, calls, and SMS for the trip duration.',
    source: 'faq:roaming-activation',
  },
  {
    content: 'Bills are generated monthly. Customers can pay a pending bill instantly through the chat by confirming the "pay my bill" action, which redirects to a secure payment link.',
    source: 'faq:billing-payment',
  },
  {
    content: 'eSIM activation requires the device ID (EID), found under Settings > About Phone > IMEI on Android or General > About on iPhone.',
    source: 'faq:esim-activation',
  },
  {
    content: 'Recharge plans should be chosen based on remaining data/call usage before the next billing cycle; Telly recommends a plan with at least 20% headroom over typical usage.',
    source: 'faq:recharge-guidance',
  },
  {
    content: 'Autopilot lets Telly automatically pay bills and recharge plans on the customer\'s behalf when enabled; it can be turned off anytime to regain manual control.',
    source: 'faq:autopilot',
  },
];

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);

  constructor(private readonly flags: FeatureFlagsService) {}

  async retrieve(query: string, topK = 3): Promise<RagSnippet[]> {
    if (this.flags.vectorDb === 'azure_ai_search') {
      try {
        return await this.retrieveFromAzureSearch(query, topK);
      } catch (error) {
        this.logger.warn(`Azure AI Search retrieval failed, falling back to in-memory knowledge base: ${error}`);
      }
    }

    return this.retrieveFromMemory(query, topK);
  }

  private async retrieveFromAzureSearch(query: string, topK: number): Promise<RagSnippet[]> {
    const endpoint = process.env.AZURE_SEARCH_ENDPOINT;
    const apiKey = process.env.AZURE_SEARCH_API_KEY;
    const index = process.env.AZURE_SEARCH_INDEX || 'telecom-knowledge-base';

    if (!endpoint || !apiKey) {
      throw new Error('AZURE_SEARCH_ENDPOINT and AZURE_SEARCH_API_KEY are required for VECTOR_DB=azure_ai_search');
    }

    const url = `${endpoint.replace(/\/$/, '')}/indexes/${index}/docs/search?api-version=2023-11-01`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({ search: query, top: topK }),
    });

    if (!response.ok) {
      throw new Error(`Azure AI Search request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as { value?: Array<Record<string, unknown>> };
    return (payload.value ?? []).map((doc, index) => ({
      content: String(doc.content ?? doc.text ?? JSON.stringify(doc)),
      source: String(doc.id ?? doc.source ?? `azure-search:${index}`),
      score: Number((doc as Record<string, unknown>)['@search.score'] ?? 0),
    }));
  }

  private retrieveFromMemory(query: string, topK: number): RagSnippet[] {
    const terms = query.toLowerCase().split(/\W+/).filter(Boolean);
    const candidates: RagSnippet[] = [
      ...FAQ_KNOWLEDGE_BASE.map((entry) => ({ ...entry, score: 0 })),
      ...TELECOM_SERVICE_CATALOG.map((item) => ({
        content: `${item.name} (${item.category}, ${item.price}): ${item.description}`,
        source: `catalog:${item.name}`,
        score: 0,
      })),
    ];

    for (const candidate of candidates) {
      const haystack = candidate.content.toLowerCase();
      candidate.score = terms.reduce((score, term) => (term.length > 2 && haystack.includes(term) ? score + 1 : score), 0);
    }

    return candidates
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}
