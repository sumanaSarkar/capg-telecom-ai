import { ErrorMessage } from '../components/common/ErrorMessage';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { useApi } from '../hooks/useApi';
import { api } from '../services/api';
import styles from './Page.module.css';

export function PlansPage() {
  const { data: plans, loading, error } = useApi(() => api.getPlans(), []);

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Available Plans</h1>

      {loading && <LoadingSpinner />}
      {error && <ErrorMessage message={error} />}

      {!loading && !error && plans && plans.length > 0 && (
        <div className={styles.grid}>
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`${styles.planCard} ${
                plan.recommended ? styles.planCardRecommended : ''
              }`}
            >
              {plan.recommended && <span className={styles.recommendedTag}>Recommended</span>}
              <h2 style={{ margin: '0 0 0.25rem 0', fontSize: '1.05rem' }}>{plan.name}</h2>
              <p style={{ fontSize: '1.3rem', fontWeight: 700, color: '#0ea5e9', margin: '0 0 0.75rem 0' }}>
                ${plan.price.toFixed(2)}/mo
              </p>
              <p style={{ margin: '0 0 0.5rem 0', color: '#475569', fontSize: '0.9rem' }}>
                {plan.dataGB === -1 ? 'Unlimited data' : `${plan.dataGB}GB data`} &middot;{' '}
                {plan.callMinutes === -1 ? 'Unlimited calls' : `${plan.callMinutes} minutes`}
              </p>
              <ul style={{ paddingLeft: '1.1rem', margin: 0, color: '#334155', fontSize: '0.88rem' }}>
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {!loading && !error && plans && plans.length === 0 && (
        <div className={styles.emptyState}>No plans are currently available.</div>
      )}
    </div>
  );
}

export default PlansPage;
