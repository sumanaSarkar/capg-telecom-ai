import { Mic, MicOff, Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import axios from 'axios';
import { BillingHistoryCard } from '../components/chat/BillingHistoryCard';
import { PaymentCard } from '../components/chat/PaymentCard';
import { PlanRecommendationCard } from '../components/chat/PlanRecommendationCard';
import { SuccessCard } from '../components/chat/SuccessCard';
import { ErrorMessage } from '../components/common/ErrorMessage';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { useAuth } from '../hooks/useAuth';
import { useChat } from '../hooks/useChat';
import { api } from '../services/api';
import type { OrchestratorResponse } from '../services/types';
import styles from './ChatPage.module.css';

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

interface SpeechRecognitionInstance {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

interface SpeechRecognitionResultEventLike {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    [index: number]: { transcript: string };
    length: number;
  }>;
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

export function ChatPage() {
  const { user } = useAuth();
  const { messages, setMessages, appendAssistantMessage } = useChat();
  const customerId = user?.customerId ?? 'cust-001';
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const submitMessageRef = useRef<((message: string) => Promise<void>) | null>(null);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const recognitionConstructor =
      (window as Window & {
        SpeechRecognition?: SpeechRecognitionConstructor;
        webkitSpeechRecognition?: SpeechRecognitionConstructor;
      }).SpeechRecognition ??
      (window as Window & {
        SpeechRecognition?: SpeechRecognitionConstructor;
        webkitSpeechRecognition?: SpeechRecognitionConstructor;
      }).webkitSpeechRecognition;

    setVoiceReady(Boolean(recognitionConstructor));

    if (!recognitionConstructor) {
      return;
    }

    const recognition = new recognitionConstructor();
    recognition.lang = 'en-US';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = Array.from({ length: event.results.length }, (_, index) => event.results[index])
        .slice(event.resultIndex)
        .map((result) => result[0]?.transcript ?? '')
        .join(' ')
        .trim();

      if (transcript) {
        void submitMessageRef.current?.(transcript);
      }
    };
    recognition.onerror = () => {
      setListening(false);
      setError('Voice input was interrupted. Please try again.');
    };
    recognition.onend = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
      recognitionRef.current = null;
    };
  }, []);

  const appendAssistantResponse = (response: OrchestratorResponse) => {
    appendAssistantMessage(response, false);
  };

  const markActioned = (id: string) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, actioned: true } : m)));
  };

  const submitMessage = async (message: string) => {
    const trimmed = message.trim();
    if (!trimmed || loading) return;

    if (recognitionRef.current && listening) {
      recognitionRef.current.stop();
      setListening(false);
    }

    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: 'user', text: trimmed }]);
    setInput('');
    setError(null);
    setLoading(true);

    try {
      const response = await api.ask(trimmed, customerId, 'ask');
      appendAssistantResponse(response);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        setError('Your session has expired. Please sign in again.');
      } else {
        setError('Something went wrong while contacting the assistant. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    submitMessageRef.current = submitMessage;
  }, [submitMessage]);

  const handleSend = async (event: FormEvent) => {
    event.preventDefault();
    await submitMessage(input);
  };

  const toggleVoiceInput = () => {
    if (input.trim() || loading) {
      setError('Please send the current text message first before using voice input.');
      return;
    }

    if (!voiceReady || !recognitionRef.current) {
      setError('Voice input is not supported in this browser.');
      return;
    }

    if (listening) {
      recognitionRef.current.stop();
      return;
    }

    setError(null);
    setListening(true);
    recognitionRef.current.start();
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

                {message.response.stage === 'billing' && (
                  <BillingHistoryCard records={message.response.billingHistory ?? []} />
                )}

                {message.response.stage === 'plans' && message.response.availablePlans && (
                  <div className={styles.planGrid}>
                    {message.response.availablePlans.map((plan) => (
                      <div
                        key={plan.id}
                        className={`${styles.planCard} ${
                          plan.recommended ? styles.planCardRecommended : ''
                        }`}
                      >
                        {plan.recommended && <span className={styles.recommendedTag}>Recommended</span>}
                        <h3 className={styles.planName}>{plan.name}</h3>
                        <p className={styles.planPrice}>${plan.price.toFixed(2)}/mo</p>
                        <p className={styles.planSummary}>
                          {plan.dataGB === -1 ? 'Unlimited data' : `${plan.dataGB}GB data`} ·{' '}
                          {plan.callMinutes === -1 ? 'Unlimited calls' : `${plan.callMinutes} minutes`}
                        </p>
                        <ul className={styles.planFeatures}>
                          {plan.features.map((feature) => (
                            <li key={feature}>{feature}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}

                {message.response.stage === 'recharge-options' && message.response.rechargeOptions && (
                  <div className={styles.planGrid}>
                    {message.response.rechargeOptions.map((plan) => (
                      <div
                        key={plan.id}
                        className={`${styles.planCard} ${
                          plan.recommended ? styles.planCardRecommended : ''
                        }`}
                      >
                        {plan.recommended && <span className={styles.recommendedTag}>Recommended</span>}
                        <h3 className={styles.planName}>{plan.name}</h3>
                        <p className={styles.planPrice}>${plan.price.toFixed(2)}/mo</p>
                        <p className={styles.planSummary}>
                          {plan.dataGB === -1 ? 'Unlimited data' : `${plan.dataGB}GB data`} ·{' '}
                          {plan.callMinutes === -1 ? 'Unlimited calls' : `${plan.callMinutes} minutes`}
                        </p>
                        <ul className={styles.planFeatures}>
                          {plan.features.map((feature) => (
                            <li key={feature}>{feature}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}

                {message.response.stage === 'roaming-packages' && message.response.roamingPackages && (
                  <div className={styles.planGrid}>
                    {message.response.roamingPackages.map((pkg) => (
                      <div
                        key={pkg.id}
                        className={`${styles.planCard} ${
                          pkg.recommended ? styles.planCardRecommended : ''
                        }`}
                      >
                        {pkg.recommended && <span className={styles.recommendedTag}>Recommended</span>}
                        <h3 className={styles.planName}>{pkg.name}</h3>
                        <p className={styles.planPrice}>${pkg.price.toFixed(2)}</p>
                        <p className={styles.planSummary}>
                          {pkg.dataGB}GB data · {pkg.days} days
                        </p>
                        <p className={styles.planSummary}>
                          Countries: {pkg.countries.join(', ')}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {loading && <LoadingSpinner />}
      </div>

      {error && <ErrorMessage message={error} />}

      <form className={styles.inputBar} onSubmit={handleSend}>
        <div className={styles.inputWrapper}>
          <input
            className={styles.input}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (e.target.value.trim() && listening) {
                recognitionRef.current?.stop();
                setListening(false);
              }
            }}
            placeholder="Type or speak your message..."
            disabled={loading}
          />
          <span className={styles.voiceStatus}>
            {listening ? 'Listening...' : 'Tap the mic to talk'}
          </span>
        </div>
        <button
          className={`${styles.voiceButton} ${listening ? styles.voiceButtonActive : ''}`}
          type="button"
          onClick={toggleVoiceInput}
          disabled={loading || Boolean(input.trim())}
          aria-label={listening ? 'Stop voice input' : 'Start voice input'}
          title={listening ? 'Stop voice input' : 'Start voice input'}
        >
          {listening ? <MicOff size={18} /> : <Mic size={18} />}
        </button>
        <button className={styles.sendButton} type="submit" disabled={loading || !input.trim()}>
          <Send size={18} />
        </button>
      </form>
    </div>
  );
}

export default ChatPage;
