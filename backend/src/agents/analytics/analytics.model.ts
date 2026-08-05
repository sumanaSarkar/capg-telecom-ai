export interface RoamingHistoryEntry {
  country: string;
  date: string;
  dataUsedGB: number;
}

export interface MonthlyTrendEntry {
  month: string;
  dataGB: number;
}

export interface CustomerAnalytics {
  customerId: string;
  dataUsageGB: number;
  dataLimitGB: number;
  callMinutes: number;
  callLimit: number;
  roamingHistory: RoamingHistoryEntry[];
  monthlyTrend: MonthlyTrendEntry[];
}
