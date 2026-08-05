import { useState } from 'react';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { useAuth } from '../hooks/useAuth';
import { useApi } from '../hooks/useApi';
import { api } from '../services/api';
import styles from './Page.module.css';

export function EsimPage() {
  const { user } = useAuth();
  const customerId = user?.customerId ?? 'cust-001';
  const [deviceId, setDeviceId] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const {
    data: status,
    loading,
    error,
    refetch,
  } = useApi(() => api.getEsim(customerId), [customerId]);

  const handleActivate = async () => {
    if (!deviceId.trim()) {
      setActionError('Please enter a device ID to activate the eSIM.');
      return;
    }
    setActionLoading(true);
    setActionError(null);
    try {
      await api.activateEsim(customerId, deviceId.trim());
      setDeviceId('');
      refetch();
    } catch {
      setActionError('Unable to activate eSIM right now.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeactivate = async () => {
    setActionLoading(true);
    setActionError(null);
    try {
      await api.deactivateEsim(customerId);
      refetch();
    } catch {
      setActionError('Unable to deactivate eSIM right now.');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>eSIM Management</h1>

      {loading && <LoadingSpinner />}
      {error && <ErrorMessage message={error} />}
      {actionError && <ErrorMessage message={actionError} />}

      {!loading && !error && status && (
        <div className={styles.card}>
          <div className={styles.grid} style={{ marginBottom: '1.25rem' }}>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Status</span>
              <span
                className={`${styles.badge} ${status.active ? styles.badgeGreen : styles.badgeRed}`}
              >
                {status.active ? 'Active' : 'Inactive'}
              </span>
            </div>
            {status.deviceId && (
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Device ID</span>
                <span className={styles.fieldValue}>{status.deviceId}</span>
              </div>
            )}
            {status.activatedAt && (
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Activated at</span>
                <span className={styles.fieldValue}>
                  {new Date(status.activatedAt).toLocaleString()}
                </span>
              </div>
            )}
          </div>

          {status.active ? (
            <button
              className={styles.buttonSecondary}
              onClick={handleDeactivate}
              disabled={actionLoading}
              type="button"
            >
              {actionLoading ? 'Please wait...' : 'Deactivate eSIM'}
            </button>
          ) : (
            <>
              <input
                className={styles.input}
                placeholder="Device ID (e.g. device-iphone-15)"
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
              />
              <button
                className={styles.button}
                onClick={handleActivate}
                disabled={actionLoading}
                type="button"
              >
                {actionLoading ? 'Please wait...' : 'Activate eSIM'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default EsimPage;
