import { Injectable } from '@nestjs/common';
import { Plan } from './plan.model';

const PLANS_BY_CUSTOMER: Record<string, Plan[]> = {
  'cust-001': [
    {
      id: 'plan-001',
      name: 'Basic 5GB',
      dataGB: 5,
      callMinutes: 500,
      price: 29.99,
      features: ['5G', 'Hotspot'],
      recommended: true,
    },
    {
      id: 'plan-002',
      name: 'Standard 20GB',
      dataGB: 20,
      callMinutes: 1000,
      price: 49.99,
      features: ['5G', 'Hotspot', 'International SMS'],
      recommended: false,
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
  ],
  'cust-002': [
    {
      id: 'plan-011',
      name: 'Starter 10GB',
      dataGB: 10,
      callMinutes: 800,
      price: 34.99,
      features: ['5G', 'Hotspot', 'Weekend Roaming'],
      recommended: true,
    },
    {
      id: 'plan-012',
      name: 'Travel 25GB',
      dataGB: 25,
      callMinutes: 1200,
      price: 54.99,
      features: ['5G', 'Hotspot', 'International SMS', 'Roaming Pass'],
      recommended: false,
    },
    {
      id: 'plan-013',
      name: 'Global Pro',
      dataGB: -1,
      callMinutes: -1,
      price: 89.99,
      features: ['5G', 'Hotspot', 'International Calls', 'Unlimited Roaming'],
      recommended: false,
    },
  ],
  'cust-003': [
    {
      id: 'plan-021',
      name: 'Premium Plus 30GB',
      dataGB: 30,
      callMinutes: 1500,
      price: 59.99,
      features: ['5G', 'Hotspot', 'Priority Support'],
      recommended: true,
    },
    {
      id: 'plan-022',
      name: 'Business Unlimited',
      dataGB: -1,
      callMinutes: -1,
      price: 99.99,
      features: ['5G', 'Hotspot', 'International Calls', 'Multi-country Roaming'],
      recommended: false,
    },
    {
      id: 'plan-023',
      name: 'Executive Ultra',
      dataGB: -1,
      callMinutes: -1,
      price: 129.99,
      features: ['5G', 'Hotspot', 'Unlimited Roaming', 'VIP Support'],
      recommended: false,
    },
  ],
};

@Injectable()
export class PlanService {
  getPlans(customerId?: string): Plan[] {
    if (customerId && PLANS_BY_CUSTOMER[customerId]) {
      return PLANS_BY_CUSTOMER[customerId];
    }
    return PLANS_BY_CUSTOMER['cust-001'];
  }

  getPlanById(planId: string): Plan | undefined {
    const allPlans = Object.values(PLANS_BY_CUSTOMER).flat();
    return allPlans.find((p) => p.id === planId);
  }
}
