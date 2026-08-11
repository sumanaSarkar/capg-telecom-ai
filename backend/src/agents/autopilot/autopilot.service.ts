import { Injectable } from '@nestjs/common';

export interface AutopilotSettings {
  customerId: string;
  enabled: boolean;
  autoPayBills: boolean;
  autoRecharge: boolean;
  enabledAt?: string;
  disabledAt?: string;
}

@Injectable()
export class AutopilotService {
  private readonly settings = new Map<string, AutopilotSettings>();

  getSettings(customerId: string): AutopilotSettings {
    return (
      this.settings.get(customerId) ?? {
        customerId,
        enabled: false,
        autoPayBills: false,
        autoRecharge: false,
      }
    );
  }

  enable(customerId: string): AutopilotSettings {
    const updated: AutopilotSettings = {
      customerId,
      enabled: true,
      autoPayBills: true,
      autoRecharge: true,
      enabledAt: new Date().toISOString(),
    };
    this.settings.set(customerId, updated);
    return updated;
  }

  disable(customerId: string): AutopilotSettings {
    const current = this.getSettings(customerId);
    const updated: AutopilotSettings = {
      ...current,
      enabled: false,
      autoPayBills: false,
      autoRecharge: false,
      disabledAt: new Date().toISOString(),
    };
    this.settings.set(customerId, updated);
    return updated;
  }

  isEnabled(customerId: string): boolean {
    return this.getSettings(customerId).enabled;
  }
}
