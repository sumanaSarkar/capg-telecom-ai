import { Injectable } from '@nestjs/common';
import { RoamingStatus } from './roaming.model';

const COUNTRIES_COVERED = [
  'France',
  'Germany',
  'Spain',
  'Italy',
  'United Kingdom',
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
