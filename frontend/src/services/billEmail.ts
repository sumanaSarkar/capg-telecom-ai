import type { BillingRecord } from './types';

export function buildBillEmailUrl(record: BillingRecord, recipient: string): string {
  const date = new Date(record.date).toLocaleDateString();
  const subject = `Bill ${record.id} - ${date}`;
  const body = [
    `Bill: ${record.id}`,
    `Account: ${record.customerId}`,
    `Date: ${date}`,
    `Description: ${record.description}`,
    `Amount: $${record.amount.toFixed(2)}`,
    `Payment status: ${record.status}`,
  ].join('\n');

  return `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
