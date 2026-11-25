import { CurrencyRateService } from './currency-rate.service';

describe('CurrencyRateService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('fetches and caches the current INR-to-EUR ECB reference rate', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        amount: 1,
        base: 'INR',
        date: '2026-11-25',
        rates: { EUR: 0.0099 },
      }),
    } as Response);
    const service = new CurrencyRateService();

    await expect(Promise.all([
      service.getInrToEurRate(),
      service.getInrToEurRate(),
      service.getInrToEurRate(),
    ])).resolves.toEqual([
      { rate: 0.0099, date: '2026-11-25' },
      { rate: 0.0099, date: '2026-11-25' },
      { rate: 0.0099, date: '2026-11-25' },
    ]);
    await service.getInrToEurRate();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.frankfurter.dev/v1/latest?base=INR&symbols=EUR',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
