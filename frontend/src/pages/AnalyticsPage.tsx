import { UsageChart } from '../components/common/UsageChart';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { useAuth } from '../hooks/useAuth';
import { useApi } from '../hooks/useApi';
import { api } from '../services/api';
import styles from './Page.module.css';

export function AnalyticsPage() {
  const { user } = useAuth();
  const customerId = user?.customerId ?? 'cust-001';

  const {
    data: analytics,
    loading,
    error,
  } = useApi(() => api.getAnalytics(customerId), [customerId]);

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Usage Analytics</h1>

      {loading && <LoadingSpinner />}
      {error && <ErrorMessage message={error} />}

      {!loading && !error && analytics && (
        <>
          <div className={styles.card}>
            <div className={styles.grid}>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Data usage</span>
                <span className={styles.fieldValue}>
                  {analytics.dataUsageGB}GB / {analytics.dataLimitGB}GB
                </span>
              </div>
              <div className={styles.field}>
                <span className={styles.fieldLabel}>Call minutes</span>
                <span className={styles.fieldValue}>
                  {analytics.callMinutes} / {analytics.callLimit} min
                </span>
              </div>
            </div>
          </div>

          <div className={styles.card}>
            <h2 style={{ fontSize: '1rem', marginTop: 0 }}>Monthly data usage trend</h2>
            {analytics.monthlyTrend.length > 0 ? (
              <UsageChart data={analytics.monthlyTrend} />
            ) : (
              <div className={styles.emptyState}>No trend data available.</div>
            )}
          </div>

          <div className={styles.card}>
            <h2 style={{ fontSize: '1rem', marginTop: 0 }}>Roaming history</h2>
            {analytics.roamingHistory.length > 0 ? (
              <div className={styles.list}>
                {analytics.roamingHistory.map((entry, idx) => (
                  <div className={styles.listRow} key={`${entry.country}-${idx}`}>
                    <span>{entry.country}</span>
                    <span>{entry.date}</span>
                    <span>{entry.dataUsedGB}GB used</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.emptyState}>No roaming history available.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default AnalyticsPage;
