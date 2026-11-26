import { AnalyticsService } from '../agents/analytics/analytics.service';
import { AutopilotService } from '../agents/autopilot/autopilot.service';
import { BillingService } from '../agents/billing/billing.service';
import { PaymentService } from '../agents/payment/payment.service';
import { PlanService } from '../agents/plan/plan.service';
import { ProfileService } from '../agents/profile/profile.service';
import { RechargeService } from '../agents/recharge/recharge.service';
import { RoamingService } from '../agents/roaming/roaming.service';
import { SupportService } from '../agents/support/support.service';
import { ILlmProvider } from '../llm/llm-provider.interface';
import { ConsultativeFlowService } from './consultative-flow.service';
import { CustomerIntelligenceService } from './customer-intelligence.service';
import { CustomPlanComposerService } from './custom-plan-composer.service';
import { CurrencyRateService } from './currency-rate.service';
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
  let autopilotService: AutopilotService;

  const createCustomPlanComposer = () => {
    const currencyRateService = new CurrencyRateService();
    jest.spyOn(currencyRateService, 'getInrToCurrencyRate').mockImplementation(async (currency) => ({
      rate: currency === 'EUR' ? 0.01 : 1.71,
      date: '2026-11-25',
    }));
    return new CustomPlanComposerService(currencyRateService);
  };

  const createSupportEnabledOrchestrator = (supportService: SupportService) =>
    new OrchestratorService(
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
      createCustomPlanComposer(),
      undefined as never,
      new TellyResponseTemplateService(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      new ConsultativeFlowService(),
      supportService,
    );

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
    autopilotService = new AutopilotService();

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
      createCustomPlanComposer(),
      autopilotService,
      new TellyResponseTemplateService(),
    );
  });

  it('enables demo Autopilot for both bills and recharges on an explicit setup request', async () => {
    const result = await orchestrator.ask({
      message: 'Please do that automatic payment setup',
      customerId: 'cust-001',
    });

    expect(autopilotService.getSettings('cust-001')).toMatchObject({
      enabled: true,
      autoPayBills: true,
      autoRecharge: true,
    });
    expect(result.autopilot).toMatchObject({ enabled: true, action: 'enabled' });
    expect(result.finalMessage).toMatch(/demo autopilot is on/i);
    expect(result.finalMessage).toMatch(/does not charge real money/i);
  });

  it('does not enable Autopilot when the customer only asks to pay one bill', async () => {
    const result = await orchestrator.ask({
      message: 'Yes, please proceed with paying the bill',
      customerId: 'cust-001',
    });

    expect(autopilotService.isEnabled('cust-001')).toBe(false);
    expect(result.stage).toBe('bill-payment');
  });

  it('marks the pending bill paid in the demo when Autopilot processes it', async () => {
    autopilotService.enable('cust-001');

    const result = await orchestrator.ask({
      message: 'Pay my pending bill',
      customerId: 'cust-001',
    });

    expect(result.stage).toBe('complete');
    expect(result.finalMessage).toMatch(/no real payment was taken/i);
    expect(result.billingHistory?.find((record) => record.id === 'bill-006')?.status).toBe('paid');
  });

  it('detects intent and fans out to profile/analytics/plan agents in parallel for a plan request', async () => {
    const profileSpy = jest.spyOn(profileService, 'getProfile');
    const analyticsSpy = jest.spyOn(analyticsService, 'getAnalytics');
    const planSpy = jest.spyOn(planService, 'getPlans');

    const result = await orchestrator.ask({
      message: 'Suggest the best plan for my family of four with 30GB of data, unlimited calls, and a $500 monthly budget, then recharge it',
      customerId: 'cust-001',
    });

    expect(detectIntentMock).toHaveBeenCalledWith(
      'Suggest the best plan for my family of four with 30GB of data, unlimited calls, and a $500 monthly budget, then recharge it',
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
    expect(customPlan.currency).toBe('USD');
    expect(result.finalMessage).not.toContain('₹');
    expect(result.finalMessage).toContain('$');
    expect(result.finalMessage).toContain('Personalised');
  });

  it('uses the exact requested catalog plan and does not start an unsupported future activation', async () => {
    const initiatePaymentSpy = jest.spyOn(paymentService, 'initiatePayment');

    const result = await orchestrator.ask({
      message: 'activate premium unlimited plan for me from next month 1st dec',
      customerId: 'cust-001',
    });

    expect(result.stage).toBe('complete');
    expect(result.recommendation).toBeUndefined();
    expect(result.finalMessage).toContain('Premium Unlimited');
    expect(result.finalMessage).toContain('$89.99/month');
    expect(result.finalMessage).toContain('next month 1st dec');
    expect(result.finalMessage).toMatch(/future-dated activation is not supported/i);
    expect(result.context).toMatchObject({
      requestedPlan: { id: 'plan-003', name: 'Premium Unlimited' },
      schedulingSupported: false,
    });
    expect(initiatePaymentSpy).not.toHaveBeenCalled();
    expect(rechargeService.getActivationStatus('cust-001').status).toBe('not_activated');
  });

  it('recommends the exact requested catalog plan when no future start date is given', async () => {
    const listed = await orchestrator.ask({
      message: 'show all available plans',
      customerId: 'cust-001',
    });
    const result = await orchestrator.ask({
      message: 'activate standard plan',
      customerId: 'cust-001',
    });

    expect(listed.availablePlans?.every((plan) => plan.currency === 'USD')).toBe(true);
    expect(result.stage).toBe('recommendation');
    expect(result.recommendation?.plan).toMatchObject({
      id: 'plan-002',
      name: 'Standard 20GB',
      dataGB: 20,
      price: 59.99,
      currency: 'USD',
    });
    expect(result.finalMessage).toContain('exact Standard 20GB plan');
    expect(result.finalMessage).toContain('$59.99/month');
    expect(result.finalMessage).not.toContain('₹');
  });

  it('asks which plan the user means when a past plan list leaves a contextual reference ambiguous', async () => {
    await orchestrator.ask({
      message: 'show all available plans',
      customerId: 'cust-001',
    });

    const result = await orchestrator.ask({
      message: 'activate that plan',
      customerId: 'cust-001',
    });

    expect(result.stage).toBe('plans');
    expect(result.recommendation).toBeUndefined();
    expect(result.availablePlans).toHaveLength(3);
    expect(result.finalMessage).toContain('choose from the available plans');
    expect(result.finalMessage).toContain('I won\'t prepare payment');
  });

  it('uses the single plan in recent conversation context for a follow-up reference', async () => {
    await orchestrator.ask({
      message: 'show all available plans',
      customerId: 'cust-001',
    });
    await orchestrator.ask({
      message: 'activate standard plan',
      customerId: 'cust-001',
    });

    const result = await orchestrator.ask({
      message: 'activate that plan',
      customerId: 'cust-001',
    });

    expect(result.recommendation?.plan).toMatchObject({
      id: 'plan-002',
      name: 'Standard 20GB',
      currency: 'USD',
    });
  });

  it('starts a plan-intake conversation for vague plan requests and keeps qualification answers in that conversation', async () => {
    const chatMock = jest.fn()
      .mockResolvedValueOnce('What monthly budget would feel comfortable?')
      .mockResolvedValueOnce('How much mobile data do you usually use each month?')
      .mockResolvedValueOnce('Do you mainly need this for yourself or for family lines?');
    llmProvider.chat = chatMock;
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

    const opening = await orchestrator.ask({ message: 'I need a mobile plan', customerId: 'cust-voice' });
    const budgetAnswer = await orchestrator.ask({ message: 'Around $500 a month', customerId: 'cust-voice' });
    const dataAnswer = await orchestrator.ask({ message: 'I use about 20GB', customerId: 'cust-voice' });

    expect(opening.stage).toBe('complete');
    expect(budgetAnswer.stage).toBe('complete');
    expect(dataAnswer.stage).toBe('complete');
    expect(chatMock).toHaveBeenCalledTimes(3);
  });

  it('does not present a custom travel plan as verified when the catalog cannot meet the data request', async () => {
    const supportService = new SupportService();
    const flowOrchestrator = new OrchestratorService(
      llmProvider, profileService, analyticsService, planService, paymentService, rechargeService,
      roamingService, billingService, new RecommendationService(), new DecisionEngineService(),
      new CustomerIntelligenceService(), createCustomPlanComposer(), undefined as never,
      new TellyResponseTemplateService(),
      undefined, undefined, undefined, undefined, undefined, undefined,
      new ConsultativeFlowService(), supportService,
    );
    const ask = (message: string) => flowOrchestrator.ask({ message, customerId: 'cust-001' });

    const step1 = await ask('I am going to Dubai');
    const step2 = await ask('for five days');
    const step3 = await ask('I think I will need both');
    const offer = await ask('I use around twenty-five GB');

    expect(step1.stage).toBe('complete');
    expect(step2.finalMessage).toMatch(/data|calls/i);
    expect(step3.finalMessage).toMatch(/how much data/i);
    expect(offer.stage).toBe('complete');
    expect(offer.recommendation).toBeUndefined();
    expect(offer.finalMessage).toMatch(/25GB/);
    expect(offer.finalMessage).toMatch(/quote request/i);
    expect(offer.finalMessage).not.toMatch(/Essential|Balanced|Premium/);
  });

  it('retains the complete South Africa request and opens a quote only after confirmation', async () => {
    const supportService = new SupportService();
    const flowOrchestrator = new OrchestratorService(
      llmProvider, profileService, analyticsService, planService, paymentService, rechargeService,
      roamingService, billingService, new RecommendationService(), new DecisionEngineService(),
      new CustomerIntelligenceService(), createCustomPlanComposer(), undefined as never,
      new TellyResponseTemplateService(),
      undefined, undefined, undefined, undefined, undefined, undefined,
      new ConsultativeFlowService(), supportService,
    );
    const ask = (message: string) => flowOrchestrator.ask({ message, customerId: 'cust-001' });

    const initial = await ask(
      'I am going to South Africa for one month. I need 500GB data and 500 international calling minutes to Europe.',
    );
    const followUp = await ask('Yes, I need an eSIM option, and my company will sponsor the plan.');
    const quote = await ask('Yes, please');

    expect(initial.stage).toBe('complete');
    expect(initial.recommendation).toBeUndefined();
    expect(initial.finalMessage).toMatch(/30 days/);
    expect(initial.finalMessage).toMatch(/500GB/);
    expect(initial.finalMessage).toMatch(/500 international calling minutes to Europe/);
    expect(initial.finalMessage).not.toMatch(/10GB|50GB/);
    expect(followUp.finalMessage).toMatch(/eSIM/);
    expect(followUp.finalMessage).toMatch(/company/);
    expect(followUp.finalMessage).toMatch(/500GB/);
    expect(followUp.finalMessage).toMatch(/Europe/);
    expect(supportService.getTickets('cust-001')).toHaveLength(3);
    expect(quote.finalMessage).toMatch(/sales quote request/);
    const quoteTicket = supportService.getTickets('cust-001').find((ticket) => /Enterprise quote request/.test(ticket.issue));
    expect(quoteTicket?.issue).toMatch(/South Africa/);
    expect(quoteTicket?.issue).toMatch(/500GB/);
    expect(quoteTicket?.issue).toMatch(/500 international minutes to Europe/);
    expect(quoteTicket?.issue).toMatch(/eSIM requested/);
    expect(quoteTicket?.issue).toMatch(/company-sponsored billing requested/);
  });

  it('triages network trouble with safe checks and gets consent before creating a support ticket', async () => {
    const supportService = new SupportService();
    const supportOrchestrator = createSupportEnabledOrchestrator(supportService);
    const ask = (message: string) => supportOrchestrator.ask({ message, customerId: 'cust-001' });

    const opening = await ask('My mobile data is slow in Pune.');
    const triedChecks = await ask('No, I have not tried those steps yet.');
    const stillBroken = await ask('It is still not working after restarting.');

    expect(opening.finalMessage).toMatch(/live network telemetry/i);
    expect(opening.finalMessage).toMatch(/already tried/i);
    expect(triedChecks.finalMessage).toMatch(/After trying those steps/i);
    expect(stillBroken.finalMessage).toMatch(/haven’t opened a ticket yet/i);
    expect(stillBroken.finalMessage).toMatch(/Would you like me to open one/i);
    expect(supportService.getTickets('cust-001')).toHaveLength(2);

    const created = await ask('Yes, please');
    expect(created.finalMessage).toMatch(/network support request/);
    expect(supportService.getTickets('cust-001')).toHaveLength(3);
    expect(supportService.getTickets('cust-001')[2].issue).toMatch(/slow data near Pune/i);
  });

  it('routes a poor-signal complaint to network care instead of a plan recommendation', async () => {
    const response = await orchestrator.ask({
      message: 'I have poor signal',
      customerId: 'cust-001',
    });

    expect(response.intent).toBe('network_support');
    expect(response.recommendation).toBeUndefined();
    expect(response.finalMessage).toMatch(/outage/i);
    expect(response.finalMessage).toMatch(/city or PIN code/i);
    expect(response.context).toMatchObject({ networkIssue: 'weak-signal' });
  });

  it('compares recorded bills without inventing line items and requires consent to escalate', async () => {
    const supportService = new SupportService();
    const supportOrchestrator = createSupportEnabledOrchestrator(supportService);
    const ask = (message: string) => supportOrchestrator.ask({ message, customerId: 'cust-001' });

    const analysis = await ask('My latest bill is higher than expected.');

    expect(analysis.finalMessage).toMatch(/latest and previous recorded bills are both/i);
    expect(analysis.finalMessage).toMatch(/don’t include itemized usage or fee details/i);
    expect(analysis.finalMessage).toMatch(/haven’t opened a ticket yet/i);
    expect(supportService.getTickets('cust-001')).toHaveLength(2);

    const created = await ask('Yes, please');
    expect(created.finalMessage).toMatch(/billing support request/);
    expect(supportService.getTickets('cust-001')).toHaveLength(3);
  });

  it('does not claim a failed recharge succeeded and requires consent to investigate', async () => {
    const supportService = new SupportService();
    const supportOrchestrator = createSupportEnabledOrchestrator(supportService);

    const response = await supportOrchestrator.ask({
      message: 'My recharge was debited but the data was not credited.',
      customerId: 'cust-001',
    });

    expect(response.finalMessage).toMatch(/can’t verify this specific payment/i);
    expect(response.finalMessage).toMatch(/don’t repeat the recharge/i);
    expect(response.context).toMatchObject({ paymentStatusVerified: false });
    expect(supportService.getTickets('cust-001')).toHaveLength(2);

    const created = await supportOrchestrator.ask({
      message: 'Yes, please',
      customerId: 'cust-001',
    });
    expect(created.finalMessage).toMatch(/recharge support request/);
    expect(supportService.getTickets('cust-001')).toHaveLength(3);
  });

  it('routes cancellation and port-out requests without silently changing service', async () => {
    const supportService = new SupportService();
    const supportOrchestrator = createSupportEnabledOrchestrator(supportService);

    const response = await supportOrchestrator.ask({
      message: 'I want to port my number out.',
      customerId: 'cust-001',
    });

    expect(response.finalMessage).toMatch(/number porting aren’t connected/i);
    expect(response.context).toMatchObject({ serviceChangePerformed: false });
    expect(supportService.getTickets('cust-001')).toHaveLength(2);
  });

  it('responds to a lost phone with empathy, raises a SIM block ticket, then offers replacement and plans', async () => {
    const supportService = new SupportService();
    const flowOrchestrator = new OrchestratorService(
      llmProvider, profileService, analyticsService, planService, paymentService, rechargeService,
      roamingService, billingService, new RecommendationService(), new DecisionEngineService(),
      new CustomerIntelligenceService(), createCustomPlanComposer(), undefined as never,
      new TellyResponseTemplateService(),
      undefined, undefined, undefined, undefined, undefined, undefined,
      new ConsultativeFlowService(), supportService,
    );
    const ask = (message: string) => flowOrchestrator.ask({ message, customerId: 'cust-001' });

    const opening = await ask('I lost my phone');
    expect(opening.finalMessage).toMatch(/sorry/i);

    const blocked = await ask('yes please');
    expect(blocked.finalMessage).toMatch(/ticket-/);
    expect(supportService.getTickets('cust-001').some((t) => t.issue.includes('block SIM'))).toBe(true);

    const replacement = await ask('eSIM please');
    expect(replacement.finalMessage).toMatch(/personalised plan/i);

    const plan = await ask('yes build one');
    expect(plan.stage).toBe('recommendation');
  });

  it('answers "what was my last recharge plan" from billing records instead of pitching a new offer', async () => {
    const result = await orchestrator.ask({
      message: 'what was my last recharge plan',
      customerId: 'cust-001',
    });

    expect(result.recommendation).toBeUndefined();
    expect(result.stage).toBe('billing');
    expect(result.finalMessage).toMatch(/most recent payment|last recharge/i);
    expect(result.finalMessage).toContain('Basic 5GB');
    expect(result.billingHistory).toHaveLength(1);
  });

  it('reports the recharged plan once a recharge has been recorded', async () => {
    const plan = planService.getPlans('cust-001')[1];
    billingService.recordTransaction('cust-001', plan.id, plan.price);

    const result = await orchestrator.ask({ message: 'When was my last recharge?', customerId: 'cust-001' });

    expect(result.finalMessage).toContain(`Your last recharge was the ${plan.name} plan`);
  });

  it('answers remaining data questions from analytics', async () => {
    const result = await orchestrator.ask({ message: 'how much data is left?', customerId: 'cust-001' });

    expect(result.recommendation).toBeUndefined();
    expect(result.finalMessage).toMatch(/GB left/);
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

    const followUp = await orchestrator.ask({
      message: 'What about that?',
      customerId: 'cust-001',
    });

    expect(chatMock).not.toHaveBeenCalled();
    expect(followUp.finalMessage).toContain('telecom services');
  });

  it('politely declines non-telecom requests and steers into a telecom question', async () => {
    for (const message of ['Suggest me a pizza shop near me', 'I want to eat ice cream', 'I want to watch a movie tonight', 'recommend a good hotel']) {
      const result = await orchestrator.ask({ message, customerId: 'cust-offtopic' });

      expect(result.recommendation).toBeUndefined();
      expect(result.stage).toBe('complete');
      expect(result.finalMessage).toContain("that's not something I can help with");
      expect(result.finalMessage).toMatch(/\?$/);
    }
  });

  it('uses conversational chat for unrelated requests', async () => {
    const result = await orchestrator.ask({
      message: 'pasta recipe',
      customerId: 'cust-001',
    });

    expect(result.stage).toBe('complete');
    expect(result.finalMessage).toContain("that's not something I can help with");
    expect(result.finalMessage).toContain('How much mobile data do you use');
    expect(llmProvider.chat).not.toHaveBeenCalled();
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

    const plan = result.recommendation?.plan as { name: string; provider: string; components: Array<{ name: string; provider: string }> };
    expect(plan.name).toBe('Telly Japan Travel Plan');
    expect(plan.components.some((component) => component.name === 'Japan Roaming Pass')).toBe(true);
    expect(plan.provider).toBe('Airtel');
    expect(plan.components.every((component) => component.provider === 'Airtel')).toBe(true);
    expect(result.finalMessage).toContain('Airtel');
    expect(result.finalMessage).not.toMatch(/Vodafone|Jio/i);
    expect(result.finalMessage).toMatch(/Japan/i);
  });

  it('creates a provider-owned Dubai telecom plan for the requested duration', async () => {
    const result = await orchestrator.ask({
      message: 'I am going to Dubai for 7 days, show me a telecom plan',
      customerId: 'cust-001',
    });

    const plan = result.recommendation?.plan as { provider: string; components: Array<{ description: string; provider: string }> };
    expect(result.stage).toBe('recommendation');
    expect(plan.provider).toBe('Airtel');
    expect(plan.components.every((component) => component.provider === 'Airtel')).toBe(true);
    expect(plan.components.some((component) => /Dubai.*7 days/i.test(component.description))).toBe(true);
    expect(result.finalMessage).toMatch(/Dubai|7 days|Airtel/i);
  });

  it('reinterprets Dubai itinerary requests as a roaming recommendation', async () => {
    const result = await orchestrator.ask({
      message: 'I am going to Dubai for 7 days. Give me an itinerary.',
      customerId: 'cust-001',
    });

    const plan = result.recommendation?.plan as {
      provider: string;
      components: Array<{ description: string; provider: string }>;
    };
    expect(result.stage).toBe('recommendation');
    expect(plan.provider).toBe('Airtel');
    expect(plan.components.some((component) => /Dubai.*7 days/i.test(component.description))).toBe(true);
    expect(result.finalMessage).not.toMatch(/itinerary|sightseeing|hotel|restaurant/i);
  });

  it('uses a deterministic telecom response for travel prompts', async () => {
    const result = await orchestrator.ask({
      message: 'Plan my trip to Paris for 7 days',
      customerId: 'cust-001',
    });

    expect(result.intent).toBe('TELECOM_ROAMING');
    expect(result.agents).toContain('roaming');
    expect(llmProvider.humanize).not.toHaveBeenCalled();
    expect(result.finalMessage).toContain('roaming');
    expect(result.finalMessage).not.toMatch(/sightseeing|hotel|tourist attractions/i);
  });

  it('uses a deterministic telecom plan response for a bare plan request', async () => {
    const result = await orchestrator.ask({
      message: 'Give me a plan',
      customerId: 'cust-001',
    });

    expect(result.agents).toContain('plan');
    expect(llmProvider.humanize).not.toHaveBeenCalled();
    expect(result.finalMessage).toContain('plan');
    expect(result.finalMessage).not.toMatch(/adventure|day 1|sightseeing|hotel/i);
  });

  it('creates a provider-owned Thailand roaming plan without itinerary content', async () => {
    const result = await orchestrator.ask({
      message: 'I am going to Thailand for 5 days, give me a good plan',
      customerId: 'cust-001',
    });

    const plan = result.recommendation?.plan as { provider: string; components: Array<{ name: string; description: string; provider: string }> };
    expect(result.stage).toBe('recommendation');
    expect(plan.provider).toBe('Airtel');
    expect(plan.components.some((component) => component.name === 'Thailand Roaming Pass')).toBe(true);
    expect(plan.components.every((component) => component.provider === 'Airtel')).toBe(true);
    expect(result.finalMessage).toMatch(/Thailand|5 days|Airtel/i);
    expect(result.finalMessage).not.toMatch(/itinerary|sightseeing|hotel|restaurant/i);
  });

  it('creates a telecom roaming plan for an arbitrary destination', async () => {
    const result = await orchestrator.ask({
      message: 'I am going to Brazil for 5 days, give me a good plan',
      customerId: 'cust-001',
    });

    const plan = result.recommendation?.plan as { provider: string; components: Array<{ name: string; description: string; provider: string }> };
    expect(result.stage).toBe('recommendation');
    expect(plan.provider).toBe('Airtel');
    expect(plan.components.some((component) => component.name === 'BRAZIL Roaming Pass')).toBe(true);
    expect(plan.components.some((component) => /Brazil.*5 days/i.test(component.description))).toBe(true);
    expect(plan.components.every((component) => component.provider === 'Airtel')).toBe(true);
    expect(result.finalMessage).not.toMatch(/itinerary|sightseeing|hotel|restaurant/i);
  });

  it('treats a Maldives voice-style plan request as a telecom roaming request', async () => {
    const result = await orchestrator.ask({
      message: 'I am going to Maldives, give me a plan for 7 days',
      customerId: 'cust-001',
    });

    const plan = result.recommendation?.plan as {
      components: Array<{ name: string; description: string }>;
    };
    expect(result.intent).toBe('TELECOM_ROAMING');
    expect(result.agents).toContain('roaming');
    expect(plan.components.some((component) => component.name === 'MALDIVES Roaming Pass')).toBe(true);
    expect(plan.components.some((component) => /Maldives.*7 days/i.test(component.description))).toBe(true);
    expect(result.finalMessage).toMatch(/roaming|data|calling/i);
    expect(result.finalMessage).not.toMatch(/adventure|tour|itinerary|day[- ]wise|sightseeing|hotel|restaurant/i);
  });

  it('turns an unknown destination into a telecom roaming discussion', async () => {
    const result = await orchestrator.ask({
      message: 'I am moving to Luminara and need a plan',
      customerId: 'cust-001',
    });

    const plan = result.recommendation?.plan as {
      components: Array<{ name: string; description: string }>;
    };
    expect(result.intent).toBe('TELECOM_ROAMING');
    expect(result.agents).toContain('roaming');
    expect(plan.components.some((component) => component.name === 'LUMINARA Roaming Pass')).toBe(true);
    expect(result.finalMessage).toMatch(/roaming|data|calling/i);
    expect(result.finalMessage).not.toMatch(/tour|itinerary|sightseeing|hotel|restaurant/i);
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

  it('converts Netherlands roaming recommendations to EUR using the ECB reference rate', async () => {
    const result = await orchestrator.ask({
      message: 'I am visiting the Netherlands for 21 days and need roaming data and calls',
      customerId: 'cust-001',
    });

    const plan = result.recommendation?.plan;
    expect(plan?.currency).toBe('EUR');
    expect(plan?.currencyRateDate).toBe('2026-11-25');
    expect(result.finalMessage).toContain('€');
    expect(result.finalMessage).not.toContain('₹');
    expect(result.finalMessage).not.toContain('$');
  });

  it('converts Japan roaming recommendations to JPY instead of INR', async () => {
    const result = await orchestrator.ask({
      message: 'I am going to Japan for three weeks, I need a mobile data plan',
      customerId: 'cust-001',
    });

    const plan = result.recommendation?.plan;
    expect(plan?.currency).toBe('JPY');
    expect(plan?.currencyRateDate).toBe('2026-11-25');
    expect(result.finalMessage).toMatch(/[¥￥]/);
    expect(result.finalMessage).not.toContain('₹');
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
    expect(llmProvider.chat).not.toHaveBeenCalled();
    expect(result.finalMessage).toContain('automatic recurring recharge/payment scheduling');
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
    expect(result.finalMessage).toContain('Here are all 3 available plans:');
  });

  it('returns recharge options without a recommendation card when the user asks for recharge options', async () => {
    const result = await orchestrator.ask({
      message: 'Show available recharge options',
      customerId: 'cust-001',
    });

    expect(result.stage).toBe('recharge-options');
    expect(result.rechargeOptions).toHaveLength(3);
    expect(result.finalMessage).toContain('Here are all 3 available recharge options:');
  });

  it('returns roaming packages when the user asks for roaming packages', async () => {
    const result = await orchestrator.ask({
      message: 'Show available roaming packages',
      customerId: 'cust-001',
    });

    expect(result.stage).toBe('roaming-packages');
    expect(result.roamingPackages).toHaveLength(3);
    expect(result.finalMessage).toContain('Here are all 3 available roaming packages for your account:');
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
    expect(result.finalMessage).toContain('Here are your past 3 months of billing records (3 found):');
  });

  it('understands number words when asking for recent billing months', async () => {
    detectIntentMock.mockResolvedValueOnce({
      intent: 'billing_inquiry',
      agents: ['billing'],
      confidence: 0.9,
    });

    const result = await orchestrator.ask({
      message: 'I want to see my last two months bill',
      customerId: 'cust-001',
    });

    expect(result.stage).toBe('billing');
    expect(result.billingHistory).toHaveLength(2);
    const now = new Date();
    expect(result.billingHistory?.map((record) => record.date)).toEqual([
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1)).toISOString().slice(0, 10),
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 10),
    ]);
    expect(result.finalMessage).toContain('Here are your past 2 months of billing records (2 found):');
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
    expect(result.finalMessage).toContain('Here are your last 2 billing records (2 found):');
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
    expect(result.finalMessage).toContain('Here are your past 1 month of billing records (1 found):');
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

  it('does not invent a Kenya roaming offer when the catalog cannot verify unlimited data', async () => {
    const result = await orchestrator.ask({
      message: 'Find a package for unlimited data in Kenya with Jio Hotstar',
      customerId: 'cust-001',
    });

    expect(result.stage).toBe('complete');
    expect(result.recommendation).toBeUndefined();
    expect(result.finalMessage).toMatch(/Kenya/);
    expect(result.finalMessage).toMatch(/quote request/i);
  });

  it('does not invent a Bhutan roaming plan for a quantified data request', async () => {
    const result = await orchestrator.ask({
      message: 'Find a package in Bhutan with 50GB data unlimited call and can watch SonyLIV',
      customerId: 'cust-003',
    });

    expect(result.stage).toBe('complete');
    expect(result.recommendation).toBeUndefined();
    expect(result.finalMessage).toMatch(/Bhutan/);
    expect(result.finalMessage).toMatch(/quote request/i);
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
