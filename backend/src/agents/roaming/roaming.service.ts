import { Injectable } from '@nestjs/common';
import { RoamingPackage, RoamingStatus } from './roaming.model';

const COUNTRIES_COVERED = [
  'France',
  'Germany',
  'Spain',
  'Italy',
  'United Kingdom',
];

const ROAMING_PACKAGES: RoamingPackage[] = [
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
];

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

  getRoamingPackages(): RoamingPackage[] {
    return ROAMING_PACKAGES;
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
