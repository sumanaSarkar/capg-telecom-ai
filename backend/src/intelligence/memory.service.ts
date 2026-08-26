import { Injectable } from '@nestjs/common';
import { FeatureFlagsService } from './feature-flags.service';

const MAX_SESSION_TURNS = 10;
const MAX_CUSTOMER_FACTS = 20;

// Very lightweight fact extraction: destinations, trip length, data/talktime hints mentioned in free text.
const DESTINATION_PATTERN = /\b(?:going to|traveling to|travelling to|trip to|visiting)\s+([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)/;
const DAYS_PATTERN = /\b(\d+)\s*days?\b/i;
const DATA_PATTERN = /\b(\d+)\s*gb\b/i;
const MINUTES_PATTERN = /\b(\d+)\s*(?:min|minutes|mins)\b/i;

@Injectable()
export class MemoryService {
  private readonly sessionTurns = new Map<string, string[]>();
  private readonly customerFacts = new Map<string, string[]>();

  constructor(private readonly flags: FeatureFlagsService) {}

  appendSessionTurn(customerId: string, message: string): void {
    if (!this.flags.sessionMemoryEnabled) return;

    const turns = this.sessionTurns.get(customerId) ?? [];
    turns.push(message);
    this.sessionTurns.set(customerId, turns.slice(-MAX_SESSION_TURNS));
  }

  getSessionSummary(customerId: string): string[] {
    if (!this.flags.sessionMemoryEnabled) return [];
    return this.sessionTurns.get(customerId) ?? [];
  }

  rememberFact(customerId: string, fact: string): void {
    if (!this.flags.customerMemoryEnabled) return;

    const facts = this.customerFacts.get(customerId) ?? [];
    if (!facts.includes(fact)) {
      facts.push(fact);
    }
    this.customerFacts.set(customerId, facts.slice(-MAX_CUSTOMER_FACTS));
  }

  getCustomerFacts(customerId: string): string[] {
    if (!this.flags.customerMemoryEnabled) return [];
    return this.customerFacts.get(customerId) ?? [];
  }

  /** Extracts obvious travel/usage facts from a message and stores them as customer memory. */
  extractAndRememberFacts(customerId: string, message: string): void {
    if (!this.flags.customerMemoryEnabled) return;

    const destinationMatch = message.match(DESTINATION_PATTERN);
    if (destinationMatch) {
      this.rememberFact(customerId, `Mentioned travel destination: ${destinationMatch[1]}`);
    }

    const daysMatch = message.match(DAYS_PATTERN);
    if (daysMatch) {
      this.rememberFact(customerId, `Mentioned trip length: ${daysMatch[1]} days`);
    }

    const dataMatch = message.match(DATA_PATTERN);
    if (dataMatch) {
      this.rememberFact(customerId, `Mentioned data need: ${dataMatch[1]}GB`);
    }

    const minutesMatch = message.match(MINUTES_PATTERN);
    if (minutesMatch) {
      this.rememberFact(customerId, `Mentioned talk-time need: ${minutesMatch[1]} minutes`);
    }
  }
}
