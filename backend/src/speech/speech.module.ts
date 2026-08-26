import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../agents/analytics/analytics.module';
import { ProfileModule } from '../agents/profile/profile.module';
import { SpeechController } from './speech.controller';
import { SpeechService } from './speech.service';

@Module({
  imports: [ProfileModule, AnalyticsModule],
  controllers: [SpeechController],
  providers: [SpeechService],
  exports: [SpeechService],
})
export class SpeechModule {}
