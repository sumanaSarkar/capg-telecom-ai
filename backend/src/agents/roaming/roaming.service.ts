import { Injectable } from '@nestjs/common';
import { RoamingPackage, RoamingStatus } from './roaming.model';

const COUNTRIES_COVERED = [
  'France',
  'Germany',
  'Spain',
  'Italy',
  'United Kingdom',
];

const ROAMING_PACKAGES_BY_CUSTOMER: Record<string, RoamingPackage[]> = {
  'cust-001': [
    {
      id: 'roam-001',
      name: 'Europe Lite',
      countries: ['France', 'Germany', 'Spain', 'Italy'],
      dataGB: 2,
      days: 7,
      price: 12.99,
      recommended: false,
    },
    {
      id: 'roam-002',
      name: 'Europe Plus',
      countries: ['France', 'Germany', 'Spain', 'Italy', 'United Kingdom'],
      dataGB: 5,
      days: 14,
      price: 24.99,
      recommended: true,
    },
    {
      id: 'roam-003',
      name: 'Global Max',
      countries: ['France', 'Germany', 'Spain', 'Italy', 'United Kingdom'],
      dataGB: 10,
      days: 30,
      price: 39.99,
      recommended: false,
    },
  ],
  'cust-002': [
    {
      id: 'roam-011',
      name: 'Weekend Escape',
      countries: ['Germany', 'Spain', 'Italy'],
      dataGB: 3,
      days: 5,
      price: 9.99,
      recommended: true,
    },
    {
      id: 'roam-012',
      name: 'Schengen Flow',
      countries: ['Germany', 'Spain', 'Italy', 'France'],
      dataGB: 8,
      days: 15,
      price: 19.99,
      recommended: false,
    },
    {
      id: 'roam-013',
      name: 'Atlantic Connect',
      countries: ['United Kingdom', 'Ireland', 'France'],
      dataGB: 12,
      days: 21,
      price: 29.99,
      recommended: false,
    },
  ],
  'cust-003': [
    {
      id: 'roam-021',
      name: 'Business Europe',
      countries: ['France', 'Germany', 'Spain', 'Italy', 'United Kingdom'],
      dataGB: 6,
      days: 10,
      price: 17.99,
      recommended: true,
    },
    {
      id: 'roam-022',
      name: 'Global Executive',
      countries: ['France', 'Germany', 'Spain', 'Italy', 'United Kingdom', 'Singapore'],
      dataGB: 15,
      days: 30,
      price: 49.99,
      recommended: false,
    },
    {
      id: 'roam-023',
      name: 'Worldwide Premium',
      countries: ['France', 'Germany', 'Spain', 'Italy', 'United Kingdom', 'Singapore', 'USA'],
      dataGB: 20,
      days: 45,
      price: 69.99,
      recommended: false,
    },
  ],
};

@Injectable()
export class RoamingService {
  private readonly statusByCustomer = new Map<string, RoamingStatus>();

  private getOrCreate(customerId: string): RoamingStatus {
    let status = this.statusByCustomer.get(customerId);
    if (!status) {
      status = {
        customerId,
        enabled: false,
        countriesCovered: COUNTRIES_COVERED,
      };
      this.statusByCustomer.set(customerId, status);
    }
    return status;
  }

  getRoamingStatus(customerId: string): RoamingStatus {
    return this.getOrCreate(customerId);
  }

  getRoamingPackages(customerId?: string): RoamingPackage[] {
    if (customerId && ROAMING_PACKAGES_BY_CUSTOMER[customerId]) {
      return ROAMING_PACKAGES_BY_CUSTOMER[customerId];
    }
    return ROAMING_PACKAGES_BY_CUSTOMER['cust-001'];
  }

  enableRoaming(customerId: string): RoamingStatus {
    const status = this.getOrCreate(customerId);
    status.enabled = true;
    status.activatedAt = new Date().toISOString();
    this.statusByCustomer.set(customerId, status);
    return status;
  }

  disableRoaming(customerId: string): RoamingStatus {
    const status = this.getOrCreate(customerId);
    status.enabled = false;
    status.activatedAt = undefined;
    this.statusByCustomer.set(customerId, status);
    return status;
  }
}
