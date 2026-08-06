import { AnalyticsService } from '../agents/analytics/analytics.service';
import { BillingService } from '../agents/billing/billing.service';
import { PaymentService } from '../agents/payment/payment.service';
import { PlanService } from '../agents/plan/plan.service';
import { ProfileService } from '../agents/profile/profile.service';
import { RechargeService } from '../agents/recharge/recharge.service';
import { RoamingService } from '../agents/roaming/roaming.service';
import { ILlmProvider } from '../llm/llm-provider.interface';
import { OrchestratorService } from './orchestrator.service';
import { RecommendationService } from './recommendation.service';

describe('OrchestratorService', () => {
  let orchestrator: OrchestratorService;
  let llmProvider: ILlmProvider;
  let detectIntentMock: jest.Mock;
  let profileService: ProfileService;
  let analyticsService: AnalyticsService;
  let planService: PlanService;
  let paymentService: PaymentService;
  let rechargeService: RechargeService;
  let roamingService: RoamingService;
  let billingService: BillingService;

  beforeEach(() => {
    detectIntentMock = jest.fn().mockResolvedValue({
      intent: 'plan_analytics_profile_inquiry',
      agents: ['profile', 'analytics', 'plan'],
      confidence: 0.9,
    });

    llmProvider = {
      detectIntent: detectIntentMock,
      generateResponse: jest.fn().mockResolvedValue('Generated response text'),
    };

    profileService = new ProfileService();
    analyticsService = new AnalyticsService();
    planService = new PlanService();
    paymentService = new PaymentService();
    rechargeService = new RechargeService();
    roamingService = new RoamingService();
    billingService = new BillingService();

    orchestrator = new OrchestratorService(
      llmProvider,
      profileService,
      analyticsService,
      planService,
      paymentService,
      rechargeService,
      roamingService,
      billingService,
      new RecommendationService(),
    );
  });

  it('detects intent and fans out to profile/analytics/plan agents in parallel for a plan request', async () => {
    const profileSpy = jest.spyOn(profileService, 'getProfile');
    const analyticsSpy = jest.spyOn(analyticsService, 'getAnalytics');
    const planSpy = jest.spyOn(planService, 'getPlans');

    const result = await orchestrator.ask({
      message: 'Suggest the best data plan and recharge it',
      customerId: 'cust-001',
    });

    expect(detectIntentMock).toHaveBeenCalledWith(
      'Suggest the best data plan and recharge it',
    );
    expect(profileSpy).toHaveBeenCalledWith('cust-001');
    expect(analyticsSpy).toHaveBeenCalledWith('cust-001');
    expect(planSpy).toHaveBeenCalledWith('cust-001');

    expect(result.stage).toBe('recommendation');
    expect(result.intent).toBe('plan_analytics_profile_inquiry');
    expect(result.agents).toEqual(['profile', 'analytics', 'plan']);
    expect(result.recommendation).toBeDefined();
    expect(result.recommendation?.plan).toBeDefined();
    expect(result.finalMessage).toBe('Generated response text');
  });

  it('returns the current plan without a recharge prompt', async () => {
    const result = await orchestrator.ask({
      message: 'What is my current plan?',
      customerId: 'cust-001',
    });

    expect(result.stage).toBe('complete');
    expect(result.finalMessage).toContain('Your current plan is Basic 5GB');
    expect(result.finalMessage.toLowerCase()).not.toContain('recharge');
  });

  it('returns all available plans when the user asks for available plans', async () => {
    const result = await orchestrator.ask({
      message: 'Show all available plans',
      customerId: 'cust-001',
    });

    expect(result.stage).toBe('plans');
    expect(result.availablePlans).toHaveLength(3);
    expect(result.finalMessage).toBe('Here are all 3 available plans:');
  });

  it('returns recharge options without a recommendation card when the user asks for recharge options', async () => {
    const result = await orchestrator.ask({
      message: 'Show available recharge options',
      customerId: 'cust-001',
    });

    expect(result.stage).toBe('recharge-options');
    expect(result.rechargeOptions).toHaveLength(3);
    expect(result.finalMessage).toBe('Here are all 3 available recharge options:');
  });

  it('returns roaming packages when the user asks for roaming packages', async () => {
    const result = await orchestrator.ask({
      message: 'Show available roaming packages',
      customerId: 'cust-001',
    });

    expect(result.stage).toBe('roaming-packages');
    expect(result.roamingPackages).toHaveLength(3);
    expect(result.finalMessage).toBe('Here are all 3 available roaming packages:');
  });

  it('returns the requested number of billing months', async () => {
    const result = await orchestrator.ask({
      message: 'Show my last 3 months bill',
      customerId: 'cust-001',
    });

    expect(result.stage).toBe('billing');
    expect(result.billingHistory).toHaveLength(3);
    expect(result.finalMessage).toBe('Here are your past 3 months of billing records (3 found):');
  });

  it('returns the last month of billing when the user asks for last month', async () => {
    const result = await orchestrator.ask({
      message: 'My last month bill',
      customerId: 'cust-001',
    });

    expect(result.stage).toBe('billing');
    expect(result.billingHistory).toHaveLength(1);
    expect(result.finalMessage).toBe('Here are your past 1 month of billing records (1 found):');
  });

  it('captures an explicitly named plan in the recharge request', async () => {
    const result = await orchestrator.ask({
      message: 'Recharge with premium unlimited one',
      customerId: 'cust-001',
    });

    expect(result.stage).toBe('recommendation');
    expect(result.recommendation?.plan).toMatchObject({
      name: 'Premium Unlimited',
    });
    expect(result.context?.selectedPlan).toMatchObject({
      name: 'Premium Unlimited',
    });
    expect(result.finalMessage).toContain('Premium Unlimited');
  });

  it('moves to the payment stage when the user confirms a plan', async () => {
    const result = await orchestrator.ask({
      message: 'Yes please proceed',
      customerId: 'cust-001',
      action: 'confirm',
      planId: 'plan-002',
    });

    expect(result.stage).toBe('payment');
    expect(result.paymentId).toBeDefined();
    expect(result.paymentUrl).toContain('https://pay.example.com');
  });

  it('completes the flow after payment success, applying recharge and billing', async () => {
    const payment = paymentService.initiatePayment(
      'cust-001',
      'plan-002',
      49.99,
    );
    const rechargeSpy = jest.spyOn(rechargeService, 'applyRecharge');
    const billingSpy = jest.spyOn(billingService, 'recordTransaction');

    const result = await orchestrator.ask({
      message: 'Payment done',
      customerId: 'cust-001',
      action: 'payment_success',
      planId: 'plan-002',
      paymentId: payment.paymentId,
    });

    expect(rechargeSpy).toHaveBeenCalledWith('cust-001', 'plan-002');
    expect(billingSpy).toHaveBeenCalledWith('cust-001', 'plan-002', 49.99);
    expect(result.stage).toBe('complete');
    expect(result.finalMessage).toBe('Generated response text');
  });
});
