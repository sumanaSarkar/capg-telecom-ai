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
});