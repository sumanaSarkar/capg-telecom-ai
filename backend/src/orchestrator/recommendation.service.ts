import { Injectable } from '@nestjs/common';
import { CustomerAnalytics } from '../agents/analytics/analytics.model';
import { Plan } from '../agents/plan/plan.model';

export interface PlanRecommendation {
  plan: Plan;
  reason: string;
  rankedPlans: Array<{ plan: Plan; score: number }>;
}

/**
 * Internal recommendation engine used by the orchestrator to pick the
 * best-fit plan for a customer based on their current usage patterns.
 */
@Injectable()
export class RecommendationService {
  private static readonly HEADROOM_FACTOR = 1.2;

  rankPlans(
    analytics: CustomerAnalytics,
    plans: Plan[],
  ): Array<{ plan: Plan; score: number }> {
    const requiredData =
      analytics.dataUsageGB * RecommendationService.HEADROOM_FACTOR;

    const scored = plans.map((plan) => {
      const effectiveData =
        plan.dataGB === -1 ? Number.POSITIVE_INFINITY : plan.dataGB;
      const meetsNeed = effectiveData >= requiredData;

      // Favor plans that comfortably cover the customer's usage while
      // penalizing higher prices, so among plans that meet the need the
      // cheapest one wins. Plans that don't meet the need score far lower.
      let score = meetsNeed ? 1000 - plan.price : 100 - plan.price;
      if (plan.recommended) {
        score += 10;
      }

      return { plan, score };
    });

    return scored.sort((a, b) => b.score - a.score);
  }

  buildRecommendationContext(analytics: CustomerAnalytics, best: Plan) {
    const usagePercent = Math.round(
      (analytics.dataUsageGB / analytics.dataLimitGB) * 100,
    );
    return {
      currentUsageGB: analytics.dataUsageGB,
      currentLimitGB: analytics.dataLimitGB,
      usagePercent,
      planName: best.name,
      planDataGB: best.dataGB === -1 ? 'unlimited' : best.dataGB,
      planPrice: best.price,
    };
  }
}
