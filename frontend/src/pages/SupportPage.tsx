import { useState } from 'react';
import type { FormEvent } from 'react';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { useAuth } from '../hooks/useAuth';
import { useApi } from '../hooks/useApi';
import { api } from '../services/api';
import type { TicketPriority } from '../services/types';
import styles from './Page.module.css';

function statusBadgeClass(status: string) {
  if (status === 'resolved' || status === 'closed') return styles.badgeGreen;
  if (status === 'in_progress') return styles.badgeBlue;
  return styles.badgeYellow;
}

export function SupportPage() {
  const { user } = useAuth();
  const customerId = user?.customerId ?? 'cust-001';
  const [issue, setIssue] = useState('');
  const [priority, setPriority] = useState<TicketPriority>('medium');
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const {
    data: tickets,
    loading,
    error,
    refetch,
  } = useApi(() => api.getSupportTickets(customerId), [customerId]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!issue.trim()) return;
    setSubmitLoading(true);
    setSubmitError(null);
    try {
      await api.createSupportTicket(customerId, issue.trim(), priority);
      setIssue('');
      setPriority('medium');
      refetch();
    } catch {
      setSubmitError('Unable to create the support ticket right now.');
    } finally {
      setSubmitLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Support Tickets</h1>

      <div className={styles.card}>
        <h2 style={{ fontSize: '1rem', marginTop: 0 }}>Raise a new ticket</h2>
        <form onSubmit={handleSubmit}>
          <input
            className={styles.input}
            placeholder="Describe your issue..."
            value={issue}
            onChange={(e) => setIssue(e.target.value)}
          />
          <select
            className={styles.select}
            value={priority}
            onChange={(e) => setPriority(e.target.value as TicketPriority)}
          >
            <option value="low">Low priority</option>
            <option value="medium">Medium priority</option>
            <option value="high">High priority</option>
          </select>
          {submitError && <ErrorMessage message={submitError} />}
          <button className={styles.button} type="submit" disabled={submitLoading}>
            {submitLoading ? 'Submitting...' : 'Submit ticket'}
          </button>
        </form>
      </div>

      {loading && <LoadingSpinner />}
      {error && <ErrorMessage message={error} />}

      {!loading && !error && tickets && tickets.length > 0 && (
        <div className={styles.card}>
          <div className={styles.list}>
            {tickets.map((ticket) => (
              <div className={styles.listRow} key={ticket.id}>
                <div>
                  <div style={{ fontWeight: 600, color: '#0f172a' }}>{ticket.issue}</div>
                  <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                    {new Date(ticket.createdAt).toLocaleString()}
                  </div>
                </div>
                <span className={styles.badge}>{ticket.priority}</span>
                <span className={`${styles.badge} ${statusBadgeClass(ticket.status)}`}>
                  {ticket.status.replace('_', ' ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && !error && tickets && tickets.length === 0 && (
        <div className={styles.emptyState}>No support tickets found.</div>
      )}
    </div>
  );
}

export default SupportPage;
