import { Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { PaymentCard } from '../components/chat/PaymentCard';
import { PlanRecommendationCard } from '../components/chat/PlanRecommendationCard';
import { SuccessCard } from '../components/chat/SuccessCard';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { useAuth } from '../hooks/useAuth';
import { api } from '../services/api';
import type { OrchestratorResponse } from '../services/types';
import styles from './ChatPage.module.css';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text?: string;
  response?: OrchestratorResponse;
  actioned?: boolean;
}

const WELCOME_MESSAGE =
  "Hello! I'm your AI telecom assistant. How can I help you today? " +
  "Try: 'Suggest the best data plan and recharge it'";

export function ChatPage() {
  const { user } = useAuth();
  const customerId = user?.customerId ?? 'cust-001';

  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'welcome', role: 'assistant', text: WELCOME_MESSAGE },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const appendAssistantResponse = (response: OrchestratorResponse) => {
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'assistant', response }]);
  };

  const markActioned = (id: string) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, actioned: true } : m)));
  };

  const handleSend = async (event: FormEvent) => {
    event.preventDefault();
    const message = input.trim();
    if (!message || loading) return;

    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'user', text: message }]);
    setInput('');
    setError(null);
    setLoading(true);

    try {
      const response = await api.ask(message, customerId, 'ask');
      appendAssistantResponse(response);
    } catch {
      setError('Something went wrong while contacting the assistant. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmPlan = async (messageId: string, response: OrchestratorResponse) => {
    if (!response.recommendation) return;
    markActioned(messageId);
    setLoading(true);
    setError(null);
    try {
      const nextResponse = await api.ask(
        'Yes, please proceed with this plan.',
        customerId,
        'confirm',
        response.recommendation.plan.id,
      );
      appendAssistantResponse(nextResponse);
    } catch {
      setError('Unable to proceed with the recharge right now. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeclinePlan = (messageId: string) => {
    markActioned(messageId);
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: 'No problem! Let me know if you would like to explore other plans or need anything else.',
      },
    ]);
  };

  const handlePaymentComplete = async (
    messageId: string,
    response: OrchestratorResponse,
    planId: string,
  ) => {
    if (!response.paymentId) return;
    markActioned(messageId);
    setLoading(true);
    setError(null);
    try {
      const nextResponse = await api.ask(
        'Payment complete.',
        customerId,
        'payment_success',
        planId,
        response.paymentId,
      );
      appendAssistantResponse(nextResponse);
    } catch {
      setError('Unable to confirm the payment right now. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.chatPage}>
      <div className={styles.header}>
        <h1 className={styles.title}>AI Assistant</h1>
        <p className={styles.subtitle}>
          Ask about plans, recharges, billing, roaming, eSIM or support.
        </p>
      </div>

      <div className={styles.thread} ref={threadRef}>
        {messages.map((message) => (
          <div
            key={message.id}
            className={`${styles.messageRow} ${
              message.role === 'user' ? styles.messageRowUser : styles.messageRowAssistant
            }`}
          >
            {message.text && (
              <div
                className={`${styles.bubble} ${
                  message.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant
                }`}
              >
                {message.text}
              </div>
            )}

            {message.response && (
              <div className={`${styles.bubble} ${styles.bubbleAssistant}`}>
                <div style={{ marginBottom: '0.75rem' }}>{message.response.finalMessage}</div>

                {message.response.stage === 'recommendation' &&
                  message.response.recommendation && (
                    <PlanRecommendationCard
                      plan={message.response.recommendation.plan}
                      reason={message.response.recommendation.reason}
                      onConfirm={() => handleConfirmPlan(message.id, message.response!)}
                      onDecline={() => handleDeclinePlan(message.id)}
                      disabled={message.actioned || loading}
                    />
                  )}

                {message.response.stage === 'payment' && message.response.paymentUrl && (
                  <PaymentCard
                    paymentUrl={message.response.paymentUrl}
                    amount={
                      (message.response.context?.plan as { price?: number } | undefined)?.price
                    }
                    onComplete={() => {
                      const plan = message.response?.context?.plan as { id: string } | undefined;
                      if (!plan?.id) return;
                      handlePaymentComplete(message.id, message.response!, plan.id);
                    }}
                    disabled={message.actioned || loading}
                  />
                )}

                {message.response.stage === 'complete' && (
                  <SuccessCard message={message.response.finalMessage} />
                )}
              </div>
            )}
          </div>
        ))}

        {loading && <LoadingSpinner />}
      </div>

      {error && <ErrorMessage message={error} />}

      <form className={styles.inputBar} onSubmit={handleSend}>
        <input
          className={styles.input}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          disabled={loading}
        />
        <button className={styles.sendButton} type="submit" disabled={loading || !input.trim()}>
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}

export default ChatPage;
