import { Injectable } from '@nestjs/common';

export interface RechargeResult {
  success: boolean;
  message: string;
  planId: string;
  activatedAt: string;
}

const RECHARGE_OPTIONS_BY_CUSTOMER: Record<string, Array<{ planId: string; label: string; price: number }>> = {
  'cust-001': [
    { planId: 'plan-001', label: 'Basic 5GB top-up', price: 10.99 },
    { planId: 'plan-002', label: 'Standard 20GB upgrade', price: 19.99 },
  ],
  'cust-002': [
    { planId: 'plan-011', label: 'Starter 10GB top-up', price: 12.99 },
    { planId: 'plan-012', label: 'Travel 25GB upgrade', price: 24.99 },
  ],
  'cust-003': [
    { planId: 'plan-021', label: 'Premium Plus 30GB add-on', price: 15.99 },
    { planId: 'plan-022', label: 'Business Unlimited upgrade', price: 29.99 },
  ],
};

@Injectable()
export class RechargeService {
  applyRecharge(customerId: string, planId: string): RechargeResult {
    const options = RECHARGE_OPTIONS_BY_CUSTOMER[customerId] ?? RECHARGE_OPTIONS_BY_CUSTOMER['cust-001'];
    const match = options.find((option) => option.planId === planId);

    return {
      success: true,
      message: match
        ? `${match.label} applied for ${customerId}`
        : `Recharge applied for customer ${customerId}`,
      planId,
      activatedAt: new Date().toISOString(),
    };
  }
}
