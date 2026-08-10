export interface IntentResult {
  intent: string;
  agents: string[];
  confidence: number;
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export const LLM_PROVIDER = 'LLM_PROVIDER';

export interface ILlmProvider {
  detectIntent(userMessage: string): Promise<IntentResult>;
  generateResponse(context: object, template: string): Promise<string>;
  /** Conversational multi-turn chat; falls back to single-turn if unsupported. */
  chat(messages: ConversationMessage[]): Promise<string>;
}
