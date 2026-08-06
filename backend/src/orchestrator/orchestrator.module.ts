import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../agents/analytics/analytics.module';
import { BillingModule } from '../agents/billing/billing.module';
import { PaymentModule } from '../agents/payment/payment.module';
import { PlanModule } from '../agents/plan/plan.module';
import { ProfileModule } from '../agents/profile/profile.module';
import { RechargeModule } from '../agents/recharge/recharge.module';
import { RoamingModule } from '../agents/roaming/roaming.module';
import { AuthModule } from '../auth/auth.module';
import { LlmModule } from '../llm/llm.module';
import { OrchestratorController } from './orchestrator.controller';
import { OrchestratorService } from './orchestrator.service';
import { RecommendationService } from './recommendation.service';

@Module({
  imports: [
    AuthModule,
    LlmModule,
    ProfileModule,
    AnalyticsModule,
    PlanModule,
    PaymentModule,
    RechargeModule,
    RoamingModule,
    BillingModule,
  ],
  controllers: [OrchestratorController],
  providers: [OrchestratorService, RecommendationService],
})
export class OrchestratorModule {}
