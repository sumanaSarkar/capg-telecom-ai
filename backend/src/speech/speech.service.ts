import { Injectable, Logger } from '@nestjs/common';
import OpenAI, { toFile } from 'openai';

@Injectable()
export class SpeechService {
  private readonly logger = new Logger(SpeechService.name);
  private readonly client: OpenAI | null;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    this.client = apiKey ? new OpenAI({ apiKey }) : null;
    if (!this.client) {
      this.logger.warn('SpeechService: OPENAI_API_KEY not set; STT/TTS endpoints will return 503.');
    }
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  async transcribe(audioBuffer: Buffer, filename: string, mimeType?: string): Promise<string> {
    if (!this.client) throw new Error('OpenAI client not initialised');

    const resolvedMimeType = mimeType && mimeType.startsWith('audio/') ? mimeType : this.inferMimeType(filename);
    const safeFilename = filename.includes('.') ? filename : `${filename}.webm`;
    const file = await toFile(audioBuffer, safeFilename, { type: resolvedMimeType });
    const transcription = await this.client.audio.transcriptions.create({
      file,
      model: 'whisper-1',
      language: 'en',
    });

    return transcription.text;
  }

  private inferMimeType(filename: string): string {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.wav')) return 'audio/wav';
    if (lower.endsWith('.mp3') || lower.endsWith('.mpeg') || lower.endsWith('.mpga')) return 'audio/mpeg';
    if (lower.endsWith('.m4a')) return 'audio/mp4';
    if (lower.endsWith('.ogg')) return 'audio/ogg';
    return 'audio/webm';
  }

  async synthesize(
    text: string,
    voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' = 'nova',
  ): Promise<ArrayBuffer> {
    if (!this.client) throw new Error('OpenAI client not initialised');

    const response = await this.client.audio.speech.create({
      model: 'tts-1',
      input: text,
      voice,
      response_format: 'mp3',
    });

    return response.arrayBuffer();
  }

  async createRealtimeSession(): Promise<Record<string, unknown>> {
    if (!this.client) throw new Error('OpenAI client not initialised');

    const model = process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview-2024-12-17';
    const session = await (this.client as any).beta.realtime.sessions.create({
      model,
      voice: 'nova',
      modalities: ['text', 'audio'],
      instructions:
        'You are Telly, a helpful telecom assistant. Guide the customer with concise, natural spoken answers about plans, billing, roaming, support, and recharges.',
    });

    return session;
  }
}
