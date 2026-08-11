import { Injectable } from '@nestjs/common';
import { CustomerAnalytics } from '../agents/analytics/analytics.model';
import { CustomerProfile } from '../agents/profile/profile.model';
import { CustomerIntelligence } from './customer-intelligence.service';
import { OFFER_CATALOG, OfferCatalogItem } from './offer-catalog';

export interface CustomPlanComponent {
  name: string;
  description: string;
  monthlyPrice: number;
  tag: string;
}

export interface CustomPlan {
  id: string;
  name: string;
  isCustom: true;
  dataGB: number;
  callMinutes: number;
  price: number;
  features: string[];
  components: CustomPlanComponent[];
  discountNote?: string;
  exclusiveBadge?: string;
  estimatedSavings?: number;
}

@Injectable()
export class CustomPlanComposerService {
  compose(
    message: string,
    profile: CustomerProfile,
    analytics: CustomerAnalytics,
    intelligence: CustomerIntelligence,
  ): CustomPlan {
    const normalized = message.toLowerCase();
    const components: CustomPlanComponent[] = [];

    // 1. Determine base data tier from usage patterns
    const baseData = this.resolveDataTier(analytics, normalized);
    components.push(baseData);

    // 2. Determine voice tier from request + historical call usage
    const voiceTier = this.resolveVoiceTier(analytics, normalized);
    components.push(voiceTier);

    // 3. Attach catalog-driven add-ons relevant to the request
    const relevantAddOns = this.selectRelevantAddOns(normalized, intelligence);
    components.push(...relevantAddOns);

    const basePrice = components.reduce((sum, c) => sum + c.monthlyPrice, 0);
    const discount = this.resolveDiscount(intelligence, components.length);
    const finalPrice = Math.max(basePrice - discount, 0);

    const dataGB = baseData.tag === 'unlimited' ? -1 : this.parseDataGB(baseData);
    const callMinutes = voiceTier.tag === 'unlimited-calls' ? -1 : this.parseCallMinutes(voiceTier);
    const features = this.buildFeatureList(components, normalized);

    const planName = this.buildPlanName(intelligence, components);
    const exclusiveBadge = this.buildBadge(intelligence);
    const discountNote = discount > 0
      ? `Exclusive offer for ${profile.name}: save ₹${discount.toFixed(0)}/month`
      : undefined;
    const estimatedSavings = discount > 0 ? discount * 12 : undefined;

    return {
      id: `custom-${Date.now()}`,
      name: planName,
      isCustom: true,
      dataGB,
      callMinutes,
      price: finalPrice,
      features,
      components,
      discountNote,
      exclusiveBadge,
      estimatedSavings,
    };
  }

  private resolveDataTier(analytics: CustomerAnalytics, normalized: string): CustomPlanComponent {
    const monthlyPeak = Math.max(...analytics.monthlyTrend.map((m) => m.dataGB), analytics.dataUsageGB);
    const needed = monthlyPeak * 1.3;

    if (/unlimited data|no data limit|data unlimited/.test(normalized) || needed > 80) {
      return { name: 'Unlimited 5G Data', description: 'True unlimited 5G data, no throttling', monthlyPrice: 499, tag: 'unlimited' };
    }
    if (needed > 40 || /100gb|150gb|high data|heavy data/.test(normalized)) {
      return { name: '100 GB Data Pack', description: 'High-capacity 5G data for power users', monthlyPrice: 349, tag: '100gb' };
    }
    if (needed > 20 || /40gb|50gb|stream|hotspot/.test(normalized)) {
      return { name: '50 GB Data Pack', description: '5G data for daily streaming and browsing', monthlyPrice: 249, tag: '50gb' };
    }
    if (needed > 8 || /20gb|25gb|netflix|ott/.test(normalized)) {
      return { name: '25 GB Data Pack', description: 'Comfortable data for an active digital lifestyle', monthlyPrice: 149, tag: '25gb' };
    }
    return { name: '10 GB Data Pack', description: 'Core data for essential daily use', monthlyPrice: 99, tag: '10gb' };
  }

  private resolveVoiceTier(analytics: CustomerAnalytics, normalized: string): CustomPlanComponent {
    const usageRatio = analytics.callMinutes / Math.max(analytics.callLimit, 1);
    if (
      /unlimited call|unlimited calls|no call limit|voice unlimited/.test(normalized) ||
      usageRatio > 0.8
    ) {
      return { name: 'Unlimited Voice', description: 'Unlimited local and national calling, zero surprises', monthlyPrice: 149, tag: 'unlimited-calls' };
    }
    if (/international call|overseas|usa|europe|roam/.test(normalized) || analytics.roamingHistory.length > 0) {
      return { name: 'International Voice (500 min)', description: '500 minutes usable across domestic and international calls', monthlyPrice: 199, tag: 'intl-voice' };
    }
    return { name: 'Standard Voice (300 min)', description: '300 minutes for everyday calls', monthlyPrice: 79, tag: 'voice-300' };
  }

