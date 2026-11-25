import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { BillingRecord } from './billing.model';

const BILLING_PROFILES = [
  { customerId: 'cust-001', firstBillNumber: 1, description: 'Basic 5GB - Monthly subscription', amount: 29.99 },
  { customerId: 'cust-002', firstBillNumber: 101, description: 'Starter 10GB - Monthly subscription', amount: 34.99 },
  { customerId: 'cust-003', firstBillNumber: 201, description: 'Premium Plus 30GB - Monthly subscription', amount: 59.99 },
];

const createBillingHistory = (now = new Date()): BillingRecord[] =>
  BILLING_PROFILES.flatMap((profile) =>
    Array.from({ length: 6 }, (_, index) => {
      const monthsAgo = 6 - index;
      const billDate = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 1),
      );
      const status: BillingRecord['status'] = monthsAgo === 1 ? 'pending' : 'paid';

      return {
        id: `bill-${String(profile.firstBillNumber + index).padStart(3, '0')}`,
        customerId: profile.customerId,
        date: billDate.toISOString().slice(0, 10),
        description: profile.description,
        amount: profile.amount,
        status,
      };
    }),
  );

@Injectable()
export class BillingService {
  private readonly history = createBillingHistory();

  getBillingHistory(customerId: string): BillingRecord[] {
    return this.history.filter((record) => record.customerId === customerId);
  }

  markBillPaid(customerId: string, billId: string): BillingRecord {
    const bill = this.history.find(
      (record) => record.customerId === customerId && record.id === billId,
    );
    if (!bill) {
      throw new NotFoundException(`Bill ${billId} not found`);
    }
    if (bill.status === 'paid') {
      return bill;
    }
    if (bill.status !== 'pending') {
      throw new ConflictException(`Bill ${billId} cannot be marked as paid`);
    }

    bill.status = 'paid';
    return bill;
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
