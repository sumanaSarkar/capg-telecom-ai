import { Inject, Injectable, Optional } from '@nestjs/common';
import type { ILlmProvider } from '../llm/llm-provider.interface';
import { LLM_PROVIDER } from '../llm/llm-provider.interface';
import { FeatureFlagsService } from './feature-flags.service';

// Script/keyword based detection; good enough to route between the supported languages without an extra API call.
const DEVANAGARI_RANGE = /[\u0900-\u097F]/; // Hindi
const BENGALI_RANGE = /[\u0980-\u09FF]/;
const TAMIL_RANGE = /[\u0B80-\u0BFF]/;
const TELUGU_RANGE = /[\u0C00-\u0C7F]/;
const KANNADA_RANGE = /[\u0C80-\u0CFF]/;
const MALAYALAM_RANGE = /[\u0D00-\u0D7F]/;
const SPANISH_HINTS = /\b(hola|gracias|necesito|quiero|por favor|cu[aá]nto|d[oó]nde|plan de datos)\b/i;

@Injectable()
export class LanguageService {
  constructor(
    private readonly flags: FeatureFlagsService,
    @Optional() @Inject(LLM_PROVIDER) private readonly llmProvider?: ILlmProvider,
  ) {}

  detect(message: string): string {
    if (!this.flags.multiLanguageEnabled) return this.flags.defaultLanguage;

    if (BENGALI_RANGE.test(message)) return this.pickSupported('bn');
    if (TELUGU_RANGE.test(message)) return this.pickSupported('te');
    if (KANNADA_RANGE.test(message)) return this.pickSupported('kn');
    if (MALAYALAM_RANGE.test(message)) return this.pickSupported('ml');
    if (TAMIL_RANGE.test(message)) return this.pickSupported('ta');
    if (DEVANAGARI_RANGE.test(message)) return this.pickSupported('hi');
    if (SPANISH_HINTS.test(message)) return this.pickSupported('es');
    return this.pickSupported('en');
  }

  private pickSupported(language: string): string {
    return this.flags.supportedLanguages.includes(language) ? language : this.flags.defaultLanguage;
  }

  async translate(text: string, targetLanguage: string): Promise<string> {
    if (!this.flags.multiLanguageEnabled) return text;
    if (targetLanguage === this.flags.defaultLanguage) return text;
    if (!this.llmProvider?.chat) return text;

    try {
      const translated = await this.llmProvider.chat([
        {
          role: 'system',
          content: `Translate the assistant's message into language code "${targetLanguage}". Keep the tone warm and concise, preserve any numbers/prices exactly, and respond with only the translated text.`,
        },
        { role: 'user', content: text },
      ]);
      return translated?.trim() || text;
    } catch {
      return text;
    }
  }
}
