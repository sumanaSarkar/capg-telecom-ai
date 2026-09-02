import { Injectable, Logger } from '@nestjs/common';
import OpenAI, { toFile } from 'openai';
import { ProfileService } from '../agents/profile/profile.service';
import { AnalyticsService } from '../agents/analytics/analytics.service';

@Injectable()
export class SpeechService {
  private readonly logger = new Logger(SpeechService.name);
  private readonly client: OpenAI | null;

  constructor(
    private readonly profileService: ProfileService,
    private readonly analyticsService: AnalyticsService,
  ) {
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

  private async buildCustomerContextSummary(customerId?: string): Promise<{ summary: string; firstName: string | null }> {
    if (!customerId) return { summary: 'No customer is identified yet.', firstName: null };

    try {
      const [profile, analytics] = await Promise.all([
        this.profileService.getProfile(customerId),
        this.analyticsService.getAnalytics(customerId),
      ]);

      const firstName = profile.name?.trim().split(/\s+/)[0] || null;
      const summary = [
        `Name: ${profile.name}`,
        `Current plan: ${profile.plan}`,
        `Customer type: ${profile.customerType}`,
        `Account balance: ${profile.accountBalance}`,
        `Data usage: ${analytics.dataUsageGB}GB of ${analytics.dataLimitGB}GB`,
        `Call usage: ${analytics.callMinutes} of ${analytics.callLimit} minutes`,
        `Past roaming trips: ${analytics.roamingHistory.map((entry) => entry.country).join(', ') || 'none'}`,
      ].join('; ');

      return { summary, firstName };
    } catch {
      return {
        summary: 'Customer context could not be loaded; ask the customer directly instead of guessing.',
        firstName: null,
      };
    }
  }

  async createRealtimeSession(customerId?: string): Promise<Record<string, unknown>> {
    if (!this.client) throw new Error('OpenAI client not initialised');

    const model = process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime-mini';
    const { summary: contextSummary, firstName } = await this.buildCustomerContextSummary(customerId);

    const instructions = `You are Telly, a real live telecom care agent for this call${customerId ? ` assisting customer ${customerId}` : ''} — a warm, experienced human support professional, not a script or a bot.

IDENTITY & PRESENCE
- You are a real person on a live call, working from your desk with the customer's account already open in front of you. Speak, breathe, and react like a human colleague would — never say you are an AI, a bot, or a language model, and never break character.
- ${firstName ? `Greet the customer warmly by their first name, "${firstName}", at the start of the call and naturally use it again once or twice through the conversation, the way a good agent does.` : 'Greet the customer warmly at the start of the call.'}
- You already have their account open, so never ask them to "verify their identity" or repeat information you already have (see KNOWN ACCOUNT CONTEXT below).
- Sound present and attentive: use small natural acknowledgements ("mm-hmm", "got it", "I hear you") the way a human agent listening on a call would, sparingly and naturally, not in every turn.

KNOWN ACCOUNT CONTEXT (already loaded, do not ask the customer to repeat this): ${contextSummary}

CORE STYLE
- Detect the language the customer speaks and reply naturally in that same language unless asked to switch. Supported languages: English, Spanish, Hindi, Bengali, Kannada, Tamil, Telugu, and Malayalam.
- Acknowledge emotion (frustration, worry, excitement) before problem-solving. Never blame the customer.
- Keep turns short and conversational, like a real phone call — one idea or question per turn, no lists read aloud.
- Never claim an account change, payment, or activation happened unless the "get_recommendation" tool or system output confirms it.
- If the customer says something personal or emotional unrelated to telecom (feelings, food, small talk), just respond like a real person — warmly and briefly. Do not force in an unrelated sales pitch or drag up an earlier topic just to sound proactive; only reconnect to telecom when it's genuinely relevant to what they just said.

BE PROACTIVE, NOT REACTIVE
Do not just answer the literal question — anticipate what the customer will need next and guide the conversation like an experienced human agent gathering the right details before recommending anything. When the customer signals an intent, immediately ask the 2-3 follow-up questions a great agent would ask, one at a time, before proposing anything.

Example: if the customer says "I'm going to Singapore next month", do NOT immediately pitch a package. Instead ask naturally, one question per turn, such as:
  1. "Got it — how many days will you be in Singapore?"
  2. "Roughly how much data do you think you'll need — light browsing, or heavy streaming/maps?"
  3. "How much talk time do you need, and will you be calling back to India often?"
Once you have enough of these details, call the get_recommendation tool with a concise summary of everything gathered so the recommendation is grounded in real plans/roaming packages, then present the result warmly and briefly, ask if they want to proceed.

Apply the same proactive slot-filling pattern to other intents:
- Billing concern → ask which bill/cycle, and whether it's about the amount or a specific charge.
- Recharge/top-up → ask how long until next cycle and typical monthly usage.
- Roaming (any destination) → ask trip length (days), expected data need, and call/talk-time need (including calls back home).
- Support/technical issue → ask when it started and what device/network they're on.

TOOLS
- Call "get_recommendation" once you have gathered enough detail to ground a plan, roaming, add-on, billing, or support answer in real backend data. Never invent prices, data limits, or package names — always ground them via this tool.
- Use the tool result to phrase a short, warm, human recommendation; do not read raw JSON aloud.

Ask only one focused question per turn, keep momentum, and offer escalation to a human agent if something cannot be resolved safely.`;

    // Uses the current Realtime "client secrets" API (replaces the deprecated beta.realtime.sessions.create).
    const clientSecret = await this.client.realtime.clientSecrets.create({
      session: {
        type: 'realtime',
        model,
        instructions,
        output_modalities: ['audio'],
        audio: {
          input: {
            transcription: {
              model: process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe',
            },
          },
          output: {
            voice: 'marin',
          },
        },
        tools: [
          {
            type: 'function',
            name: 'get_recommendation',
            description:
              'Fetch a grounded, personalized recommendation (plan, roaming package, add-on, billing info, or support guidance) from the telecom backend once enough details have been gathered from the customer. Never guess prices or data limits without calling this first.',
            parameters: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description:
                    'A concise natural-language summary of everything learned from the customer, e.g. "Traveling to Singapore for 6 days, needs about 10GB data and 200 minutes talktime, calls India often."',
                },
              },
              required: ['query'],
            },
          },
        ],
        tool_choice: 'auto',
      },
    } as never);

    return clientSecret as unknown as Record<string, unknown>;
  }

  async exchangeRealtimeSdp(sdp: string): Promise<string> {
    if (!this.client) throw new Error('OpenAI client not initialised');
    if (!sdp?.trim()) throw new Error('Realtime SDP offer is empty');

    const model = process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime';
    const response = await fetch(`https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(model)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/sdp',
      },
      body: sdp,
    });

    if (!response.ok) {
      const details = (await response.text()).slice(0, 300).replace(/\s+/g, ' ').trim();
      throw new Error(`OpenAI realtime connection failed (${response.status})${details ? `: ${details}` : '.'}`);
    }

    return response.text();
  }
}
