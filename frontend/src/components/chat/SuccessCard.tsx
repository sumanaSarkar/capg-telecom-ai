import { CheckCircle2 } from 'lucide-react';
import styles from './SuccessCard.module.css';

interface SuccessCardProps {
  message: string;
}

export function SuccessCard({ message }: SuccessCardProps) {
  return (
    <div className={styles.card}>
      <CheckCircle2 className={styles.icon} size={28} />
      <span className={styles.message}>{message}</span>
    </div>
  );
}

export default SuccessCard;
