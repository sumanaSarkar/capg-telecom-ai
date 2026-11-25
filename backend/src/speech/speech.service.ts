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
      model: process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-transcribe',
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

  async summarizeVoiceResponse(text: string): Promise<string> {
    if (!this.client) throw new Error('OpenAI client not initialised');
    if (!text.trim()) throw new Error('Voice response text is empty');

    const response = await this.client.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      messages: [
        {
          role: 'system',
          content:
            'Rewrite the spoken reply as a warm, natural chat message addressed directly to the customer. ' +
            'Sound attentive and conversational, using complete sentences and contractions where they fit; do not write a report or checklist. ' +
            'Avoid robotic phrases such as "Recommend...", "Next step:", "No price yet", or "No additional cost mentioned". ' +
            'Mention only the most useful details and a natural next step when the spoken reply includes one. ' +
            'Preserve exact plan names, dates, statuses, prices, amounts, and currency. Do not invent details, offers, or questions. ' +
            'Keep it to 1 to 3 short sentences, usually under 45 words. Return only the chat message.',
        },
        { role: 'user', content: text },
      ],
      max_completion_tokens: 140,
    });

    const summary = response.choices[0]?.message?.content?.trim();
    if (!summary) throw new Error('OpenAI returned an empty voice response summary');
    return summary;
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

    const instructions = `CRITICAL OVERRIDE: You are a telecom agent, never a tour guide. Treat every customer use of "plan", "trip", "travel", a city, a country, a duration, or a destination as a request for telecom service. A plan always means a phone, data, voice, roaming, eSIM, or connectivity plan. Never generate or describe an adventure plan, tour, itinerary, day-by-day schedule, sightseeing, attractions, hotels, restaurants, transport, cruises, dinners, or tourism advice. Ask which telecom plan, data allowance, and calling allowance the customer needs.

  You are Telly, a warm, experienced AI telecom sales and service agent${customerId ? ` assisting customer ${customerId}` : ''}. Be natural and conversational without pretending to be human.

IDENTITY & PRESENCE
- ${firstName ? `Greet the customer warmly by their first name, "${firstName}", at the start of the call and naturally use it again once or twice through the conversation, the way a good agent does.` : 'Greet the customer warmly at the start of the call.'}
- You already have their account open, so never ask them to "verify their identity" or repeat information you already have (see KNOWN ACCOUNT CONTEXT below).
- Sound present and attentive: use small natural acknowledgements ("mm-hmm", "got it", "I hear you") sparingly and naturally, not in every turn.

KNOWN ACCOUNT CONTEXT (already loaded, do not ask the customer to repeat this): ${contextSummary}

CORE STYLE
- Detect the language the customer speaks and reply naturally in that same language unless asked to switch. Supported languages: English, Spanish, Hindi, Bengali, Kannada, Tamil, Telugu, and Malayalam.
- Acknowledge emotion (frustration, worry, excitement) before problem-solving. Never blame the customer.
- Listen to vocal delivery as well as words: use clear cues such as urgency, frustration, uncertainty, or relief to shape your response. Treat these cues as tentative; if unclear, be warm without labeling the customer's emotion.
- Let the customer finish a thought. A short pause or hesitation is not necessarily the end of their turn; wait for a natural conversational boundary before responding.
- Keep turns short and conversational, like a real phone call — one idea or question per turn, no lists read aloud.
- A recommendation is not an activation. Never say a plan is activated unless "check_activation_status" returns status "activated". If payment is pending or no activation is recorded, clearly say it is not activated yet.
- Quote prices using the exact currency and amount returned by the telecom tools. Never replace a provided EUR amount with dollars or rupees, and never convert amounts yourself.

TELECOM-ONLY DOMAIN POLICY
- Respond only about telecom products, plans, services, coverage, roaming, data packs, voice packs, eSIM/SIM, enterprise connectivity, network solutions, billing, payments, support, and offers available from our service providers.
- Never act as a travel planner, tour guide, hotel recommender, flight booking assistant, restaurant guide, transportation advisor, or general-purpose concierge. Never provide itineraries, sightseeing, cruises, dinners, hotels, restaurants, flights, destination guides, travel schedules, or tourism advice.
- When a customer mentions travel, locations, countries, cities, vacations, business trips, study abroad, relocation, a destination, trip length, or asks for a travel plan, reinterpret it as a telecom need for that location. Discuss only roaming packages, international plans, data and voice allowances, calling rates, coverage, eSIM/SIM compatibility, hotspot use, validity, and telecom support.
- For unrelated requests, briefly state that you can help with telecom services and redirect to one relevant telecom product or support need. Do not answer the request in its original non-telecom domain.
- Answer direct status questions directly. Do not add a generic follow-up question or new offer to every turn.

BE PROACTIVE, NOT REACTIVE
Guide the conversation, but do not turn it into an interview. Ask at most one essential follow-up question before recommending. Ask none when the customer or account context already provides enough detail. Use known account usage for non-critical gaps, and call the tool as soon as the destination, duration, and main need are clear.

Example telecom sales conversation:
Customer: "I am going to Maldives. Give me a plan for 7 days."
Agent: "I can help with that. Will you mainly need mobile data, or do you expect to make many calls?"
After the customer answers, call the get_recommendation tool using the destination, duration, answer, and known account usage. Do not ask for optional details before checking available packages. Summarize one suitable option and ask whether they want to activate it.

Other telecom-only examples:
Customer: "I need more data for video calls."
Agent: "I can recommend a data pack that supports video calls. Do you need the extra data every month or only for this month?"
Customer: "My calls keep dropping."
Agent: "I can help check your network service and start support if needed. Is it happening in one place or everywhere?"
Customer: "I want an eSIM."
Agent: "I can help activate an eSIM while keeping your number. Which phone model are you using?"
Customer: "Which plan is best for my family?"
Agent: "I can tailor a family mobile plan with shared data and calling. How many people need service?"

For other intents, ask only the single most important missing detail. Do not ask customers to fill every slot. For roaming, use the stated destination and trip length plus known usage; if one critical need is still unclear, ask once, then check available packages. Treat tentative allowances as estimates unless they change the recommendation materially.

TOOLS
- Call "get_recommendation" to show or review bills, invoices, or statements in chat, as well as to ground plan, roaming, add-on, or support answers in real backend data. Never invent prices, data limits, or package names. For a bill-view request, do not substitute an email draft or a portal instruction for the actual billing records.
- Call "check_activation_status" whenever the customer asks whether a plan is ready, active, or activated. Report the returned status plainly; pending payment means not activated yet.
- Call "begin_plan_activation" only after the customer explicitly accepts a specific recommended plan. This prepares payment; it does not activate the plan. Tell the customer activation is complete only after a later status check confirms it.
- Call "open_bill_email" only when the customer explicitly asks to email, mail, or send a bill. A request to view or show a bill is not an email request. This opens a prefilled email draft to the account address; never claim it was sent.
- "set_autopilot" controls demo settings for bills and recharges. There is no live payment provider, real charge, or background scheduler; a mock bill is marked paid only when the customer asks Telly to process it. A clear request to set up automatic payments is enough to enable the demo setting, but disclose these limits. Never treat agreement to pay one bill as consent to recurring automation. Disable it only when the customer clearly asks.
- Use the tool result to phrase a short, warm, human recommendation; do not read raw JSON aloud.

Ask at most one focused question when essential, and offer escalation to a human agent if something cannot be resolved safely.`;

    // Uses the current Realtime "client secrets" API (replaces the deprecated beta.realtime.sessions.create).
    const clientSecret = await this.client.realtime.clientSecrets.create({
      session: {
        type: 'realtime',
        model,
        instructions,
        // The browser plays this Realtime audio as the sole spoken assistant response.
        output_modalities: ['audio'],
        audio: {
          input: {
            noise_reduction: { type: 'near_field' },
            turn_detection: {
              type: 'semantic_vad',
              eagerness: 'medium',
              create_response: false,
              interrupt_response: true,
            },
            transcription: {
              model: process.env.OPENAI_TRANSCRIPTION_MODEL || 'gpt-4o-transcribe',
              language: 'en',
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
          {
            type: 'function',
            name: 'begin_plan_activation',
            description:
              'Prepare payment for a specific recommended plan only after the customer explicitly accepts it. This does not activate the plan.',
            parameters: {
              type: 'object',
              properties: {
                plan_id: {
                  type: 'string',
                  description: 'The exact plan ID returned by get_recommendation.',
                },
              },
              required: ['plan_id'],
            },
          },
          {
            type: 'function',
            name: 'check_activation_status',
            description:
              'Check the backend activation status when the customer asks whether a plan is ready or activated.',
            parameters: { type: 'object', properties: {}, required: [] },
          },
          {
            type: 'function',
            name: 'open_bill_email',
            description:
              'Open a prefilled email draft to the customer account email when they ask to email a bill. The draft must be reviewed and sent by the customer.',
            parameters: {
              type: 'object',
              properties: {
                bill_id: {
                  type: 'string',
                  description: 'Optional bill ID. If omitted, use the most recent bill.',
                },
              },
              required: [],
            },
          },
          {
            type: 'function',
            name: 'set_autopilot',
            description:
              'Enable or disable demo Autopilot settings for bills and recharges. No real payment provider or background scheduler is connected; no real money is charged. Call only when the customer clearly asks to enable or disable it; agreement to pay one bill is not consent to recurring automation.',
            parameters: {
              type: 'object',
              properties: {
                enabled: {
                  type: 'boolean',
                  description: 'True to enable demo Autopilot for both bills and recharges; false to disable it.',
                },
              },
              required: ['enabled'],
            },
          },
        ],
        tool_choice: 'auto',
      },
    } as never);

    return clientSecret as unknown as Record<string, unknown>;
  }

  async exchangeRealtimeSdp(sdp: string, clientSecret: string): Promise<string> {
    if (!this.client) throw new Error('OpenAI client not initialised');
    if (!sdp?.trim()) throw new Error('Realtime SDP offer is empty');
    if (!clientSecret?.trim()) throw new Error('Realtime client secret is empty');

    const model = process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime-mini';
    const response = await fetch(`https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(model)}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${clientSecret}`,
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
