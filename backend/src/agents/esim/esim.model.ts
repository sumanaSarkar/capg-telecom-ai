export interface EsimStatus {
  customerId: string;
  active: boolean;
  deviceId?: string;
  activatedAt?: string;
  qrCodeUrl?: string;
}
