import { Injectable } from '@nestjs/common';

export type TravelPurpose = 'data' | 'voice' | 'both';
type TravelSlot = 'destination' | 'days' | 'purpose' | 'data';

interface TravelState {
  flow: 'travel';
  destination?: string;
  days?: number;
  purpose?: TravelPurpose;
  dataGB?: number;
  expecting?: TravelSlot;
  retries: number;
  opening: string;
  early: boolean;
}

interface LostPhoneState {
  flow: 'lost_phone';
  step: 'await_block' | 'await_replacement' | 'await_offer';
}

type FlowState = TravelState | LostPhoneState;

export type FlowDecision =
  | {
      kind: 'reply';
      message: string;
      intent: string;
      agents: string[];
      context?: Record<string, unknown>;
      action?: 'block_sim';
    }
  | {
      kind: 'travel_offer';
      destination: string;
      days?: number;
      purpose: TravelPurpose;
      dataGB?: number;
      composeMessage: string;
      original: boolean;
    }
  | { kind: 'delegate'; message: string };

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  seventy: 70, eighty: 80, ninety: 90,
};

const DESTINATION_PATTERN =
  /\b(?:going\s+to|travell?ing\s+to|travel\s+to|visiting|visit|trip\s+to|flying\s+to|moving\s+to|relocating\s+to|heading\s+to|off\s+to)\s+([a-z]+(?:\s+[a-z]+){0,2}?)(?=\s+(?:for|in|from|next|this|with|and|on|to|by|soon|tomorrow|tonight)\b|[.,!?]|$)/i;
const LOST_PHONE_PATTERN =
  /\b(?:lost|stolen|misplaced|snatched|missing|robbed)\b.{0,25}\b(?:phone|mobile|handset|device|sim)\b|\b(?:phone|mobile|handset|device|sim)\b.{0,25}\b(?:lost|stolen|missing|misplaced|snatched)\b/i;
const INTERRUPT_PATTERN =
  /\b(?:bills?|invoice|pay|current plan|available plans|recharge options|roaming packages|(?:last|previous|latest)\s+(?:recharge|payment|plan)|balance)\b/i;
const AFFIRMATIVE_PATTERN =
  /^\s*(?:yes|yeah|yep|yup|sure|ok|okay|please|go ahead|do it|sounds good|absolutely|definitely|haan)\b|\b(?:block it|do that|go for it|please do)\b/i;
