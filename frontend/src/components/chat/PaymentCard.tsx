import { CreditCard } from 'lucide-react';
import { formatCurrency, type CurrencyCode } from '../../services/currency';
import styles from './PaymentCard.module.css';

interface PaymentCardProps {
  paymentUrl: string;
  amount?: number;
  currency?: CurrencyCode;
  onComplete: () => void;
  disabled?: boolean;
}

export function PaymentCard({ paymentUrl, amount, currency = 'USD', onComplete, disabled }: PaymentCardProps) {
  return (
    <div className={styles.card}>
      <div className={styles.title}>
        <CreditCard size={18} />
        Complete your payment
      </div>
      {amount !== undefined && <div className={styles.amount}>{formatCurrency(amount, currency)}</div>}
      <a
        className={styles.link}
        href={paymentUrl}
        target="_blank"
        rel="noopener noreferrer nofollow"
      >
        {paymentUrl}
      </a>
      <div>
        <button
          className={styles.completeButton}
          onClick={onComplete}
          disabled={disabled}
          type="button"
        >
          Payment Complete
        </button>
      </div>
    </div>
  );
}

export default PaymentCard;
