import { Module } from '@nestjs/common';
import { LLM_PROVIDER } from './llm-provider.interface';
import { MockLlmProvider } from './mock-llm.provider';
import { OpenAiLlmProvider } from './openai-llm.provider';

@Module({
  providers: [
    {
      provide: LLM_PROVIDER,
      useFactory: () => {
        const providerName = (process.env.LLM_PROVIDER || 'mock').toLowerCase();
        const apiKey = process.env.OPENAI_API_KEY ?? '';
        const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
        if (providerName === 'openai' && apiKey) {
          return new OpenAiLlmProvider(apiKey, model);
        }
        return new MockLlmProvider();
      },
    },
  ],
  exports: [LLM_PROVIDER],
})
export class LlmModule {}
