import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AnalyticsService } from '../agents/analytics/analytics.service';
import { BillingService } from '../agents/billing/billing.service';
import { PaymentService } from '../agents/payment/payment.service';
import { PlanService } from '../agents/plan/plan.service';
import { ProfileService } from '../agents/profile/profile.service';
import { RechargeService } from '../agents/recharge/recharge.service';
import type { ILlmProvider } from '../llm/llm-provider.interface';
import { LLM_PROVIDER } from '../llm/llm-provider.interface';
import { AskAction, AskDto } from './ask.dto';
import { RecommendationService } from './recommendation.service';

export type OrchestratorStage = 'recommendation' | 'payment' | 'complete';

export interface OrchestratorResponse {
  intent: string;
  agents: string[];
  recommendation?: {
    plan: unknown;
    reason: string;
  };
  paymentUrl?: string;
  paymentId?: string;
  finalMessage: string;
  stage: OrchestratorStage;
  context?: Record<string, unknown>;
}

@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);

  constructor(
    @Inject(LLM_PROVIDER) private readonly llmProvider: ILlmProvider,
    private readonly profileService: ProfileService,
    private readonly analyticsService: AnalyticsService,
    private readonly planService: PlanService,
    private readonly paymentService: PaymentService,
    private readonly rechargeService: RechargeService,
    private readonly billingService: BillingService,
    private readonly recommendationService: RecommendationService,
  ) {}

  async ask(dto: AskDto): Promise<OrchestratorResponse> {
    const action: AskAction = dto.action ?? 'ask';

    // Step 1: detect intent & required agents via the LLM provider.
    const { intent, agents } = await this.llmProvider.detectIntent(dto.message);

    if (action === 'confirm') {
      return this.handleConfirm(dto, intent, agents);
    }

    if (action === 'payment_success') {
      return this.handlePaymentSuccess(dto, intent, agents);
    }

    return this.handleAsk(dto, intent, agents);
  }

  private async handleAsk(
    dto: AskDto,
    intent: string,
    agents: string[],
  ): Promise<OrchestratorResponse> {
    // Step 2/3: parallel fan-out to the core context-gathering agents.
    const [profile, analytics, plans] = await Promise.all([
      Promise.resolve(this.profileService.getProfile(dto.customerId)),
      Promise.resolve(this.analyticsService.getAnalytics(dto.customerId)),
      Promise.resolve(this.planService.getPlans(dto.customerId)),
    ]);

    // Step 4: send aggregated context to the recommendation engine.
    const rankedPlans = this.recommendationService.rankPlans(analytics, plans);
    const bestPlan = rankedPlans[0].plan;

    const recommendationContext = {
      ...this.recommendationService.buildRecommendationContext(
        analytics,
        bestPlan,
      ),
      customerName: profile.name,
    };

    const reason = await this.llmProvider.generateResponse(
      recommendationContext,
      "Based on {{customerName}}'s usage of {{currentUsageGB}}GB out of {{currentLimitGB}}GB " +
        '({{usagePercent}}% consumed), the {{planName}} plan ({{planDataGB}}GB for ${{planPrice}}/mo) ' +
        'offers the best balance of coverage and value.',
    );

    const finalMessage = await this.llmProvider.generateResponse(
      { planName: bestPlan.name, planPrice: bestPlan.price },
      'I recommend the {{planName}} plan at ${{planPrice}}/mo. Would you like to proceed with this recharge?',
    );

    return {
      intent,
      agents,
      recommendation: { plan: bestPlan, reason },
      finalMessage,
      stage: 'recommendation',
      context: {
        profile,
        analytics,
        rankedPlans: rankedPlans.map((r) => ({
          planId: r.plan.id,
          score: r.score,
        })),
      },
    };
  }

  private async handleConfirm(
    dto: AskDto,
    intent: string,
    agents: string[],
  ): Promise<OrchestratorResponse> {
    if (!dto.planId) {
      throw new NotFoundException('planId is required to confirm a plan');
    }

    const plan = this.planService.getPlanById(dto.planId);
    if (!plan) {
      throw new NotFoundException(`Plan ${dto.planId} not found`);
    }

    // Step 6: initiate payment for the selected plan.
    const payment = this.paymentService.initiatePayment(
      dto.customerId,
      plan.id,
      plan.price,
    );

    const finalMessage = await this.llmProvider.generateResponse(
      { planName: plan.name, paymentUrl: payment.paymentUrl },
      'Great choice! Please complete your payment for the {{planName}} plan using the link ' +
        'below, then confirm once done: {{paymentUrl}}',
    );

    return {
      intent,
      agents,
      paymentUrl: payment.paymentUrl,
      paymentId: payment.paymentId,
      finalMessage,
      stage: 'payment',
      context: { plan },
    };
  }

  private async handlePaymentSuccess(
    dto: AskDto,
    intent: string,
    agents: string[],
  ): Promise<OrchestratorResponse> {
    if (!dto.paymentId) {
      throw new NotFoundException('paymentId is required to finalize payment');
    }
    if (!dto.planId) {
      throw new NotFoundException('planId is required to finalize payment');
    }

    const plan = this.planService.getPlanById(dto.planId);
    if (!plan) {
      throw new NotFoundException(`Plan ${dto.planId} not found`);
    }

    // Step 7: confirm the payment.
    this.paymentService.confirmPayment(dto.paymentId);

    // Step 8 (recharge) & Step 9 (billing) run once payment is confirmed.
    const recharge = this.rechargeService.applyRecharge(
      dto.customerId,
      plan.id,
    );
    const billingRecord = this.billingService.recordTransaction(
      dto.customerId,
      plan.id,
      plan.price,
    );

    // Step 10: generate the final confirmation message.
    const finalMessage = await this.llmProvider.generateResponse(
      { planName: plan.name, activatedAt: recharge.activatedAt },
      'Your payment was successful and the {{planName}} plan has been activated as of ' +
        '{{activatedAt}}. Thank you for choosing us!',
    );

    return {
      intent,
      agents,
      finalMessage,
      stage: 'complete',
      context: { recharge, billingRecord },
    };
  }
}
