export interface BillingRecord {
  id: string;
  customerId: string;
  date: string;
  description: string;
  amount: number;
  status: 'paid' | 'pending' | 'failed';
}
