import { AnalyticsService } from '../agents/analytics/analytics.service';
import { BillingService } from '../agents/billing/billing.service';
import { PaymentService } from '../agents/payment/payment.service';
import { PlanService } from '../agents/plan/plan.service';
import { ProfileService } from '../agents/profile/profile.service';
import { RechargeService } from '../agents/recharge/recharge.service';
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
    billingService = new BillingService();

    orchestrator = new OrchestratorService(
      llmProvider,
      profileService,
      analyticsService,
      planService,
      paymentService,
      rechargeService,
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
