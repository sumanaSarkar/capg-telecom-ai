import { AlertCircle, Bot, ChevronDown, ChevronUp, Clock3, Layers3, Mic, MicOff, Send, Sparkles, Zap, ZapOff } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
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
import type { ChatMessage } from '../hooks/useChat';
import type { AgentCommunicationTrace, OrchestratorResponse } from '../services/types';
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

const NON_TELECOM_BANNER_TEXT = 'I am not available for this service.';
const MAX_FLOW_TRACES = 5;
const FLOW_CLEAR_MARKER_PREFIX = 'telecom-ai-flow-clear-marker';
const FLOW_NODE_COLOR_CLASSES = [
  'flowBlockMint',
  'flowBlockSky',
  'flowBlockSun',
  'flowBlockCoral',
  'flowBlockLavender',
  'flowBlockLime',
] as const;

const FLOW_NODE_LAYOUT = [
  { x: 16, y: 17 },
  { x: 46, y: 12 },
  { x: 76, y: 18 },
  { x: 76, y: 45 },
  { x: 50, y: 58 },
  { x: 24, y: 47 },
  { x: 20, y: 76 },
  { x: 62, y: 80 },
] as const;

interface FlowDiagramNode {
  key: string;
  title: string;
  subtitle: string;
  x: number;
  y: number;
  colorClass: (typeof FLOW_NODE_COLOR_CLASSES)[number];
  order: number;
}

function buildConnectorPath(
  from: Pick<FlowDiagramNode, 'x' | 'y'>,
  to: Pick<FlowDiagramNode, 'x' | 'y'>,
  index: number,
): string {
  const controlX = (from.x + to.x) / 2;
  const curveOffset = index % 2 === 0 ? -10 : 10;
  const controlY = (from.y + to.y) / 2 + curveOffset;
  return `M ${from.x} ${from.y} Q ${controlX} ${controlY} ${to.x} ${to.y}`;
}

function getFlowClearMarkerKey(customerId: string): string {
  return `${FLOW_CLEAR_MARKER_PREFIX}:${customerId}`;
}

function readFlowClearMarker(customerId: string): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage.getItem(getFlowClearMarkerKey(customerId));
}

function writeFlowClearMarker(customerId: string, messageId: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(getFlowClearMarkerKey(customerId), messageId);
}

function clearFlowClearMarker(customerId: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.removeItem(getFlowClearMarkerKey(customerId));
}

