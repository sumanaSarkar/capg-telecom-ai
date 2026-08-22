import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { api } from '../services/api';
import type { OrchestratorResponse } from '../services/types';
import { useAuth } from './useAuth';

const STORAGE_KEY_PREFIX = 'telecom-ai-chat-v2';
const MAX_CHAT_TURNS = 5;

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text?: string;
  response?: OrchestratorResponse;
  actioned?: boolean;
}

interface ChatContextValue {
  messages: ChatMessage[];
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
  appendAssistantMessage: (response: OrchestratorResponse, shouldSpeak?: boolean) => void;
  clearChat: () => void;
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined);

const WELCOME_MESSAGE =
  "Hello! I'm Telly, your telecom assistant. How can I help you today? " +
  "Try: 'Show my past 2 months bill', 'Show all available plans', or 'What is my current plan?'";

function sanitizeForSpeech(text: string): string {
  return text
    .replace(/\*\*/g, '')
    .replace(/[_`#~]/g, '')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/[\u2728\u{1F381}\u{1F4B0}\u{1F4F1}\u{1F4B3}]/gu, '')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function firstSentence(text: string): string {
  const match = text.match(/^(.+?[.!?])(\s|$)/);
  return (match?.[1] ?? text).trim();
}

function clampWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return text.trim();
  }
  return `${words.slice(0, maxWords).join(' ')}...`;
}

function buildNaturalAgentVoiceReply(response: OrchestratorResponse): string {
  const text = response.finalMessage?.trim() ?? '';
  if (!text) {
    return 'I can help with that. Tell me what you need from your telecom account.';
  }

  const normalizedText = sanitizeForSpeech(text);

  if (/network metadata|registered account profile|number on file/i.test(normalizedText)) {
    const last4 = normalizedText.match(/ends with\s+(\d{4})/i)?.[1];
    if (last4) {
      return `I cannot read live network details directly, but I can verify your account number ending ${last4}. Would you like secure verification or SIM support now?`;
    }
    return 'I cannot directly read live network metadata, but I can securely verify your number from account records and continue from there.';
  }

  if (/block the sim|secure your sim|replacement sim|suspend outgoing/i.test(normalizedText)) {
    return 'I know this can be stressful. I can block your SIM immediately, suspend outgoing activity, and start replacement support. Shall I begin now?';
  }

  if (response.recommendation?.plan) {
    const plan = response.recommendation.plan;
    const dataText = plan.dataGB === -1 ? 'unlimited data' : `${plan.dataGB} gigabytes of data`;
    const callText = plan.callMinutes === -1 ? 'unlimited calls' : `${plan.callMinutes} minutes`;
    return `I found a strong option: ${plan.name}. It includes ${dataText} and ${callText}, at ${plan.price.toFixed(2)} per month. Want a quick comparison or should I proceed with this one?`;
  }

  if (response.availablePlans?.length) {
    const topPlan = response.availablePlans[0];
    const label = topPlan?.name ?? 'your best option';
    return `I found ${response.availablePlans.length} plans that match your needs. The strongest option is ${label}. I can compare the details with you and help you decide.`;
  }

  if (response.billingHistory?.length) {
    const total = response.billingHistory.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    return `Your recent billing totals ${total.toFixed(2)} dollars across ${response.billingHistory.length} entries. I can break down the charges or suggest the next best action.`;
  }

  if (response.roamingPackages?.length) {
    const bestPackage = response.roamingPackages[0];
    return `I found ${response.roamingPackages.length} roaming package options. The top choice is ${bestPackage?.name ?? 'a roaming pack'} for ${bestPackage?.countries?.join(', ') ?? 'your destination'}.`;
  }

  if (response.paymentUrl) {
    return 'Your payment step is ready. I can guide you through the payment flow and confirm the next action clearly.';
  }

  if (/sorry|unable|failed|error|issue/i.test(normalizedText)) {
    return 'I understand. Something did not go as expected. I can quickly retry and guide you to the next best option.';
  }

  if (normalizedText.length > 220) {
    const summary = firstSentence(clampWords(normalizedText, 28));
    return `${summary} I can break that down step by step if you want.`;
  }

  const summary = firstSentence(clampWords(normalizedText, 24));
  return `Got it. ${summary} Would you like me to take the next step now?`;
}

async function speakAssistantMessage(response: OrchestratorResponse, overrideText?: string) {
  const text = (overrideText ?? response.finalMessage ?? '').trim();
  if (!text) {
    return;
  }

  try {
    const blob = await api.synthesizeSpeech(text, 'nova');
    const audioUrl = URL.createObjectURL(blob);
    const audio = new Audio(audioUrl);
    audio.onended = () => URL.revokeObjectURL(audioUrl);
    audio.onerror = () => URL.revokeObjectURL(audioUrl);
    await audio.play();
    return;
  } catch {
    // Fallback to browser speech synthesis if the OpenAI TTS route is unavailable.
  }

  if (typeof window === 'undefined' || typeof window.speechSynthesis === 'undefined') {
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.volume = 1;
  window.speechSynthesis.speak(utterance);
}

function getStorageKey(customerId?: string): string {
  return `${STORAGE_KEY_PREFIX}:${customerId ?? 'guest'}`;
}

function readStoredMessages(customerId?: string): ChatMessage[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const stored = window.localStorage.getItem(getStorageKey(customerId));
    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored) as ChatMessage[];
    return Array.isArray(parsed) && parsed.length > 0 ? trimMessages(parsed) : [];
  } catch {
    return [];
  }
}

function trimMessages(messages: ChatMessage[]): ChatMessage[] {
  if (messages.length === 0) {
    return [];
  }

  const userMessageIndexes = messages
    .map((message, index) => (message.role === 'user' ? index : -1))
    .filter((index) => index >= 0);

  if (userMessageIndexes.length <= MAX_CHAT_TURNS) {
    return messages;
  }

  const keepFromIndex = userMessageIndexes[userMessageIndexes.length - MAX_CHAT_TURNS];
  const hasWelcomeMessage =
    messages[0]?.id === 'welcome' && messages[0]?.role === 'assistant';
  const trimmed = messages.slice(keepFromIndex);

  return hasWelcomeMessage && keepFromIndex > 0 ? [messages[0], ...trimmed] : trimmed;
}

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const customerId = user?.customerId ?? 'guest';
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const storedMessages = readStoredMessages(customerId);
    if (storedMessages.length > 0) {
      return storedMessages;
    }

    return [{ id: 'welcome', role: 'assistant', text: WELCOME_MESSAGE }];
  });

  useEffect(() => {
    const storedMessages = readStoredMessages(customerId);
    if (storedMessages.length > 0) {
      setMessages(storedMessages);
      return;
    }

    setMessages((prev) => {
      const hasConversation = prev.some((message) => message.text || message.response);
      if (hasConversation) {
        return prev;
      }
      return [{ id: 'welcome', role: 'assistant', text: WELCOME_MESSAGE }];
    });
  }, [customerId]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(getStorageKey(customerId), JSON.stringify(trimMessages(messages)));
  }, [messages, customerId]);

  const appendAssistantMessage = (response: OrchestratorResponse, shouldSpeak = false) => {
    setMessages((prev) => trimMessages([...prev, { id: crypto.randomUUID(), role: 'assistant', response }]));

    if (shouldSpeak) {
      const voiceText = buildNaturalAgentVoiceReply(response);
      void speakAssistantMessage(response, voiceText);
    }
  };

  const clearChat = () => {
    const freshConversation: ChatMessage[] = [
      { id: 'welcome', role: 'assistant', text: WELCOME_MESSAGE },
    ];
    setMessages(freshConversation);

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(getStorageKey(customerId), JSON.stringify(freshConversation));
    }
  };

  const value = useMemo(
    () => ({ messages, setMessages, appendAssistantMessage, clearChat }),
    [messages],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
}
