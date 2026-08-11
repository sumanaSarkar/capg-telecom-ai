import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AutopilotService } from '../agents/autopilot/autopilot.service';
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
import type { ConversationMessage, ILlmProvider } from '../llm/llm-provider.interface';
import { LLM_PROVIDER } from '../llm/llm-provider.interface';
import { AskAction, AskDto } from './ask.dto';
import { TellyResponseTemplateService } from './telly-response-template.service';
import { CustomerIntelligenceService } from './customer-intelligence.service';
import { CustomPlanComposerService } from './custom-plan-composer.service';
import { DecisionEngineService } from './decision-engine.service';
import { RecommendationService } from './recommendation.service';

const MAX_FLOW_TRACES_PER_CUSTOMER = 5;

export interface AgentCommunicationStep {
  agent: string;
  action: string;
  detail: string;
  timestamp: string;
}

export interface AgentCommunicationTrace {
  customerId: string;
  request: string;
  intent: string;
  stage: OrchestratorStage;
  agents: string[];
  steps: AgentCommunicationStep[];
  response?: {
    finalMessage: string;
    recommendation?: OrchestratorResponse['recommendation'];
    availablePlans?: OrchestratorResponse['availablePlans'];
    rechargeOptions?: OrchestratorResponse['rechargeOptions'];
    roamingPackages?: OrchestratorResponse['roamingPackages'];
    paymentUrl?: string;
    paymentId?: string;
    billingHistory?: BillingRecord[];
  };
}

export type OrchestratorStage =
  | 'recommendation'
  | 'payment'
  | 'bill-payment'
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
  autopilot?: { enabled: boolean; action?: string };
  context?: Record<string, unknown>;
}

