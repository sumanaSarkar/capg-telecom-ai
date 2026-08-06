import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { BillingRecord } from './billing.model';

const BILLING_HISTORY: BillingRecord[] = [
  {
    id: 'bill-001',
    customerId: 'cust-001',
    date: '2026-05-01',
    description: 'Basic 5GB - Monthly subscription',
    amount: 29.99,
    status: 'paid',
  },
  {
    id: 'bill-002',
    customerId: 'cust-001',
    date: '2026-06-01',
    description: 'Basic 5GB - Monthly subscription',
    amount: 29.99,
    status: 'paid',
  },
  {
    id: 'bill-003',
    customerId: 'cust-001',
    date: '2026-07-01',
    description: 'Basic 5GB - Monthly subscription',
    amount: 29.99,
    status: 'paid',
  },
  {
    id: 'bill-004',
    customerId: 'cust-001',
    date: '2026-08-01',
    description: 'Basic 5GB - Monthly subscription',
    amount: 29.99,
    status: 'pending',
  },
  {
    id: 'bill-101',
    customerId: 'cust-002',
    date: '2026-05-01',
    description: 'Starter 10GB - Monthly subscription',
    amount: 34.99,
    status: 'paid',
  },
  {
    id: 'bill-102',
    customerId: 'cust-002',
    date: '2026-06-01',
    description: 'Starter 10GB - Monthly subscription',
    amount: 34.99,
    status: 'paid',
  },
  {
    id: 'bill-103',
    customerId: 'cust-002',
    date: '2026-07-01',
    description: 'Starter 10GB - Monthly subscription',
    amount: 34.99,
    status: 'paid',
  },
  {
    id: 'bill-104',
    customerId: 'cust-002',
    date: '2026-08-01',
    description: 'Starter 10GB - Monthly subscription',
    amount: 34.99,
    status: 'pending',
  },
  {
    id: 'bill-201',
    customerId: 'cust-003',
    date: '2026-05-01',
    description: 'Premium Plus 30GB - Monthly subscription',
    amount: 59.99,
    status: 'paid',
  },
  {
    id: 'bill-202',
    customerId: 'cust-003',
    date: '2026-06-01',
    description: 'Premium Plus 30GB - Monthly subscription',
    amount: 59.99,
    status: 'paid',
  },
  {
    id: 'bill-203',
    customerId: 'cust-003',
    date: '2026-07-01',
    description: 'Premium Plus 30GB - Monthly subscription',
    amount: 59.99,
    status: 'paid',
  },
  {
    id: 'bill-204',
    customerId: 'cust-003',
    date: '2026-08-01',
    description: 'Premium Plus 30GB - Monthly subscription',
    amount: 59.99,
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
