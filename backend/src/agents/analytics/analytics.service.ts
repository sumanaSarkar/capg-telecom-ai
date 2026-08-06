import { Injectable } from '@nestjs/common';
import { CustomerAnalytics } from './analytics.model';

const CUSTOMER_ANALYTICS: Record<string, Omit<CustomerAnalytics, 'customerId'>> = {
  'cust-001': {
    dataUsageGB: 4.2,
    dataLimitGB: 5,
    callMinutes: 320,
    callLimit: 500,
    roamingHistory: [{ country: 'France', date: '2024-06-15', dataUsedGB: 0.5 }],
    monthlyTrend: [
      { month: 'Jan', dataGB: 3.1 },
      { month: 'Feb', dataGB: 3.8 },
      { month: 'Mar', dataGB: 4.2 },
    ],
  },
  'cust-002': {
    dataUsageGB: 14.8,
    dataLimitGB: 20,
    callMinutes: 840,
    callLimit: 1000,
    roamingHistory: [{ country: 'Germany', date: '2024-07-02', dataUsedGB: 1.2 }],
    monthlyTrend: [
      { month: 'Jan', dataGB: 10.2 },
      { month: 'Feb', dataGB: 12.9 },
      { month: 'Mar', dataGB: 14.8 },
    ],
  },
  'cust-003': {
    dataUsageGB: 34.6,
    dataLimitGB: 999,
    callMinutes: 1520,
    callLimit: 2000,
    roamingHistory: [{ country: 'Spain', date: '2024-07-18', dataUsedGB: 2.8 }],
    monthlyTrend: [
      { month: 'Jan', dataGB: 26.4 },
      { month: 'Feb', dataGB: 30.1 },
      { month: 'Mar', dataGB: 34.6 },
    ],
  },
};

@Injectable()
export class AnalyticsService {
  getAnalytics(customerId: string): CustomerAnalytics {
    const analytics = CUSTOMER_ANALYTICS[customerId] ?? CUSTOMER_ANALYTICS['cust-001'];
    return {
      customerId,
      ...analytics,
    };
  }
}
