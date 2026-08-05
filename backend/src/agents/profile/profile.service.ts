import { Injectable, NotFoundException } from '@nestjs/common';
import { CustomerProfile } from './profile.model';

const PROFILES: Record<string, CustomerProfile> = {
  'cust-001': {
    customerId: 'cust-001',
    name: 'Alex Johnson',
    email: 'alex@example.com',
    phone: '+1-555-0101',
    plan: 'Basic 5GB',
    customerType: 'postpaid',
    kycStatus: 'verified',
    accountBalance: 45.5,
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
