import { CustomerAnalytics } from '../agents/analytics/analytics.model';
import { Plan } from '../agents/plan/plan.model';
import { RecommendationService } from './recommendation.service';

const PLANS: Plan[] = [
  {
    id: 'plan-001',
    name: 'Basic 5GB',
    dataGB: 5,
    callMinutes: 500,
    price: 29.99,
    features: ['5G', 'Hotspot'],
    recommended: false,
  },
  {
    id: 'plan-002',
    name: 'Standard 20GB',
    dataGB: 20,
    callMinutes: 1000,
    price: 49.99,
    features: ['5G', 'Hotspot', 'International SMS'],
    recommended: true,
  },
  {
    id: 'plan-003',
    name: 'Premium Unlimited',
    dataGB: -1,
    callMinutes: -1,
    price: 79.99,
    features: ['5G', 'Hotspot', 'International Calls', 'Roaming'],
    recommended: false,
  },
];

const baseAnalytics: Omit<CustomerAnalytics, 'dataUsageGB'> = {
  customerId: 'cust-001',
  dataLimitGB: 5,
  callMinutes: 320,
  callLimit: 500,
  roamingHistory: [],
  monthlyTrend: [],
};

describe('RecommendationService', () => {
  let service: RecommendationService;

  beforeEach(() => {
    service = new RecommendationService();
  });

  it('recommends the cheapest plan that covers usage with headroom when near the limit', () => {
    const analytics: CustomerAnalytics = { ...baseAnalytics, dataUsageGB: 4.2 };
    const ranked = service.rankPlans(analytics, PLANS);

    expect(ranked[0].plan.id).toBe('plan-002');
  });

  it('recommends the cheapest plan overall when usage is low', () => {
    const analytics: CustomerAnalytics = { ...baseAnalytics, dataUsageGB: 1 };
    const ranked = service.rankPlans(analytics, PLANS);

    expect(ranked[0].plan.id).toBe('plan-001');
  });

  it('falls back to unlimited plan when usage exceeds every finite plan', () => {
    const analytics: CustomerAnalytics = { ...baseAnalytics, dataUsageGB: 18 };
    const ranked = service.rankPlans(analytics, PLANS);

    expect(ranked[0].plan.id).toBe('plan-003');
  });

  it('builds a recommendation context with rounded usage percentage', () => {
    const analytics: CustomerAnalytics = { ...baseAnalytics, dataUsageGB: 4.2 };
    const context = service.buildRecommendationContext(analytics, PLANS[1]);

    expect(context.usagePercent).toBe(84);
    expect(context.planName).toBe('Standard 20GB');
    expect(context.planDataGB).toBe(20);
  });
});