function getChatStorageKey(customerId: string) {
  return `telecom-ai-chat-v2:${customerId}`;
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

function buildTracesFromMessages(messages: ChatMessage[], customerId: string): AgentCommunicationTrace[] {
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
}

function mergeHistory(
  backendHistory: AgentCommunicationTrace[],
  localHistory: AgentCommunicationTrace[],
): AgentCommunicationTrace[] {
  const merged = [...backendHistory, ...localHistory];
  const seen = new Set<string>();

  const deduplicated = merged.filter((trace) => {
    const key = `${trace.customerId}|${trace.request}|${trace.intent}|${trace.stage}|${trace.response?.finalMessage ?? ''}|${trace.agents.join(',')}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });

  return deduplicated.slice(-MAX_FLOW_TRACES);
}

function shortenText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1)}...`;
}

function formatStepTimer(steps: AgentCommunicationTrace['steps'], stepIndex: number): string {
  const fallbackSeconds = stepIndex * 0.7;
  const first = steps[0]?.timestamp;
  const current = steps[stepIndex]?.timestamp;

  if (!first || !current) {
    return `t+${fallbackSeconds.toFixed(1)}s`;
  }

  const firstTime = new Date(first).getTime();
  const currentTime = new Date(current).getTime();

  if (!Number.isFinite(firstTime) || !Number.isFinite(currentTime) || currentTime <= firstTime) {
    return `t+${fallbackSeconds.toFixed(1)}s`;
  }

  const elapsedSeconds = (currentTime - firstTime) / 1000;
  return `t+${elapsedSeconds.toFixed(1)}s`;
}

export function ChatPage() {
  const { user } = useAuth();
  const { messages, setMessages, appendAssistantMessage, clearChat } = useChat();
  const customerId = user?.customerId ?? 'cust-001';
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);
  const [backendHistory, setBackendHistory] = useState<AgentCommunicationTrace[]>([]);
  const [localHistory, setLocalHistory] = useState<AgentCommunicationTrace[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [clearingHistory, setClearingHistory] = useState(false);
  const [expandedTraceIndex, setExpandedTraceIndex] = useState<number | null>(null);
  const [flowStartMessageId, setFlowStartMessageId] = useState<string | null>(null);
  const [autopilotEnabled, setAutopilotEnabled] = useState(false);
  const [autopilotLoading, setAutopilotLoading] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const realtimeSessionRef = useRef<Record<string, unknown> | null>(null);
  const submitMessageRef = useRef<((message: string, shouldSpeak?: boolean) => Promise<void>) | null>(null);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    api.getAutopilot(customerId)
      .then((s) => setAutopilotEnabled(s.enabled))
      .catch(() => {});
  }, [customerId]);

  useEffect(() => {
    setLocalHistory(readStoredChatHistory(customerId));
    setFlowStartMessageId(readFlowClearMarker(customerId));
  }, [customerId]);

  useEffect(() => {
    const scopedMessages = (() => {
      if (!flowStartMessageId) {
        return messages;
      }

      const markerIndex = messages.findIndex((message) => message.id === flowStartMessageId);
      return markerIndex >= 0 ? messages.slice(markerIndex + 1) : messages;
    })();

    const hasAssistantResponse = scopedMessages.some(
      (message) => message.role === 'assistant' && Boolean(message.response),
    );

    if (!hasAssistantResponse) {
      setLocalHistory([]);
      setExpandedTraceIndex(null);
      return;
    }

    const lastMessage = scopedMessages[scopedMessages.length - 1];
    if (lastMessage?.role === 'assistant' && lastMessage.response) {
      setLocalHistory(buildTracesFromMessages(scopedMessages, customerId).slice(-MAX_FLOW_TRACES));
    }
  }, [messages, customerId, flowStartMessageId]);

  useEffect(() => {
    let isMounted = true;

    const loadHistory = async () => {
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const data = await api.getAgentCommunicationHistory(customerId);
        if (isMounted) {
          setBackendHistory(data.slice(-MAX_FLOW_TRACES));
        }
      } catch {
        if (isMounted) {
          setHistoryError('Live dashboard feed is temporarily unavailable.');
          setBackendHistory([]);
        }
      } finally {
        if (isMounted) {
          setHistoryLoading(false);
        }
      }
    };

    void loadHistory();

    return () => {
      isMounted = false;
    };
  }, [customerId]);

  const mergedHistory = useMemo(
    () => mergeHistory(backendHistory, localHistory),
    [backendHistory, localHistory],
  );

  const orderedHistory = useMemo(() => [...mergedHistory].reverse(), [mergedHistory]);
  const activeTrace = orderedHistory[0] ?? null;

  const flowNodes = useMemo(() => {
    if (!activeTrace) {
      return [
        {
          key: 'sample-request',
          title: 'User Request',
          subtitle: 'Example: Recommend best plan and recharge now',
        },
        {
          key: 'sample-intent',
          title: 'Intent Detected',
          subtitle: 'Orchestrator identifies the telecom goal',
        },
        {
          key: 'sample-agents',
          title: 'Agent Fan-Out',
          subtitle: 'Profile, Analytics, Plan agents run in parallel',
        },
        {
          key: 'sample-decision',
          title: 'Decision Step',
          subtitle: 'Recommendation or payment step is prepared',
        },
        {
          key: 'sample-reply',
          title: 'Assistant Reply',
          subtitle: 'Natural response with next guided action',
        },
      ];
    }

    const stepNodes = activeTrace.steps.slice(0, 4).map((step, index) => ({
      key: `${step.agent}-${index}`,
      title: `${step.agent}`,
      subtitle: shortenText(step.action === 'Generated response' ? step.detail : step.action, 52),
    }));

    return [
      {
        key: 'live-request',
        title: 'User Request',
        subtitle: shortenText(activeTrace.request, 52),
      },
      ...stepNodes,
      {
        key: 'live-stage',
        title: `Stage: ${activeTrace.stage}`,
        subtitle: shortenText(activeTrace.response?.finalMessage ?? 'Response prepared', 56),
      },
    ];
  }, [activeTrace]);

  const diagramNodes = useMemo<FlowDiagramNode[]>(() => {
    return flowNodes.slice(0, FLOW_NODE_LAYOUT.length).map((node, index) => ({
      ...node,
      ...FLOW_NODE_LAYOUT[index],
      colorClass: FLOW_NODE_COLOR_CLASSES[index % FLOW_NODE_COLOR_CLASSES.length],
      order: index + 1,
    }));
  }, [flowNodes]);

  const diagramConnectors = useMemo(() => {
    return diagramNodes.slice(0, -1).map((node, index) => {
      const nextNode = diagramNodes[index + 1];
      return {
        key: `${node.key}->${nextNode.key}`,
        path: buildConnectorPath(node, nextNode, index),
        delayMs: index * 140 + 120,
      };
    });
  }, [diagramNodes]);

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

    const supportsMediaRecorder = typeof window !== 'undefined' && 'MediaRecorder' in window;
    setVoiceReady(Boolean(recognitionConstructor || supportsMediaRecorder));

    if (!recognitionConstructor) {
      return;
    }

    const recognition = new recognitionConstructor();
    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      const transcript = Array.from({ length: event.results.length }, (_, index) => event.results[index])
        .slice(event.resultIndex)
        .map((result) => result[0]?.transcript ?? '')
        .join(' ')
        .trim();

      if (transcript) {
        void submitMessageRef.current?.(transcript, true);
      }
    };
    recognition.onerror = () => {
      setListening(false);
      setError('Voice input was interrupted. Please try again.');
    };
    recognition.onend = () => {
      if (voiceMode && !loading) {
        setTimeout(() => {
          if (voiceMode && recognitionRef.current && !loading) {
            recognitionRef.current.start();
          }
        }, 300);
        return;
      }
      setListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
      recognitionRef.current = null;
    };
  }, []);

  const appendAssistantResponse = (response: OrchestratorResponse, shouldSpeak = false) => {
    appendAssistantMessage(response, shouldSpeak);
  };

  const markActioned = (id: string) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, actioned: true } : m)));
  };

  const submitMessage = async (message: string, shouldSpeak = false) => {
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
      appendAssistantResponse(response, shouldSpeak || true);
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

  const startVoiceCapture = async () => {
    if (typeof navigator !== 'undefined' && navigator.mediaDevices && typeof MediaRecorder !== 'undefined') {
      try {
        setError(null);
        setVoiceMode(true);
        setListening(true);

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm';

        const recorder = new MediaRecorder(stream, { mimeType });
        audioChunksRef.current = [];
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        recorder.onstop = async () => {
          const blob = new Blob(audioChunksRef.current, { type: mimeType || 'audio/webm' });
          const extension = blob.type.includes('wav') ? 'wav' : blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm';
          stream.getTracks().forEach((track) => track.stop());

          try {
            const result = await api.transcribeAudio(blob, `voice.${extension}`);
            const transcript = result.transcript?.trim();
            if (transcript) {
              await submitMessageRef.current?.(transcript, true);
            }
          } catch {
            setError('Voice transcription failed. Please try again.');
          } finally {
            setListening(false);
            if (voiceMode && !loading) {
              setListening(true);
            }
          }
        };

        mediaRecorderRef.current = recorder;
        recorder.start();
        return;
      } catch {
        setListening(false);
        setVoiceMode(false);
      }
    }

    if (!voiceReady || !recognitionRef.current) {
      setError('Voice input is not supported in this browser.');
      return;
    }

    setError(null);
    setVoiceMode(true);
    setListening(true);
    recognitionRef.current.start();
  };

  const stopVoiceCapture = () => {
    setVoiceMode(false);
    setListening(false);
    mediaRecorderRef.current?.stop();
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  };

  const toggleVoiceInput = async () => {
    if (input.trim() || loading) {
      setError('Please send the current text message first before using voice input.');
      return;
    }

    if (listening) {
      stopVoiceCapture();
      return;
    }

    await startVoiceCapture();
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

  const handleToggleAutopilot = async () => {
    setAutopilotLoading(true);
    try {
      if (autopilotEnabled) {
        await api.disableAutopilot(customerId);
        setAutopilotEnabled(false);
        const res = await api.ask('Telly Autopilot disabled', customerId, 'autopilot_disable');
        appendAssistantMessage(res);
      } else {
        await api.enableAutopilot(customerId);
        setAutopilotEnabled(true);
        const res = await api.ask('Telly Autopilot enabled', customerId, 'autopilot_enable');
        appendAssistantMessage(res);
      }
    } catch {
      // silently ignore toggle errors
    } finally {
      setAutopilotLoading(false);
    }
  };

  const handleStartNewChat = () => {
    if (recognitionRef.current && listening) {
      recognitionRef.current.stop();
      setListening(false);
    }
    setVoiceMode(false);

    setInput('');
    setError(null);
    setLoading(false);
    setFlowStartMessageId(null);
    clearFlowClearMarker(customerId);
    clearChat();
  };

  const handleStartRealtimeVoice = async () => {
    try {
      setInput('');
      const session = await api.createRealtimeSession();
      realtimeSessionRef.current = session;
      setError(null);
      if (session && typeof session === 'object') {
        const clientSecret = (session as { client_secret?: { value?: string } }).client_secret;
        if (clientSecret?.value) {
          setError('Realtime session ready. Starting live voice capture now.');
        }
      }
      await startVoiceCapture();
    } catch {
      setError('Realtime voice session could not be created. Falling back to normal voice transcription.');
      await startVoiceCapture();
    }
  };

  const handleClearDashboard = async () => {
    setClearingHistory(true);
    setHistoryError(null);
    try {
      await api.clearAgentCommunicationHistory(customerId);
      setBackendHistory([]);
      setLocalHistory([]);
      setExpandedTraceIndex(null);
      const markerId = messages[messages.length - 1]?.id ?? '';
      setFlowStartMessageId(markerId || null);
      writeFlowClearMarker(customerId, markerId);
    } catch {
      setHistoryError('Unable to clear dashboard traces right now. Please try again.');
    } finally {
      setClearingHistory(false);
    }
  };

  const isNonTelecomBanner = (response: OrchestratorResponse) =>
    response.finalMessage.startsWith(NON_TELECOM_BANNER_TEXT);

  const isRechargeCompletionResponse = (response: OrchestratorResponse): boolean => {
    if (response.stage !== 'complete') {
      return false;
    }

    const context = response.context as
      | {
          recharge?: unknown;
          billingRecord?: unknown;
        }
      | undefined;

    return Boolean(context?.recharge && context?.billingRecord);
  };

  const toggleTraceExpanded = (index: number) => {
    setExpandedTraceIndex((prev) => (prev === index ? null : index));
  };

  return (
    <div className={styles.chatPage}>
      <section className={styles.chatColumn}>
        <div className={styles.header}>
            <div className={styles.headerTop}>
              <div>
                <h1 className={styles.title}>Capgemini Telecom AI Assistant</h1>
                <p className={styles.subtitle}>
                  Ask about plans, recharges, billing, roaming, or support.
                </p>
              </div>
              <div className={styles.headerActions}>
                <button
                  className={`${styles.autopilotButton} ${autopilotEnabled ? styles.autopilotOn : styles.autopilotOff}`}
                  type="button"
                  onClick={handleToggleAutopilot}
                  disabled={autopilotLoading}
                  title={autopilotEnabled ? 'Telly Autopilot ON — click to take back control' : 'Enable Telly Autopilot'}
                >
                  {autopilotEnabled ? <Zap size={15} /> : <ZapOff size={15} />}
                  {autopilotEnabled ? 'Autopilot ON' : 'Autopilot OFF'}
                </button>
                <button className={styles.newChatButton} type="button" onClick={handleStartNewChat}>
                  <Sparkles size={16} />
                  New chat
                </button>
                <button
                  className={styles.newChatButton}
                  type="button"
                  onClick={handleStartRealtimeVoice}
                >
                  <Mic size={16} />
                  Live Agent
                </button>
              </div>
            </div>
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
                <div
                  className={`${styles.bubble} ${styles.bubbleAssistant} ${
                    isNonTelecomBanner(message.response) ? styles.serviceBanner : ''
                  }`}
                >
                  <div
                    className={
                      isNonTelecomBanner(message.response)
                        ? styles.serviceBannerText
                        : undefined
                    }
                    style={{ marginBottom: '0.75rem' }}
                  >
                    {message.response.finalMessage}
                  </div>

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

                  {message.response.stage === 'bill-payment' && message.response.paymentUrl && (
                    <>
                      {message.response.billingHistory && message.response.billingHistory.length > 0 && (
                        <BillingHistoryCard records={message.response.billingHistory} />
                      )}
                      <PaymentCard
                        paymentUrl={message.response.paymentUrl}
                        amount={(message.response.context?.pendingBill as { amount?: number } | undefined)?.amount}
                        onComplete={() => {
                          const paymentId = message.response?.paymentId;
                          const bill = message.response?.context?.pendingBill as { id?: string } | undefined;
                          if (!paymentId || !bill?.id) return;
                          void api.ask('Bill payment confirmed', customerId, 'payment_success', bill.id, paymentId)
                            .then((res) => { appendAssistantMessage(res); setMessages((prev) => prev.map((m) => m.id === message.id ? { ...m, actioned: true } : m)); });
                        }}
                        disabled={message.actioned || loading}
                      />
                    </>
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

                  {isRechargeCompletionResponse(message.response) && (
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
      </section>

      <aside className={styles.dashboardColumn}>
        <div className={styles.dashboardHeader}>
          <div>
            <h2 className={styles.dashboardTitle}>Live Agent Dashboard</h2>
            <p className={styles.dashboardSubtitle}>Request traces from your current chat session</p>
            <span className={styles.dashboardFlowBadge}>FLOW DIAGRAM + TIMERS ACTIVE</span>
          </div>
          <div className={styles.dashboardActions}>
            <span className={styles.dashboardCount}>{mergedHistory.length}</span>
            <button
              type="button"
              className={styles.dashboardClearButton}
              onClick={handleClearDashboard}
              disabled={clearingHistory || historyLoading}
            >
              {clearingHistory ? 'Clearing...' : 'Clear'}
            </button>
          </div>
        </div>

        <section className={styles.flowBoard} aria-label="Agent flow diagram">
          <div className={styles.flowStickerOne} />
          <div className={styles.flowStickerTwo} />
          <div className={styles.flowStickerThree} />
          <div className={styles.flowStickerFour} />

          <div className={styles.flowCanvas}>
            <svg
              className={styles.flowSvg}
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <defs>
                <marker
                  id="flow-arrow-head"
                  viewBox="0 0 10 10"
                  refX="9"
                  refY="5"
                  markerWidth="5"
                  markerHeight="5"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#111827" />
                </marker>
              </defs>

              {diagramConnectors.map((connector) => (
                <path
                  key={connector.key}
                  d={connector.path}
                  className={styles.flowConnector}
                  style={{ animationDelay: `${connector.delayMs}ms` }}
                  markerEnd="url(#flow-arrow-head)"
                />
              ))}
            </svg>

            {diagramNodes.map((node, index) => (
              <article
                key={node.key}
                className={`${styles.flowBlock} ${styles[node.colorClass]}`}
                style={{
                  animationDelay: `${index * 140}ms`,
                }}
              >
                <span className={styles.flowBlockNumber}>{node.order}</span>
                <h3>{node.title}</h3>
                <p>{node.subtitle}</p>
              </article>
            ))}

            <span className={styles.flowSpark} />
            <span className={styles.flowLoop} />
          </div>

          <p className={styles.flowCaption}>
            {activeTrace
              ? 'Live mode: each colorful block is one executed agent step from the latest request.'
              : 'Sample mode: send a message to animate a live telecom workflow trace.'}
          </p>
        </section>

        {historyLoading && <LoadingSpinner />}

        {historyError && (
          <div className={styles.dashboardError}>
            <AlertCircle size={16} />
            <span>{historyError}</span>
          </div>
        )}

        {!historyLoading && orderedHistory.length === 0 && (
          <div className={styles.dashboardEmpty}>No agent traces yet. Start a conversation to populate this panel.</div>
        )}

        <p className={styles.traceListHeading}>Detailed Trace Cards</p>

        <div className={styles.dashboardList}>
          {orderedHistory.map((trace, index) => {
            const isExpanded = expandedTraceIndex === index;
            const latestTimestamp = trace.steps[trace.steps.length - 1]?.timestamp;

            return (
              <article key={`${trace.customerId}-${trace.request}-${index}`} className={styles.dashboardCard}>
                <button
                  type="button"
                  className={styles.dashboardCardButton}
                  onClick={() => toggleTraceExpanded(index)}
                  aria-expanded={isExpanded}
                >
                  <div>
                    <h3>{trace.intent || 'General request'}</h3>
                    <p>{trace.request}</p>
                  </div>
                  <div className={styles.dashboardMetaRight}>
                    <span className={styles.dashboardBadge}>{trace.stage}</span>
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </button>

                <div className={styles.dashboardMeta}>
                  <span>
                    <Layers3 size={14} />
                    {trace.agents.join(' → ') || 'No agents'}
                  </span>
                  <span>
                    <Clock3 size={14} />
                    {new Date(latestTimestamp ?? Date.now()).toLocaleString()}
                  </span>
                </div>

                {isExpanded && (
                  <div className={styles.dashboardSteps}>
                    {trace.steps.map((step, stepIndex) => (
                      <div key={`${step.agent}-${step.action}-${stepIndex}`} className={styles.dashboardStepSequence}>
                        <div
                          className={`${styles.dashboardStepBlock} ${styles[FLOW_NODE_COLOR_CLASSES[stepIndex % FLOW_NODE_COLOR_CLASSES.length]]}`}
                          style={{ animationDelay: `${stepIndex * 140}ms` }}
                        >
                          <div className={styles.dashboardStepHead}>
                            <strong>
                              <Bot size={13} />
                              {step.agent}
                            </strong>
                            <span className={styles.dashboardStepTimer}>{formatStepTimer(trace.steps, stepIndex)}</span>
                          </div>
                          <span className={styles.dashboardStepAction}>{step.action}</span>
                          <p>{step.detail}</p>
                        </div>

                        {stepIndex < trace.steps.length - 1 && <span className={styles.dashboardStepArrow}>→</span>}
                      </div>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </aside>
    </div>
  );
}

export default ChatPage;
