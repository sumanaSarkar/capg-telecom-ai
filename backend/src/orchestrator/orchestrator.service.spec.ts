import { AnalyticsService } from '../agents/analytics/analytics.service';
import { BillingService } from '../agents/billing/billing.service';
import { PaymentService } from '../agents/payment/payment.service';
import { PlanService } from '../agents/plan/plan.service';
import { ProfileService } from '../agents/profile/profile.service';
import { RechargeService } from '../agents/recharge/recharge.service';
import { RoamingService } from '../agents/roaming/roaming.service';
import { ILlmProvider } from '../llm/llm-provider.interface';
import { CustomerIntelligenceService } from './customer-intelligence.service';
import { CustomPlanComposerService } from './custom-plan-composer.service';
import { DecisionEngineService } from './decision-engine.service';
import { OrchestratorService } from './orchestrator.service';
import { RecommendationService } from './recommendation.service';
import { TellyResponseTemplateService } from './telly-response-template.service';

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
      generateResponse: jest.fn().mockImplementation(async (context: object, template: string) =>
        template.replace(/{{\s*([\w.]+)\s*}}/g, (_match, path: string) => {
          const value = path.split('.').reduce<unknown>(
            (acc, key) =>
              acc && typeof acc === 'object' ? (acc as Record<string, unknown>)[key] : undefined,
            context,
          );

          if (value === undefined || value === null) return '';
          if (
            typeof value === 'string' ||
            typeof value === 'number' ||
            typeof value === 'boolean'
          ) {
            return String(value);
          }

          return JSON.stringify(value);
        }),
      ),
      chat: jest.fn().mockResolvedValue('I can help with that.'),
      humanize: jest.fn().mockImplementation(async (draft: string) => draft),
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
      new DecisionEngineService(),
      new CustomerIntelligenceService(),
      new CustomPlanComposerService(),
      undefined as never, // AutopilotService — not needed for these unit tests
      new TellyResponseTemplateService(),
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
    // Telly now composes a custom plan rather than picking a static one
    const customPlan = (result.recommendation?.plan as Record<string, unknown>);
    expect(customPlan.isCustom).toBe(true);
    expect(typeof customPlan.name).toBe('string');
    expect(result.finalMessage).toContain('Personalised');
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

  it('answers greeting-prefixed eSIM status questions without a plan recommendation', async () => {
    const result = await orchestrator.ask({
      message: 'Hi Telly my esim disabled?',
      customerId: 'cust-001',
    });

    expect(result.recommendation).toBeUndefined();
    expect(result.context?.esimStatus).toMatchObject({ active: false });
    expect(result.finalMessage).toContain('eSIM is currently disabled');
  });

  it('preserves eSIM context when the customer follows status with activation', async () => {
    const status = await orchestrator.ask({
      message: 'Is my eSIM enabled?',
      customerId: 'cust-001',
    });

    expect(status.context?.esimStatus).toMatchObject({ active: false });

    const activation = await orchestrator.ask({
      message: 'Ok please activate it',
      customerId: 'cust-001',
    });

    expect(activation.stage).toBe('complete');
    expect(activation.finalMessage).toContain('device ID');
    expect(activation.context).toMatchObject({
      pendingAction: 'esim_activation',
      required: 'deviceId',
    });
    expect(activation.recommendation).toBeUndefined();

    const guidance = await orchestrator.ask({
      message: 'Ok tell my device ID',
      customerId: 'cust-001',
    });

    expect(guidance.finalMessage).toContain('Sorry, I cannot read your device ID');
    expect(guidance.finalMessage).toContain('Settings > About phone');
    expect(guidance.finalMessage).toContain('Settings > General > About');
    expect(guidance.context).toMatchObject({
      pendingAction: 'esim_activation',
      guidanceProvided: true,
    });

    const activated = await orchestrator.ask({
      message: 'device Pixel-8',
      customerId: 'cust-001',
    });

    expect(activated.finalMessage).toContain('enabled on device Pixel-8');
    expect(activated.context?.esimStatus).toMatchObject({
      active: true,
      deviceId: 'Pixel-8',
    });
  });

  it('uses previous turns when answering follow-up chat prompts', async () => {
    const chatMock = jest.fn().mockResolvedValue('I can help with that.');
    llmProvider = {
      detectIntent: detectIntentMock,
      generateResponse: jest.fn().mockResolvedValue(''),
      chat: chatMock,
      humanize: jest.fn().mockImplementation(async (draft: string) => draft),
    };
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
      new DecisionEngineService(),
    );

    await orchestrator.ask({
      message: 'Hello there',
      customerId: 'cust-001',
    });

    await orchestrator.ask({
      message: 'What about that?',
      customerId: 'cust-001',
    });

    expect(chatMock).toHaveBeenLastCalledWith(
      expect.arrayContaining([
        { role: 'user', content: 'Hello there' },
        { role: 'assistant', content: 'I can help with that.' },
        { role: 'user', content: 'What about that?' },
      ]),
    );
  });

  it('uses conversational chat for unrelated requests', async () => {
    const result = await orchestrator.ask({
      message: 'pasta recipe',
      customerId: 'cust-001',
    });

    expect(result.stage).toBe('complete');
    expect(result.finalMessage).toBe('I can help with that.');
  });

  it('builds a custom telecom recommendation for lifestyle-based needs that do not mention telecom terms explicitly', async () => {
    const result = await orchestrator.ask({
      message: 'I need something that keeps everyone connected for work, entertainment, and travel.',
      customerId: 'cust-001',
    });

    expect(result.stage).toBe('recommendation');
    expect(result.recommendation).toBeDefined();
    expect(result.finalMessage).toMatch(/Telly|plan|bundle|connected/i);
  });

  it('creates a Japan-specific travel plan when Japan is named', async () => {
    const result = await orchestrator.ask({
      message: 'I am going to Japan, what is the recharge plan for 10 days?',
      customerId: 'cust-001',
    });

    const plan = result.recommendation?.plan as { name: string; components: Array<{ name: string }> };
    expect(plan.name).toBe('Telly Japan Travel Plan');
    expect(plan.components.some((component) => component.name === 'Japan Roaming Pass')).toBe(true);
    expect(result.finalMessage).toMatch(/Japan/i);
  });

  it('creates a China-specific travel plan instead of generic recharge options', async () => {
    const result = await orchestrator.ask({
      message: 'I want to visit China for 12 days and need recharge options for calling and data',
      customerId: 'cust-001',
    });

    const plan = result.recommendation?.plan as { name: string; components: Array<{ name: string }> };
    expect(result.stage).toBe('recommendation');
    expect(plan.name).toBe('Telly China Travel Plan');
    expect(plan.components.some((component) => component.name === 'China Travel Roaming Pack')).toBe(true);
    expect(result.finalMessage).toMatch(/China/i);
  });

  it('creates a personalized Manila plan instead of showing generic catalog plans', async () => {
    const result = await orchestrator.ask({
      message: 'I am visiting Manila for 9 days, show me recharge plans',
      customerId: 'cust-001',
    });

    const plan = result.recommendation?.plan as { name: string; components: Array<{ name: string; description: string }> };
    expect(result.stage).toBe('recommendation');
    expect(plan.name).toBe('Telly Manila Travel Plan');
    expect(plan.components.some((component) => component.name === 'Manila Travel Roaming Pack')).toBe(true);
    expect(plan.components.some((component) => /Manila|Philippines/i.test(component.description))).toBe(true);
    expect(result.finalMessage).toMatch(/Manila/i);
    expect(result.finalMessage).toMatch(/Alex/i);
  });

  it.each([
    ['Hawaii', 'Telly USA Hawaii Travel Plan', 'USA Hawaii Travel Roaming Pack', /USA|Hawaii/i],
    ['Sydney', 'Telly Australia Sydney Travel Plan', 'Australia Sydney Travel Roaming Pack', /Australia|Sydney/i],
    ['Austria', 'Telly Europe Austria Travel Plan', 'Europe Austria Travel Roaming Pack', /Europe|Austria/i],
    ['Liverpool', 'Telly UK Liverpool Travel Plan', 'UK Liverpool Travel Roaming Pack', /UK|Liverpool/i],
  ])('maps %s to the expected travel region', async (destination, planName, componentName, outputPattern) => {
    const result = await orchestrator.ask({
      message: `I am visiting ${destination} for 10 days, show me recharge plans`,
      customerId: 'cust-001',
    });

    const plan = result.recommendation?.plan as { name: string; components: Array<{ name: string }> };
    expect(plan.name).toBe(planName);
    expect(plan.components.some((component) => component.name === componentName)).toBe(true);
    expect(result.finalMessage).toMatch(outputPattern);
  });

  it('keeps actionable telecom follow-ups out of generic chat fallback', async () => {
    await orchestrator.ask({
      message: 'pasta recipe',
      customerId: 'cust-001',
    });

    const result = await orchestrator.ask({
      message: 'in telecom can u manage my payment and recharge on regular intervals',
      customerId: 'cust-001',
    });

    expect(result.stage).toBe('complete');
    expect(result.finalMessage.toLowerCase()).toContain('automatic recurring recharge/payment scheduling is not available');
    expect(llmProvider.chat).toHaveBeenCalledTimes(1);
  });

  it('responds clearly to recurring payment or recharge requests', async () => {
    const result = await orchestrator.ask({
      message: 'Can you schedule my recharge every month with auto payment?',
      customerId: 'cust-001',
    });

    expect(result.stage).toBe('complete');
    expect(result.finalMessage.toLowerCase()).toContain('one-time payments and recharges');
    expect(result.finalMessage.toLowerCase()).toContain('not available in this demo yet');
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
    expect(result.finalMessage).toBe('Here are all 3 available roaming packages for your account:');
  });

  it('returns the requested number of billing months', async () => {
    detectIntentMock.mockResolvedValueOnce({
      intent: 'billing_inquiry',
      agents: ['billing'],
      confidence: 0.9,
    });

    const result = await orchestrator.ask({
      message: 'Show my last 3 months bill',
      customerId: 'cust-001',
    });

    expect(result.stage).toBe('billing');
    expect(result.billingHistory).toHaveLength(3);
    expect(result.finalMessage).toBe('Here are your past 3 months of billing records (3 found):');
  });

  it('returns the requested number of billing records for bill-count phrasing', async () => {
    detectIntentMock.mockResolvedValueOnce({
      intent: 'billing_inquiry',
      agents: ['billing'],
      confidence: 0.9,
    });

    const result = await orchestrator.ask({
      message: 'show my last 2 bills',
      customerId: 'cust-001',
    });

    expect(result.stage).toBe('billing');
    expect(result.billingHistory).toHaveLength(2);
    expect(result.finalMessage).toBe('Here are your last 2 billing records (2 found):');
  });

  it('returns the last month of billing when the user asks for last month', async () => {
    detectIntentMock.mockResolvedValueOnce({
      intent: 'billing_inquiry',
      agents: ['billing'],
      confidence: 0.9,
    });

    const result = await orchestrator.ask({
      message: 'My last month bill',
      customerId: 'cust-001',
    });

    expect(result.stage).toBe('billing');
    expect(result.billingHistory).toHaveLength(1);
    expect(result.finalMessage).toBe('Here are your past 1 month of billing records (1 found):');
  });

  it('captures an explicitly named plan in the recharge request and returns a custom plan', async () => {
    const result = await orchestrator.ask({
      message: 'Recharge with premium unlimited one',
      customerId: 'cust-001',
    });

    expect(result.stage).toBe('recommendation');
    const plan = result.recommendation?.plan as Record<string, unknown>;
    expect(plan.isCustom).toBe(true);
    expect(result.finalMessage).toContain('Personalised');
  });

  it('builds a hyper-personalised custom bundle for multi-intent telecom requests', async () => {
    const result = await orchestrator.ask({
      message: 'I need unlimited calls, roaming for Europe, and Netflix for my family. Please suggest a package.',
      customerId: 'cust-001',
    });

    expect(result.stage).toBe('recommendation');
    const plan = result.recommendation?.plan as Record<string, unknown>;
    expect(plan.isCustom).toBe(true);
    expect(Array.isArray(plan.components)).toBe(true);
    expect(result.context?.customPlan).toBeDefined();
    expect(result.context?.customerIntelligence).toBeDefined();
    // composed plan name is set by the decision engine based on detected segment
    expect(typeof (plan.name as string)).toBe('string');
    expect((plan.name as string).startsWith('Telly')).toBe(true);
  });

  it('creates a destination-specific Kenya roaming offer without unrelated gaming', async () => {
    const result = await orchestrator.ask({
      message: 'Find a package for unlimited data in Kenya with Jio Hotstar',
      customerId: 'cust-001',
    });

    const plan = result.recommendation?.plan as {
      components: Array<{ name: string; description: string }>;
    };
    const componentNames = plan.components.map((component) => component.name);
    const kenya = plan.components.find((component) => component.name === 'Kenya Roaming Pass');

    expect(componentNames).toContain('Kenya Roaming Pass');
    expect(componentNames).toContain('JioHotstar Subscription');
    expect(componentNames.some((name) => name.includes('Gaming'))).toBe(false);
    expect(kenya?.description).toContain('incoming calls ₹8/min');
    expect(kenya?.description).toContain('outgoing calls ₹15/min');
  });

  it('never adds Gaming Turbo to a Bhutan OTT request unless gaming is requested', async () => {
    const result = await orchestrator.ask({
      message: 'Find a package in Bhutan with 50GB data unlimited call and can watch SonyLIV',
      customerId: 'cust-003',
    });

    const plan = result.recommendation?.plan as {
      name: string;
      components: Array<{ name: string; description: string }>;
    };
    const componentNames = plan.components.map((component) => component.name);

    expect(plan.name).toBe('Telly Bhutan Roaming Plan');
    expect(componentNames).toContain('Bhutan Roaming Pass');
    expect(componentNames).toContain('SonyLIV Subscription');
    expect(componentNames.some((name) => /gaming|game/i.test(name))).toBe(false);
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
    expect(billingSpy).toHaveBeenCalledWith('cust-001', 'plan-002', 59.99);
    expect(result.stage).toBe('complete');
    expect(result.finalMessage).toContain('Standard 20GB plan has been activated');
  });

  it('retains only the last 5 communication traces per customer', async () => {
    for (let i = 0; i < 7; i += 1) {
      await orchestrator.ask({
        message: `Show all available plans ${i}`,
        customerId: 'cust-001',
      });
    }

    const history = orchestrator.getHistory('cust-001');
    expect(history).toHaveLength(5);
    expect(history[0].request).toContain('2');
    expect(history[4].request).toContain('6');
  });

  it('clears communication traces for a customer', async () => {
    await orchestrator.ask({
      message: 'Show all available plans',
      customerId: 'cust-001',
    });

    expect(orchestrator.getHistory('cust-001').length).toBeGreaterThan(0);

    orchestrator.clearHistory('cust-001');

    expect(orchestrator.getHistory('cust-001')).toHaveLength(0);
  });
});
