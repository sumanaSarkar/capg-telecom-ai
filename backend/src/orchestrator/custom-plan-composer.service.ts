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
  provider?: string;
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
    const provider = this.detectProvider(profile.currentNetwork);
    const components: CustomPlanComponent[] = [];
    const destination = this.resolveRoamingDestination(normalized);
    const tripDays = this.resolveTripDays(normalized);

    // 1. Determine base data tier from usage patterns
    const baseData = this.resolveDataTier(analytics, normalized);
    components.push(baseData);

    // 2. Determine voice tier from request + historical call usage
    const voiceTier = this.resolveVoiceTier(analytics, normalized);
    components.push(voiceTier);

    // 3. Attach catalog-driven add-ons relevant to the request
    const relevantAddOns = this.selectRelevantAddOns(normalized, intelligence, destination, tripDays);
    components.push(...relevantAddOns);

    const providerComponents = components.map((component) => ({
      ...component,
      provider,
      description: `${component.description} Available on ${provider}.`,
    }));

    const basePrice = providerComponents.reduce((sum, c) => sum + c.monthlyPrice, 0);
    const discount = this.resolveDiscount(intelligence, providerComponents.length);
    const finalPrice = Math.max(basePrice - discount, 0);

    const dataGB = baseData.tag === 'unlimited' ? -1 : this.parseDataGB(baseData);
    const callMinutes = voiceTier.tag === 'unlimited-calls' ? -1 : this.parseCallMinutes(voiceTier);
    const features = this.buildFeatureList(providerComponents, normalized);

    const planName = this.buildPlanName(intelligence, providerComponents);
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
      components: providerComponents,
      discountNote,
      exclusiveBadge,
      estimatedSavings,
      provider,
    };
  }

  private detectProvider(network: string): string {
    const normalized = network.trim().toLowerCase().replace(/[._-]+/g, ' ');
    if (normalized.includes('airtel')) return 'Airtel';
    if (normalized.includes('jio') || normalized.includes('reliance')) return 'Jio';
    if (normalized.includes('vodafone') || normalized.includes('idea') || normalized === 'vi') {
      return 'Vodafone Idea';
    }
    return network.trim() || 'Unknown provider';
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

  private selectRelevantAddOns(
    normalized: string,
    intelligence: CustomerIntelligence,
    destination?: string,
    tripDays?: number,
  ): CustomPlanComponent[] {
    const addOns: CustomPlanComponent[] = [];
    const removedGaming = /\b(remove|without|exclude|drop|no)\b[^.]*\b(gaming|game)\b/.test(normalized);
    const requestedPlatforms = this.extractStreamingPlatforms(normalized);
    const explicitlyGaming = /\b(gaming|game|gamer)\b/.test(normalized);
    const scored = OFFER_CATALOG
      .filter((item) => item.category === 'add-on' || item.category === 'feature')
      .map((item) => ({ item, score: this.scoreAddOn(item, normalized, intelligence) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);

    for (const { item } of scored) {
      if (removedGaming && item.name.toLowerCase().includes('gaming')) {
        continue;
      }
      if (!explicitlyGaming && item.name.toLowerCase().includes('gaming')) {
        continue;
      }
      if (destination && item.name.toLowerCase().includes('roaming')) {
        continue;
      }
      addOns.push({
        name: item.name,
        description: item.description,
        monthlyPrice: item.price,
        tag: item.tags[0] ?? item.id,
      });
    }

    const relevantAddOns = explicitlyGaming
      ? addOns
      : addOns.filter((addOn) => !/gaming|game/i.test(addOn.name));

    if (requestedPlatforms.length > 0) {
      const platformAddOns = [
        ...relevantAddOns.filter((addOn) => !/ott|netflix|entertainment/i.test(addOn.name)),
        ...requestedPlatforms.map((platform) => ({
          name: `${platform} Subscription`,
          description: `Access to ${platform} content as requested.`,
          monthlyPrice: this.platformPrice(platform),
          tag: platform.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        })),
      ];
      return destination ? [this.buildRoamingComponent(destination, tripDays), ...platformAddOns] : platformAddOns;
    }

    return destination ? [this.buildRoamingComponent(destination, tripDays), ...relevantAddOns] : relevantAddOns;
  }

  private resolveTripDays(normalized: string): number | undefined {
    const match = normalized.match(/\b(\d+)\s*days?\b/);
    return match ? parseInt(match[1], 10) : undefined;
  }

  private resolveRoamingDestination(normalized: string): string | undefined {
    const destinations = [
      'hawaii', 'sydney', 'austria', 'liverpool', 'manila', 'philippines', 'china', 'asia', 'japan', 'tokyo', 'osaka', 'kenya', 'bhutan', 'usa', 'united states',
      'uk', 'united kingdom', 'uae', 'dubai', 'thailand', 'maldives', 'france', 'germany', 'spain',
    ];
    const knownDestination = destinations.find((destination) => normalized.includes(destination));
    if (knownDestination) return knownDestination;

    const destinationMatch = normalized.match(
      /\b(?:going\s+to|travell?ing\s+to|visiting|visit|moving\s+to|relocating\s+to|studying\s+in)\s+([a-z]+(?:\s+[a-z]+){0,2}?)(?=\s+for\s+\d+\s+days?\b|\s+(?:and|,|give|show|need|want|what)\b|$)/i,
    );
    return destinationMatch?.[1]?.trim();
  }

  private buildRoamingComponent(destination: string, tripDays?: number): CustomPlanComponent {
    const duration = tripDays ? ` for ${tripDays} days` : '';
    if (destination === 'hawaii') {
      return {
        name: 'USA Hawaii Travel Roaming Pack',
        description: `USA travel connectivity for Hawaii${duration} with roaming data, calling, SMS, and usage alerts tailored to your trip.`,
        monthlyPrice: 399,
        tag: 'usa-hawaii-roaming',
      };
    }

    if (destination === 'sydney') {
      return {
        name: 'Australia Sydney Travel Roaming Pack',
        description: `Australia travel connectivity for Sydney${duration} with roaming data, calling, SMS, and usage alerts tailored to your trip.`,
        monthlyPrice: 399,
        tag: 'australia-sydney-roaming',
      };
    }

    if (destination === 'austria') {
      return {
        name: 'Europe Austria Travel Roaming Pack',
        description: `Europe travel connectivity for Austria${duration} with roaming data, calling, SMS, and usage alerts tailored to your trip.`,
        monthlyPrice: 399,
        tag: 'europe-austria-roaming',
      };
    }

    if (destination === 'liverpool') {
      return {
        name: 'UK Liverpool Travel Roaming Pack',
        description: `UK travel connectivity for Liverpool${duration} with roaming data, calling, SMS, and usage alerts tailored to your trip.`,
        monthlyPrice: 399,
        tag: 'uk-liverpool-roaming',
      };
    }

    if (destination === 'manila' || destination === 'philippines') {
      return {
        name: 'Manila Travel Roaming Pack',
        description: `Philippines travel connectivity${duration} with roaming data, calling, SMS, and usage alerts tailored to your Manila trip.`,
        monthlyPrice: 399,
        tag: 'manila-roaming',
      };
    }

    if (destination === 'china' || destination === 'asia') {
      const label = destination === 'china' ? 'China' : 'Asia';
      return {
        name: `${label} Travel Roaming Pack`,
        description: `${label} travel connectivity${duration} with roaming data, calling, SMS, and usage alerts for your trip.`,
        monthlyPrice: 399,
        tag: `${destination}-roaming`,
      };
    }

    if (destination === 'japan' || destination === 'tokyo' || destination === 'osaka') {
      return {
        name: 'Japan Roaming Pass',
        description: `Japan travel connectivity${duration} with roaming data, calls, SMS, and usage alerts for your trip.`,
        monthlyPrice: 399,
        tag: 'japan-roaming',
      };
    }

    if (destination === 'thailand') {
      return {
        name: 'Thailand Roaming Pass',
        description: `Thailand travel connectivity${duration} with roaming data, international calls, SMS, and usage alerts for your trip.`,
        monthlyPrice: 399,
        tag: 'thailand-roaming',
      };
    }

    if (destination === 'kenya') {
      return {
        name: 'Kenya Roaming Pass',
        description: '2 GB roaming data, incoming calls ₹8/min, outgoing calls ₹15/min, SMS ₹5 each; alerts at 80% usage.',
        monthlyPrice: 399,
        tag: 'kenya-roaming',
      };
    }

    if (destination === 'bhutan') {
      return {
        name: 'Bhutan Roaming Pass',
        description: '3 GB roaming data, incoming calls ₹6/min, outgoing calls ₹12/min, SMS ₹4 each; alerts at 80% usage.',
        monthlyPrice: 349,
        tag: 'bhutan-roaming',
      };
    }

    const label = destination === 'united states' ? 'USA' : destination.toUpperCase();
    return {
      name: `${label} Roaming Pass`,
      description: `Destination telecom roaming data and voice coverage for ${label}${duration}; per-minute rates are shown before activation.`,
      monthlyPrice: 399,
      tag: `${destination.replace(/\s+/g, '-')}-roaming`,
    };
  }

  private extractStreamingPlatforms(normalized: string): string[] {
    const platformNames = [
      { pattern: /sony\s*liv/, name: 'SonyLIV' },
      { pattern: /jio\s*hotstar|hotstar/, name: 'JioHotstar' },
      { pattern: /netflix/, name: 'Netflix' },
      { pattern: /prime\s*video|amazon\s*prime/, name: 'Prime Video' },
      { pattern: /disney\s*plus|disney\+/, name: 'Disney+' },
    ];

    return platformNames.filter(({ pattern }) => pattern.test(normalized)).map(({ name }) => name);
  }

  private platformPrice(platform: string): number {
    return {
      Netflix: 199,
      JioHotstar: 149,
      SonyLIV: 99,
      'Prime Video': 149,
      'Disney+': 149,
    }[platform] ?? 99;
  }

  private scoreAddOn(item: OfferCatalogItem, normalized: string, intelligence: CustomerIntelligence): number {
    let score = 0;
    for (const tag of item.tags) {
      if (normalized.includes(tag)) score += 4;
    }
    if (item.segment === intelligence.segment) score += 3;
    // strong keyword boosts
    if (/netflix|ott|stream|sony\s*liv|hotstar|prime\s*video|disney/.test(normalized) && /ott|netflix|stream/.test(item.tags.join(' '))) score += 5;
    if (/roam|travel|europe|usa|international/.test(normalized) && /roam|travel/.test(item.tags.join(' '))) score += 5;
    if (/hotspot|jio hotstar|hotstar/.test(normalized) && /hotspot/.test(item.tags.join(' '))) score += 5;
    if (!/\b(remove|without|exclude|drop|no)\b[^.]*\b(gaming|game)\b/.test(normalized) && /gaming|game/.test(normalized) && /gaming|latency/.test(item.tags.join(' '))) score += 5;
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
    const hasKenyaRoaming = components.some((c) => c.tag === 'kenya-roaming');
    const hasBhutanRoaming = components.some((c) => c.tag === 'bhutan-roaming');
    const hasJapanRoaming = components.some((c) => c.tag === 'japan-roaming');
    const hasChinaRoaming = components.some((c) => c.tag === 'china-roaming');
    const hasAsiaRoaming = components.some((c) => c.tag === 'asia-roaming');
    const hasManilaRoaming = components.some((c) => c.tag === 'manila-roaming');
    const hasHawaiiRoaming = components.some((c) => c.tag === 'usa-hawaii-roaming');
    const hasSydneyRoaming = components.some((c) => c.tag === 'australia-sydney-roaming');
    const hasAustriaRoaming = components.some((c) => c.tag === 'europe-austria-roaming');
    const hasLiverpoolRoaming = components.some((c) => c.tag === 'uk-liverpool-roaming');

    if (hasHawaiiRoaming) return 'Telly USA Hawaii Travel Plan';
    if (hasSydneyRoaming) return 'Telly Australia Sydney Travel Plan';
    if (hasAustriaRoaming) return 'Telly Europe Austria Travel Plan';
    if (hasLiverpoolRoaming) return 'Telly UK Liverpool Travel Plan';
    if (hasManilaRoaming) return 'Telly Manila Travel Plan';
    if (hasJapanRoaming) return 'Telly Japan Travel Plan';
    if (hasChinaRoaming) return 'Telly China Travel Plan';
    if (hasAsiaRoaming) return 'Telly Asia Travel Plan';
    if (hasKenyaRoaming) return 'Telly Kenya Roaming Plan';
    if (hasBhutanRoaming) return 'Telly Bhutan Roaming Plan';
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