  private selectRelevantAddOns(normalized: string, intelligence: CustomerIntelligence): CustomPlanComponent[] {
    const addOns: CustomPlanComponent[] = [];
    const scored = OFFER_CATALOG
      .filter((item) => item.category === 'add-on' || item.category === 'feature')
      .map((item) => ({ item, score: this.scoreAddOn(item, normalized, intelligence) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);

    for (const { item } of scored) {
      addOns.push({
        name: item.name,
        description: item.description,
        monthlyPrice: item.price,
        tag: item.tags[0] ?? item.id,
      });
    }
    return addOns;
  }

  private scoreAddOn(item: OfferCatalogItem, normalized: string, intelligence: CustomerIntelligence): number {
    let score = 0;
    for (const tag of item.tags) {
      if (normalized.includes(tag)) score += 4;
    }
    if (item.segment === intelligence.segment) score += 3;
    // strong keyword boosts
    if (/netflix|ott|stream/.test(normalized) && /ott|netflix|stream/.test(item.tags.join(' '))) score += 5;
    if (/roam|travel|europe|usa|international/.test(normalized) && /roam|travel/.test(item.tags.join(' '))) score += 5;
    if (/hotspot|jio hotstar|hotstar/.test(normalized) && /hotspot/.test(item.tags.join(' '))) score += 5;
    if (/gaming|game/.test(normalized) && /gaming|latency/.test(item.tags.join(' '))) score += 5;
    if (/family|household/.test(normalized) && /family/.test(item.tags.join(' '))) score += 5;
    // skip if already covered by the voice/data tier naming
    if (/unlimited-calls|voice-300|intl-voice/.test(item.id)) return 0;
    return score;
  }

  private resolveDiscount(intelligence: CustomerIntelligence, componentCount: number): number {
    let discount = 0;
    if (intelligence.priceSensitivity === 'high') discount += 100;
    if (intelligence.priceSensitivity === 'medium') discount += 50;
    if (componentCount >= 4) discount += 75;
    if (intelligence.historicalSignals.includes('high-lifetime-value')) discount += 50;
    if (intelligence.segment === 'premium') discount = 0; // premium customers see value, not discounts
    return discount;
  }

  private parseDataGB(component: CustomPlanComponent): number {
    const match = component.name.match(/(\d+)\s*GB/i);
    return match ? parseInt(match[1], 10) : 10;
  }

  private parseCallMinutes(component: CustomPlanComponent): number {
    const match = component.name.match(/(\d+)\s*min/i);
    return match ? parseInt(match[1], 10) : 300;
  }

  private buildFeatureList(components: CustomPlanComponent[], normalized: string): string[] {
    const features = new Set<string>();
    features.add('5G');
    for (const c of components) {
      if (/data/i.test(c.name)) features.add('High-Speed Data');
      if (/voice|call/i.test(c.name)) features.add('Voice Calls');
      if (/roaming|intl/i.test(c.name)) features.add('International Roaming');
      if (/ott|netflix|stream/i.test(c.name)) features.add('OTT Streaming');
      if (/hotspot/i.test(c.name)) features.add('Mobile Hotspot');
      if (/gaming/i.test(c.name)) features.add('Gaming Boost');
      if (/support/i.test(c.name)) features.add('Priority Support');
      if (/family/i.test(c.name)) features.add('Family Sharing');
    }
    if (/hotstar|jio/.test(normalized)) features.add('JioHotstar Access');
    return Array.from(features);
  }

  private buildPlanName(intelligence: CustomerIntelligence, components: CustomPlanComponent[]): string {
    const hasUnlimitedData = components.some((c) => c.tag === 'unlimited');
    const hasIntlVoice = components.some((c) => c.tag === 'intl-voice');
    const hasOTT = components.some((c) => /ott|netflix|stream/i.test(c.tag));
    const hasRoaming = components.some((c) => /roam|travel/i.test(c.tag));

    if (intelligence.segment === 'family') return 'Telly Family Unlimited Bundle';
    if (intelligence.segment === 'traveler' || hasRoaming) return 'Telly Global Traveler Plan';
    if (intelligence.segment === 'business') return 'Telly Business Pro Bundle';
    if (intelligence.segment === 'streamer' || hasOTT) return 'Telly Entertainment Max Plan';
    if (intelligence.segment === 'premium') return 'Telly Premium Concierge Plan';
    if (hasUnlimitedData && hasIntlVoice) return 'Telly Power Unlimited Plan';
    return 'Telly Personalised Plan';
  }

  private buildBadge(intelligence: CustomerIntelligence): string {
    if (intelligence.segment === 'premium') return 'Exclusive Premium Offer';
    if (intelligence.priceSensitivity === 'high') return 'Exclusive Savings Bundle';
    if (intelligence.segment === 'traveler') return 'Exclusive Travel Offer';
    if (intelligence.segment === 'streamer') return 'Exclusive Entertainment Bundle';
    if (intelligence.segment === 'family') return 'Exclusive Family Deal';
    return 'Personalised for You';
  }
}
