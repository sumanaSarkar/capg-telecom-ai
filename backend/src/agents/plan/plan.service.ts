import { Injectable } from '@nestjs/common';
import { Plan } from './plan.model';

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

@Injectable()
export class PlanService {
  getPlans(customerId?: string): Plan[] {
    void customerId;
    return PLANS;
  }

  getPlanById(planId: string): Plan | undefined {
    return PLANS.find((p) => p.id === planId);
  }
}
