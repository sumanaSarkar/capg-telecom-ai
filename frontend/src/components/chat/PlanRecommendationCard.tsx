import type { Plan } from '../../services/types';
import styles from './PlanRecommendationCard.module.css';

interface PlanRecommendationCardProps {
  plan: Plan;
  reason: string;
  onConfirm: () => void;
  onDecline: () => void;
  disabled?: boolean;
}

export function PlanRecommendationCard({
  plan,
  reason,
  onConfirm,
  onDecline,
  disabled,
}: PlanRecommendationCardProps) {
  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span className={styles.planName}>{plan.name}</span>
        <span className={styles.price}>${plan.price.toFixed(2)}/mo</span>
      </div>
      <p className={styles.reason}>{reason}</p>
      <ul className={styles.features}>
        {plan.features.map((feature) => (
          <li key={feature} className={styles.feature}>
            {feature}
          </li>
        ))}
      </ul>
      <div className={styles.actions}>
        <button
          className={styles.confirmButton}
          onClick={onConfirm}
          disabled={disabled}
          type="button"
        >
          Yes, continue
        </button>
        <button
          className={styles.declineButton}
          onClick={onDecline}
          disabled={disabled}
          type="button"
        >
          No, thanks
        </button>
      </div>
    </div>
  );
}

export default PlanRecommendationCard;
