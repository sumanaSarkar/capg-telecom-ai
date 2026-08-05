import { Injectable, Logger } from '@nestjs/common';
import { ILlmProvider, IntentResult } from './llm-provider.interface';

interface KeywordMapping {
  keyword: string;
  agent: string;
}

const KEYWORD_AGENT_MAP: KeywordMapping[] = [
  { keyword: 'plan', agent: 'plan' },
  { keyword: 'recharge', agent: 'recharge' },
  { keyword: 'billing', agent: 'billing' },
  { keyword: 'invoice', agent: 'billing' },
  { keyword: 'support', agent: 'support' },
  { keyword: 'ticket', agent: 'support' },
  { keyword: 'roaming', agent: 'roaming' },
  { keyword: 'esim', agent: 'esim' },
  { keyword: 'sim', agent: 'esim' },
  { keyword: 'profile', agent: 'profile' },
  { keyword: 'account', agent: 'profile' },
  { keyword: 'analytics', agent: 'analytics' },
  { keyword: 'usage', agent: 'analytics' },
  { keyword: 'payment', agent: 'payment' },
  { keyword: 'pay', agent: 'payment' },
];

/**
 * Mock LLM provider that simulates intent detection and templated
 * response generation without calling any real language model.
 */
@Injectable()
export class MockLlmProvider implements ILlmProvider {
  private readonly logger = new Logger(MockLlmProvider.name);

  detectIntent(userMessage: string): Promise<IntentResult> {
    const message = (userMessage || '').toLowerCase();
    const matchedAgents = new Set<string>();

    for (const { keyword, agent } of KEYWORD_AGENT_MAP) {
      if (message.includes(keyword)) {
        matchedAgents.add(agent);
      }
    }

    // The recommendation & recharge journey always needs a full customer
    // picture, so ensure the core context-gathering agents are present
    // whenever a plan/recharge/usage related request is detected.
    if (
      matchedAgents.has('plan') ||
      matchedAgents.has('recharge') ||
      matchedAgents.has('analytics')
    ) {
      matchedAgents.add('profile');
      matchedAgents.add('analytics');
      matchedAgents.add('plan');
    }

    const agents =
      matchedAgents.size > 0 ? Array.from(matchedAgents) : ['profile'];

    const intent =
      agents.length > 0 && matchedAgents.size > 0
        ? `${agents.slice().sort().join('_')}_inquiry`
        : 'general_inquiry';

    const confidence = Math.min(0.5 + matchedAgents.size * 0.12, 0.97);

    this.logger.debug(
      `Detected intent "${intent}" for message: "${userMessage}"`,
    );

    return Promise.resolve({ intent, agents, confidence });
  }

  generateResponse(context: object, template: string): Promise<string> {
    const rendered = template.replace(
      /{{\s*([\w.]+)\s*}}/g,
      (_match, path: string) => {
        const value = path
          .split('.')
          .reduce<unknown>(
            (acc, key) =>
              acc && typeof acc === 'object'
                ? (acc as Record<string, unknown>)[key]
                : undefined,
            context,
          );
        if (value === undefined || value === null) return '';
        if (
          typeof value === 'string' ||
          typeof value === 'number' ||
          typeof value === 'boolean'
        ) {
          return String(value);
        }
        return JSON.stringify(value);
      },
    );

    return Promise.resolve(rendered);
  }
}
