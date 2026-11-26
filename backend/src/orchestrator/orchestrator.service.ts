import { Inject, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { AutopilotService } from '../agents/autopilot/autopilot.service';
import { AnalyticsService } from '../agents/analytics/analytics.service';
import { BillingRecord } from '../agents/billing/billing.model';
import { BillingService } from '../agents/billing/billing.service';
import { EsimService } from '../agents/esim/esim.service';
import { PaymentService } from '../agents/payment/payment.service';
import { Plan } from '../agents/plan/plan.model';
import { PlanService } from '../agents/plan/plan.service';
import { ProfileService } from '../agents/profile/profile.service';
import { RechargeService } from '../agents/recharge/recharge.service';
import { RoamingPackage } from '../agents/roaming/roaming.model';
import { RoamingService } from '../agents/roaming/roaming.service';
import { SupportService } from '../agents/support/support.service';
import type { ConversationMessage, ILlmProvider } from '../llm/llm-provider.interface';
import { LLM_PROVIDER } from '../llm/llm-provider.interface';
import { FeatureFlagsService } from '../intelligence/feature-flags.service';
import { LanguageService } from '../intelligence/language.service';
import { MemoryService } from '../intelligence/memory.service';
import { RagService } from '../intelligence/rag.service';
import { SentimentService } from '../intelligence/sentiment.service';
import { AskAction, AskDto } from './ask.dto';
import { TellyResponseTemplateService } from './telly-response-template.service';
import { CustomerIntelligenceService } from './customer-intelligence.service';
import { ConsultativeFlowService } from './consultative-flow.service';
import type { FlowDecision } from './consultative-flow.service';
import { CustomPlan, CustomPlanComposerService } from './custom-plan-composer.service';
import { formatCurrencyAmount } from './currency.utils';
import { DecisionEngineService } from './decision-engine.service';
import { RecommendationService } from './recommendation.service';

const MAX_FLOW_TRACES_PER_CUSTOMER = 5;
const TOURISM_RESPONSE_PATTERN = /\b(adventure (?:plan|trip)|tour(?:ism|ist| guide| itinerary)?|tourist attractions?|sightseeing|itinerar(?:y|ies)|day[-\s]?wise|day\s*\d+|travel schedules?|hotel(?:s| suggestions?)?|restaurant(?:s| suggestions?)?|cruise(?:s)?|dinner(?:s)?|vacation (?:plan|guide)|destination guide|things to do)\b/i;

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

interface TravelPlanRequirements {
  destination: string;
  days?: number;
  dataGB?: number;
  unlimitedDataRequested: boolean;
  internationalMinutes?: number;
  internationalCallDestination?: string;
  esimRequested: boolean;
  companySponsored: boolean;
  quotePending: boolean;
}

interface NetworkCareCase {
  symptom: 'no-service' | 'weak-signal' | 'slow-data' | 'dropped-calls' | 'mobile-data';
  location?: string;
  diagnosticsTried: boolean;
  awaiting: 'location' | 'diagnostics' | 'result';
}

interface PendingSupportRequest {
  category: 'network' | 'billing' | 'recharge' | 'service-change';
  issue: string;
  priority: 'low' | 'medium' | 'high';
}

@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);
  private readonly communicationHistory: AgentCommunicationTrace[] = [];
  private readonly conversationHistoryByCustomer = new Map<string, ConversationMessage[]>();
  private readonly recentAsks = new Map<string, { message: string; at: number; response: OrchestratorResponse }>();
  private readonly presentedPlansByCustomer = new Map<string, Plan[]>();
  private readonly travelRequirementsByCustomer = new Map<string, TravelPlanRequirements>();
  private readonly networkCareByCustomer = new Map<string, NetworkCareCase>();
  private readonly pendingSupportByCustomer = new Map<string, PendingSupportRequest>();

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
    @Optional() private readonly esimService?: EsimService,
    @Optional() private readonly featureFlags?: FeatureFlagsService,
    @Optional() private readonly ragService?: RagService,
    @Optional() private readonly memoryService?: MemoryService,
    @Optional() private readonly sentimentService?: SentimentService,
    @Optional() private readonly languageService?: LanguageService,
    @Optional() private readonly consultativeFlow?: ConsultativeFlowService,
    @Optional() private readonly supportService?: SupportService,
  ) {}

  async ask(dto: AskDto): Promise<OrchestratorResponse> {
    const action: AskAction = dto.action ?? 'ask';

    // A duplicate delivery of the same utterance must not advance the conversation twice.
    const recent = this.recentAsks.get(dto.customerId);
    if (action === 'ask' && recent && recent.message === dto.message && Date.now() - recent.at < 3000) {
      return recent.response;
    }

    // Step 1: detect intent & required agents via the LLM provider.
    const detected = await this.llmProvider.detectIntent(dto.message);
    const isTelecomRoamingRequest = this.isTelecomRoamingRequest(dto.message);
    const intent = isTelecomRoamingRequest ? 'TELECOM_ROAMING' : detected.intent;
    const agents = isTelecomRoamingRequest
      ? [...new Set([...detected.agents, 'roaming', 'profile', 'analytics', 'plan'])]
      : detected.agents;

    let response: OrchestratorResponse;

    if (action === 'confirm') {
      response = await this.handleConfirm(dto, intent, agents);
    } else if (action === 'payment_success') {
      response = await this.handlePaymentSuccess(dto, intent, agents);
    } else if (action === 'autopilot_enable') {
      response = this.handleAutopilotSetting(dto, intent, agents, true);
    } else if (action === 'autopilot_disable') {
      response = this.handleAutopilotSetting(dto, intent, agents, false);
    } else {
      response = await this.handleAsk(dto, intent, agents);
    }

    response = await this.applyIntelligenceLayer(dto, response);
    response = this.validateTelecomResponse(dto, response);

    this.recordCommunicationTrace(dto, response);
    if (action === 'ask') {
      this.recentAsks.set(dto.customerId, { message: dto.message, at: Date.now(), response });
    }
    return response;
  }

  private validateTelecomResponse(dto: AskDto, response: OrchestratorResponse): OrchestratorResponse {
    if (!TOURISM_RESPONSE_PATTERN.test(response.finalMessage)) {
      return response;
    }

    const isRoamingRequest = this.isTelecomRoamingRequest(dto.message);
    const destination = dto.message.match(/\b(?:to|in|visit(?:ing)?|travel(?:ling)?\s+to|going\s+to)\s+([a-z][a-z\s-]{1,40})/i)?.[1]
      ?.replace(/\b(?:for|on|with|and|please|give|show|what|where)\b.*$/i, '')
      .trim();
    const duration = dto.message.match(/\b(\d+)\s+days?\b/i)?.[0];
    const location = destination ? ` in ${destination}` : '';
    const stay = duration ? ` for ${duration}` : '';
    const finalMessage = isRoamingRequest
      ? `For your stay${location}${stay}, I recommend an international roaming package with mobile data, voice calling, and network coverage support. I can also compare our eSIM and international data pack options. How much data and calling time will you need?`
      : 'I recommend a telecom plan with mobile data, voice calling, and account support options. I can also compare data packs and eSIM services. How much data and calling time will you need?';

    return {
      ...response,
      intent: isRoamingRequest ? 'TELECOM_ROAMING' : 'telecom_plan_recommendation',
      agents: [...new Set([...response.agents, ...(isRoamingRequest ? ['roaming'] : ['plan'])])],
      finalMessage,
    };
  }

  /** Enriches the response with RAG grounding, memory, sentiment, proactive questions, and translation. */
  private async applyIntelligenceLayer(dto: AskDto, response: OrchestratorResponse): Promise<OrchestratorResponse> {
    const flags = this.featureFlags;
    if (!flags) return response;

    const context: Record<string, unknown> = { ...(response.context ?? {}) };

    if (flags.sessionMemoryEnabled || flags.customerMemoryEnabled) {
      this.memoryService?.appendSessionTurn(dto.customerId, dto.message);
      this.memoryService?.extractAndRememberFacts(dto.customerId, dto.message);
      const customerFacts = this.memoryService?.getCustomerFacts(dto.customerId) ?? [];
      if (customerFacts.length > 0) {
        context.customerMemory = customerFacts;
      }
    }

    if (flags.sentimentAnalysisEnabled) {
      const sentiment = this.sentimentService?.analyze(dto.message);
      if (sentiment) {
        context.sentiment = sentiment;
      }
    }

    if (flags.ragEnabled) {
      const snippets = await this.ragService?.retrieve(dto.message);
      if (snippets && snippets.length > 0) {
        context.knowledgeSnippets = snippets;
      }
    }

    if (flags.proactiveResponseEnabled) {
      const proactiveQuestions = this.buildProactiveQuestions(dto.message);
      if (proactiveQuestions.length > 0) {
        context.proactiveQuestions = proactiveQuestions;
      }
    }

    let finalMessage = response.finalMessage;
    let detectedLanguage = flags.defaultLanguage;
    if (flags.multiLanguageEnabled && this.languageService) {
      detectedLanguage = this.languageService.detect(dto.message);
      if (detectedLanguage !== flags.defaultLanguage) {
        finalMessage = await this.languageService.translate(finalMessage, detectedLanguage);
      }
      context.detectedLanguage = detectedLanguage;
    }

    return { ...response, finalMessage, context };
  }

  /** Anticipates the next 2-3 details a human agent would ask for, based on intent signals in the message. */
  private buildProactiveQuestions(message: string): string[] {
    const normalized = message.toLowerCase();
    const questions: string[] = [];

    const mentionsTravel = /\b(travel|trip|going to|visiting|abroad|roaming)\b/.test(normalized);
    if (mentionsTravel) {
      questions.push('How many days will you be there?');
      questions.push('Roughly how much data do you think you will need?');
      questions.push('How much talk time do you need, and will you be calling India often?');
    }

    const mentionsBilling = /\b(bill|invoice|charge|overcharg)/.test(normalized);
    if (mentionsBilling && !mentionsTravel) {
      questions.push('Which billing cycle is this about?');
      questions.push('Is this about the total amount or a specific charge?');
    }

    const mentionsRecharge = /\b(recharge|top.?up|renew)\b/.test(normalized);
    if (mentionsRecharge && !mentionsTravel) {
      questions.push('How many days are left until your next billing cycle?');
      questions.push('What is your typical monthly data and call usage?');
    }

    return questions;
  }

  private filterRecentBilling(records: BillingRecord[], months: number): BillingRecord[] {
    const sorted = [...records].sort(
      (left, right) => new Date(left.date).getTime() - new Date(right.date).getTime(),
    );

    if (!Number.isFinite(months) || months <= 0) {
      return sorted;
    }

    const now = new Date();
    const currentMonthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    const firstMonthStart = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth() - months,
      1,
    );

    return sorted.filter((record) => {
      const date = Date.parse(record.date);
      return Number.isFinite(date) && date >= firstMonthStart && date < currentMonthStart;
    });
  }

  private isCurrentPlanRequest(message: string): boolean {
    return /\b(current|my|existing|present)\s+plan\b/i.test(message) || /\bwhat\s+is\s+my\s+plan\b/i.test(message) || /\bwhich\s+plan\s+am\s+i\s+on\b/i.test(message);
  }

  private isNetworkIssueRequest(message: string): boolean {
    return /\b(?:no\s+(?:mobile\s+)?service|no\s+signal|weak\s+signal|poor\s+signal|poor\s+reception|network\s+(?:issue|outage)|slow\s+(?:mobile\s+)?(?:data|internet|connection)|(?:mobile\s+)?(?:data|internet|connection)\s+(?:is\s+)?(?:slow|not\s+working|keeps?\s+dropping)|(?:mobile\s+)?data\s+(?:is\s+)?not\s+working|internet\s+(?:is\s+)?not\s+working|internet\s+keeps?\s+disconnecting|dropped\s+calls?|calls?\s+(?:keep|keeps)\s+dropping|(?:cannot|can.t)\s+connect)\b/i.test(
      message,
    );
  }

  private isBillingConcern(message: string): boolean {
    return /\b(?:high(?:er)?\s+bill|bill\s+(?:is\s+)?(?:too\s+high|higher|wrong|incorrect|unexpected)|overcharg(?:ed|ing)|unexpected\s+charge|unknown\s+charge|extra\s+charge|charged\s+twice|unrecognized\s+charge|unrecognised\s+charge|bill\s+dispute)\b/i.test(
      message,
    );
  }

  private isRechargeIssueRequest(message: string): boolean {
    return /\b(?:recharge|top[-\s]?up)\b.{0,60}\b(?:deducted|debited|failed|not\s+credited|not\s+applied|missing|not\s+received|pending)\b|\b(?:money|payment)\b.{0,40}\b(?:deducted|debited)\b.{0,40}\b(?:recharge|top[-\s]?up)\b/i.test(
      message,
    );
  }

  private isServiceExitRequest(message: string): boolean {
    return /\b(?:cancel|disconnect|terminate)\b.{0,35}\b(?:my\s+)?(?:account|service|connection|plan|line)\b|\bport\b.{0,30}\bout\b|\b(?:switch|move)\b.{0,30}\b(?:my\s+)?number\b.{0,20}\b(?:provider|operator|network)\b|\b(?:switch|leave)\s+(?:airtel|jio|my\s+provider)\b/i.test(
      message,
    );
  }

  private isPayBillRequest(message: string): boolean {
    return /\b(pay(?:ing)?|clear|settle|make)\b.*\b(bill|invoice|due|pending|payment)\b/i.test(message) ||
      /\b(bill|invoice)\b.*\b(pay(?:ing)?|clear|settle)\b/i.test(message) ||
      /\bpay(?:ing)?\s+my\s+bill\b/i.test(message);
  }

  private isAutopilotEnableRequest(message: string): boolean {
    return /\b(?:enable|turn\s+on|switch\s+on|set\s+up|setup|activate|start)\b.{0,35}\b(?:telly\s+)?autopilot\b/i.test(message) ||
      /\b(?:enable|turn\s+on|switch\s+on|set\s+up|setup|activate|start)\b.{0,35}\b(?:auto[-\s]?pay|automatic(?:ally)?\s+(?:bill\s+)?payments?|recurring\s+payments?|auto[-\s]?recharge)\b/i.test(message) ||
      /\b(?:autopilot|auto[-\s]?pay|automatic(?:ally)?\s+(?:bill\s+)?payments?|recurring\s+payments?)\b.{0,25}\b(?:setup|set\s+up|enable|turn\s+on|start)\b/i.test(message);
  }

  private isAutopilotDisableRequest(message: string): boolean {
    return /\b(?:disable|turn\s+off|switch\s+off|stop|cancel)\b.{0,35}\b(?:telly\s+)?(?:autopilot|auto[-\s]?pay|automatic(?:ally)?\s+(?:bill\s+)?payments?|recurring\s+payments?|auto[-\s]?recharge)\b/i.test(message);
  }

  private handleAutopilotSetting(
    dto: AskDto,
    intent: string,
    agents: string[],
    enabled: boolean,
  ): OrchestratorResponse {
    const settings = enabled
      ? this.autopilotService.enable(dto.customerId)
      : this.autopilotService.disable(dto.customerId);
    const finalMessage = enabled
      ? 'Demo Autopilot is ON for bill and recharge settings. It does not charge real money and has no live payment provider or background scheduler; it only marks a mock bill paid when you ask Telly to process it. Settings reset when the backend restarts. You can turn it off anytime.'
      : 'Demo Autopilot is OFF. Simulated automatic bill payments and recharges are disabled.';

    this.appendConversationTurn(dto.customerId, { role: 'user', content: dto.message });
    this.appendConversationTurn(dto.customerId, { role: 'assistant', content: finalMessage });

    return {
      intent,
      agents,
      finalMessage,
      stage: 'complete',
      autopilot: { enabled, action: enabled ? 'enabled' : 'disabled' },
      context: { autopilotSettings: settings, simulated: true, realCharges: false },
    };
  }

  private isEsimStatusRequest(message: string): boolean {
    const normalized = this.normalizeText(message);
    return /\b(e\s*sim|esim)\b.*\b(enabled|active|on|off|disabled|status)\b/i.test(normalized) ||
      /\b(is|what|whether)\b.*\b(e\s*sim|esim)\b/i.test(normalized) ||
      /\b(e\s*sim|esim)\b.*\b(is|enabled|active|on|off|disabled)\b/i.test(normalized);
  }

  private isSimSecurityRequest(message: string): boolean {
    const normalized = this.normalizeText(message);
    const simTerm = /\b(sim|number|line)\b/i.test(normalized);
    const blockTerm =
      /\b(block|lock|disable|deactivate|suspend|stop|secure|lost|stolen|theft|compromise|fraud)\b/i.test(
        normalized,
      );
    return simTerm && blockTerm;
  }

  private isPhoneNumberVisibilityRequest(message: string): boolean {
    const normalized = this.normalizeText(message);
    const asksAboutPhoneNumber =
      /\b(phone\s*number|mobile\s*number|my\s*number|number)\b/i.test(normalized);
    const asksVisibility =
      /\b(see|know|find|show|read|detect|access|view)\b/i.test(normalized) ||
      /\b(can t\s+you|cant\s+you|can\s+you)\b/i.test(normalized);
    const referencesNetwork = /\b(network|sim|line|carrier|operator)\b/i.test(normalized);
    return asksAboutPhoneNumber && (asksVisibility || referencesNetwork);
  }

  private isEsimActivationFollowUp(customerId: string, message: string): boolean {
    const history = this.conversationHistoryByCustomer.get(customerId) ?? [];
    const lastAssistantMessage = [...history].reverse().find((turn) => turn.role === 'assistant')?.content ?? '';
    const refersToPreviousEsim = /e\s*sim/i.test(lastAssistantMessage) &&
      /disabled|activate|active/i.test(lastAssistantMessage);
    const awaitingDeviceId = /device\s+id/i.test(lastAssistantMessage);
    return (refersToPreviousEsim && /\b(activate|enable|turn\s+on|switch\s+on)\b/i.test(message)) ||
      (awaitingDeviceId && Boolean(this.getDeviceId(message)));
  }

  private isDeviceIdGuidanceRequest(customerId: string, message: string): boolean {
    const history = this.conversationHistoryByCustomer.get(customerId) ?? [];
    const lastAssistantMessage = [...history].reverse().find((turn) => turn.role === 'assistant')?.content ?? '';
    return /device\s+id/i.test(lastAssistantMessage) &&
      /\b(where|what|find|locate|know|check|see|discover|tell|show|how)\b/i.test(message) &&
      /\b(device|id|number)\b/i.test(message);
  }

  private getDeviceId(message: string): string | undefined {
    const explicitDevice = message.match(/\bdevice(?:\s+id)?\s*[:#-]?\s*([a-z0-9-]{3,})\b/i);
    return explicitDevice?.[1];
  }

  private isAvailablePlansRequest(message: string): boolean {
    return /\b(available|all|list|show|compare)\b.*\bplans?\b/i.test(message) || /\bplans?\s+available\b/i.test(message) || /\bplan\s+options\b/i.test(message);
  }

  private isRechargeOptionsRequest(message: string): boolean {
    return /\b(available|all|list|show|compare)\b.*\brecharge\b.*\boptions?\b/i.test(message) || /\brecharge\s+options\b/i.test(message) || /\btop\s*up\s+options\b/i.test(message);
  }

  private isDestinationTravelRequest(message: string): boolean {
    const namesADestination = /\b(?:going\s+to|travell?ing\s+to|visiting|visit)\s+[a-z]/i.test(message);
    const travelContext = /\b(travel|trip|abroad|roaming|recharge|package|plan|calling|data|days?|itinerary|tourism|sightseeing|hotel|flight)\b/i.test(message);
    return namesADestination && travelContext;
  }

  private isTelecomRoamingRequest(message: string): boolean {
    const travelContext = /\b(trip|travel|vacation|business trip|migration|relocation|study abroad|destination|roaming|international)\b/i.test(message);
    const knownDestination = /\b(dubai|paris|london|singapore|tokyo|japan|thailand|china|usa|united states|uk|united kingdom|australia|france|germany|brazil|kenya|bhutan|manila)\b/i.test(message);
    const destinationPhrase = /\b(?:going\s+to|travell?ing\s+to|visiting|visit|moving\s+to|relocating\s+to|studying\s+in|plan\s+(?:my\s+)?trip\s+to|what\s+should\s+i\s+do\s+in)\s+[a-z]/i.test(message);
    return travelContext || knownDestination || destinationPhrase;
  }

  private isRoamingPackagesRequest(message: string): boolean {
    return /\b(available|all|list|show|compare)\b.*\broaming\b.*\bpackages?\b/i.test(message) || /\broaming\s+packages?\b/i.test(message) || /\broaming\s+options\b/i.test(message);
  }

  private isNetworkCareFollowUp(message: string, networkCase: NetworkCareCase): boolean {
    if (/\b(?:bill|billing|plan|recharge|roaming|e[\s-]?sim|payment|balance)\b/i.test(message)) {
      return false;
    }

    if (networkCase.awaiting === 'location') {
      const wordCount = this.normalizeText(message).trim().split(/\s+/).length;
      return (
        wordCount <= 6 &&
        !this.isAffirmativeReply(message) &&
        !this.isNegativeReply(message)
      ) || /\b(?:in|at|near|around)\s+[a-z0-9]/i.test(message);
    }

    return (
      this.isAffirmativeReply(message) ||
      this.isNegativeReply(message) ||
      /\b(?:still|fixed|working|tried|restart|reboot|airplane|reset|disconnect|signal|data|internet|call|service)\b/i.test(
        message,
      )
    );
  }

  private isTelecomRelatedRequest(message: string): boolean {
    const normalized = this.normalizeText(message);
    const telecomTerms = [
      'plan', 'plans', 'recharge', 'topup', 'billing', 'bill', 'bills', 'invoice',
      'payment', 'pay', 'roaming', 'esim', 'sim', 'support', 'ticket',
      'profile', 'account', 'analytics', 'usage', 'data', 'call', 'calls', 'calling', 'minutes',
      'mobile', 'network', 'internet', 'bundle', 'travel', 'abroad', 'international',
      'netflix', 'hotstar', 'ott', 'upgrade', 'sms', 'wifi', 'broadband', 'signal', 'telecom',
      'carrier', 'airtel', 'jio', 'balance', 'validity', 'prepaid', 'postpaid',
    ];
    return telecomTerms.some((term) => new RegExp(`\\b${term}\\b`).test(normalized));
  }

  private isLifestyleTelecomNeed(message: string): boolean {
    const normalized = this.normalizeText(message);
    const lifestyleSignals = [
      'connected', 'connectivity', 'stay connected', 'internet', 'data usage', 'streaming',
      'travel', 'roaming', 'abroad', 'international', 'work from home', 'mobile', 'network',
      'signal', 'wifi', 'hotspot',
    ];

    const hasLifestyleSignal = lifestyleSignals.some((term) => new RegExp(`\\b${term}\\b`).test(normalized));
    const hasNeedVerb = /(need|want|looking for|need something|help me|get|find|choose|pick)/.test(normalized);
    const hasMultiUseContext = /(work|travel|entertainment|stream|family|household|business|gaming)/.test(normalized);

    return hasLifestyleSignal && (hasNeedVerb || hasMultiUseContext);
  }

  private isPlanShoppingRequest(message: string): boolean {
    return /\b(plan|package|bundle)\b/i.test(message) &&
      /\b(need|want|looking for|recommend|suggest|best|choose|pick|find)\b/i.test(message) &&
      !this.isCurrentPlanRequest(message) &&
      !this.isAvailablePlansRequest(message) &&
      !this.isDestinationTravelRequest(message);
  }

  private hasPersonalizedPlanDetails(message: string): boolean {
    const detailSignals = [
      /\b(?:budget|spend|under|below|around|inr|rs\.?|usd|dollars?)\b|[$₹]/i,
      /\b\d+\s*(?:gb|gigabytes?)\b|\b(?:data usage|data consumption|use .*data|need .*data)\b/i,
      /\b(?:calls?|calling|voice|minutes|talk time)\b/i,
      /\b(?:family|household|individual|solo|people|users|lines?)\b/i,
      /\b(?:stream|streaming|netflix|ott|youtube)\b/i,
      /\b(?:work from home|wfh|remote work|video calls?|conferencing)\b/i,
      /\b(?:device|phone|iphone|android|pixel|samsung|esim)\b/i,
      /\b(?:roaming|international|abroad|travel|trip)\b/i,
    ];

    return detailSignals.filter((signal) => signal.test(message)).length >= 2;
  }

  private isPlanDiscoveryFollowUp(customerId: string, message: string): boolean {
    const history = this.conversationHistoryByCustomer.get(customerId) ?? [];
    const lastAssistantMessage = [...history].reverse().find((turn) => turn.role === 'assistant')?.content ?? '';
    if (!/\?\s*$/.test(lastAssistantMessage) || this.isRecurringPaymentOrRechargeRequest(message) || this.hasPersonalizedPlanDetails(message)) {
      return false;
    }

    const answerPatterns: Array<[RegExp, RegExp]> = [
      [/\b(budget|spend|cost)\b/i, /[$₹]|\b\d+\b|budget|not sure|flexible/i],
      [/\b(data|gb|usage)\b/i, /\b\d+\s*(?:gb|gigabytes?)\b|data|usage|not sure/i],
      [/\b(call|minute|voice|talk time)\b/i, /\b\d+\b|call|minute|voice|unlimited|not sure/i],
      [/\b(roam|travel|abroad|destination|country)\b/i, /\b(?:often|rarely|sometimes|never|occasionally|yes|no|home|mostly|abroad|travel|trips?|roaming|international|countr(?:y|ies)|not sure)\b/i],
      [/\b(family|people|lines|individual|yourself)\b/i, /\b\d+\b|family|people|line|individual|myself|myself|not sure/i],
      [/\b(stream|streaming|netflix|ott)\b/i, /stream|netflix|ott|video|not sure/i],
      [/\b(work|remote|home)\b/i, /work|remote|home|video call|not sure/i],
      [/\b(device|phone|iphone|android)\b/i, /device|phone|iphone|android|pixel|samsung|not sure/i],
    ];

    return answerPatterns.some(([question, answer]) =>
      question.test(lastAssistantMessage) && answer.test(message),
    );
  }

  private isFollowUpConversationRequest(message: string): boolean {
    return /\b(what about|how about|tell me more|more about|can you|can u|could you|help me|what else|why|any updates|what happened|go on|continue)\b/i.test(message);
  }

  private isActionableTelecomRequest(message: string): boolean {
    return /\b(show|list|compare|recommend|suggest|recharge|top\s*up|pay|payment|billing|bill|invoice|history|plan|roaming|esim|activate|deactivate|support|ticket|profile|account|usage|manage|schedule|regular|interval|monthly|weekly|autopay|auto\s*debit|set\s*up|set\s*me\s*up|decide|travel|international|abroad|stream|netflix|hotstar|gaming|cheap|affordable|upgrade|bundle|package)\b/i.test(message);
  }

  private isRecurringPaymentOrRechargeRequest(message: string): boolean {
    const referencesPaymentOrRecharge = /\b(payment|pay|recharge|top\s*up)\b/i.test(message);
    const referencesRecurring =
      /\b(recurring|regular|schedule|scheduled|interval|autopay|auto\s*debit|automatic)\b/i.test(message) ||
      /\b(?:monthly|weekly)\s+(?:payment|recharge|top\s*up)\b|\b(?:payment|recharge|top\s*up)\s+(?:monthly|weekly)\b|\b(?:pay|recharge|top\s*up)\b.{0,15}\bevery\s+(?:month|week)\b/i.test(message);
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

  private findExplicitPlanMatches(message: string, plans: Plan[]): Plan[] {
    const normalizedMessage = this.normalizeText(message);
    const messageTokens = new Set(normalizedMessage.split(' '));
    const fullMatches = plans.filter((plan) => {
      const planTokens = this.normalizeText(plan.name).split(' ').filter(Boolean);
      return planTokens.length > 0 && planTokens.every((token) => messageTokens.has(token));
    });
    if (fullMatches.length > 0) return fullMatches;

    const ignoredTokens = new Set([
      'activate', 'switch', 'move', 'change', 'upgrade', 'subscribe', 'sign', 'me', 'up',
      'for', 'from', 'starting', 'effective', 'beginning', 'on', 'next', 'month', 'week',
      'tomorrow', 'today', 'the', 'plan', 'plans', 'package', 'packages', 'option', 'options',
      'my', 'please', 'i', 'want', 'to', 'now', 'that', 'this', 'same', 'selected',
      'recommended', 'it', 'a', 'an', 'do',
    ]);
    const requestedTokens = new Set(
      normalizedMessage.split(' ').filter((token) => token && !ignoredTokens.has(token)),
    );
    if (requestedTokens.size === 0) return [];

    return plans.filter((plan) =>
      this.normalizeText(plan.name)
        .split(' ')
        .some((token) => requestedTokens.has(token)),
    );
  }

  private isContextualPlanReference(message: string): boolean {
    return /\b(?:(?:this|that|same|selected|recommended)\s+(?:plan|one)|(?:the)\s+one)\b|\b(?:activate|switch|move|change|upgrade)\s+it\b/i.test(
      message,
    );
  }

  private buildPlanClarificationResponse(
    dto: AskDto,
    intent: string,
    agents: string[],
    plans: Plan[],
  ): OrchestratorResponse {
    this.presentedPlansByCustomer.set(dto.customerId, plans);
    const names = plans.map((plan) => plan.name).join(', ');
    const finalMessage = `I couldn't identify one exact plan to activate. Please choose from the available plans: ${names}. I won't prepare payment until you select a specific plan.`;
    this.appendConversationTurn(dto.customerId, { role: 'user', content: dto.message });
    this.appendConversationTurn(dto.customerId, { role: 'assistant', content: finalMessage });
    return {
      intent,
      agents: [...new Set([...agents, 'plan'])],
      finalMessage,
      stage: 'plans',
      availablePlans: plans,
    };
  }

  private isPlanActivationRequest(message: string): boolean {
    const action = /\b(?:activate|switch|move|change|upgrade|subscribe|sign me up)\b/i;
    const negatedAction = /\b(?:do not|don't|never|not)\b.{0,30}\b(?:activate|switch|move|change|upgrade|subscribe|sign me up)\b/i;
    return action.test(message) && !negatedAction.test(message);
  }

  private getRequestedPlanStartDate(message: string): string | undefined {
    const match = message.match(
      /\b(?:from|starting|effective(?:\s+from)?|beginning(?:\s+on)?)\s+(?:the\s+)?((?:next\s+month(?:\s+\d{1,2}(?:st|nd|rd|th)?(?:\s+[a-z]+)?)?|next\s+week|tomorrow|(?:\d{1,2}(?:st|nd|rd|th)?\s+)?(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+\d{4})?|\d{4}-\d{2}-\d{2}))/i,
    );
    return match?.[1]?.trim();
  }

  private handleExplicitPlanActivationRequest(
    dto: AskDto,
    intent: string,
    agents: string[],
    plan: Plan,
  ): OrchestratorResponse {
    const requestedStartDate = this.getRequestedPlanStartDate(dto.message);
    this.presentedPlansByCustomer.set(dto.customerId, [plan]);
    const dataAllowance = plan.dataGB < 0 ? 'unlimited data' : `${plan.dataGB}GB data`;
    const callingAllowance = plan.callMinutes < 0 ? 'unlimited calls' : `${plan.callMinutes} call minutes`;
    const price = `${formatCurrencyAmount(plan.price, plan.currency ?? 'USD')}/month`;
    const resolvedAgents = [...new Set([...agents, 'plan'])];
    const finalMessage = requestedStartDate
      ? `I found the exact ${plan.name} plan you asked for: ${dataAllowance}, ${callingAllowance}, at ${price}. You requested it to start ${requestedStartDate}. Future-dated activation is not supported in this demo, so I have not started payment or changed your plan. If you want it to start now instead, say “activate ${plan.name} now.”`
      : `I found the exact ${plan.name} plan you asked for: ${dataAllowance}, ${callingAllowance}, at ${price}. This is only a recommendation; nothing has changed. Choose the activation button below if you want to proceed.`;

    this.appendConversationTurn(dto.customerId, { role: 'user', content: dto.message });
    this.appendConversationTurn(dto.customerId, { role: 'assistant', content: finalMessage });

    return requestedStartDate
      ? {
          intent,
          agents: resolvedAgents,
          finalMessage,
          stage: 'complete',
          context: { requestedPlan: plan, requestedStartDate, schedulingSupported: false },
        }
      : {
          intent,
          agents: resolvedAgents,
          finalMessage,
          recommendation: { plan, reason: 'This is the exact plan you asked for.' },
          stage: 'recommendation',
          context: { requestedPlan: plan },
        };
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
    this.presentedPlansByCustomer.delete(customerId);
    this.travelRequirementsByCustomer.delete(customerId);
    this.networkCareByCustomer.delete(customerId);
    this.pendingSupportByCustomer.delete(customerId);
    this.consultativeFlow?.reset(customerId);
  }

  private appendConversationTurn(customerId: string, message: ConversationMessage): void {
    const history = this.conversationHistoryByCustomer.get(customerId) ?? [];
    const nextHistory = [...history, message];
    const trimmed = nextHistory.slice(-12);
    this.conversationHistoryByCustomer.set(customerId, trimmed);
  }

  private getConversationMessages(customerId: string, latestMessage: string): ConversationMessage[] {
    const history = this.conversationHistoryByCustomer.get(customerId) ?? [];
    const contextMessage = this.buildCustomerContextMessage(customerId);
    return [contextMessage, ...history, { role: 'user', content: latestMessage }];
  }

  /** Grounds the free-form chat turn in the customer's real account data so the LLM never has to ask for or guess known facts. */
  private buildCustomerContextMessage(customerId: string): ConversationMessage {
    try {
      const profile = this.profileService.getProfile(customerId);
      const analytics = this.analyticsService.getAnalytics(customerId);
      const plans = this.planService.getPlans(customerId);
      const currentPlan = plans.find((plan) => plan.name === profile.plan);

      const summary = [
        `Customer name: ${profile.name}`,
        `Current plan: ${profile.plan}${currentPlan ? ` (${currentPlan.dataGB}GB data, ${currentPlan.callMinutes === -1 ? 'unlimited' : currentPlan.callMinutes} minutes, $${currentPlan.price.toFixed(2)}/mo)` : ''}`,
        `Customer type: ${profile.customerType}`,
        `Account balance: $${profile.accountBalance}`,
        `Data usage: ${analytics.dataUsageGB}GB of ${analytics.dataLimitGB}GB`,
        `Call usage: ${analytics.callMinutes} of ${analytics.callLimit} minutes`,
        `Past roaming trips: ${analytics.roamingHistory.map((entry) => entry.country).join(', ') || 'none'}`,
      ].join('; ');

      return {
        role: 'system',
        content: `KNOWN ACCOUNT CONTEXT for this customer (already loaded — never ask the customer to repeat this or say you need to "check" it, just use it directly): ${summary}`,
      };
    } catch {
      return {
        role: 'system',
        content: 'Account context could not be loaded for this customer; do not guess account details, ask the customer directly instead.',
      };
    }
  }

  private recordCommunicationTrace(dto: AskDto, response: OrchestratorResponse) {
    const traceStart = Date.now();
    let stepIndex = 0;
    const nextTimestamp = () => new Date(traceStart + stepIndex++ * 120).toISOString();
    const steps: AgentCommunicationStep[] = [
      {
        agent: 'Orchestrator',
        action: 'Intent detected',
        detail: `Detected intent "${response.intent}" and selected agents: ${response.agents.join(', ') || 'none'}.`,
        timestamp: nextTimestamp(),
      },
      ...response.agents.map((agent) => ({
        agent,
        action: 'Agent engaged',
        detail: `Agent ${agent} handled the request.`,
        timestamp: nextTimestamp(),
      })),
      {
        agent: 'LLM',
        action: 'Generated response',
        detail: 'LLM generated the final assistant response.',
        timestamp: nextTimestamp(),
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

    const monthsMatch = message.match(
      /\b(?:past|last|previous)\s+(\d+|one|two|three|four|five)\s+months?\b/i,
    );
    if (monthsMatch) {
      return this.parseCount(monthsMatch[1]);
    }

    const looseMatch = message.match(/\b(\d+|one|two|three|four|five)\s+months?\b/i);
    return looseMatch ? this.parseCount(looseMatch[1]) : undefined;
  }

  private getRequestedBillingCount(message: string): number | undefined {
    if (/\b(?:last|past|previous)\s+bill\b/i.test(message)) {
      return 1;
    }

    const billsMatch = message.match(
      /\b(?:last|past|previous|show|give|fetch|get)\s+(\d+|one|two|three|four|five)\s+(?:bills?|invoices?|records?|statements?)\b/i,
    );
    if (billsMatch) {
      return this.parseCount(billsMatch[1]);
    }

    const looseBillsMatch = message.match(/\b(\d+|one|two|three|four|five)\s+(?:bills?|invoices?)\b/i);
    return looseBillsMatch ? this.parseCount(looseBillsMatch[1]) : undefined;
  }

  private parseCount(value: string): number {
    const number = Number(value);
    if (Number.isInteger(number)) {
      return number;
    }

    return { one: 1, two: 2, three: 3, four: 4, five: 5 }[value.toLowerCase()] ?? 1;
  }

  private async handleAsk(
    dto: AskDto,
    intent: string,
    agents: string[],
  ): Promise<OrchestratorResponse> {
    const isPlanActivationRequest = this.isPlanActivationRequest(dto.message);
    const pendingSupport = this.pendingSupportByCustomer.get(dto.customerId);
    if (pendingSupport && this.isAffirmativeReply(dto.message)) {
      return this.openPendingSupportTicket(dto, intent, agents, pendingSupport);
    }
    if (pendingSupport && this.isNegativeReply(dto.message)) {
      this.pendingSupportByCustomer.delete(dto.customerId);
      const finalMessage = 'Understood. I have not opened a support ticket.';
      this.appendConversationTurn(dto.customerId, { role: 'user', content: dto.message });
      this.appendConversationTurn(dto.customerId, { role: 'assistant', content: finalMessage });
      return { intent: 'support_inquiry', agents, finalMessage, stage: 'complete' };
    }
    if (pendingSupport) {
      this.pendingSupportByCustomer.delete(dto.customerId);
    }
    const travelRequirements = this.travelRequirementsByCustomer.get(dto.customerId);
    if (travelRequirements?.quotePending && this.isAffirmativeReply(dto.message)) {
      return this.createTravelQuoteRequest(dto, intent, agents, travelRequirements);
    }
    if (travelRequirements?.quotePending && this.isNegativeReply(dto.message)) {
      travelRequirements.quotePending = false;
      const finalMessage =
        'Understood — I have not opened a sales quote request. Your travel requirements remain available in this conversation if you want to revisit them.';
      this.appendConversationTurn(dto.customerId, { role: 'user', content: dto.message });
      this.appendConversationTurn(dto.customerId, { role: 'assistant', content: finalMessage });
      return { intent: 'TELECOM_ROAMING', agents, finalMessage, stage: 'complete' };
    }
    if (travelRequirements && this.isTravelRequirementsFollowUp(dto.message)) {
      this.mergeTravelRequirements(travelRequirements, dto.message);
      return this.respondToTravelRequirements(dto, intent, agents, travelRequirements);
    }
    const networkCase = this.networkCareByCustomer.get(dto.customerId);
    if (
      this.isNetworkIssueRequest(dto.message) ||
      (networkCase && this.isNetworkCareFollowUp(dto.message, networkCase))
    ) {
      this.clearPendingTravelQuote(dto.customerId);
      return this.handleNetworkCare(dto, intent, agents, networkCase);
    }
    if (this.isBillingConcern(dto.message)) {
      this.clearPendingTravelQuote(dto.customerId);
      return this.handleBillingConcern(dto, intent, agents);
    }
    if (this.isRechargeIssueRequest(dto.message)) {
      this.clearPendingTravelQuote(dto.customerId);
      return this.handleRechargeConcern(dto, intent, agents);
    }
    if (this.isServiceExitRequest(dto.message)) {
      this.clearPendingTravelQuote(dto.customerId);
      return this.handleServiceExitRequest(dto, intent, agents);
    }
    const previouslyPresentedPlans = this.presentedPlansByCustomer.get(dto.customerId);
    const isEsimActivationFollowUp = this.isEsimActivationFollowUp(dto.customerId, dto.message);
    if (isPlanActivationRequest && !isEsimActivationFollowUp) {
      const plansInContext = previouslyPresentedPlans ?? this.planService.getPlans(dto.customerId);
      const matchingPlans = this.findExplicitPlanMatches(dto.message, plansInContext);
      if (matchingPlans.length === 1) {
        return this.handleExplicitPlanActivationRequest(dto, intent, agents, matchingPlans[0]);
      }
      if (matchingPlans.length > 1) {
        return this.buildPlanClarificationResponse(dto, intent, agents, matchingPlans);
      }
      if (this.isContextualPlanReference(dto.message) && previouslyPresentedPlans?.length === 1) {
        return this.handleExplicitPlanActivationRequest(dto, intent, agents, previouslyPresentedPlans[0]);
      }
      if (this.isContextualPlanReference(dto.message) && previouslyPresentedPlans?.length) {
        return this.buildPlanClarificationResponse(dto, intent, agents, previouslyPresentedPlans);
      }
      if (/\b(?:plan|package|bundle)\b/i.test(dto.message)) {
        return this.buildPlanClarificationResponse(
          dto,
          intent,
          agents,
          previouslyPresentedPlans ?? this.planService.getPlans(dto.customerId),
        );
      }
    }
    const flowDecision = this.consultativeFlow?.handle(dto.customerId, dto.message);
    if (flowDecision) {
      return this.applyFlowDecision(dto, intent, agents, flowDecision);
    }

    const directTravelDestination = this.extractTravelDestination(dto.message);
    if (
      directTravelDestination &&
      this.isTelecomRoamingRequest(dto.message) &&
      /\b(?:roam(?:ing)?|travel|trip|abroad|international|package|plan)\b/i.test(dto.message) &&
      (/\b(?:unlimited\s+data|\d+(?:\.\d+)?\s*(?:gb|gigs?|gigabytes?))\b/i.test(dto.message) ||
        /\b\d[\d,]*\s*(?:(?:international|intl)\s*)?(?:call(?:ing)?\s*)?(?:minutes?|mins?)\b/i.test(dto.message))
    ) {
      const requirements = this.mergeTravelRequirements(
        {
          destination: directTravelDestination,
          esimRequested: false,
          companySponsored: false,
          quotePending: false,
          unlimitedDataRequested: false,
        },
        dto.message,
      );
      this.travelRequirementsByCustomer.set(dto.customerId, requirements);
      if (this.hasUnverifiedTravelRequirements(dto.customerId, requirements)) {
        return this.respondToTravelRequirements(dto, intent, agents, requirements);
      }
    }

    if (this.isSimSecurityRequest(dto.message)) {
      return this.handleSimSecurityRequest(dto, intent, agents);
    }

    if (this.isPhoneNumberVisibilityRequest(dto.message)) {
      return this.handlePhoneNumberVisibilityRequest(dto, intent, agents);
    }

    if (this.isEsimStatusRequest(dto.message)) {
      return this.handleEsimStatus(dto, intent, agents);
    }

    if (this.isDeviceIdGuidanceRequest(dto.customerId, dto.message)) {
      return this.handleDeviceIdGuidance(dto, intent, agents);
    }

    if (this.isEsimActivationFollowUp(dto.customerId, dto.message)) {
      return this.handleEsimActivation(dto, intent, agents);
    }

    const accountAnswer = this.answerAccountQuestion(dto, intent, agents);
    if (accountAnswer) {
      return accountAnswer;
    }

    const hasExistingConversation = (this.conversationHistoryByCustomer.get(dto.customerId) ?? []).length > 0;
    const isTelecomRelated =
      this.isTelecomRelatedRequest(dto.message) || this.isDestinationTravelRequest(dto.message);
    const isLifestyleTelecomNeed = this.isLifestyleTelecomNeed(dto.message);
    const isFollowUp = this.isFollowUpConversationRequest(dto.message);
    const isActionableTelecom = this.isActionableTelecomRequest(dto.message);
    const shouldStartPlanDiscovery =
      this.isPlanShoppingRequest(dto.message) &&
      !this.hasPersonalizedPlanDetails(dto.message) &&
      !this.isTelecomRoamingRequest(dto.message);
    const isPlanDiscoveryFollowUp = this.isPlanDiscoveryFollowUp(dto.customerId, dto.message);
    const shouldUseConversationChat =
      (!isTelecomRelated && !isLifestyleTelecomNeed) ||
      (hasExistingConversation && isFollowUp && !isActionableTelecom) ||
      shouldStartPlanDiscovery ||
      isPlanDiscoveryFollowUp;

    if (shouldUseConversationChat) {
      if (!isTelecomRelated && !isLifestyleTelecomNeed && !isPlanDiscoveryFollowUp) {
        const redirectQuestions = [
          'How much mobile data do you use in a typical month?',
          'What monthly budget would suit you for your mobile plan?',
          'Do you travel abroad often, or do you mostly need calls and data at home?',
        ];
        const priorTurns = (this.conversationHistoryByCustomer.get(dto.customerId) ?? []).length;
        const finalMessage = `Sorry, that's not something I can help with — I focus on telecom services. I'd be glad to help you find the right plan though. ${redirectQuestions[Math.floor(priorTurns / 2) % redirectQuestions.length]}`;
        this.appendConversationTurn(dto.customerId, { role: 'user', content: dto.message });
        this.appendConversationTurn(dto.customerId, { role: 'assistant', content: finalMessage });
        return { intent, agents, finalMessage, stage: 'complete' };
      }

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

    if (this.isAutopilotEnableRequest(dto.message)) {
      return this.handleAutopilotSetting(dto, intent, agents, true);
    }

    if (this.isAutopilotDisableRequest(dto.message)) {
      return this.handleAutopilotSetting(dto, intent, agents, false);
    }

    if (this.isCurrentPlanRequest(dto.message)) {
      const profile = this.profileService.getProfile(dto.customerId);
      const currentPlan = this.planService.getPlans(dto.customerId).find((plan) => plan.name === profile.plan);

      const finalMessage = currentPlan
        ? `Your current plan is ${currentPlan.name} at $${currentPlan.price.toFixed(2)}/mo. If you want to compare options, I can show all available plans. I can also check whether a better-fit plan or a travel pass would suit your usage.`
        : `Your current plan is ${profile.plan}. If you want to compare options, I can show all available plans. I can also check whether a better-fit plan or a travel pass would suit your usage.`;

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

    if (this.isAvailablePlansRequest(dto.message) && !this.isDestinationTravelRequest(dto.message)) {
      const availablePlans = this.planService.getPlans(dto.customerId);
      this.presentedPlansByCustomer.set(dto.customerId, availablePlans);
      const finalMessage = await this.llmProvider.generateResponse(
        { count: availablePlans.length },
        'Here are all {{count}} available plans: ',
      ).then((text) => `${text.trim()} Want me to tailor a custom plan from these around your usage, budget or travel?`);

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

    if (this.isRechargeOptionsRequest(dto.message) && !this.isDestinationTravelRequest(dto.message)) {
      const rechargeOptions = this.planService.getPlans(dto.customerId);
      this.presentedPlansByCustomer.set(dto.customerId, rechargeOptions);
      const finalMessage = await this.llmProvider.generateResponse(
        { count: rechargeOptions.length },
        'Here are all {{count}} available recharge options:',
      ).then((text) => `${text} Tell me how much data and calling you need and I will pick the best-value pack, or build you a custom bundle.`);

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
      ).then((text) => `${text} Tell me where and for how many days you are travelling and I will build a destination plan on your network.`);

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

      return {
        intent,
        agents,
        finalMessage: `${finalMessage} Would you like to pay a pending bill now, or should I check for a plan that could lower your monthly spend?`,
        stage: 'billing',
        billingHistory,
      };
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
    const customPlan = await this.customPlanComposerService.compose(
      dto.message,
      profile,
      analytics,
      intelligence,
      plans.find((plan) => plan.name === profile.plan)?.currency ?? 'USD',
    );

    // Keep ranked plans for context / fallback reference but don't use them as the offer.
    const rankedPlans = this.recommendationService.rankPlans(analytics, plans);

    const reason = [
      customPlan.discountNote ?? intelligence.exclusiveOfferHint,
      intelligence.motivation,
    ]
      .filter(Boolean)
      .join(' ');

    const templatedDraft = this.tellyResponseTemplateService.buildRecommendationMessage({
      message: dto.message,
      customerName: profile.name,
      customPlan,
      intelligence,
    });
    const finalMessage = templatedDraft;

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

  private clearPendingTravelQuote(customerId: string): void {
    const requirements = this.travelRequirementsByCustomer.get(customerId);
    if (requirements) requirements.quotePending = false;
  }

  private handleRechargeConcern(
    dto: AskDto,
    intent: string,
    agents: string[],
  ): OrchestratorResponse {
    this.pendingSupportByCustomer.set(dto.customerId, {
      category: 'recharge',
      issue: 'Recharge/payment reconciliation requested: customer reports that a recharge failed, was debited, or was not credited. Verify payment-gateway result and service provisioning before advising another attempt.',
      priority: 'medium',
    });
    const finalMessage =
      'I can’t verify this specific payment or provisioning status in the demo. If money was deducted, don’t repeat the recharge until its status is checked, to avoid a duplicate. I can ask support to reconcile the payment and activation; I haven’t opened a ticket yet. Would you like me to? Please don’t share full card or bank details.';
    this.appendConversationTurn(dto.customerId, { role: 'user', content: dto.message });
    this.appendConversationTurn(dto.customerId, { role: 'assistant', content: finalMessage });
    return {
      intent: 'recharge_support',
      agents: [...new Set([...agents, 'recharge', 'payment', 'support'])],
      finalMessage,
      stage: 'complete',
      context: { paymentStatusVerified: false, ticketRequiresConfirmation: true },
    };
  }

  private handleServiceExitRequest(
    dto: AskDto,
    intent: string,
    agents: string[],
  ): OrchestratorResponse {
    this.pendingSupportByCustomer.set(dto.customerId, {
      category: 'service-change',
      issue: `Service change request: customer asked to cancel, disconnect, or port out. No plan, number, or account change has been made. An agent must verify the request and explain any applicable terms.`,
      priority: 'medium',
    });
    const finalMessage =
      'I understand. I won’t obstruct your choice or make a change without confirmation. Cancellation and number porting aren’t connected in this demo, but I can route your request to a support agent. Would you like me to open a request?';
    this.appendConversationTurn(dto.customerId, { role: 'user', content: dto.message });
    this.appendConversationTurn(dto.customerId, { role: 'assistant', content: finalMessage });
    return {
      intent: 'service_change_request',
      agents: [...new Set([...agents, 'support'])],
      finalMessage,
      stage: 'complete',
      context: { serviceChangePerformed: false, ticketRequiresConfirmation: true },
    };
  }

  private handleNetworkCare(
    dto: AskDto,
    intent: string,
    agents: string[],
    existingCase?: NetworkCareCase,
  ): OrchestratorResponse {
    const message = dto.message;
    const symptom = /\b(?:poor\s+signal|weak\s+signal|poor\s+reception)\b/i.test(message)
      ? 'weak-signal'
      : /\b(?:no\s+(?:mobile\s+)?service|no\s+signal)\b/i.test(message)
        ? 'no-service'
        : /\b(?:dropped\s+calls?|calls?\s+(?:keep|keeps)\s+dropping)\b/i.test(message)
          ? 'dropped-calls'
          : /\b(?:slow\s+(?:mobile\s+)?(?:data|internet|connection)|(?:mobile\s+)?(?:data|internet|connection)\s+(?:is\s+)?slow)\b/i.test(message)
            ? 'slow-data'
            : 'mobile-data';
    const networkCase =
      existingCase ?? { symptom, diagnosticsTried: false, awaiting: 'location' as const };
    const location = this.extractNetworkLocation(message, networkCase.awaiting === 'location');
    if (location) networkCase.location = location;

    const hasNotTried = /\b(?:not|never|haven.t|have\s+not)\s+(?:yet\s+)?tried\b/i.test(message);
    const triedDiagnostics =
      !hasNotTried &&
      /\b(?:already|tried|restart(?:ed)?|reboot(?:ed)?|airplane\s+mode|reset\s+(?:the\s+)?network)\b/i.test(
        message,
      );
    if (triedDiagnostics) networkCase.diagnosticsTried = true;

    const persists =
      /\b(?:still|continues?|keeps?|not\s+(?:fixed|working)|no\s+improvement|same\s+issue)\b/i.test(
        message,
      );
    const resolved =
      /\b(?:fixed|working\s+now|back\s+to\s+normal|resolved|sorted|no\s+longer)\b/i.test(
        message,
      );

    if (networkCase.awaiting === 'location' && !networkCase.location) {
      this.networkCareByCustomer.set(dto.customerId, networkCase);
      return this.buildNetworkCareReply(
        dto,
        intent,
        agents,
        'I’m sorry you’re dealing with that. I don’t have a live Airtel/Jio outage feed connected, so I can’t confirm a local outage. I can guide you through safe checks and prepare a support case if needed. Which city or PIN code is affected? Please don’t share a full street address.',
        networkCase,
      );
    }

    if (networkCase.awaiting === 'location') {
      if (networkCase.diagnosticsTried && persists) {
        return this.requestNetworkEscalation(dto, intent, agents, networkCase);
      }
      networkCase.awaiting = 'diagnostics';
      this.networkCareByCustomer.set(dto.customerId, networkCase);
      if (networkCase.diagnosticsTried) {
        networkCase.awaiting = 'result';
        return this.buildNetworkCareReply(
          dto,
          intent,
          agents,
          'You’ve already tried the basic reconnect steps. Is the problem still happening?',
          networkCase,
        );
      }
      return this.buildNetworkCareReply(
        dto,
        intent,
        agents,
        this.getNetworkDiagnosticSteps(networkCase.symptom),
        networkCase,
      );
    }

    if (networkCase.awaiting === 'diagnostics') {
      if (networkCase.diagnosticsTried && persists) {
        return this.requestNetworkEscalation(dto, intent, agents, networkCase);
      }
      if (networkCase.diagnosticsTried || this.isAffirmativeReply(message)) {
        networkCase.diagnosticsTried = true;
        networkCase.awaiting = 'result';
        this.networkCareByCustomer.set(dto.customerId, networkCase);
        return this.buildNetworkCareReply(
          dto,
          intent,
          agents,
          'Thanks for checking. Is the connection still failing after those steps?',
          networkCase,
        );
      }

      if (this.isNegativeReply(message)) {
        networkCase.awaiting = 'result';
        this.networkCareByCustomer.set(dto.customerId, networkCase);
        return this.buildNetworkCareReply(
          dto,
          intent,
          agents,
          `${this.getNetworkDiagnosticInstructions(networkCase.symptom)} After trying those steps, tell me whether the service is working again.`,
          networkCase,
        );
      }

      networkCase.awaiting = 'result';
      this.networkCareByCustomer.set(dto.customerId, networkCase);
      return this.buildNetworkCareReply(
        dto,
        intent,
        agents,
        `${this.getNetworkDiagnosticInstructions(networkCase.symptom)} After trying those steps, tell me whether the service is working again.`,
        networkCase,
      );
    }

    if (networkCase.diagnosticsTried && (resolved || (this.isNegativeReply(message) && !persists))) {
      this.networkCareByCustomer.delete(dto.customerId);
      return this.buildNetworkCareReply(
        dto,
        intent,
        agents,
        'Glad it’s working again. I haven’t opened a support ticket. If the problem returns, tell me the affected area and symptom and I’ll pick up from there.',
        networkCase,
      );
    }

    if (
      (networkCase.diagnosticsTried && (persists || this.isAffirmativeReply(message))) ||
      (!networkCase.diagnosticsTried &&
        (persists || (this.isNegativeReply(message) && !resolved)))
    ) {
      networkCase.diagnosticsTried = true;
      return this.requestNetworkEscalation(dto, intent, agents, networkCase);
    }

    if (resolved || this.isAffirmativeReply(message)) {
      this.networkCareByCustomer.delete(dto.customerId);
      return this.buildNetworkCareReply(
        dto,
        intent,
        agents,
        'Glad it’s working again. I haven’t opened a support ticket. If the problem returns, tell me the affected area and symptom and I’ll pick up from there.',
        networkCase,
      );
    }

    this.networkCareByCustomer.set(dto.customerId, networkCase);
    return this.buildNetworkCareReply(
      dto,
      intent,
      agents,
      'Is the network problem still happening after the checks?',
      networkCase,
    );
  }

  private extractNetworkLocation(message: string, allowShortAnswer: boolean): string | undefined {
    const match = message.match(
      /\b(?:in|at|near|around)\s+([a-z0-9][a-z0-9\s-]{1,39}?)(?=\s+(?:for|and|with|but|where|when|please|the|my|after)\b|[,.;!?]|$)/i,
    );
    const location = match?.[1]?.trim();
    if (location) return location.slice(0, 50);

    if (!allowShortAnswer || this.isAffirmativeReply(message) || this.isNegativeReply(message)) {
      return undefined;
    }

    const candidate = message.trim().replace(/[,.!?]+$/, '');
    if (
      this.isNetworkIssueRequest(candidate) ||
      candidate.split(/\s+/).length > 3 ||
      /\b(?:i|my|have|no|poor|weak|signal|service|internet|mobile|data|calls?|plan|bill|recharge|roaming|payment)\b/i.test(
        candidate,
      )
    ) {
      return undefined;
    }
    return candidate.slice(0, 50);
  }

  private getNetworkDiagnosticSteps(
    symptom: NetworkCareCase['symptom'],
  ): string {
    return `${this.getNetworkDiagnosticInstructions(symptom)} These steps won’t confirm an outage, since I don’t have live network telemetry here. Have you already tried them?`;
  }

  private getNetworkDiagnosticInstructions(
    symptom: NetworkCareCase['symptom'],
  ): string {
    const steps =
      symptom === 'slow-data'
        ? 'Try toggling Airplane Mode on for 15 seconds and off, then check mobile data with Wi-Fi turned off. If you use a VPN or Data Saver, briefly check whether it is limiting the connection.'
        : symptom === 'dropped-calls'
          ? 'Restart the phone, then try a call from a different nearby spot. If your device supports VoLTE/4G Calling, check that it is enabled.'
          : symptom === 'weak-signal'
            ? 'Compare reception in an open area and another nearby location, since indoor coverage can vary. Toggle Airplane Mode on for 15 seconds and off, then check whether the signal improves.'
          : symptom === 'no-service'
            ? 'Check that Airplane Mode is off, toggle it on for 15 seconds and off, then restart the phone.'
            : 'Check that Mobile Data is enabled, toggle Airplane Mode on for 15 seconds and off, then restart the phone.';
    return steps;
  }

  private buildNetworkCareReply(
    dto: AskDto,
    intent: string,
    agents: string[],
    finalMessage: string,
    networkCase: NetworkCareCase,
  ): OrchestratorResponse {
    this.appendConversationTurn(dto.customerId, { role: 'user', content: dto.message });
    this.appendConversationTurn(dto.customerId, { role: 'assistant', content: finalMessage });
    return {
      intent: 'network_support',
      agents: [...new Set([...agents, 'support'])],
      finalMessage,
      stage: 'complete',
      context: {
        networkIssue: networkCase.symptom,
        approximateLocation: networkCase.location,
        diagnosticsTried: networkCase.diagnosticsTried,
      },
    };
  }

  private requestNetworkEscalation(
    dto: AskDto,
    intent: string,
    agents: string[],
    networkCase: NetworkCareCase,
  ): OrchestratorResponse {
    const location = networkCase.location ? ` near ${networkCase.location}` : '';
    const steps = networkCase.diagnosticsTried ? ' Basic reconnect/restart steps were tried.' : '';
    const priority = networkCase.symptom === 'no-service' ? 'high' : 'medium';
    this.pendingSupportByCustomer.set(dto.customerId, {
      category: 'network',
      issue: `Network support request: ${networkCase.symptom.replace(/-/g, ' ')}${location}.${steps} Live outage status was not verified; investigate network telemetry and coverage.`,
      priority,
    });
    this.networkCareByCustomer.delete(dto.customerId);
    return this.buildNetworkCareReply(
      dto,
      intent,
      agents,
      'Since it is still happening, I can send these details to a support agent to check coverage and network telemetry. I haven’t opened a ticket yet. Would you like me to open one?',
      networkCase,
    );
  }

  private handleBillingConcern(
    dto: AskDto,
    intent: string,
    agents: string[],
  ): OrchestratorResponse {
    const records = this.billingService
      .getBillingHistory(dto.customerId)
      .slice()
      .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
    const recent = records.slice(0, 2);
    const latest = recent[0];
    const previous = recent[1];
    let comparison = 'I can’t compare it because there is no statement history on this account.';
    if (latest && previous) {
      const difference = latest.amount - previous.amount;
      comparison =
        difference > 0
          ? `The latest recorded bill is ${formatCurrencyAmount(latest.amount, 'USD')}, up ${formatCurrencyAmount(difference, 'USD')} from the previous ${formatCurrencyAmount(previous.amount, 'USD')}.`
          : difference < 0
            ? `The latest recorded bill is ${formatCurrencyAmount(latest.amount, 'USD')}, down ${formatCurrencyAmount(Math.abs(difference), 'USD')} from the previous ${formatCurrencyAmount(previous.amount, 'USD')}.`
            : `The latest and previous recorded bills are both ${formatCurrencyAmount(latest.amount, 'USD')}; this account history doesn’t show an increase.`;
    } else if (latest) {
      comparison = `The latest recorded bill is ${formatCurrencyAmount(latest.amount, 'USD')}, but there isn’t an earlier bill here to compare.`;
    }

    const itemization =
      'The demo statement records don’t include itemized usage or fee details, so I can’t attribute the amount to roaming, overages, or add-ons.';
    this.pendingSupportByCustomer.set(dto.customerId, {
      category: 'billing',
      issue: `Billing investigation requested: customer reports an unexpectedly high bill. Latest recorded amount: ${latest ? formatCurrencyAmount(latest.amount, 'USD') : 'not available'}; prior recorded amount: ${previous ? formatCurrencyAmount(previous.amount, 'USD') : 'not available'}. Review itemized charges with the customer.`,
      priority: /\b(?:unauthori[sz]ed|charged\s+twice|fraud|unknown\s+charge)\b/i.test(dto.message)
        ? 'high'
        : 'medium',
    });
    const finalMessage = `${comparison} ${itemization} I can ask a support agent to investigate the itemized statement. I haven’t opened a ticket yet. Would you like me to?`;
    this.appendConversationTurn(dto.customerId, { role: 'user', content: dto.message });
    this.appendConversationTurn(dto.customerId, { role: 'assistant', content: finalMessage });
    return {
      intent: 'billing_dispute',
      agents: [...new Set([...agents, 'billing', 'support'])],
      finalMessage,
      stage: 'billing',
      billingHistory: recent,
      context: { billingComparison: { latest, previous } },
    };
  }

  private openPendingSupportTicket(
    dto: AskDto,
    intent: string,
    agents: string[],
    request: PendingSupportRequest,
  ): OrchestratorResponse {
    if (!this.supportService) {
      const finalMessage =
        'The support service is unavailable right now, so I haven’t opened a ticket. Please try again later.';
      this.appendConversationTurn(dto.customerId, { role: 'user', content: dto.message });
      this.appendConversationTurn(dto.customerId, { role: 'assistant', content: finalMessage });
      return { intent, agents, finalMessage, stage: 'complete' };
    }

    const ticket = this.supportService.createTicket(
      dto.customerId,
      request.issue,
      request.priority,
    );
    this.pendingSupportByCustomer.delete(dto.customerId);
    const finalMessage = `I’ve opened a ${request.category} support request (reference ${ticket.id}). A support agent can review the details; I haven’t claimed the issue is resolved.`;
    this.appendConversationTurn(dto.customerId, { role: 'user', content: dto.message });
    this.appendConversationTurn(dto.customerId, { role: 'assistant', content: finalMessage });
    return {
      intent: 'support_request',
      agents: [...new Set([...agents, 'support'])],
      finalMessage,
      stage: 'complete',
      context: { supportTicket: ticket },
    };
  }

  private answerAccountQuestion(dto: AskDto, intent: string, agents: string[]): OrchestratorResponse | null {
    const message = dto.message;
    const asksLastRecharge =
      /\b(?:last|previous|latest|recent)\b.{0,20}\b(?:recharge|re-?charged|top\s*up|payment|paid|plan)\b/i.test(message) ||
      /\bwhen\b.{0,25}\b(?:last|recently)\b.{0,15}\b(?:recharge|paid|pay|top\s*up)\b/i.test(message);
    const asksUsage =
      /\b(?:data|minutes|calls?)\s+(?:left|remaining|usage|used)\b/i.test(message) ||
      /\bhow\s+much\b.{0,20}\b(?:data|minutes)\b.{0,20}\b(?:left|remaining|used|consumed)\b/i.test(message);
    const asksBalance = /\b(?:account\s+)?balance\b|\bhow\s+much\s+credit\b/i.test(message);

    if (this.isPayBillRequest(message) || !(asksLastRecharge || asksUsage || asksBalance)) {
      return null;
    }

    const profile = this.profileService.getProfile(dto.customerId);
    const analytics = this.analyticsService.getAnalytics(dto.customerId);
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const formatDate = (value: string) => {
      const date = new Date(value);
      return `${date.getUTCDate()} ${months[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
    };

    let finalMessage: string;
    let billingHistory: BillingRecord[] | undefined;
    let stage: OrchestratorStage = 'complete';

    if (asksLastRecharge) {
      const paid = this.billingService
        .getBillingHistory(dto.customerId)
        .filter((record) => record.status === 'paid')
        .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime());
      const lastRecharge = paid.find((record) => record.description.startsWith('Plan change/recharge'));
      const latest = lastRecharge ?? paid[0];

      if (!latest) {
        finalMessage = `I can't see any completed recharge or payment on your account yet, ${profile.name.split(' ')[0]}. You're on ${profile.plan}. Want me to find a plan that fits how you use your phone?`;
      } else if (lastRecharge) {
        const planId = lastRecharge.description.replace('Plan change/recharge - ', '').trim();
        const planName = this.planService.getPlanById(planId)?.name ?? planId;
        finalMessage = `Your last recharge was the ${planName} plan on ${formatDate(lastRecharge.date)} for $${lastRecharge.amount.toFixed(2)}. You're currently on ${profile.plan}, and you've used ${analytics.dataUsageGB}GB of ${analytics.dataLimitGB}GB this cycle. Would you like to repeat that recharge, or should I check whether a better-fit plan would save you money?`;
        billingHistory = [lastRecharge];
        stage = 'billing';
      } else {
        finalMessage = `I don't see a separate manual recharge on your account. Your most recent payment was ${formatDate(latest.date)}: ${latest.description}, $${latest.amount.toFixed(2)}, and it's marked paid. You're on ${profile.plan}, with ${analytics.dataUsageGB}GB of ${analytics.dataLimitGB}GB used this cycle. Would you like me to check whether a better-fit plan or an add-on would suit your usage?`;
        billingHistory = [latest];
        stage = 'billing';
      }
    } else if (asksUsage) {
      const dataLeft = Math.max(analytics.dataLimitGB - analytics.dataUsageGB, 0);
      const callsLeft = analytics.callLimit < 0 ? 'unlimited calling' : `${Math.max(analytics.callLimit - analytics.callMinutes, 0)} call minutes left`;
      finalMessage = `You've used ${analytics.dataUsageGB}GB of your ${analytics.dataLimitGB}GB, so you have ${dataLeft.toFixed(1)}GB left, with ${callsLeft}. ${dataLeft < analytics.dataLimitGB * 0.2 ? 'You are running low on data, so I can suggest a data booster or a bigger plan before you run out. Shall I?' : 'You are well covered for now. Want me to check whether a cheaper plan would still fit your usage?'}`;
    } else {
      finalMessage = `Your account balance is $${profile.accountBalance}. You're on ${profile.plan}. Would you like me to check pending bills or find a way to lower your monthly spend?`;
    }

    this.appendConversationTurn(dto.customerId, { role: 'user', content: dto.message });
    this.appendConversationTurn(dto.customerId, { role: 'assistant', content: finalMessage });

    return {
      intent: 'account_inquiry',
      agents: [...new Set([...agents, 'profile', 'billing', 'analytics'])],
      finalMessage,
      stage,
      billingHistory,
    };
  }

  private async applyFlowDecision(
    dto: AskDto,
    intent: string,
    agents: string[],
    decision: FlowDecision,
  ): Promise<OrchestratorResponse> {
    if (decision.kind === 'delegate') {
      return this.handleAsk(
        { ...dto, message: 'I need a personalised plan for my new phone with unlimited calls, 50GB data and device protection' },
        'plan_recommendation',
        ['profile', 'analytics', 'plan'],
      );
    }

    if (decision.kind === 'travel_offer') {
      return this.buildTravelOffer(dto, decision);
    }

    let finalMessage = decision.message;
    if (decision.action === 'block_sim') {
      const ticket = this.supportService?.createTicket(
        dto.customerId,
        'Lost or stolen phone: block SIM immediately and arrange replacement',
        'high',
      );
      finalMessage = finalMessage.replace(' (reference {{ticket}})', ticket ? ` (reference ${ticket.id})` : '');
    }

    this.appendConversationTurn(dto.customerId, { role: 'user', content: dto.message });
    this.appendConversationTurn(dto.customerId, { role: 'assistant', content: finalMessage });

    return {
      intent: decision.intent || intent,
      agents: decision.agents,
      finalMessage,
      stage: 'complete',
      context: decision.context,
    };
  }

  private async buildTravelOffer(
    dto: AskDto,
    decision: Extract<FlowDecision, { kind: 'travel_offer' }>,
  ): Promise<OrchestratorResponse> {
    const requirements = this.mergeTravelRequirements(
      {
        destination: decision.destination,
        days: decision.days,
        dataGB: decision.dataGB,
        unlimitedDataRequested: false,
        esimRequested: false,
        companySponsored: false,
        quotePending: false,
      },
      dto.message,
    );
    this.travelRequirementsByCustomer.set(dto.customerId, requirements);

    if (this.hasUnverifiedTravelRequirements(dto.customerId, requirements)) {
      return this.respondToTravelRequirements(dto, 'TELECOM_ROAMING', ['roaming', 'profile', 'analytics', 'plan'], requirements);
    }

    const profile = this.profileService.getProfile(dto.customerId);
    const analytics = this.analyticsService.getAnalytics(dto.customerId);
    const intelligence = this.customerIntelligenceService.analyzeCustomer(
      profile,
      analytics,
      this.billingService.getBillingHistory(dto.customerId),
    );

    const base = decision.composeMessage;
    const accountCurrency =
      this.planService.getPlans(dto.customerId).find((plan) => plan.name === profile.plan)?.currency ?? 'USD';
    const compose = (extra: string): Promise<CustomPlan> =>
      this.customPlanComposerService.compose(
        `${base} ${extra}`.trim(),
        profile,
        analytics,
        intelligence,
        accountCurrency,
      );
    const heavyData = (decision.dataGB ?? 0) >= 25;
    const [essential, balanced, premium] = await Promise.all([
      compose(''),
      compose(`${heavyData ? '50gb' : '25gb'} international call`),
      compose('unlimited data unlimited calls netflix'),
    ]);

    const firstName = profile.name.split(' ')[0];
    const provider = balanced.provider ?? profile.currentNetwork;
    const place = decision.destination.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
    const stay = decision.days ? ` for ${decision.days} days` : '';
    const summarize = (plan: CustomPlan) =>
      `${formatCurrencyAmount(plan.price, plan.currency)}/month with ${plan.components.slice(0, 3).map((component) => component.name).join(', ')}`;
    const need =
      decision.purpose === 'data' ? 'mostly data' : decision.purpose === 'voice' ? 'mostly calls' : 'both data and calls';
    const offerNote = balanced.discountNote ?? 'Because you are a valued customer, I will keep your current benefits intact while you are away.';
    const currencyNote = balanced.currencyRateDate
      ? ` Prices are shown in ${balanced.currency} after conversion from the INR catalog using exchange rates dated ${balanced.currencyRateDate}.`
      : balanced.currencyNote
        ? ` ${balanced.currencyNote}`
        : '';

    const finalMessage =
      `${firstName}, ${place}${stay} with ${need} — I have built three options for you, using only ${provider} packs so everything works on your own network:\n` +
      `- Essential: ${summarize(essential)}\n` +
      `- Balanced, my pick for you: ${summarize(balanced)}\n` +
      `- Premium: ${summarize(premium)}\n` +
      `${offerNote}${currencyNote} Tap Activate to take the Balanced plan, or tell me if you want more data, more calling or streaming added.`;

    this.appendConversationTurn(dto.customerId, { role: 'user', content: dto.message });
    this.appendConversationTurn(dto.customerId, { role: 'assistant', content: finalMessage });

    return {
      intent: 'TELECOM_ROAMING',
      agents: ['roaming', 'profile', 'analytics', 'plan'],
      recommendation: { plan: balanced as unknown as Plan, reason: offerNote },
      finalMessage,
      stage: 'recommendation',
      context: {
        profile,
        analytics,
        customPlan: balanced,
        planOptions: { essential, balanced, premium },
        travel: {
          destination: decision.destination,
          days: decision.days,
          purpose: decision.purpose,
          dataGB: decision.dataGB,
        },
        travelRequirements: requirements,
      },
    };
  }

  private mergeTravelRequirements(
    requirements: TravelPlanRequirements,
    message: string,
  ): TravelPlanRequirements {
    const dataMatch = message.match(
      /\b(\d+(?:\.\d+)?)\s*(?:gb|gigs?|gigabytes?)\b/i,
    );
    const durationMatch = message.match(/\b(\d+)\s*(?:days?|nights?)\b/i);
    const minutesMatch = message.match(
      /\b(\d[\d,]*)\s*(?:(?:international|intl)\s*)?(?:call(?:ing)?\s*)?(?:minutes?|mins?)\b/i,
    );
    const destinationMatch = message.match(
      /\b(?:calls?|calling(?:\s+minutes?)?)\s+to\s+([a-z][a-z\s-]{1,30})/i,
    );
    const callDestination = destinationMatch?.[1]
      ?.replace(/\b(?:and|with|for|please|as|because)\b.*$/i, '')
      .trim();

    if (dataMatch) requirements.dataGB = Number(dataMatch[1]);
    if (/\bunlimited\s+data\b/i.test(message)) requirements.unlimitedDataRequested = true;
    if (durationMatch) requirements.days = Number(durationMatch[1]);
    if (minutesMatch) {
      requirements.internationalMinutes = Number(
        minutesMatch[1].replace(/,/g, ''),
      );
    }
    if (callDestination) requirements.internationalCallDestination = callDestination;
    if (/\be[\s-]?sim\b/i.test(message)) requirements.esimRequested = true;
    if (
      /\b(?:company|employer|corporate|business)\b.{0,40}\b(?:pay|sponsor|cover|billing|account)|\b(?:pay|sponsor|cover).{0,40}\b(?:company|employer|corporate|business)\b/i.test(
        message,
      )
    ) {
      requirements.companySponsored = true;
    }

    return requirements;
  }

  private isTravelRequirementsFollowUp(message: string): boolean {
    return /\b(?:roam(?:ing)?|e[\s-]?sim|company|employer|corporate|sponsor(?:ed|ship)?|(?:\d+(?:\.\d+)?)\s*(?:gb|gigs?|gigabytes?|minutes?|mins?)|international calls?)\b/i.test(
      message,
    );
  }

  private extractTravelDestination(message: string): string | undefined {
    const match = message.match(
      /\b(?:in|to|for)\s+(?:the\s+)?([a-z]+(?:\s+[a-z]+){0,2}?)(?=\s+(?:for|with|and|need|want|please|while|company|e[\s-]?sim)\b|[,.!?]|$)/i,
    );
    return match?.[1]?.trim().toLowerCase();
  }

  private hasUnverifiedTravelRequirements(
    customerId: string,
    requirements: TravelPlanRequirements,
  ): boolean {
    if (
      requirements.dataGB === undefined &&
      !requirements.unlimitedDataRequested &&
      requirements.internationalMinutes === undefined
    ) {
      return false;
    }

    const normalize = (value: string) => value.toLowerCase().replace(/[^a-z]/g, '');
    const destination = normalize(requirements.destination);
    return !this.roamingService
      .getRoamingPackages(customerId)
      .some((roamingPackage) => {
        const coversDestination = roamingPackage.countries.some(
          (country) => normalize(country) === destination,
        );
        const coversDuration =
          requirements.days === undefined ||
          roamingPackage.days >= requirements.days;
        const coversData =
          !requirements.unlimitedDataRequested &&
          (requirements.dataGB === undefined ||
            roamingPackage.dataGB >= requirements.dataGB);
        // RoamingPackage has no international-minutes allowance, so it cannot verify that constraint.
        const coversCalls = requirements.internationalMinutes === undefined;
        return coversDestination && coversDuration && coversData && coversCalls;
      });
  }

  private respondToTravelRequirements(
    dto: AskDto,
    intent: string,
    agents: string[],
    requirements: TravelPlanRequirements,
  ): OrchestratorResponse {
    const profile = this.profileService.getProfile(dto.customerId);
    const destinationName = requirements.destination.replace(
      /\b[a-z]/g,
      (letter) => letter.toUpperCase(),
    );
    const stay = requirements.days ? ` for ${requirements.days} days` : '';
    const data = requirements.unlimitedDataRequested
      ? 'unlimited data'
      : requirements.dataGB !== undefined
        ? `${requirements.dataGB}GB data`
        : undefined;
    const calls =
      requirements.internationalMinutes !== undefined
        ? `${requirements.internationalMinutes} international calling minutes${requirements.internationalCallDestination ? ` to ${requirements.internationalCallDestination}` : ''}`
        : undefined;
    const needs = [data, calls].filter(Boolean).join(' and ');
    const esim = requirements.esimRequested
      ? ' The eSIM service in this demo supports activation and status only; it has no destination-specific eSIM offers or device-compatibility catalog.'
      : '';
    const sponsorship = requirements.companySponsored
      ? ' Company-sponsored billing is not configured in this demo.'
      : '';
    const matchingDestinationPackages = this.roamingService
      .getRoamingPackages(dto.customerId)
      .filter((roamingPackage) =>
        roamingPackage.countries.some(
          (country) =>
            country.toLowerCase().replace(/[^a-z]/g, '') ===
            requirements.destination.toLowerCase().replace(/[^a-z]/g, ''),
        ),
      );
    const catalogStatus = matchingDestinationPackages.length
      ? `The catalog does list roaming packages for ${destinationName}, but none verifies every requested data, duration, and calling requirement.`
      : `The catalog lists no roaming package for ${destinationName}.`;
    const finalMessage =
      `${profile.name.split(' ')[0]}, I’ve kept your requirements together: ${destinationName}${stay}${needs ? `, ${needs}` : ''}` +
      `${requirements.esimRequested ? ', eSIM' : ''}${requirements.companySponsored ? ', paid by your company' : ''}. ` +
      `I can’t verify a roaming package in this account’s catalog that meets them. ${catalogStatus}` +
      `${requirements.internationalMinutes !== undefined ? ' Package details also do not specify international calling minutes.' : ''}` +
      `${esim}${sponsorship} I won’t present a smaller data pack as if it covered your full request. Would you like me to open a sales quote request for these requirements?`;

    requirements.quotePending = true;
    this.appendConversationTurn(dto.customerId, {
      role: 'user',
      content: dto.message,
    });
    this.appendConversationTurn(dto.customerId, {
      role: 'assistant',
      content: finalMessage,
    });

    return {
      intent: 'TELECOM_ROAMING',
      agents: [...new Set([...agents, 'roaming', 'support'])],
      finalMessage,
      stage: 'complete',
      context: {
        travelRequirements: requirements,
        quoteRequestRequiresConfirmation: true,
      },
    };
  }

  private createTravelQuoteRequest(
    dto: AskDto,
    intent: string,
    agents: string[],
    requirements: TravelPlanRequirements,
  ): OrchestratorResponse {
    if (!this.supportService) {
      const finalMessage =
        'I can’t submit the sales quote request right now because the support service is unavailable. Your requirements are still in this conversation; please try again later.';
      this.appendConversationTurn(dto.customerId, {
        role: 'user',
        content: dto.message,
      });
      this.appendConversationTurn(dto.customerId, {
        role: 'assistant',
        content: finalMessage,
      });
      return {
        intent,
        agents: [...new Set([...agents, 'support'])],
        finalMessage,
        stage: 'complete',
      };
    }

    const ticket = this.supportService.createTicket(
      dto.customerId,
      `Enterprise quote request: ${requirements.destination.replace(/\b[a-z]/g, (letter) => letter.toUpperCase())}, ${requirements.days ?? 'unspecified'} days, ${requirements.unlimitedDataRequested ? 'unlimited' : `${requirements.dataGB ?? 'unspecified'}GB`} data, ${requirements.internationalMinutes ?? 'unspecified'} international minutes${requirements.internationalCallDestination ? ` to ${requirements.internationalCallDestination}` : ''}; eSIM ${requirements.esimRequested ? 'requested' : 'not requested'}; company-sponsored billing ${requirements.companySponsored ? 'requested' : 'not requested'}. Verify destination coverage, capacity, eSIM compatibility, and billing.`,
      'medium',
    );
    requirements.quotePending = false;
    const destinationName = requirements.destination.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
    const finalMessage =
      `I’ve opened a sales quote request with your full requirements (reference ${ticket.id}). ` +
      `The team will need to verify ${destinationName} coverage` +
      `${requirements.unlimitedDataRequested ? ', the requested unlimited data' : requirements.dataGB !== undefined ? `, the ${requirements.dataGB}GB data allowance` : ''}` +
      `${requirements.internationalMinutes !== undefined ? ', international minutes' : ''}` +
      `${requirements.esimRequested ? ', eSIM compatibility' : ''}` +
      `${requirements.companySponsored ? ', and company billing' : ''} before quoting.`;
    this.appendConversationTurn(dto.customerId, {
      role: 'user',
      content: dto.message,
    });
    this.appendConversationTurn(dto.customerId, {
      role: 'assistant',
      content: finalMessage,
    });
    return {
      intent: 'TELECOM_ROAMING',
      agents: [...new Set([...agents, 'support'])],
      finalMessage,
      stage: 'complete',
      context: { travelRequirements: requirements, supportTicket: ticket },
    };
  }

  private isAffirmativeReply(message: string): boolean {
    return /^\s*(?:yes(?:,?\s+please)?|yeah|yep|sure|please do|go ahead|do that|that would be great)\b[.! ]*$/i.test(message);
  }

  private isNegativeReply(message: string): boolean {
    return /^\s*(?:no|not now|cancel|don't|do not)\b/i.test(message);
  }

  private async handleEsimStatus(
    dto: AskDto,
    intent: string,
    agents: string[],
  ): Promise<OrchestratorResponse> {
    const esimStatus = this.esimService?.getEsimStatus(dto.customerId) ?? {
      customerId: dto.customerId,
      active: false,
    };
    const finalMessage = esimStatus.active
      ? `Your eSIM is enabled and active${esimStatus.deviceId ? ` on device ${esimStatus.deviceId}` : ''}. It was activated${esimStatus.activatedAt ? ` on ${new Date(esimStatus.activatedAt).toLocaleDateString()}` : ''}.`
      : 'Your eSIM is currently disabled. I can help you activate it whenever you are ready.';

    this.appendConversationTurn(dto.customerId, { role: 'user', content: dto.message });
    this.appendConversationTurn(dto.customerId, { role: 'assistant', content: finalMessage });

    return {
      intent,
      agents: agents.includes('esim') ? agents : [...agents, 'esim'],
      finalMessage,
      stage: 'complete',
      context: { esimStatus },
    };
  }

  private async handleSimSecurityRequest(
    dto: AskDto,
    intent: string,
    agents: string[],
  ): Promise<OrchestratorResponse> {
    const finalMessage =
      "I understand this is stressful. I can help secure your SIM right away. " +
      "I can help you block the SIM immediately, suspend outgoing services, " +
      "raise a high-priority support request, and guide replacement SIM steps. " +
      "Please confirm: should I create a high-priority SIM block support ticket now?";

    this.appendConversationTurn(dto.customerId, { role: 'user', content: dto.message });
    this.appendConversationTurn(dto.customerId, { role: 'assistant', content: finalMessage });

    return {
      intent: intent || 'sim_security_support',
      agents: agents.includes('support') ? agents : [...agents, 'support'],
      finalMessage,
      stage: 'complete',
      context: {
        securityFlow: 'sim_block',
        nextActions: [
          'block_sim',
          'suspend_outgoing',
          'create_support_ticket',
          'replacement_sim_guidance',
        ],
      },
    };
  }

  private async handlePhoneNumberVisibilityRequest(
    dto: AskDto,
    intent: string,
    agents: string[],
  ): Promise<OrchestratorResponse> {
    const profile = this.profileService.getProfile(dto.customerId);
    const masked = profile.phone.length > 4
      ? `${'*'.repeat(Math.max(0, profile.phone.length - 4))}${profile.phone.slice(-4)}`
      : profile.phone;

    const finalMessage =
      `Good question. I cannot read live network metadata directly, but I can access your registered account profile. ` +
      `Your number on file ends with ${masked.slice(-4)}. ` +
      `If you want, I can help you verify the full number securely or proceed to SIM block/replacement support right away.`;

    this.appendConversationTurn(dto.customerId, { role: 'user', content: dto.message });
    this.appendConversationTurn(dto.customerId, { role: 'assistant', content: finalMessage });

    return {
      intent: intent || 'profile_number_visibility',
      agents: agents.includes('profile') ? agents : [...agents, 'profile'],
      finalMessage,
      stage: 'complete',
      context: {
        profilePhoneLast4: profile.phone.slice(-4),
        canAccessLiveNetworkMetadata: false,
      },
    };
  }

  private async handleEsimActivation(
    dto: AskDto,
    intent: string,
    agents: string[],
  ): Promise<OrchestratorResponse> {
    const deviceId = this.getDeviceId(dto.message);
    if (!deviceId) {
      const finalMessage = 'I can activate your eSIM. Please share the device ID you want to use, for example: “Activate it on device Pixel-8”.';
      this.appendConversationTurn(dto.customerId, { role: 'user', content: dto.message });
      this.appendConversationTurn(dto.customerId, { role: 'assistant', content: finalMessage });
      return {
        intent,
        agents: agents.includes('esim') ? agents : [...agents, 'esim'],
        finalMessage,
        stage: 'complete',
        context: { pendingAction: 'esim_activation', required: 'deviceId' },
      };
    }

    const esimStatus = this.esimService?.activateEsim(dto.customerId, deviceId) ?? {
      customerId: dto.customerId,
      active: true,
      deviceId,
      activatedAt: new Date().toISOString(),
    };
    const finalMessage = `Your eSIM is now enabled on device ${deviceId}. You are ready to use mobile service.`;
    this.appendConversationTurn(dto.customerId, { role: 'user', content: dto.message });
    this.appendConversationTurn(dto.customerId, { role: 'assistant', content: finalMessage });
    return {
      intent,
      agents: agents.includes('esim') ? agents : [...agents, 'esim'],
      finalMessage,
      stage: 'complete',
      context: { esimStatus },
    };
  }

  private async handleDeviceIdGuidance(
    dto: AskDto,
    intent: string,
    agents: string[],
  ): Promise<OrchestratorResponse> {
    const finalMessage = 'Sorry, I cannot read your device ID from here. You can find it in Settings: on Android, open Settings > About phone > Device identifiers (or IMEI); on iPhone, open Settings > General > About and copy the IMEI or EID. Send me the device ID when you have it and I will continue the eSIM activation.';
    this.appendConversationTurn(dto.customerId, { role: 'user', content: dto.message });
    this.appendConversationTurn(dto.customerId, { role: 'assistant', content: finalMessage });
    return {
      intent,
      agents: agents.includes('esim') ? agents : [...agents, 'esim'],
      finalMessage,
      stage: 'complete',
      context: {
        pendingAction: 'esim_activation',
        required: 'deviceId',
        guidanceProvided: true,
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
      const finalMessage = 'Great news — you have no pending bills! All your payments are up to date. Want me to check whether a better-fit plan or an add-on could save you money?';
      this.appendConversationTurn(dto.customerId, { role: 'user', content: dto.message });
      this.appendConversationTurn(dto.customerId, { role: 'assistant', content: finalMessage });
      return { intent, agents, finalMessage, stage: 'complete', billingHistory: allRecords };
    }

    const bill = pendingBills[0];

    if (autopilotEnabled) {
      // Autopilot is a demo flow; this records a simulated payment, not a real charge.
      const payment = this.paymentService.initiatePayment(dto.customerId, bill.id, bill.amount);
      this.paymentService.confirmPayment(payment.paymentId);
      const billingRecord = this.billingService.markBillPaid(dto.customerId, bill.id);
      const finalMessage = `Demo Autopilot marked your bill of $${bill.amount.toFixed(2)} for "${bill.description}" as paid in the simulation. No real payment was taken.`;
      this.appendConversationTurn(dto.customerId, { role: 'user', content: dto.message });
      this.appendConversationTurn(dto.customerId, { role: 'assistant', content: finalMessage });
      return {
        intent,
        agents,
        finalMessage,
        stage: 'complete',
        billingHistory: this.billingService.getBillingHistory(dto.customerId),
        autopilot: { enabled: true, action: 'auto-paid' },
        context: { billingRecord, payment },
      };
    }

    // Autopilot OFF: show payment link and ask user to confirm.
    const payment = this.paymentService.initiatePayment(dto.customerId, bill.id, bill.amount);
    const finalMessage = `You have a pending bill of $${bill.amount.toFixed(2)} for "${bill.description}". I have prepared the payment link below — you can pay securely by card or UPI. Want me to switch on Autopilot so future bills are paid automatically?`;
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
    this.rechargeService.markPendingActivation(dto.customerId, plan.id);

    const finalMessage = await this.llmProvider.generateResponse(
      { planName: plan.name, paymentUrl: payment.paymentUrl },
      'The {{planName}} plan is not activated yet. Complete payment using this secure link; ' +
        'activation is confirmed only after payment succeeds: {{paymentUrl}}',
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
