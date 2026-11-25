export interface Plan {
  id: string;
  name: string;
  dataGB: number;
  callMinutes: number;
  price: number;
  currency?: 'EUR' | 'INR' | 'USD';
  currencyRateDate?: string;
  features: string[];
  recommended: boolean;
}