@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);
  private readonly communicationHistory: AgentCommunicationTrace[] = [];
  private readonly conversationHistoryByCustomer = new Map<string, ConversationMessage[]>();

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
    private readonly decisionEngineService: DecisionEngineService,
    private readonly customerIntelligenceService: CustomerIntelligenceService,
    private readonly customPlanComposerService: CustomPlanComposerService,
    private readonly autopilotService: AutopilotService,
    private readonly tellyResponseTemplateService: TellyResponseTemplateService,
  ) {}

  async ask(dto: AskDto): Promise<OrchestratorResponse> {
    const action: AskAction = dto.action ?? 'ask';

    // Step 1: detect intent & required agents via the LLM provider.
    const { intent, agents } = await this.llmProvider.detectIntent(dto.message);

    let response: OrchestratorResponse;

    if (action === 'confirm') {
      response = await this.handleConfirm(dto, intent, agents);
    } else if (action === 'payment_success') {
      response = await this.handlePaymentSuccess(dto, intent, agents);
    } else if (action === 'autopilot_enable') {
      this.autopilotService.enable(dto.customerId);
      response = { intent, agents, finalMessage: '✅ Telly Autopilot is now ON. I will automatically handle your bill payments and recharges on your behalf. You can disable this anytime.', stage: 'complete', autopilot: { enabled: true, action: 'enabled' } };
    } else if (action === 'autopilot_disable') {
      this.autopilotService.disable(dto.customerId);
      response = { intent, agents, finalMessage: '🔒 Telly Autopilot is now OFF. You are back in full control of all payments and recharges.', stage: 'complete', autopilot: { enabled: false, action: 'disabled' } };
    } else {
      response = await this.handleAsk(dto, intent, agents);
    }

    this.recordCommunicationTrace(dto, response);
    return response;
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

  private isPayBillRequest(message: string): boolean {
    return /\b(pay|clear|settle|make)\b.*\b(bill|invoice|due|pending|payment)\b/i.test(message) ||
      /\b(bill|invoice)\b.*\b(pay|clear|settle)\b/i.test(message) ||
      /\bpay\s+my\s+bill\b/i.test(message);
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

  private isTelecomRelatedRequest(message: string): boolean {
    const normalized = this.normalizeText(message);
    const telecomTerms = [
      'plan', 'plans', 'recharge', 'topup', 'billing', 'bill', 'invoice',
      'payment', 'pay', 'roaming', 'esim', 'sim', 'support', 'ticket',
      'profile', 'account', 'analytics', 'usage', 'data', 'call', 'minutes',
      'mobile', 'network', 'service', 'internet', 'bundle', 'package',
      'cheap', 'affordable', 'budget', 'travel', 'abroad', 'international',
      'stream', 'netflix', 'hotstar', 'ott', 'gaming', 'decide', 'manage',
      'set me up', 'set up', 'upgrade', 'recommend', 'suggest',
    ];
    return telecomTerms.some((term) => normalized.includes(term));
  }

  private isFollowUpConversationRequest(message: string): boolean {
    return /\b(what about|how about|tell me more|more about|can you|can u|could you|help me|what else|why|any updates|what happened|go on|continue)\b/i.test(message);
  }

  private isActionableTelecomRequest(message: string): boolean {
    return /\b(show|list|compare|recommend|suggest|recharge|top\s*up|pay|payment|billing|bill|invoice|history|plan|roaming|esim|activate|deactivate|support|ticket|profile|account|usage|manage|schedule|regular|interval|monthly|weekly|autopay|auto\s*debit|set\s*up|set\s*me\s*up|decide|travel|international|abroad|stream|netflix|hotstar|gaming|cheap|affordable|upgrade|bundle|package)\b/i.test(message);
  }

  private isRecurringPaymentOrRechargeRequest(message: string): boolean {
    const referencesPaymentOrRecharge = /\b(payment|pay|recharge|top\s*up)\b/i.test(message);
    const referencesRecurring = /\b(recurring|regular|schedule|scheduled|interval|monthly|weekly|autopay|auto\s*debit|automatic)\b/i.test(message);
    return referencesPaymentOrRecharge && referencesRecurring;
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

  getHistory(customerId: string): AgentCommunicationTrace[] {
    return this.communicationHistory
      .filter((trace) => trace.customerId === customerId)
      .slice(-MAX_FLOW_TRACES_PER_CUSTOMER);
  }

  clearHistory(customerId: string): void {
    const retained = this.communicationHistory.filter((trace) => trace.customerId !== customerId);
    this.communicationHistory.length = 0;
    this.communicationHistory.push(...retained);
    this.conversationHistoryByCustomer.delete(customerId);
  }

  private appendConversationTurn(customerId: string, message: ConversationMessage): void {
    const history = this.conversationHistoryByCustomer.get(customerId) ?? [];
    const nextHistory = [...history, message];
    const trimmed = nextHistory.slice(-12);
    this.conversationHistoryByCustomer.set(customerId, trimmed);
  }

  private getConversationMessages(customerId: string, latestMessage: string): ConversationMessage[] {
    const history = this.conversationHistoryByCustomer.get(customerId) ?? [];
    return [...history, { role: 'user', content: latestMessage }];
  }

  private recordCommunicationTrace(dto: AskDto, response: OrchestratorResponse) {
    const timestamp = new Date().toISOString();
    const steps: AgentCommunicationStep[] = [
      {
        agent: 'Orchestrator',
        action: 'Intent detected',
        detail: `Detected intent "${response.intent}" and selected agents: ${response.agents.join(', ') || 'none'}.`,
        timestamp,
      },
      ...response.agents.map((agent) => ({
        agent,
        action: 'Agent engaged',
        detail: `Agent ${agent} handled the request.`,
        timestamp,
      })),
      {
        agent: 'LLM',
        action: 'Generated response',
        detail: 'LLM generated the final assistant response.',
        timestamp,
      },
    ];

    this.communicationHistory.push({
      customerId: dto.customerId,
      request: dto.message,
      intent: response.intent,
      stage: response.stage,
      agents: response.agents,
      steps,
      response: {
        finalMessage: response.finalMessage,
        recommendation: response.recommendation,
        availablePlans: response.availablePlans,
        rechargeOptions: response.rechargeOptions,
        roamingPackages: response.roamingPackages,
        paymentUrl: response.paymentUrl,
        paymentId: response.paymentId,
        billingHistory: response.billingHistory,
      },
    });

    const customerHistoryIndexes = this.communicationHistory
      .map((trace, index) => (trace.customerId === dto.customerId ? index : -1))
      .filter((index) => index >= 0);

    const overflowCount = customerHistoryIndexes.length - MAX_FLOW_TRACES_PER_CUSTOMER;
    if (overflowCount <= 0) {
      return;
    }

    for (let i = 0; i < overflowCount; i += 1) {
      const indexToRemove = customerHistoryIndexes[i] - i;
      this.communicationHistory.splice(indexToRemove, 1);
    }
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

  private getRequestedBillingCount(message: string): number | undefined {
    if (/\b(?:last|past|previous)\s+bill\b/i.test(message)) {
      return 1;
    }

    const billsMatch = message.match(
      /\b(?:last|past|previous|show|give|fetch|get)\s+(\d+)\s+(?:bills?|invoices?|records?|statements?)\b/i,
    );
    if (billsMatch) {
      return parseInt(billsMatch[1], 10);
    }

    const looseBillsMatch = message.match(/\b(\d+)\s+(?:bills?|invoices?)\b/i);
    return looseBillsMatch ? parseInt(looseBillsMatch[1], 10) : undefined;
  }

  private async handleAsk(
    dto: AskDto,
    intent: string,
    agents: string[],
  ): Promise<OrchestratorResponse> {
    const hasExistingConversation = (this.conversationHistoryByCustomer.get(dto.customerId) ?? []).length > 0;
    const isTelecomRelated = this.isTelecomRelatedRequest(dto.message);
    const isFollowUp = this.isFollowUpConversationRequest(dto.message);
    const isActionableTelecom = this.isActionableTelecomRequest(dto.message);
    const shouldUseConversationChat =
      !isTelecomRelated ||
      (hasExistingConversation && isFollowUp && !isActionableTelecom);

    if (shouldUseConversationChat) {
      const finalMessage = await this.llmProvider.chat(
        this.getConversationMessages(dto.customerId, dto.message),
      );
      this.appendConversationTurn(dto.customerId, { role: 'user', content: dto.message });
      this.appendConversationTurn(dto.customerId, { role: 'assistant', content: finalMessage });
      return { intent, agents, finalMessage, stage: 'complete' };
    }

    if (this.isPayBillRequest(dto.message)) {
      return this.handlePayBill(dto, intent, agents);
    }

    if (this.isCurrentPlanRequest(dto.message)) {
      const profile = this.profileService.getProfile(dto.customerId);
      const currentPlan = this.planService.getPlans(dto.customerId).find((plan) => plan.name === profile.plan);

      const finalMessage = currentPlan
        ? `Your current plan is ${currentPlan.name} at $${currentPlan.price.toFixed(2)}/mo. If you want to compare options, I can show all available plans.`
        : `Your current plan is ${profile.plan}. If you want to compare options, I can show all available plans.`;

      this.appendConversationTurn(dto.customerId, { role: 'user', content: dto.message });
      this.appendConversationTurn(dto.customerId, { role: 'assistant', content: finalMessage });

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

    if (this.isRecurringPaymentOrRechargeRequest(dto.message)) {
      const finalMessage = await this.llmProvider.generateResponse(
        {},
        'I can help you make one-time payments and recharges whenever you ask, but automatic recurring recharge/payment scheduling is not available in this demo yet. If you want, I can start a recharge now.',
      );

      this.appendConversationTurn(dto.customerId, { role: 'user', content: dto.message });
      this.appendConversationTurn(dto.customerId, { role: 'assistant', content: finalMessage });

      return {
        intent,
        agents,
        finalMessage,
        stage: 'complete',
      };
    }

    if (this.isAvailablePlansRequest(dto.message)) {
      const availablePlans = this.planService.getPlans(dto.customerId);
      const finalMessage = await this.llmProvider.generateResponse(
        { count: availablePlans.length },
        'Here are all {{count}} available plans:',
      );

      this.appendConversationTurn(dto.customerId, { role: 'user', content: dto.message });
      this.appendConversationTurn(dto.customerId, { role: 'assistant', content: finalMessage });

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

      this.appendConversationTurn(dto.customerId, { role: 'user', content: dto.message });
      this.appendConversationTurn(dto.customerId, { role: 'assistant', content: finalMessage });

      return {
        intent,
        agents,
        finalMessage,
        stage: 'recharge-options',
        rechargeOptions,
      };
    }

    if (this.isRoamingPackagesRequest(dto.message)) {
      const roamingPackages = this.roamingService.getRoamingPackages(dto.customerId);
      const finalMessage = await this.llmProvider.generateResponse(
        { count: roamingPackages.length },
        'Here are all {{count}} available roaming packages for your account:',
      );

      this.appendConversationTurn(dto.customerId, { role: 'user', content: dto.message });
      this.appendConversationTurn(dto.customerId, { role: 'assistant', content: finalMessage });

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
      const billingCount = this.getRequestedBillingCount(dto.message);
      const allRecords = this.billingService.getBillingHistory(dto.customerId);
      const billingHistory = billingCount
        ? this.filterRecentBilling(allRecords, billingCount)
        : months
          ? this.filterRecentBilling(allRecords, months)
          : allRecords;

      const finalMessage = await this.llmProvider.generateResponse(
        { count: billingHistory.length, months: months ?? 'all', billingCount: billingCount ?? 'all' },
        billingCount
          ? billingCount === 1
            ? 'Here is your last {{billingCount}} billing record ({{count}} found):'
            : 'Here are your last {{billingCount}} billing records ({{count}} found):'
          : months
            ? months === 1
              ? 'Here are your past {{months}} month of billing records ({{count}} found):'
              : `Here are your past {{months}} months of billing records ({{count}} found):`
            : `Here are your billing records ({{count}} found):`,
      );

      this.appendConversationTurn(dto.customerId, { role: 'user', content: dto.message });
      this.appendConversationTurn(dto.customerId, { role: 'assistant', content: finalMessage });

      return { intent, agents, finalMessage, stage: 'billing', billingHistory };
    }

    // Step 2/3: parallel fan-out to the core context-gathering agents.
    const [profile, analytics, plans] = await Promise.all([
      Promise.resolve(this.profileService.getProfile(dto.customerId)),
      Promise.resolve(this.analyticsService.getAnalytics(dto.customerId)),
      Promise.resolve(this.planService.getPlans(dto.customerId)),
    ]);

    const billingHistory = this.billingService.getBillingHistory(dto.customerId);
    const intelligence = this.customerIntelligenceService.analyzeCustomer(
      profile,
      analytics,
      billingHistory,
    );

    // Compose a hyper-personalised plan from components rather than picking a static one.
    const customPlan = this.customPlanComposerService.compose(
      dto.message,
      profile,
      analytics,
      intelligence,
    );

    // Keep ranked plans for context / fallback reference but don't use them as the offer.
    const rankedPlans = this.recommendationService.rankPlans(analytics, plans);

    const reason = [
      customPlan.discountNote ?? intelligence.exclusiveOfferHint,
      intelligence.motivation,
    ]
      .filter(Boolean)
      .join(' ');

    const componentList = customPlan.components
      .map((c) => `${c.name} (₹${c.monthlyPrice}/mo)`)
      .join(', ');

    const finalMessage = this.tellyResponseTemplateService.buildRecommendationMessage({
      message: dto.message,
      customerName: profile.name,
      customPlan,
      intelligence,
    });

    this.appendConversationTurn(dto.customerId, { role: 'user', content: dto.message });
    this.appendConversationTurn(dto.customerId, { role: 'assistant', content: finalMessage });

    return {
      intent,
      agents,
      recommendation: { plan: customPlan as unknown as Plan, reason },
      finalMessage,
      stage: 'recommendation',
      context: {
        profile,
        analytics,
        customPlan,
        rankedPlans: rankedPlans.map((r) => ({
          planId: r.plan.id,
          score: r.score,
        })),
        customerIntelligence: {
          segment: intelligence.segment,
          priceSensitivity: intelligence.priceSensitivity,
          motivation: intelligence.motivation,
          expectedOfferStyle: intelligence.expectedOfferStyle,
          historicalSignals: intelligence.historicalSignals,
          exclusiveOfferHint: intelligence.exclusiveOfferHint,
        },
      },
    };
  }

  private async handlePayBill(
    dto: AskDto,
    intent: string,
    agents: string[],
  ): Promise<OrchestratorResponse> {
    const allRecords = this.billingService.getBillingHistory(dto.customerId);
    const pendingBills = allRecords.filter((r) => r.status === 'pending');
    const autopilotEnabled = this.autopilotService.isEnabled(dto.customerId);

    if (pendingBills.length === 0) {
      const finalMessage = 'Great news — you have no pending bills! All your payments are up to date.';
      this.appendConversationTurn(dto.customerId, { role: 'user', content: dto.message });
      this.appendConversationTurn(dto.customerId, { role: 'assistant', content: finalMessage });
      return { intent, agents, finalMessage, stage: 'complete', billingHistory: allRecords };
    }

    const bill = pendingBills[0];

    if (autopilotEnabled) {
      // Autopilot ON: Telly pays without asking for confirmation.
      const payment = this.paymentService.initiatePayment(dto.customerId, bill.id, bill.amount);
      this.paymentService.confirmPayment(payment.paymentId);
      const billingRecord = this.billingService.recordTransaction(dto.customerId, bill.id, bill.amount);
      const finalMessage = `✅ Telly Autopilot paid your pending bill of $${bill.amount.toFixed(2)} for "${bill.description}" automatically. Receipt recorded. You are all caught up!`;
      this.appendConversationTurn(dto.customerId, { role: 'user', content: dto.message });
      this.appendConversationTurn(dto.customerId, { role: 'assistant', content: finalMessage });
      return {
        intent,
        agents,
        finalMessage,
        stage: 'complete',
        billingHistory: allRecords,
        autopilot: { enabled: true, action: 'auto-paid' },
        context: { billingRecord, payment },
      };
    }

    // Autopilot OFF: show payment link and ask user to confirm.
    const payment = this.paymentService.initiatePayment(dto.customerId, bill.id, bill.amount);
    const finalMessage = `You have a pending bill of $${bill.amount.toFixed(2)} for "${bill.description}". I have prepared the payment link below. Complete it and confirm when done.`;
    this.appendConversationTurn(dto.customerId, { role: 'user', content: dto.message });
    this.appendConversationTurn(dto.customerId, { role: 'assistant', content: finalMessage });
    return {
      intent,
      agents,
      finalMessage,
      stage: 'bill-payment',
      paymentUrl: payment.paymentUrl,
      paymentId: payment.paymentId,
      billingHistory: pendingBills,
      autopilot: { enabled: false },
      context: { pendingBill: bill },
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
