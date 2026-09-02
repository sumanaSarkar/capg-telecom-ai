import { Injectable, Logger } from '@nestjs/common';
import { ILlmProvider, IntentResult } from './llm-provider.interface';
import { buildTelecomAgentPrompt, TELECOM_SERVICE_CATALOG } from './telecom-agent-config';

interface KeywordMapping {
  keyword: string;
  agent: string;
}

const KEYWORD_AGENT_MAP: KeywordMapping[] = [
  { keyword: 'plan', agent: 'plan' },
  { keyword: 'recharge', agent: 'recharge' },
  { keyword: 'billing', agent: 'billing' },
  { keyword: 'invoice', agent: 'billing' },
  { keyword: 'bill', agent: 'billing' },
  { keyword: 'history', agent: 'billing' },
  { keyword: 'statement', agent: 'billing' },
  { keyword: 'support', agent: 'support' },
  { keyword: 'ticket', agent: 'support' },
  { keyword: 'roaming', agent: 'roaming' },
  { keyword: 'travel', agent: 'roaming' },
  { keyword: 'international', agent: 'roaming' },
  { keyword: 'abroad', agent: 'roaming' },
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
      matchedAgents.has('analytics') ||
      matchedAgents.has('roaming')
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

  chat(messages: import('./llm-provider.interface').ConversationMessage[]): Promise<string> {
    const userMessages = messages.filter((m) => m.role === 'user');
    const latestUserMessage = userMessages[userMessages.length - 1]?.content?.trim() ?? '';
    const previousAssistantReply = [...messages].reverse().find((m) => m.role === 'assistant')?.content;

    if (!latestUserMessage) {
      return Promise.resolve(
        'I can help with plans, recharge, billing, roaming, eSIM, payments, and support. What would you like to do?',
      );
    }

    const normalized = latestUserMessage.toLowerCase();

    if (/\b(hi|hello|hey|good morning|good evening|good afternoon)\b/.test(normalized)) {
      return Promise.resolve(
        'Hello! I can help with your telecom account, plans, billing, recharge, roaming, and eSIM requests. What would you like to check first?',
      );
    }

    if (/\b(thanks|thank you|thx)\b/.test(normalized)) {
      return Promise.resolve('You are welcome. If you want, I can next help with plans, billing, recharge, or roaming.');
    }

    if (/\b(llm|ai|model|bot)\b/.test(normalized)) {
      return Promise.resolve(
        'Yes, I am Telly, your telecom advisor. I can personalize a plan, suggest unlimited calls, roaming, OTT bundles such as Netflix, and guide you to the best offer.',
      );
    }

    if (/\b(plan|bundle|recommend|custom|ott|netflix|roaming|unlimited calls|unlimited call)\b/.test(normalized)) {
      const catalogPreview = TELECOM_SERVICE_CATALOG.slice(0, 4)
        .map((item) => `${item.name} (${item.price})`)
        .join(', ');
      return Promise.resolve(
        `I can build a hyper-personalized bundle for you. For example, I can combine options like ${catalogPreview} and tailor the offer to your usage, travel, and entertainment needs.`,
      );
    }

    if (/\b(dont|do not|never)\s+repeat\b/.test(normalized)) {
      return Promise.resolve(
        'Understood, I will not repeat your text. Tell me the telecom task you want, and I will reply with a direct answer.',
      );
    }

    if (/^(why|how|what else|tell me more|more)$/i.test(normalized) && previousAssistantReply) {
      return Promise.resolve(
        'Sure. I can explain in more detail, or we can continue directly with a telecom task like checking billing, comparing plans, or starting a recharge.',
      );
    }

    return Promise.resolve(
      `${buildTelecomAgentPrompt().split('\n')[0]} I can help you with a tailored plan, add-ons such as unlimited calls, roaming, Netflix/OTT bundles, and premium support. What do you need today?`,
    );
  }

  humanize(draftMessage: string): Promise<string> {
    // No real model available; just strip markdown so it doesn't read literal "**" characters aloud.
    return Promise.resolve(draftMessage.replace(/\*\*/g, '').replace(/^[-*]\s+/gm, ''));
  }
}
