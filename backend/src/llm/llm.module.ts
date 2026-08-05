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
        return providerName === 'openai'
          ? new OpenAiLlmProvider()
          : new MockLlmProvider();
      },
    },
  ],
  exports: [LLM_PROVIDER],
})
export class LlmModule {}
