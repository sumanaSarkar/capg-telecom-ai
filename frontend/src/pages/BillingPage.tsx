import { ErrorMessage } from '../components/common/ErrorMessage';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { useAuth } from '../hooks/useAuth';
import { useApi } from '../hooks/useApi';
import { api } from '../services/api';
import styles from './Page.module.css';

function statusBadgeClass(status: string) {
  if (status === 'paid') return styles.badgeGreen;
  if (status === 'pending') return styles.badgeYellow;
  return styles.badgeRed;
}

export function BillingPage() {
  const { user } = useAuth();
  const customerId = user?.customerId ?? 'cust-001';

  const { data: records, loading, error } = useApi(() => api.getBilling(customerId), [customerId]);

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Billing History</h1>

      {loading && <LoadingSpinner />}
      {error && <ErrorMessage message={error} />}

      {!loading && !error && records && records.length > 0 && (
        <div className={styles.card}>
          <div className={styles.list}>
            {records.map((record) => (
              <div className={styles.listRow} key={record.id}>
                <div>
                  <div style={{ fontWeight: 600, color: '#0f172a' }}>{record.description}</div>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                    {new Date(record.date).toLocaleDateString()}
                  </div>
                </div>
                <div style={{ fontWeight: 700 }}>${record.amount.toFixed(2)}</div>
                <span className={`${styles.badge} ${statusBadgeClass(record.status)}`}>
                  {record.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && !error && records && records.length === 0 && (
        <div className={styles.emptyState}>No billing records found.</div>
      )}
    </div>
  );
}

export default BillingPage;
