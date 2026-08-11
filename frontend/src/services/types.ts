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

export interface CustomPlanComponent {
  name: string;
  description: string;
  monthlyPrice: number;
  tag: string;
}

export interface Plan {
  id: string;
  name: string;
  dataGB: number;
  callMinutes: number;
  price: number;
  features: string[];
  recommended: boolean;
  // custom composed plan extras
  isCustom?: boolean;
  components?: CustomPlanComponent[];
  discountNote?: string;
  exclusiveBadge?: string;
  estimatedSavings?: number;
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

export type AskAction = 'ask' | 'confirm' | 'payment_success' | 'autopilot_enable' | 'autopilot_disable';
export type OrchestratorStage =
  | 'recommendation'
  | 'payment'
  | 'bill-payment'
  | 'complete'
  | 'billing'
  | 'plans'
  | 'recharge-options'
  | 'roaming-packages';

export interface OrchestratorResponse {
  intent: string;
  agents: string[];
  recommendation?: {
    plan: Plan;
    reason: string;
  };
  availablePlans?: Plan[];
  rechargeOptions?: Plan[];
  roamingPackages?: {
    id: string;
    name: string;
    countries: string[];
    dataGB: number;
    days: number;
    price: number;
    recommended: boolean;
  }[];
  paymentUrl?: string;
  paymentId?: string;
  finalMessage: string;
  stage: OrchestratorStage;
  billingHistory?: BillingRecord[];
  autopilot?: { enabled: boolean; action?: string };
  context?: Record<string, unknown>;
  communicationTrace?: AgentCommunicationTrace;
}

export interface AutopilotSettings {
  customerId: string;
  enabled: boolean;
  autoPayBills: boolean;
  autoRecharge: boolean;
  enabledAt?: string;
  disabledAt?: string;
}

export interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    username: string;
    customerId: string;
  };
}
export interface AgentCommunicationStep {
  agent: string;
  action: string;
  detail: string;
  timestamp: string;
}

export interface AgentCommunicationTrace {
  customerId: string;
  request: string;
  intent: string;
  stage: OrchestratorStage;
  agents: string[];
  steps: AgentCommunicationStep[];
  response?: OrchestratorResponse;
}