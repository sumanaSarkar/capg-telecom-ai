import { Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import type { ConversationMessage, ILlmProvider, IntentResult } from './llm-provider.interface';
import { MockLlmProvider } from './mock-llm.provider';
import { buildTelecomAgentPrompt } from './telecom-agent-config';

const AVAILABLE_AGENTS = [
  'plan', 'recharge', 'billing', 'payment', 'roaming',
  'esim', 'profile', 'analytics', 'support',
];

const SYSTEM_PROMPT_INTENT = `You are an intent classifier for a telecom AI assistant called Telly.
Given a user message, return a JSON object with:
- "intent": a snake_case string like "billing_inquiry" or "plan_recommendation"
- "agents": an array of relevant agent names from this list: ${AVAILABLE_AGENTS.join(', ')}
- "confidence": a number between 0 and 1

Rules:
- If the request involves plan, recharge, or analytics, always include "profile", "analytics", and "plan" agents.
- Return ONLY valid JSON, no extra text.`;

const SYSTEM_PROMPT_CHAT = buildTelecomAgentPrompt();

@Injectable()
export class OpenAiLlmProvider implements ILlmProvider {
  private readonly logger = new Logger(OpenAiLlmProvider.name);
  private readonly client: OpenAI;
  private readonly fallback = new MockLlmProvider();
  private readonly model: string;

  constructor(apiKey: string, model = 'gpt-4.1-mini') {
    this.client = new OpenAI({ apiKey });
    this.model = model;
    this.logger.log(`OpenAI LLM provider initialised (model: ${this.model}).`);
  }

  // Newer reasoning-family models (gpt-5, o1, o3, o4, ...) reject "max_tokens" and require "max_completion_tokens".
  private usesMaxCompletionTokens(): boolean {
    return /^(gpt-5|o1|o3|o4)/i.test(this.model);
  }

  private tokenLimitParam(limit: number): Record<string, number> {
    return this.usesMaxCompletionTokens() ? { max_completion_tokens: limit } : { max_tokens: limit };
  }

  // Reasoning-family models only support the default temperature (1); omit the override for them.
  private temperatureParam(value: number): Record<string, number> {
    return this.usesMaxCompletionTokens() ? {} : { temperature: value };
  }

  // Reasoning models spend part of the token budget on hidden reasoning tokens, so keep effort low and budgets generous.
  private reasoningEffortParam(): Record<string, string> {
    return this.usesMaxCompletionTokens() ? { reasoning_effort: 'minimal' } : {};
  }

  // The free-form persona chat needs more thorough instruction-following (tone shifts, meta-feedback,
  // staying grounded in context) than the cheap classification/rephrasing calls, so give it more room to think.
  private chatReasoningEffortParam(): Record<string, string> {
    return this.usesMaxCompletionTokens() ? { reasoning_effort: 'low' } : {};
  }

  async detectIntent(userMessage: string): Promise<IntentResult> {
    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT_INTENT },
          { role: 'user', content: userMessage },
        ],
        response_format: { type: 'json_object' },
        ...this.temperatureParam(0),
        ...this.reasoningEffortParam(),
        ...this.tokenLimitParam(this.usesMaxCompletionTokens() ? 800 : 200),
      });

      const raw = completion.choices[0]?.message?.content ?? '{}';
      const parsed = JSON.parse(raw) as Partial<IntentResult>;

      return {
        intent: parsed.intent ?? 'general_inquiry',
        agents: Array.isArray(parsed.agents) ? parsed.agents : ['profile'],
        confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.8,
      };
    } catch (err) {
      this.logger.warn(`detectIntent failed, falling back to mock: ${String(err)}`);
      return this.fallback.detectIntent(userMessage);
    }
  }

  async generateResponse(context: object, template: string): Promise<string> {
    // Interpolate template variables first (same as mock).
    const interpolated = template.replace(
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
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          return String(value);
        }
        return JSON.stringify(value);
      },
    );

    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content:
              'You are Telly, a concise and friendly telecom assistant. ' +
              'Rephrase the following draft message into a natural, warm single sentence. ' +
              'Preserve all data values exactly. Return only the rephrased sentence, no quotes.',
          },
          { role: 'user', content: interpolated },
        ],
        ...this.temperatureParam(0.4),
        ...this.reasoningEffortParam(),
        ...this.tokenLimitParam(this.usesMaxCompletionTokens() ? 600 : 150),
      });

      return completion.choices[0]?.message?.content?.trim() ?? interpolated;
    } catch (err) {
      this.logger.warn(`generateResponse LLM call failed, returning interpolated draft: ${String(err)}`);
      return interpolated;
    }
  }

  async chat(messages: ConversationMessage[]): Promise<string> {
    try {
      // The persona system prompt always leads; any caller-supplied system messages (e.g. real
      // account context) are grounding context layered on top of it, never a replacement for it.
      const callerSystemMessages = messages.filter((m) => m.role === 'system');
      const nonSystemMessages = messages.filter((m) => m.role !== 'system');
      const fullMessages = [
        { role: 'system' as const, content: SYSTEM_PROMPT_CHAT },
        ...callerSystemMessages,
        ...nonSystemMessages,
      ];

      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: fullMessages,
        ...this.temperatureParam(0.7),
        ...this.chatReasoningEffortParam(),
        ...this.tokenLimitParam(this.usesMaxCompletionTokens() ? 1200 : 300),
      });

      return completion.choices[0]?.message?.content?.trim() ?? 'I\'m sorry, I could not generate a response right now.';
    } catch (err) {
      this.logger.warn(`chat failed: ${String(err)}`);
      return 'I\'m having trouble connecting right now. Please try again in a moment.';
    }
  }

  async humanize(draftMessage: string): Promise<string> {
    try {
      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT_CHAT },
          {
            role: 'user',
            content:
              'Rewrite the following structured draft as something you would actually say out loud on a live call — flowing, warm, conversational sentences, no markdown, no bullet points or dashes, no bold text. ' +
              'Keep every price, GB, minute, plan name, and customer name exactly as given; do not invent or drop any of them. ' +
              'End with a short, natural yes/no style check-in instead of a formal call-to-action button phrase.\n\n' +
              `Draft:\n${draftMessage}`,
          },
        ],
        ...this.temperatureParam(0.6),
        ...this.chatReasoningEffortParam(),
        ...this.tokenLimitParam(this.usesMaxCompletionTokens() ? 900 : 250),
      });

      return completion.choices[0]?.message?.content?.trim() || draftMessage;
    } catch (err) {
      this.logger.warn(`humanize failed, returning draft unmodified: ${String(err)}`);
      return draftMessage;
    }
  }
}

