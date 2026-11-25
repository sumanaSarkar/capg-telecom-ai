import { Fragment, useState } from 'react';
import type { BillingRecord } from '../../services/types';
import { api } from '../../services/api';
import { buildBillEmailUrl } from '../../services/billEmail';
import styles from './BillingHistoryCard.module.css';

interface BillingHistoryCardProps {
  records: BillingRecord[];
}

function getPaymentStatusLabel(status: BillingRecord['status']): string {
  if (status === 'paid') return 'Paid';
  if (status === 'pending') return 'Not paid';
  return 'Payment failed';
}

export function BillingHistoryCard({ records }: BillingHistoryCardProps) {
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);
  const [emailingBillId, setEmailingBillId] = useState<string | null>(null);
  const [emailMessage, setEmailMessage] = useState<string | null>(null);

  if (records.length === 0) {
    return (
      <div className={styles.card}>
        <p className={styles.empty}>No billing records found for this period.</p>
      </div>
    );
  }

  const totalAmount = records.reduce((sum, r) => sum + r.amount, 0);

  const handleEmailBill = async (record: BillingRecord) => {
    setEmailingBillId(record.id);
    setEmailMessage(null);
    try {
      const profile = await api.getProfile(record.customerId);
      if (!profile.email.trim()) {
        setEmailMessage('There is no email address on this account.');
        return;
      }

      window.location.href = buildBillEmailUrl(record, profile.email);
      setEmailMessage(`Email draft opened for ${profile.email}. Review and send it from your email app.`);
    } catch {
      setEmailMessage('Could not open an email draft. Check the account email address and try again.');
    } finally {
      setEmailingBillId(null);
    }
  };

  return (
    <div className={styles.card}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Date</th>
            <th>Description</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Bill</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <Fragment key={record.id}>
              <tr key={record.id}>
                <td>{new Date(record.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
                <td>{record.description}</td>
                <td>${record.amount.toFixed(2)}</td>
                <td>
                  <span className={`${styles.badge} ${styles[record.status]}`}>
                    {getPaymentStatusLabel(record.status)}
                  </span>
                </td>
                <td>
                  <button
                    className={styles.viewButton}
                    type="button"
                    aria-expanded={selectedBillId === record.id}
                    onClick={() => setSelectedBillId((current) => current === record.id ? null : record.id)}
                  >
                    {selectedBillId === record.id ? 'Hide bill' : 'View bill'}
                  </button>
                </td>
              </tr>
              {selectedBillId === record.id && (
                <tr key={`${record.id}-details`}>
                  <td className={styles.invoiceCell} colSpan={5}>
                    <section className={styles.invoice} aria-label={`Bill ${record.id}`}>
                      <div className={styles.invoiceHeader}>
                        <div>
                          <h3>Bill statement</h3>
                          <span>Invoice {record.id}</span>
                        </div>
                        <span className={`${styles.badge} ${styles[record.status]}`}>
                          {getPaymentStatusLabel(record.status)}
                        </span>
                      </div>
                      <div className={styles.invoiceDetails}>
                        <div><span>Account</span><strong>{record.customerId}</strong></div>
                        <div><span>Bill date</span><strong>{new Date(record.date).toLocaleDateString()}</strong></div>
                        <div><span>Service</span><strong>{record.description}</strong></div>
                      </div>
                      <div className={styles.invoiceTotal}>
                        <span>Total billed</span>
                        <strong>${record.amount.toFixed(2)}</strong>
                      </div>
                      <div className={styles.invoiceActions}>
                        <button
                          className={styles.printButton}
                          type="button"
                          onClick={() => window.print()}
                        >
                          Print bill
                        </button>
                        <button
                          className={styles.emailButton}
                          type="button"
                          disabled={emailingBillId === record.id}
                          onClick={() => void handleEmailBill(record)}
                        >
                          {emailingBillId === record.id ? 'Preparing email...' : 'Email bill'}
                        </button>
                      </div>
                    </section>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2} className={styles.totalLabel}>Total</td>
            <td className={styles.totalAmount}>${totalAmount.toFixed(2)}</td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
      {emailMessage && <p className={styles.emailMessage} role="status">{emailMessage}</p>}
    </div>
  );
}

export default BillingHistoryCard;
