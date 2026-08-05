import { Injectable } from '@nestjs/common';

export interface RechargeResult {
  success: boolean;
  message: string;
  planId: string;
  activatedAt: string;
}

@Injectable()
export class RechargeService {
  applyRecharge(customerId: string, planId: string): RechargeResult {
    return {
      success: true,
      message: `Recharge applied for customer ${customerId}`,
      planId,
      activatedAt: new Date().toISOString(),
    };
  }
}
