import { Injectable } from '@nestjs/common';
import { CustomerAnalytics } from './analytics.model';

const DEFAULT_ANALYTICS: Omit<CustomerAnalytics, 'customerId'> = {
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
};

@Injectable()
export class AnalyticsService {
  getAnalytics(customerId: string): CustomerAnalytics {
    return {
      customerId,
      ...DEFAULT_ANALYTICS,
    };
  }
}
