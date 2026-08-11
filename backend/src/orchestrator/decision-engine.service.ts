import { Injectable } from '@nestjs/common';
import { Plan } from '../agents/plan/plan.model';
import { CustomerIntelligence } from './customer-intelligence.service';
import { OFFER_CATALOG } from './offer-catalog';

export interface BundleAddOn {
  name: string;
  price: number;
  reason: string;
}

export interface PersonalizedBundleDecision {
  type: 'bundle';
  basePlan: Plan;
  addOns: BundleAddOn[];
  estimatedMonthlyPrice: number;
  summary: string;
  reason: string;
}

@Injectable()
export class DecisionEngineService {
  buildPersonalizedBundle(message: string, basePlan: Plan, intelligence?: CustomerIntelligence): PersonalizedBundleDecision | null {
    const normalized = this.normalizeText(message);
    const segment = intelligence?.segment ?? this.inferSegment(normalized);
    const priceSensitivity = intelligence?.priceSensitivity ?? 'medium';
    const matches = OFFER_CATALOG.filter((offer) => this.scoreOffer(offer, normalized, segment, priceSensitivity) > 0);

    if (matches.length === 0) {
      return null;
    }

    const rankedOffers = matches
      .map((offer) => ({
        offer,
        score: this.scoreOffer(offer, normalized, segment, priceSensitivity),
      }))
      .sort((left, right) => right.score - left.score);

    const selectedAddOns = rankedOffers
      .filter(({ offer, score }) => offer.category !== 'plan' && score >= 4)
      .map(({ offer }) => ({
        name: offer.name,
        price: offer.price,
        reason: this.buildReason(offer, segment),
      }));

    if (selectedAddOns.length === 0) {
      return null;
    }

    const estimatedMonthlyPrice = basePlan.price + selectedAddOns.reduce((sum, addon) => sum + addon.price, 0);
    const addOnNames = selectedAddOns.map((addon) => addon.name).join(', ');

    return {
      type: 'bundle',
      basePlan,
      addOns: selectedAddOns,
      estimatedMonthlyPrice,
      summary: `A tailored bundle built around ${basePlan.name} and ${addOnNames}.`,
      reason: `${this.describeSegment(segment)} ${this.describePriceSensitivity(priceSensitivity)} This recommendation combines ${basePlan.name} with offers that match the customer's stated needs.`,
    };
  }

  private inferSegment(normalized: string): string {
    if (/family|household|kids|shared/.test(normalized)) {
      return 'family';
    }
    if (/travel|roam|international|europe|trip/.test(normalized)) {
      return 'traveler';
    }
    if (/netflix|ott|stream|disney|prime|entertainment/.test(normalized)) {
      return 'streamer';
    }
    if (/business|work|remote|office|productivity/.test(normalized)) {
      return 'business';
    }
    if (/gaming|latency|lag|streaming/.test(normalized)) {
      return 'gamer';
    }
    if (/premium|priority|concierge|support/.test(normalized)) {
      return 'premium';
    }
    return 'general';
  }

  private scoreOffer(offer: (typeof OFFER_CATALOG)[number], normalized: string, segment: string, priceSensitivity: CustomerIntelligence['priceSensitivity']): number {
    let score = 0;
    const offerName = offer.name.toLowerCase();

    if (offer.segment === segment) {
      score += 5;
    }

    for (const tag of offer.tags) {
      if (normalized.includes(tag)) {
        score += 3;
      }
    }

    if (offer.category === 'add-on' && /unlimited|calls|voice/.test(normalized) && offerName.includes('voice')) {
      score += 4;
    }

    if (offer.category === 'add-on' && /roam|travel|international|europe|trip/.test(normalized) && offerName.includes('roaming')) {
      score += 6;
    }

    if (offer.category === 'add-on' && /netflix|ott|stream|entertainment/.test(normalized) && offerName.includes('ott')) {
      score += 4;
    }

    if (offer.category === 'add-on' && /family|share|household/.test(normalized) && offerName.includes('family')) {
      score += 4;
    }

    if (offer.category === 'add-on' && /gaming|latency|lag/.test(normalized) && offerName.includes('gaming')) {
      score += 4;
    }

    if (offer.category === 'add-on' && /support|priority|concierge/.test(normalized) && offerName.includes('support')) {
      score += 4;
    }

    if (offer.category === 'add-on' && /hotspot|work|remote|business/.test(normalized) && offerName.includes('hotspot')) {
      score += 4;
    }

    if (priceSensitivity === 'high') {
      score += offer.price < 200 ? 2 : 0;
    }

    if (priceSensitivity === 'low') {
      score += offer.price > 200 ? 1 : 0;
    }

    return score;
  }

  private buildReason(offer: (typeof OFFER_CATALOG)[number], segment: string): string {
    const segmentReason = this.describeSegment(segment);
    return `${segmentReason} ${offer.description}`.trim();
  }

  private describePriceSensitivity(priceSensitivity: CustomerIntelligence['priceSensitivity']): string {
    switch (priceSensitivity) {
      case 'high':
        return 'The offer is framed as a value-first savings bundle.';
      case 'low':
        return 'The offer is framed as a premium concierge-style package.';
      default:
        return 'The offer is framed as a balanced value package.';
    }
  }

  private describeSegment(segment: string): string {
    switch (segment) {
      case 'family':
        return 'This is a strong fit for a family-focused household.';
      case 'traveler':
        return 'This is a strong fit for a frequent traveler.';
      case 'streamer':
        return 'This is a strong fit for a streaming-oriented customer.';
      case 'business':
        return 'This is a strong fit for a business or work-from-home customer.';
      case 'gamer':
        return 'This is a strong fit for a gaming-focused customer.';
      case 'premium':
        return 'This is a strong fit for a premium-service customer.';
      default:
        return 'This is a strong fit for the customer.';
    }
  }

  private normalizeText(value: string): string {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
