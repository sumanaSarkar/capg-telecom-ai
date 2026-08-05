import { Injectable } from '@nestjs/common';
import { EsimStatus } from './esim.model';

@Injectable()
export class EsimService {
  private readonly statusByCustomer = new Map<string, EsimStatus>();

  private getOrCreate(customerId: string): EsimStatus {
    let status = this.statusByCustomer.get(customerId);
    if (!status) {
      status = { customerId, active: false };
      this.statusByCustomer.set(customerId, status);
    }
    return status;
  }

  getEsimStatus(customerId: string): EsimStatus {
    return this.getOrCreate(customerId);
  }

  activateEsim(customerId: string, deviceId: string): EsimStatus {
    const status = this.getOrCreate(customerId);
    status.active = true;
    status.deviceId = deviceId;
    status.activatedAt = new Date().toISOString();
    status.qrCodeUrl = `https://esim.example.com/qr/${customerId}-${deviceId}`;
    this.statusByCustomer.set(customerId, status);
    return status;
  }

  deactivateEsim(customerId: string): EsimStatus {
    const status = this.getOrCreate(customerId);
    status.active = false;
    status.deviceId = undefined;
    status.activatedAt = undefined;
    status.qrCodeUrl = undefined;
    this.statusByCustomer.set(customerId, status);
    return status;
  }
}
