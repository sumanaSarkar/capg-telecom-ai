import { ErrorMessage } from '../components/common/ErrorMessage';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { BillingHistoryCard } from '../components/chat/BillingHistoryCard';
import { useAuth } from '../hooks/useAuth';
import { useApi } from '../hooks/useApi';
import { api } from '../services/api';
import styles from './Page.module.css';

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
        <BillingHistoryCard records={records} />
      )}

      {!loading && !error && records && records.length === 0 && (
        <div className={styles.emptyState}>No billing records found.</div>
      )}
    </div>
  );
}

export default BillingPage;
