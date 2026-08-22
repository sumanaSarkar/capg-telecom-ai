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
      model: process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe',
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
      model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
      input: text,
      voice,
      response_format: 'mp3',
    });

    return response.arrayBuffer();
  }

  async createRealtimeSession(customerId?: string): Promise<Record<string, unknown>> {
    if (!this.client) throw new Error('OpenAI client not initialised');

    const model = process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime-mini';
    const session = await (this.client as any).beta.realtime.sessions.create({
      model,
      voice: 'nova',
      modalities: ['text', 'audio'],
      input_audio_transcription: {
        model: process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe',
      },
      instructions:
        `You are Telly, an empathetic telecom self-care assistant${customerId ? ` assisting customer ${customerId}` : ''}. Detect the language the customer speaks and reply naturally in that same language unless they ask you to switch. Listen carefully, acknowledge frustration or worry before solving the problem, and never blame the customer. Give concise, practical, step-by-step solutions about plans, billing, roaming, support, eSIM, payments, and recharges. Be transparent about what you can and cannot do: never claim an account change or payment happened unless the system confirms it. Ask one focused clarification question when needed, and offer escalation when a problem cannot be resolved safely.`,
    });

    return session;
  }
}
