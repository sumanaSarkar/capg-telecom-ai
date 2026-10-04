import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import { api } from '../services/api';
import type { OrchestratorResponse } from '../services/types';
import { useAuth } from './useAuth';

const STORAGE_KEY_PREFIX = 'telecom-ai-chat-v2';
const MAX_CHAT_TURNS = 5;
let voiceAudioContext: AudioContext | null = null;

export function unlockVoicePlayback(): void {
  if (typeof window === 'undefined' || !window.AudioContext) {
    return;
  }

  voiceAudioContext ??= new window.AudioContext();
  if (voiceAudioContext.state === 'suspended') {
    void voiceAudioContext.resume().catch(() => {});
  }
}

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
  appendAssistantMessage: (
    response: OrchestratorResponse,
    shouldSpeak?: boolean,
    sourceUserText?: string,
  ) => void;
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
    // Turn bullet/dash lists into flowing spoken sentences instead of reading out "dash" pauses.
    .replace(/:\s*[-•]\s+/g, ': ')
    .replace(/\n\s*[-•]\s+/g, '. ')
    .replace(/\s[-•]\s+/g, ', ')
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function detectDeclaredGender(sourceUserText?: string): 'male' | 'female' | null {
  const text = (sourceUserText ?? '').toLowerCase();
  if (!text) {
    return null;
  }

  if (/\b(i\s*am|i'm|im)\s+(a\s+)?(woman|female|girl|lady)\b/.test(text)) {
    return 'female';
  }

  if (/\b(i\s*am|i'm|im)\s+(a\s+)?(man|male|boy|guy)\b/.test(text)) {
    return 'male';
  }

  return null;
}

function pickOppositeVoice(sourceUserText?: string): 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' {
  const declaredGender = detectDeclaredGender(sourceUserText);
  if (declaredGender === 'male') {
    return 'shimmer';
  }
  if (declaredGender === 'female') {
    return 'onyx';
  }
  return 'nova';
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

  // The backend already produces a dynamic, language-aware, proactive reply — speak it as-is
  // instead of re-templating it with canned English phrases that would clash with the response's language.
  return normalizedText;
}

async function prepareSpeech(
  response: OrchestratorResponse,
  overrideText?: string,
  sourceUserText?: string,
): Promise<(() => void) | null> {
  const text = (overrideText ?? response.finalMessage ?? '').trim();
  if (!text) {
    return null;
  }

  try {
    const voice = pickOppositeVoice(sourceUserText);
    const blob = await api.synthesizeSpeech(text, voice);
    if (typeof window === 'undefined' || !window.AudioContext) {
      throw new Error('Web Audio is not available.');
    }

    voiceAudioContext ??= new window.AudioContext();
    if (voiceAudioContext.state === 'suspended') {
      await voiceAudioContext.resume();
    }

    const context = voiceAudioContext;
    const audioBuffer = await context.decodeAudioData(await blob.arrayBuffer());
    return () => {
      const source = context.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(context.destination);
      source.start();
    };
  } catch {
    // Fall back to browser speech if TTS or Web Audio playback is unavailable.
  }

  if (typeof window === 'undefined' || typeof window.speechSynthesis === 'undefined') {
    return null;
  }

  return () => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    window.speechSynthesis.speak(utterance);
  };
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

  const appendAssistantMessage = (
    response: OrchestratorResponse,
    shouldSpeak = false,
    sourceUserText?: string,
  ) => {
    const showMessage = () =>
      setMessages((prev) => trimMessages([...prev, { id: crypto.randomUUID(), role: 'assistant', response }]));

    if (!shouldSpeak) {
      showMessage();
      return;
    }

    // Reveal the text only once audio is ready so text and voice start together.
    const voiceText = buildNaturalAgentVoiceReply(response);
    const speech = prepareSpeech(response, voiceText, sourceUserText);
    const timedOut = Symbol('timeout');
    void Promise.race([
      speech,
      new Promise<typeof timedOut>((resolve) => window.setTimeout(() => resolve(timedOut), 6000)),
    ]).then((result) => {
      showMessage();
      if (typeof result === 'function') {
        result();
      } else if (result === timedOut) {
        void speech.then((play) => play?.());
      }
    });
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
