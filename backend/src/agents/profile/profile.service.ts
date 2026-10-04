import { Injectable, NotFoundException } from '@nestjs/common';
import { CustomerProfile } from './profile.model';

const PROFILES: Record<string, CustomerProfile> = {
  'cust-001': {
    customerId: 'cust-001',
    name: 'Alex Johnson',
    email: 'alex@example.com',
    phone: '+1-555-0101',
    plan: 'Basic 5GB',
    currentNetwork: 'Airtel',
    customerType: 'postpaid',
    kycStatus: 'verified',
    accountBalance: 45.5,
  },
  'cust-002': {
    customerId: 'cust-002',
    name: 'Maya Chen',
    email: 'maya@example.com',
    phone: '+1-555-0102',
    plan: 'Standard 20GB',
    currentNetwork: 'Jio',
    customerType: 'prepaid',
    kycStatus: 'verified',
    accountBalance: 18.25,
  },
  'cust-003': {
    customerId: 'cust-003',
    name: 'Liam Patel',
    email: 'liam@example.com',
    phone: '+1-555-0103',
    plan: 'Premium Unlimited',
    currentNetwork: 'Vodafone Idea',
    customerType: 'postpaid',
    kycStatus: 'verified',
    accountBalance: 92.75,
  },
};

@Injectable()
export class ProfileService {
  getProfile(customerId: string): CustomerProfile {
    const profile = PROFILES[customerId];
    if (!profile) {
      throw new NotFoundException(
        `Profile not found for customer ${customerId}`,
      );
    }
    return profile;
  }
}
