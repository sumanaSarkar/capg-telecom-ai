export interface IntentResult {
  intent: string;
  agents: string[];
  confidence: number;
}

export const LLM_PROVIDER = 'LLM_PROVIDER';

export interface ILlmProvider {
  detectIntent(userMessage: string): Promise<IntentResult>;
  generateResponse(context: object, template: string): Promise<string>;
}
