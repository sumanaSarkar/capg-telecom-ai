import { Injectable } from '@nestjs/common';
import { FeatureFlagsService } from './feature-flags.service';

export type Sentiment = 'positive' | 'neutral' | 'negative' | 'frustrated' | 'urgent';

export interface SentimentResult {
  sentiment: Sentiment;
  score: number;
}

const NEGATIVE_WORDS = ['bad', 'angry', 'upset', 'disappointed', 'unhappy', 'terrible', 'worst', 'hate', 'annoyed'];
const FRUSTRATED_WORDS = ['frustrated', 'again', 'still not', 'not working', 'keeps failing', 'sick of', 'fed up'];
const URGENT_WORDS = ['urgent', 'asap', 'immediately', 'right now', 'emergency', 'lost my phone', 'stolen'];
const POSITIVE_WORDS = ['thanks', 'thank you', 'great', 'awesome', 'happy', 'love', 'perfect', 'appreciate'];

@Injectable()
export class SentimentService {
  constructor(private readonly flags: FeatureFlagsService) {}

  analyze(message: string): SentimentResult | null {
    if (!this.flags.sentimentAnalysisEnabled) return null;

    const normalized = message.toLowerCase();

    if (URGENT_WORDS.some((word) => normalized.includes(word))) {
      return { sentiment: 'urgent', score: 1 };
    }
    if (FRUSTRATED_WORDS.some((word) => normalized.includes(word))) {
      return { sentiment: 'frustrated', score: 0.8 };
    }

    const negativeHits = NEGATIVE_WORDS.filter((word) => normalized.includes(word)).length;
    const positiveHits = POSITIVE_WORDS.filter((word) => normalized.includes(word)).length;

    if (negativeHits > positiveHits) {
      return { sentiment: 'negative', score: -Math.min(1, negativeHits / 3) };
    }
    if (positiveHits > negativeHits) {
      return { sentiment: 'positive', score: Math.min(1, positiveHits / 3) };
    }

    return { sentiment: 'neutral', score: 0 };
  }
}