const NEGATIVE_PATTERN = /^\s*(?:no|nope|not now|later|wait)\b|\b(?:don'?t|do not)\b/i;
const DEFER_PATTERN = /\b(?:not sure|no idea|you decide|you choose|surprise me|anything|whatever|don'?t know)\b/i;

function parseCount(raw: string): number | undefined {
  const text = raw.toLowerCase().replace(/-/g, ' ');
  const digits = text.match(/\d+/);
  if (digits) return parseInt(digits[0], 10);
  const words = text.split(/\s+/).filter((word) => word in NUMBER_WORDS);
  return words.length > 0 ? words.reduce((sum, word) => sum + NUMBER_WORDS[word], 0) : undefined;
}

function titleCase(value: string): string {
  return value.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

/**
 * Multi-turn, slot-based telecom conversations (travel roaming, lost phone) that keep a
 * customer engaged and always steer toward a tailored offer.
 */
@Injectable()
export class ConsultativeFlowService {
  private readonly states = new Map<string, FlowState>();

  reset(customerId: string): void {
    this.states.delete(customerId);
  }

  handle(customerId: string, message: string): FlowDecision | null {
    const state = this.states.get(customerId);

    if (state && INTERRUPT_PATTERN.test(message) && !DESTINATION_PATTERN.test(message)) {
      this.states.delete(customerId);
      return null;
    }

    if (state?.flow === 'lost_phone') return this.continueLostPhone(customerId, state, message);
    if (state?.flow === 'travel') return this.continueTravel(customerId, state, message);

    if (LOST_PHONE_PATTERN.test(message)) return this.startLostPhone(customerId);

    const destination = this.extractDestination(message);
    if (destination) return this.startTravel(customerId, message, destination);

    return null;
  }

  // ---- Lost phone ---------------------------------------------------------

  private startLostPhone(customerId: string): FlowDecision {
    this.states.set(customerId, { flow: 'lost_phone', step: 'await_block' });
    return {
      kind: 'reply',
      intent: 'sim_security_support',
      agents: ['support', 'profile'],
      message:
        "Oh no, I'm so sorry — losing your phone is really stressful, but you're not alone in this and we'll sort it out together. " +
        'The first thing I want to do is block your SIM so nobody can make calls, use your data or read your OTPs. ' +
        'Shall I block it right now?',
      context: {
        securityFlow: 'sim_block',
        nextActions: ['block_sim', 'replacement_sim_or_esim', 'new_offers'],
      },
    };
  }

  private continueLostPhone(customerId: string, state: LostPhoneState, message: string): FlowDecision {
    const reply = (text: string, extra: Partial<Extract<FlowDecision, { kind: 'reply' }>> = {}): FlowDecision => ({
      kind: 'reply',
      intent: 'sim_security_support',
      agents: ['support', 'profile', 'esim', 'plan'],
      message: text,
      ...extra,
    });

    if (state.step === 'await_block') {
      if (NEGATIVE_PATTERN.test(message)) {
        return reply(
          "I understand — but until the SIM is blocked, anyone holding your phone can still use your number. Whenever you're ready, just say 'block it' and I'll do it instantly.",
        );
      }
      this.states.set(customerId, { flow: 'lost_phone', step: 'await_replacement' });
      return reply(
        'Done — I have raised a high-priority SIM block request (reference {{ticket}}), so calls, data and OTPs on that SIM are protected. ' +
          'Now let\'s get you connected again. Would you like an instant eSIM for a spare or new phone, or a replacement SIM delivered to you?',
        { action: 'block_sim', context: { securityFlow: 'sim_blocked', nextActions: ['esim', 'replacement_sim', 'new_offers'] } },
      );
    }

    if (state.step === 'await_replacement') {
      this.states.set(customerId, { flow: 'lost_phone', step: 'await_offer' });
      const choice = /\be\s*sim\b|instant|digital/i.test(message)
        ? 'An eSIM is the fastest route — you can be back online in minutes, keeping the same number.'
        : /\bsim\b|deliver|physical|home|store/i.test(message)
          ? 'A replacement SIM keeps your same number, and I will line up the delivery for you.'
          : "No problem, we'll pick the best option when your new phone is ready — your number stays yours either way.";
      return reply(
        `${choice} While we're at it, new-phone customers usually like Device Protection Plan at ₹149/month, Priority Support at ₹99/month, and eSIM Activation Priority at ₹49 one-time. ` +
          'Shall I build a personalised plan around how you use your phone, so your new setup is better than the old one?',
        { context: { securityFlow: 'replacement_chosen', nextActions: ['custom_plan'] } },
      );
    }

    this.states.delete(customerId);
    if (NEGATIVE_PATTERN.test(message)) {
      return reply(
        "Of course. Your SIM is blocked and your number is safe. Message me whenever your new phone is ready and I'll get you connected in minutes.",
      );
    }
    if (AFFIRMATIVE_PATTERN.test(message) || /\b(plan|offer|yes|build|create)\b/i.test(message)) {
      return {
        kind: 'delegate',
        message: 'I lost my phone and need the best personalised plan with device protection and priority support for my new phone',
      };
    }
    return reply(
      "Understood. Your SIM is blocked and your number is safe — tell me when you'd like me to put together a personalised plan for your new phone.",
    );
  }

  // ---- Travel -------------------------------------------------------------

  private extractDestination(message: string): string | undefined {
    const match = message.match(DESTINATION_PATTERN)?.[1]?.trim().replace(/^(?:the|a)\s+/i, '');
    return match ? match.toLowerCase() : undefined;
  }

  private extractDays(message: string, bare: boolean): number | undefined {
    if (/\b(?:a|one)\s+week\b/i.test(message)) return 7;
    const weeks = message.match(/\b(\d+|[a-z]+)\s*weeks?\b/i);
    if (weeks) {
      const count = parseCount(weeks[1]);
      if (count) return count * 7;
    }
    const days = message.match(/\b(\d+|[a-z]+(?:[\s-][a-z]+)?)\s*(?:days?|nights?)\b/i);
    if (days) return parseCount(days[1]);
    return bare ? parseCount(message) : undefined;
  }

  private extractPurpose(message: string): TravelPurpose | undefined {
    const both = /\bboth\b|\beverything\b|\ball of (?:it|them)\b/i.test(message);
    const data = /\b(?:data|internet|browsing|maps|social|streaming|stream|netflix|hotspot|gb)\b/i.test(message);
    const voice = /\b(?:calls?|calling|voice|talk|minutes)\b/i.test(message);
    if (both || (data && voice)) return 'both';
    if (data) return 'data';
    if (voice) return 'voice';
    return undefined;
  }

  private extractDataGB(message: string, bare: boolean): number | undefined {
    if (/\bunlimited\b/i.test(message)) return 100;
    const gb = message.match(/\b(\d+(?:\.\d+)?|(?:[a-z]+[\s-])?[a-z]+)\s*(?:gb|gigs?|gigabytes?)\b/i);
    if (gb) return parseCount(gb[1]);
    if (/\b(?:heavy|a lot|streaming|lots)\b/i.test(message)) return 30;
    if (/\b(?:regular|moderate|normal|medium)\b/i.test(message)) return 15;
    if (/\b(?:light|little|basic|minimal)\b/i.test(message)) return 5;
    return bare ? parseCount(message) : undefined;
  }

  private startTravel(customerId: string, message: string, destination: string): FlowDecision {
    const state: TravelState = { flow: 'travel', destination, retries: 0, opening: message, early: false };
    state.days = this.extractDays(message, false);
    state.purpose = this.extractPurpose(message);
    state.dataGB = this.extractDataGB(message, false);

    const signals =
      Number(state.days !== undefined) +
      Number(state.purpose !== undefined) +
      Number(state.dataGB !== undefined || /\b(?:netflix|hotstar|sony\s*liv|prime|disney)/i.test(message));
    state.early = signals >= 2;

    this.states.set(customerId, state);
    return state.early ? this.finishTravel(customerId, state) : this.askNext(customerId, state);
  }

  private continueTravel(customerId: string, state: TravelState, message: string): FlowDecision | null {
    const expecting = state.expecting;
    const deferred = DEFER_PATTERN.test(message);
    const before = JSON.stringify([state.destination, state.days, state.purpose, state.dataGB]);

    state.days ??= this.extractDays(message, expecting === 'days');
    state.purpose ??= this.extractPurpose(message);
    if (!state.dataGB || expecting === 'data') {
      state.dataGB = this.extractDataGB(message, expecting === 'data') ?? state.dataGB;
    }

    if (deferred) {
      if (expecting === 'days') state.days = 7;
      if (expecting === 'purpose') state.purpose = 'both';
      if (expecting === 'data') state.dataGB = 15;
    }

    const progressed = before !== JSON.stringify([state.destination, state.days, state.purpose, state.dataGB]);
    if (!progressed) {
      state.retries += 1;
      if (state.retries >= 3) {
        this.states.delete(customerId);
        return null;
      }
      return this.askNext(customerId, state, true);
    }

    state.retries = 0;
    return this.askNext(customerId, state);
  }

  private askNext(customerId: string, state: TravelState, rephrase = false): FlowDecision {
    const place = titleCase(state.destination ?? 'your destination');
    const lead = rephrase ? 'Just so I get this right — ' : '';

    let slot: TravelSlot | undefined;
    if (!state.days) slot = 'days';
    else if (!state.purpose) slot = 'purpose';
    else if (state.purpose !== 'voice' && !state.dataGB) slot = 'data';

    if (!slot) return this.finishTravel(customerId, state);

    state.expecting = slot;
    this.states.set(customerId, state);

    const questions: Record<TravelSlot, string> = {
      destination: 'Sounds exciting! Which country will you be travelling to?',
      days: `${lead}${place} sounds great! How many days will you be there?`,
      purpose: `${lead}${state.days} days in ${place} — lovely. What will you mainly use your phone for out there: data for maps and social, calls back home, or both?`,
      data: `${lead}Got it. Roughly how much data would you want — light (about 5GB), regular (about 15GB), or heavy with streaming (30GB or more)?`,
    };

    return {
      kind: 'reply',
      intent: 'TELECOM_ROAMING',
      agents: ['roaming', 'profile', 'analytics', 'plan'],
      message: questions[slot],
      context: { travelFlow: { destination: state.destination, days: state.days, purpose: state.purpose, dataGB: state.dataGB, asking: slot } },
    };
  }

  private finishTravel(customerId: string, state: TravelState): FlowDecision {
    this.states.delete(customerId);
    const purpose = state.purpose ?? 'both';
    const purposeText = purpose === 'data' ? 'data' : purpose === 'voice' ? 'international calls' : 'data and international calls';
    const days = state.days ? ` for ${state.days} days` : '';
    const dataText = state.dataGB && purpose !== 'voice' ? ` with ${state.dataGB}GB data` : '';

    return {
      kind: 'travel_offer',
      destination: state.destination ?? 'your destination',
      days: state.days,
      purpose,
      dataGB: state.dataGB,
      original: state.early,
      composeMessage: state.early
        ? state.opening
        : `I am going to ${state.destination}${days} and need ${purposeText}${dataText}`,
    };
  }
}
