import { Injectable } from '@nestjs/common';

function parseBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return value.toLowerCase() === 'true';
}

function parseList(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback;
  return value
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

@Injectable()
export class FeatureFlagsService {
  readonly vectorDb = process.env.VECTOR_DB?.trim() || '';
  readonly ragEnabled = this.vectorDb.length > 0;

  readonly memoryEnabled = parseBool(process.env.MEMORY_ENABLED, false);
  readonly sessionMemoryEnabled = this.memoryEnabled && parseBool(process.env.SESSION_MEMORY, false);
  readonly customerMemoryEnabled = this.memoryEnabled && parseBool(process.env.CUSTOMER_MEMORY, false);

  readonly sentimentAnalysisEnabled = parseBool(process.env.SENTIMENT_ANALYSIS, false);
  readonly proactiveResponseEnabled = parseBool(process.env.PROACTIVE_RESPONSE, false);

  readonly multiLanguageEnabled = parseBool(process.env.MULTI_LANGUAGE, false);
  readonly defaultLanguage = (process.env.DEFAULT_LANGUAGE || 'en').trim().toLowerCase();
  readonly supportedLanguages = parseList(process.env.SUPPORTED_LANGUAGES, ['en', 'es', 'hi', 'bn', 'kn', 'ta', 'te', 'ml']);
}
