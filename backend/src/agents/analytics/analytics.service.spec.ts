import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  beforeEach(() => {
    service = new AnalyticsService();
  });

  it('returns usage data with the expected shape for a customer', () => {
    const analytics = service.getAnalytics('cust-001');

    expect(analytics.customerId).toBe('cust-001');
    expect(analytics.dataUsageGB).toBe(4.2);
    expect(analytics.dataLimitGB).toBe(5);
    expect(analytics.callMinutes).toBe(320);
    expect(analytics.callLimit).toBe(500);
    expect(Array.isArray(analytics.roamingHistory)).toBe(true);
    expect(analytics.roamingHistory[0]).toEqual({
      country: 'France',
      date: '2024-06-15',
      dataUsedGB: 0.5,
    });
    expect(analytics.monthlyTrend).toHaveLength(3);
    expect(analytics.monthlyTrend[2]).toEqual({ month: 'Mar', dataGB: 4.2 });
  });

  it('returns analytics scoped to the requested customerId', () => {
    const analytics = service.getAnalytics('cust-999');
    expect(analytics.customerId).toBe('cust-999');
  });
});
