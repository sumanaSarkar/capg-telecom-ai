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
  const isCustom = Boolean(plan.isCustom);
  const hasComponents = isCustom && Array.isArray(plan.components) && plan.components.length > 0;

  return (
    <div className={`${styles.card} ${isCustom ? styles.customCard : ''}`}>
      {plan.exclusiveBadge && (
        <div className={styles.badge}>
          <span className={styles.badgeIcon}>✦</span>
          {plan.exclusiveBadge}
        </div>
      )}

      <div className={styles.header}>
        <span className={styles.planName}>{plan.name}</span>
        <span className={styles.price}>₹{plan.price.toFixed(0)}/mo</span>
      </div>

      <p className={styles.reason}>{reason}</p>

      {hasComponents && (
        <div className={styles.components}>
          <p className={styles.componentsLabel}>What's included:</p>
          <ul className={styles.componentList}>
            {plan.components!.map((component) => (
              <li key={component.name} className={styles.componentItem}>
                <span className={styles.componentName}>{component.name}</span>
                <span className={styles.componentDesc}>{component.description}</span>
                <span className={styles.componentPrice}>₹{component.monthlyPrice}/mo</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!hasComponents && (
        <ul className={styles.features}>
          {plan.features.map((feature) => (
            <li key={feature} className={styles.feature}>
              {feature}
            </li>
          ))}
        </ul>
      )}

      {hasComponents && (
        <ul className={styles.features}>
          {plan.features.map((feature) => (
            <li key={feature} className={styles.feature}>
              {feature}
            </li>
          ))}
        </ul>
      )}

      {plan.discountNote && (
        <div className={styles.discountNote}>
          🎁 {plan.discountNote}
          {plan.estimatedSavings !== undefined && (
            <span className={styles.savingsBadge}>Save ₹{plan.estimatedSavings.toFixed(0)} per year</span>
          )}
        </div>
      )}

      <div className={styles.actions}>
        <button
          className={styles.confirmButton}
          onClick={onConfirm}
          disabled={disabled}
          type="button"
        >
          Yes, activate this plan
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
