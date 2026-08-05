import type { BillingRecord } from '../../services/types';
import styles from './BillingHistoryCard.module.css';

interface BillingHistoryCardProps {
  records: BillingRecord[];
}

export function BillingHistoryCard({ records }: BillingHistoryCardProps) {
  if (records.length === 0) {
    return (
      <div className={styles.card}>
        <p className={styles.empty}>No billing records found for this period.</p>
      </div>
    );
  }

  const totalAmount = records.reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className={styles.card}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Date</th>
            <th>Description</th>
            <th>Amount</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id}>
              <td>{new Date(record.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</td>
              <td>{record.description}</td>
              <td>${record.amount.toFixed(2)}</td>
              <td>
                <span className={`${styles.badge} ${styles[record.status]}`}>
                  {record.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2} className={styles.totalLabel}>Total</td>
            <td className={styles.totalAmount}>${totalAmount.toFixed(2)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default BillingHistoryCard;
