import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { BillingRecord } from './billing.model';

const BILLING_HISTORY: BillingRecord[] = [
  {
    id: 'bill-001',
    customerId: 'cust-001',
    date: '2024-04-01',
    description: 'Basic 5GB - Monthly subscription',
    amount: 29.99,
    status: 'paid',
  },
  {
    id: 'bill-002',
    customerId: 'cust-001',
    date: '2024-05-01',
    description: 'Basic 5GB - Monthly subscription',
    amount: 29.99,
    status: 'paid',
  },
  {
    id: 'bill-003',
    customerId: 'cust-001',
    date: '2024-06-01',
    description: 'Basic 5GB - Monthly subscription',
    amount: 29.99,
    status: 'pending',
  },
];

@Injectable()
export class BillingService {
  private readonly history: BillingRecord[] = [...BILLING_HISTORY];

  getBillingHistory(customerId: string): BillingRecord[] {
    return this.history.filter((record) => record.customerId === customerId);
  }

  recordTransaction(
    customerId: string,
    planId: string,
    amount: number,
  ): BillingRecord {
    const record: BillingRecord = {
      id: `bill-${uuidv4().slice(0, 8)}`,
      customerId,
      date: new Date().toISOString(),
      description: `Plan change/recharge - ${planId}`,
      amount,
      status: 'paid',
    };
    this.history.push(record);
    return record;
  }
}
