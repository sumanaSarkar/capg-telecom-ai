import { ErrorMessage } from '../components/common/ErrorMessage';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { useAuth } from '../hooks/useAuth';
import { useApi } from '../hooks/useApi';
import { api } from '../services/api';
import styles from './Page.module.css';

export function ProfilePage() {
  const { user } = useAuth();
  const customerId = user?.customerId ?? 'cust-001';

  const { data: profile, loading, error } = useApi(() => api.getProfile(customerId), [customerId]);

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Profile</h1>

      {loading && <LoadingSpinner />}
      {error && <ErrorMessage message={error} />}

      {!loading && !error && profile && (
        <div className={styles.card}>
          <div className={styles.grid}>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Name</span>
              <span className={styles.fieldValue}>{profile.name}</span>
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Customer ID</span>
              <span className={styles.fieldValue}>{profile.customerId}</span>
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Email</span>
              <span className={styles.fieldValue}>{profile.email}</span>
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Phone</span>
              <span className={styles.fieldValue}>{profile.phone}</span>
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Current plan</span>
              <span className={styles.fieldValue}>{profile.plan}</span>
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Customer type</span>
              <span className={styles.fieldValue} style={{ textTransform: 'capitalize' }}>
                {profile.customerType}
              </span>
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>KYC status</span>
              <span
                className={`${styles.badge} ${
                  profile.kycStatus === 'verified' ? styles.badgeGreen : styles.badgeYellow
                }`}
              >
                {profile.kycStatus}
              </span>
            </div>
            <div className={styles.field}>
              <span className={styles.fieldLabel}>Account balance</span>
              <span className={styles.fieldValue}>${profile.accountBalance.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}

      {!loading && !error && !profile && (
        <div className={styles.emptyState}>No profile data available.</div>
      )}
    </div>
  );
}

export default ProfilePage;
