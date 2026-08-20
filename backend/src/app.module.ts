import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AnalyticsModule } from './agents/analytics/analytics.module';
import { AutopilotModule } from './agents/autopilot/autopilot.module';
import { BillingModule } from './agents/billing/billing.module';
import { EsimModule } from './agents/esim/esim.module';
import { PaymentModule } from './agents/payment/payment.module';
import { PlanModule } from './agents/plan/plan.module';
import { ProfileModule } from './agents/profile/profile.module';
import { RechargeModule } from './agents/recharge/recharge.module';
import { RoamingModule } from './agents/roaming/roaming.module';
import { SupportModule } from './agents/support/support.module';
import { AuthModule } from './auth/auth.module';
import { LlmModule } from './llm/llm.module';
import { OrchestratorModule } from './orchestrator/orchestrator.module';
import { SpeechModule } from './speech/speech.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AuthModule,
    LlmModule,
    ProfileModule,
    AnalyticsModule,
    PlanModule,
    BillingModule,
    RechargeModule,
    PaymentModule,
    RoamingModule,
    SupportModule,
    EsimModule,
    AutopilotModule,
    OrchestratorModule,
    SpeechModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
