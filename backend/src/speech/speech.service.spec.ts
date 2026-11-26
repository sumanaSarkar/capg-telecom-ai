import { AnalyticsService } from '../agents/analytics/analytics.service';
import { ProfileService } from '../agents/profile/profile.service';
import { SpeechService } from './speech.service';

describe('SpeechService', () => {
  const originalApiKey = process.env.OPENAI_API_KEY;
  const originalRealtimeModel = process.env.OPENAI_REALTIME_MODEL;
  let fetchMock: jest.SpyInstance;

  beforeEach(() => {
    process.env.OPENAI_API_KEY = 'test-api-key';
    delete process.env.OPENAI_REALTIME_MODEL;
    fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => 'answer-sdp',
    } as Response);
  });

  afterEach(() => {
    fetchMock.mockRestore();
    if (originalApiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = originalApiKey;
    }
    if (originalRealtimeModel === undefined) {
      delete process.env.OPENAI_REALTIME_MODEL;
    } else {
      process.env.OPENAI_REALTIME_MODEL = originalRealtimeModel;
    }
  });

  it('uses the configured session secret and default model for SDP negotiation', async () => {
    const service = new SpeechService(new ProfileService(), new AnalyticsService());

    await expect(service.exchangeRealtimeSdp('offer-sdp', 'ephemeral-session-secret'))
      .resolves.toBe('answer-sdp');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/realtime/calls?model=gpt-realtime-mini',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer ephemeral-session-secret',
          'Content-Type': 'application/sdp',
        }),
      }),
    );
  });

  it('requests a warm conversational chat rewrite that preserves key details', async () => {
    const service = new SpeechService(new ProfileService(), new AnalyticsService());
    const createMock = jest.fn().mockResolvedValue({
      choices: [{ message: { content: 'I can help find a plan that fits.' } }],
    });
    Object.defineProperty(service, 'client', {
      value: { chat: { completions: { create: createMock } } },
    });

    await expect(service.summarizeVoiceResponse('Recommend a plan for Netherlands.'))
      .resolves.toBe('I can help find a plan that fits.');

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: 'system',
            content: expect.stringMatching(
              /warm, natural chat message[\s\S]*Preserve exact plan names, dates, statuses, prices, amounts, and currency\./,
            ),
          }),
        ]),
      }),
    );
  });

  it('sets clear telecom, consent, side-talk, and audio-filter guidance for live voice', async () => {
    const service = new SpeechService(new ProfileService(), new AnalyticsService());
    const createMock = jest.fn().mockResolvedValue({ value: 'ephemeral-secret' });
    Object.defineProperty(service, 'client', {
      value: { realtime: { clientSecrets: { create: createMock } } },
    });

    await service.createRealtimeSession('cust-001');

    const session = createMock.mock.calls[0][0].session;
    expect(session.instructions).toMatch(/ignore unrelated side conversations/i);
    expect(session.instructions).toMatch(/data allowance\/GB/i);
    expect(session.instructions).toMatch(/Never prepare payment or activation because of a vague acknowledgement/i);
    expect(session.audio.input.noise_reduction).toEqual({ type: 'near_field' });
    expect(session.audio.input.turn_detection).toMatchObject({
      type: 'semantic_vad',
      eagerness: 'medium',
    });
  });
});