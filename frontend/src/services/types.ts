export interface CustomerProfile {
  customerId: string;
  name: string;
  email: string;
  phone: string;
  plan: string;
  customerType: string;
  kycStatus: string;
  accountBalance: number;
}

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

export interface Plan {
  id: string;
  name: string;
  dataGB: number;
  callMinutes: number;
  price: number;
  features: string[];
  recommended: boolean;
}

export interface BillingRecord {
  id: string;
  customerId: string;
  date: string;
  description: string;
  amount: number;
  status: 'paid' | 'pending' | 'failed';
}

export interface RoamingStatus {
  customerId: string;
  enabled: boolean;
  activatedAt?: string;
  countriesCovered: string[];
}

export interface EsimStatus {
  customerId: string;
  active: boolean;
  deviceId?: string;
  activatedAt?: string;
  qrCodeUrl?: string;
}

export type TicketPriority = 'low' | 'medium' | 'high';
export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export interface SupportTicket {
  id: string;
  customerId: string;
  issue: string;
  priority: TicketPriority;
  status: TicketStatus;
  createdAt: string;
}

export type AskAction = 'ask' | 'confirm' | 'payment_success';
export type OrchestratorStage = 'recommendation' | 'payment' | 'complete' | 'billing';

export interface OrchestratorResponse {
  intent: string;
  agents: string[];
  recommendation?: {
    plan: Plan;
    reason: string;
  };
  paymentUrl?: string;
  paymentId?: string;
  finalMessage: string;
  stage: OrchestratorStage;
  billingHistory?: BillingRecord[];
  context?: Record<string, unknown>;
}

export interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    username: string;
    customerId: string;
  };
}
