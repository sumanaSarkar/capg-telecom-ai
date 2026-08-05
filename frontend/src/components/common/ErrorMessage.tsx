import { AlertTriangle } from 'lucide-react';
import styles from './ErrorMessage.module.css';

interface ErrorMessageProps {
  message: string;
}

export function ErrorMessage({ message }: ErrorMessageProps) {
  return (
    <div className={styles.errorBox} role="alert">
      <AlertTriangle size={18} />
      <span>{message}</span>
    </div>
  );
}

export default ErrorMessage;
