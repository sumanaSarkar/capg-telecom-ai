import { useState } from 'react';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { useAuth } from '../hooks/useAuth';
import { useApi } from '../hooks/useApi';
import { api } from '../services/api';
import styles from './Page.module.css';

export function RoamingPage() {
  const { user } = useAuth();
  const customerId = user?.customerId ?? 'cust-001';
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const {
    data: status,
    loading,
    error,
    refetch,
  } = useApi(() => api.getRoaming(customerId), [customerId]);

  const handleToggle = async () => {
    if (!status) return;
    setActionLoading(true);
    setActionError(null);
    try {
      if (status.enabled) {
        await api.disableRoaming(customerId);
      } else {
        await api.enableRoaming(customerId);
      }
      refetch();
    } catch {
      setActionError('Unable to update roaming status right now.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Roaming</h1>

      {loading && <LoadingSpinner />}
      {error && <ErrorMessage message={error} />}
      {actionError && <ErrorMessage message={actionError} />}

      {!loading && !error && status && (
        <div className={styles.card}>
          <div className={styles.grid} style={{ marginBottom: '1.25rem' }}>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Status</span>
              <span
                className={`${styles.badge} ${status.enabled ? styles.badgeGreen : styles.badgeRed}`}
              >
                {status.enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            {status.activatedAt && (
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Activated at</span>
                <span className={styles.fieldValue}>
                  {new Date(status.activatedAt).toLocaleString()}
                </span>
              </div>
            )}
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Countries covered</span>
              <span className={styles.fieldValue}>{status.countriesCovered.join(', ')}</span>
            </div>
          </div>
          <button
            className={status.enabled ? styles.buttonSecondary : styles.button}
            onClick={handleToggle}
            disabled={actionLoading}
            type="button"
          >
            {actionLoading
              ? 'Please wait...'
              : status.enabled
                ? 'Disable roaming'
                : 'Enable roaming'}
          </button>
        </div>
      )}
    </div>
  );
}

export default RoamingPage;
