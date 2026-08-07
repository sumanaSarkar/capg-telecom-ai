import { AlertCircle, Bot, ChevronDown, ChevronUp, Clock3, Layers3 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';
import type { AgentCommunicationTrace, OrchestratorResponse } from '../services/types';
import type { ChatMessage } from '../hooks/useChat';
import styles from './AgentDashboardPage.module.css';

function getChatStorageKey(customerId: string) {
  return `telecom-ai-chat:${customerId}`;
}

function readStoredChatHistory(customerId: string): AgentCommunicationTrace[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const stored = window.localStorage.getItem(getChatStorageKey(customerId));
    if (!stored) {
      return [];
    }

    const messages = JSON.parse(stored) as ChatMessage[];
    const traces: AgentCommunicationTrace[] = [];
    let currentTrace: AgentCommunicationTrace | null = null;

    for (const message of messages) {
      if (message.role === 'user' && message.text?.trim()) {
        if (currentTrace && currentTrace.steps.length > 0) {
          traces.push(currentTrace);
        }

        currentTrace = {
          customerId,
          request: message.text.trim(),
          intent: '',
          stage: 'complete',
          agents: [],
          steps: [],
        };
        continue;
      }

      if (message.role === 'assistant' && message.response && currentTrace) {
        const response = message.response;

        currentTrace.intent = currentTrace.intent || response.intent;
        currentTrace.stage = response.stage || currentTrace.stage;
        currentTrace.response = response;

        const timestamp = new Date().toISOString();
        currentTrace.steps.push({
          agent: 'Orchestrator',
          action: 'Intent detected',
          detail: `Detected intent "${response.intent}" and selected agents: ${response.agents?.join(', ') || 'none'}.`,
          timestamp,
        });

        for (const agent of response.agents ?? []) {
          if (!currentTrace.agents.includes(agent)) {
            currentTrace.agents.push(agent);
          }
          currentTrace.steps.push({
            agent,
            action: 'Agent engaged',
            detail: `Agent ${agent} handled the request.`,
            timestamp,
          });
        }

        currentTrace.steps.push({
          agent: 'LLM',
          action: 'Generated response',
          detail: 'LLM generated the final assistant response.',
          timestamp,
        });
      }
    }

    if (currentTrace && currentTrace.steps.length > 0) {
      traces.push(currentTrace);
    }

    return traces;
  } catch {
    return [];
  }
}

function mergeHistory(
  backendHistory: AgentCommunicationTrace[],
  localHistory: AgentCommunicationTrace[],
): AgentCommunicationTrace[] {
  const merged = [...backendHistory, ...localHistory];
  const seen = new Set<string>();

  return merged.filter((trace) => {
    const key = `${trace.customerId}|${trace.request}|${trace.intent}|${trace.stage}|${trace.response?.finalMessage ?? ''}|${trace.agents.join(',')}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function AgentDashboardPage() {
  const { user } = useAuth();
  const customerId = user?.customerId ?? 'cust-001';
  const [history, setHistory] = useState<AgentCommunicationTrace[]>([]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadHistory = async () => {
      try {
        const data = await api.getAgentCommunicationHistory(customerId);
        const localHistory = readStoredChatHistory(customerId);
        const merged = mergeHistory(data, localHistory);

        if (isMounted) {
          setHistory(merged.length > 0 ? merged : localHistory);
        }
      } catch {
        if (isMounted) {
          setHistory(readStoredChatHistory(customerId));
          setError('Unable to load the agent communication history right now.');
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadHistory();

    return () => {
      isMounted = false;
    };
  }, [customerId]);

  const toggleExpanded = (index: number) => {
    setExpandedIndex((prev) => (prev === index ? null : index));
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Agent Communication Dashboard</h1>
          <p className={styles.subtitle}>
            Review the latest orchestrator flow and see which agents handled each request.
          </p>
        </div>
        <div className={styles.summaryCard}>
          <span className={styles.summaryLabel}>Tracked sessions</span>
          <strong>{history.length}</strong>
        </div>
      </div>

      {loading && <LoadingSpinner />}
      {error && (
        <div className={styles.errorState}>
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && history.length === 0 && (
        <div className={styles.emptyState}>No communication history has been recorded yet.</div>
      )}

      <div className={styles.list}>
        {history.map((trace, index) => {
          const isExpanded = expandedIndex === index;
          return (
            <article
              key={`${trace.customerId}-${trace.request}-${index}`}
              className={`${styles.card} ${isExpanded ? styles.expandedCard : ''}`}
            >
              <button
                type="button"
                className={styles.cardHeaderButton}
                onClick={() => toggleExpanded(index)}
                aria-expanded={isExpanded}
              >
                <div className={styles.cardHeaderContent}>
                  <div>
                    <h2 className={styles.cardTitle}>{trace.intent}</h2>
                    <p className={styles.cardSubtitle}>{trace.request}</p>
                    {trace.response?.finalMessage && (
                      <p className={styles.cardSubtitle} style={{ marginTop: '0.5rem' }}>
                        {trace.response.finalMessage}
                      </p>
                    )}
                  </div>
                  <div className={styles.cardHeaderAside}>
                    <span className={styles.badge}>{trace.stage}</span>
                    {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </div>
                </div>
              </button>

              <div className={styles.metaRow}>
                <div className={styles.metaItem}>
                  <Layers3 size={16} />
                  <span>{trace.agents.join(' → ') || 'No agents'}</span>
                </div>
                <div className={styles.metaItem}>
                  <Clock3 size={16} />
                  <span>{new Date(trace.steps[0]?.timestamp ?? Date.now()).toLocaleString()}</span>
                </div>
              </div>

              {isExpanded && (
                <div className={styles.stepsList}>
                  {trace.steps.map((step, stepIndex) => (
                    <div key={`${step.agent}-${step.action}-${stepIndex}`} className={styles.stepItem}>
                      <div className={styles.stepIcon}>
                        <Bot size={14} />
                      </div>
                      <div className={styles.stepBody}>
                        <div className={styles.stepHeader}>
                          <strong>{step.agent}</strong>
                          <span>{step.action}</span>
                        </div>
                        <p>{step.detail}</p>
                        <small>{new Date(step.timestamp).toLocaleString()}</small>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

export default AgentDashboardPage;
