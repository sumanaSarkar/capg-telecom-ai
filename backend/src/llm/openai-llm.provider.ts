import { Injectable, Logger } from '@nestjs/common';
import { ILlmProvider, IntentResult } from './llm-provider.interface';
import { MockLlmProvider } from './mock-llm.provider';

/**
 * Placeholder for a real OpenAI-backed provider. Since this project runs
 * fully offline with mocked data, this implementation simply delegates to
 * the deterministic mock logic while keeping the door open for a genuine
 * OpenAI SDK integration (e.g. using process.env.OPENAI_API_KEY) later.
 */
@Injectable()
export class OpenAiLlmProvider implements ILlmProvider {
  private readonly logger = new Logger(OpenAiLlmProvider.name);
  private readonly fallback = new MockLlmProvider();

  constructor() {
    this.logger.warn(
      'OpenAI provider requested but no live integration is configured; falling back to mock behaviour.',
    );
  }

  detectIntent(userMessage: string): Promise<IntentResult> {
    return this.fallback.detectIntent(userMessage);
  }

  generateResponse(context: object, template: string): Promise<string> {
    return this.fallback.generateResponse(context, template);
  }
}
