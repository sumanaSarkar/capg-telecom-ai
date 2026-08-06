import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AnalyticsService } from '../agents/analytics/analytics.service';
import { BillingRecord } from '../agents/billing/billing.model';
import { BillingService } from '../agents/billing/billing.service';
import { PaymentService } from '../agents/payment/payment.service';
import { Plan } from '../agents/plan/plan.model';
import { PlanService } from '../agents/plan/plan.service';
import { ProfileService } from '../agents/profile/profile.service';
import { RechargeService } from '../agents/recharge/recharge.service';
import { RoamingPackage } from '../agents/roaming/roaming.model';
import { RoamingService } from '../agents/roaming/roaming.service';
import type { ILlmProvider } from '../llm/llm-provider.interface';
import { LLM_PROVIDER } from '../llm/llm-provider.interface';
import { AskAction, AskDto } from './ask.dto';
import { RecommendationService } from './recommendation.service';

export type OrchestratorStage =
  | 'recommendation'
  | 'payment'
  | 'complete'
  | 'billing'
  | 'plans'
  | 'recharge-options'
  | 'roaming-packages';

export interface OrchestratorResponse {
  intent: string;
  agents: string[];
  recommendation?: {
    plan: unknown;
    reason: string;
  };
  availablePlans?: Plan[];
  rechargeOptions?: Plan[];
  roamingPackages?: RoamingPackage[];
  paymentUrl?: string;
  paymentId?: string;
  finalMessage: string;
  stage: OrchestratorStage;
  billingHistory?: BillingRecord[];
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
    private readonly roamingService: RoamingService,
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

  private filterRecentBilling(records: BillingRecord[], months: number): BillingRecord[] {
    const sorted = [...records].sort(
      (left, right) => new Date(left.date).getTime() - new Date(right.date).getTime(),
    );

    if (!Number.isFinite(months) || months <= 0) {
      return sorted;
    }

    return sorted.slice(-months);
  }

  private isCurrentPlanRequest(message: string): boolean {
    return /\b(current|my|existing|present)\s+plan\b/i.test(message) || /\bwhat\s+is\s+my\s+plan\b/i.test(message) || /\bwhich\s+plan\s+am\s+i\s+on\b/i.test(message);
  }

  private isAvailablePlansRequest(message: string): boolean {
    return /\b(available|all|list|show|compare)\b.*\bplans?\b/i.test(message) || /\bplans?\s+available\b/i.test(message) || /\bplan\s+options\b/i.test(message);
  }

  private isRechargeOptionsRequest(message: string): boolean {
    return /\b(available|all|list|show|compare)\b.*\brecharge\b.*\boptions?\b/i.test(message) || /\brecharge\s+options\b/i.test(message) || /\btop\s*up\s+options\b/i.test(message);
  }

  private isRoamingPackagesRequest(message: string): boolean {
    return /\b(available|all|list|show|compare)\b.*\broaming\b.*\bpackages?\b/i.test(message) || /\broaming\s+packages?\b/i.test(message) || /\broaming\s+options\b/i.test(message);
  }

