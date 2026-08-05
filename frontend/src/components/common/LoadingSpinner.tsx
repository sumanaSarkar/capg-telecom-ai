import styles from './LoadingSpinner.module.css';

export function LoadingSpinner() {
  return (
    <div className={styles.spinnerWrapper} role="status" aria-label="Loading">
      <div className={styles.spinner} />
    </div>
  );
}

export default LoadingSpinner;
