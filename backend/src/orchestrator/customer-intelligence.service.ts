import { Injectable } from '@nestjs/common';
import { CustomerAnalytics } from '../agents/analytics/analytics.model';
import { BillingRecord } from '../agents/billing/billing.model';
import { CustomerProfile } from '../agents/profile/profile.model';

export interface CustomerIntelligence {
  segment: 'budget' | 'value' | 'premium' | 'family' | 'traveler' | 'streamer' | 'business';
  priceSensitivity: 'low' | 'medium' | 'high';
  motivation: string;
  expectedOfferStyle: string;
  historicalSignals: string[];
  exclusiveOfferHint: string;
}

@Injectable()
export class CustomerIntelligenceService {
  analyzeCustomer(profile: CustomerProfile, analytics: CustomerAnalytics, billingHistory: BillingRecord[]): CustomerIntelligence {
    const recentSpend = billingHistory.slice(-3).reduce((sum, record) => sum + record.amount, 0);
    const usageRatio = analytics.dataUsageGB / Math.max(analytics.dataLimitGB, 1);
    const roamingTrips = analytics.roamingHistory.length;
    const hasHighUsage = usageRatio > 0.8;
    const hasStablePayments = billingHistory.every((record) => record.status === 'paid');
    const hasLargeBalance = profile.accountBalance > 70;

    let segment: CustomerIntelligence['segment'] = 'value';
    let priceSensitivity: CustomerIntelligence['priceSensitivity'] = 'medium';
    const signals: string[] = [];

    if (hasLargeBalance && hasStablePayments) {
      segment = 'premium';
      priceSensitivity = 'low';
      signals.push('premium-account-balance');
      signals.push('consistent-payment-history');
    } else if (roamingTrips >= 2 || analytics.callMinutes > 1000) {
      segment = 'traveler';
      priceSensitivity = 'medium';
      signals.push('high-travel-usage');
    } else if (analytics.dataUsageGB > 20 || analytics.monthlyTrend.some((entry) => entry.dataGB > 10)) {
      segment = 'streamer';
      priceSensitivity = 'medium';
      signals.push('high-data-consumption');
    } else if (profile.customerType === 'prepaid' || recentSpend < 100) {
      segment = 'budget';
      priceSensitivity = 'high';
      signals.push('cost-conscious-usage');
    } else if (hasHighUsage) {
      segment = 'family';
      priceSensitivity = 'medium';
      signals.push('high-usage-household');
    } else {
      segment = 'value';
      priceSensitivity = 'medium';
      signals.push('general-value-seeker');
    }

    if (profile.customerType === 'postpaid' && hasStablePayments && recentSpend > 120) {
      signals.push('high-lifetime-value');
    }

    if (profile.accountBalance < 30) {
      signals.push('low-balance-sensitivity');
    }

    const motivation = this.buildMotivation(segment, priceSensitivity, hasHighUsage, roamingTrips);
    const expectedOfferStyle = this.buildOfferStyle(segment, priceSensitivity);
    const exclusiveOfferHint = this.buildExclusiveOfferHint(segment, priceSensitivity, hasHighUsage, roamingTrips);

    return {
      segment,
      priceSensitivity,
      motivation,
      expectedOfferStyle,
      historicalSignals: signals,
      exclusiveOfferHint,
    };
  }

  private buildMotivation(segment: CustomerIntelligence['segment'], priceSensitivity: CustomerIntelligence['priceSensitivity'], hasHighUsage: boolean, roamingTrips: number): string {
    if (segment === 'premium') {
      return 'This customer values convenience, reliability, and premium experience more than lowest price.';
    }
    if (segment === 'traveler') {
      return 'This customer wants seamless movement across regions and wants travel value without interruptions.';
    }
    if (segment === 'streamer' && hasHighUsage) {
      return 'This customer wants plenty of data and entertainment features for digital lifestyles.';
    }
    if (priceSensitivity === 'high') {
      return 'This customer is highly price-sensitive and responds to clear savings and value messaging.';
    }
    if (roamingTrips > 0) {
      return 'This customer values flexibility and relevant add-ons for changing usage patterns.';
    }
    return 'This customer wants a balanced offer that combines value and practicality.';
  }

  private buildOfferStyle(segment: CustomerIntelligence['segment'], priceSensitivity: CustomerIntelligence['priceSensitivity']): string {
    if (segment === 'premium') {
      return 'position as a premium, concierge-style offer with convenience and exclusivity.';
    }
    if (priceSensitivity === 'high') {
      return 'position as a savings-first offer with a clear monthly value and limited-time appeal.';
    }
    if (segment === 'traveler') {
      return 'position as a flexible travel-first offer with easy roaming and low-friction upgrades.';
    }
    if (segment === 'streamer') {
      return 'position as an entertainment-led offer with data, OTT, and experience upgrades.';
    }
    return 'position as a balanced bundle with practical value and strong everyday benefits.';
  }

  private buildExclusiveOfferHint(segment: CustomerIntelligence['segment'], priceSensitivity: CustomerIntelligence['priceSensitivity'], hasHighUsage: boolean, roamingTrips: number): string {
    if (segment === 'premium') {
      return 'Offer an exclusive premium loyalty bundle with concierge support and premium entertainment perks.';
    }
    if (priceSensitivity === 'high') {
      return 'Offer a personalized savings bundle with a temporary discount, rollover benefits, or value-linked add-ons.';
    }
    if (segment === 'traveler' || roamingTrips > 0) {
      return 'Offer a limited-time travel loyalty bundle with roaming benefits and bonus data.';
    }
    if (segment === 'streamer' || hasHighUsage) {
      return 'Offer an exclusive OTT + high-data bundle that feels tailored to entertainment-heavy usage.';
    }
    return 'Offer a curated loyalty bundle that feels personalized and exclusive to the customer.';
  }
}
