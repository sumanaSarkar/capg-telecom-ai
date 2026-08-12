import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../agents/analytics/analytics.module';
import { AutopilotModule } from '../agents/autopilot/autopilot.module';
import { BillingModule } from '../agents/billing/billing.module';
import { EsimModule } from '../agents/esim/esim.module';
import { PaymentModule } from '../agents/payment/payment.module';
import { PlanModule } from '../agents/plan/plan.module';
import { ProfileModule } from '../agents/profile/profile.module';
import { RechargeModule } from '../agents/recharge/recharge.module';
import { RoamingModule } from '../agents/roaming/roaming.module';
import { AuthModule } from '../auth/auth.module';
import { LlmModule } from '../llm/llm.module';
import { OrchestratorController } from './orchestrator.controller';
import { OrchestratorService } from './orchestrator.service';
import { CustomerIntelligenceService } from './customer-intelligence.service';
import { CustomPlanComposerService } from './custom-plan-composer.service';
import { DecisionEngineService } from './decision-engine.service';
import { RecommendationService } from './recommendation.service';
import { TellyResponseTemplateService } from './telly-response-template.service';

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
    AutopilotModule,
    EsimModule,
  ],
  controllers: [OrchestratorController],
  providers: [OrchestratorService, RecommendationService, DecisionEngineService, CustomerIntelligenceService, CustomPlanComposerService, TellyResponseTemplateService],
})
export class OrchestratorModule {}