  private normalizeText(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\b(one|1)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private resolveExplicitPlan(message: string, plans: Plan[]): Plan | undefined {
    const normalizedMessage = this.normalizeText(message);

    return plans.find((plan) => {
      const planTokens = this.normalizeText(plan.name).split(' ').filter(Boolean);
      return planTokens.length > 0 && planTokens.every((token) => normalizedMessage.includes(token));
    });
  }

  private getRequestedMonths(message: string): number | undefined {
    if (/\b(?:past|last|previous)\s+month\b/i.test(message)) {
      return 1;
    }

    const monthsMatch = message.match(/\b(?:past|last|previous)\s+(\d+)\s+months?\b/i);
    if (monthsMatch) {
      return parseInt(monthsMatch[1], 10);
    }

    const looseMatch = message.match(/\b(\d+)\s+months?\b/i);
    return looseMatch ? parseInt(looseMatch[1], 10) : undefined;
  }

  private async handleAsk(
    dto: AskDto,
    intent: string,
    agents: string[],
  ): Promise<OrchestratorResponse> {
    if (this.isCurrentPlanRequest(dto.message)) {
      const profile = this.profileService.getProfile(dto.customerId);
      const currentPlan = this.planService.getPlans(dto.customerId).find((plan) => plan.name === profile.plan);

      const finalMessage = currentPlan
        ? `Your current plan is ${currentPlan.name} at $${currentPlan.price.toFixed(2)}/mo. If you want to compare options, I can show all available plans.`
        : `Your current plan is ${profile.plan}. If you want to compare options, I can show all available plans.`;

      return {
        intent,
        agents,
        finalMessage,
        stage: 'complete',
        context: {
          profile,
          currentPlan,
        },
      };
    }

    if (this.isAvailablePlansRequest(dto.message)) {
      const availablePlans = this.planService.getPlans(dto.customerId);
      const finalMessage = await this.llmProvider.generateResponse(
        { count: availablePlans.length },
        'Here are all {{count}} available plans:',
      );

      return {
        intent,
        agents,
        finalMessage,
        stage: 'plans',
        availablePlans,
      };
    }

    if (this.isRechargeOptionsRequest(dto.message)) {
      const rechargeOptions = this.planService.getPlans(dto.customerId);
      const finalMessage = await this.llmProvider.generateResponse(
        { count: rechargeOptions.length },
        'Here are all {{count}} available recharge options:',
      );

      return {
        intent,
        agents,
        finalMessage,
        stage: 'recharge-options',
        rechargeOptions,
      };
    }

    if (this.isRoamingPackagesRequest(dto.message)) {
      const roamingPackages = this.roamingService.getRoamingPackages();
      const finalMessage = await this.llmProvider.generateResponse(
        { count: roamingPackages.length },
        'Here are all {{count}} available roaming packages:',
      );

      return {
        intent,
        agents,
        finalMessage,
        stage: 'roaming-packages',
        roamingPackages,
      };
    }

    // Billing-only query: return history without running the recommendation engine.
    const isBillingOnly =
      agents.includes('billing') &&
      !agents.includes('plan') &&
      !agents.includes('recharge');

    if (isBillingOnly) {
      const months = this.getRequestedMonths(dto.message);
      const allRecords = this.billingService.getBillingHistory(dto.customerId);
      const billingHistory = months
        ? this.filterRecentBilling(allRecords, months)
        : allRecords;

      const finalMessage = await this.llmProvider.generateResponse(
        { count: billingHistory.length, months: months ?? 'all' },
        months
          ? months === 1
            ? 'Here are your past {{months}} month of billing records ({{count}} found):'
            : `Here are your past {{months}} months of billing records ({{count}} found):`
          : `Here are your billing records ({{count}} found):`,
      );

      return { intent, agents, finalMessage, stage: 'billing', billingHistory };
    }

    // Step 2/3: parallel fan-out to the core context-gathering agents.
    const [profile, analytics, plans] = await Promise.all([
      Promise.resolve(this.profileService.getProfile(dto.customerId)),
      Promise.resolve(this.analyticsService.getAnalytics(dto.customerId)),
      Promise.resolve(this.planService.getPlans(dto.customerId)),
    ]);

    const explicitPlan = this.resolveExplicitPlan(dto.message, plans);

    // Step 4: send aggregated context to the recommendation engine.
    const rankedPlans = this.recommendationService.rankPlans(analytics, plans);
    const bestPlan = explicitPlan ?? rankedPlans[0].plan;

    const recommendationContext = {
      ...this.recommendationService.buildRecommendationContext(
        analytics,
        bestPlan,
      ),
      customerName: profile.name,
    };

    const reason = explicitPlan
      ? `You asked for the ${bestPlan.name} plan, so I captured that selection for you.`
      : await this.llmProvider.generateResponse(
          recommendationContext,
          "Based on {{customerName}}'s usage of {{currentUsageGB}}GB out of {{currentLimitGB}}GB " +
            '({{usagePercent}}% consumed), the {{planName}} plan ({{planDataGB}}GB for ${{planPrice}}/mo) ' +
            'offers the best balance of coverage and value.',
        );

    const finalMessage = await this.llmProvider.generateResponse(
      { planName: bestPlan.name, planPrice: bestPlan.price },
      'I recommend the {{planName}} plan at ${{planPrice}}/mo. Would you like to proceed with this plan?',
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
        selectedPlan: explicitPlan ? { id: bestPlan.id, name: bestPlan.name } : undefined,
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
