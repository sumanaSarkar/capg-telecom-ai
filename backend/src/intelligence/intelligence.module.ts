import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module';
import { FeatureFlagsService } from './feature-flags.service';
import { LanguageService } from './language.service';
import { MemoryService } from './memory.service';
import { RagService } from './rag.service';
import { SentimentService } from './sentiment.service';

@Module({
  imports: [LlmModule],
  providers: [FeatureFlagsService, RagService, MemoryService, SentimentService, LanguageService],
  exports: [FeatureFlagsService, RagService, MemoryService, SentimentService, LanguageService],
})
export class IntelligenceModule {}
