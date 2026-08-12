import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
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

function speakAssistantMessage(response: OrchestratorResponse) {
  if (typeof window === 'undefined' || typeof window.speechSynthesis === 'undefined') {
    return;
  }

  const text = response.finalMessage?.trim();
  if (!text) {
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
      speakAssistantMessage(response);
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
