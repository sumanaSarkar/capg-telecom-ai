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

  it('converts Japan plan prices to JPY using the exchange-rate endpoint', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        date: '2026-11-25',
        rates: { JPY: 1.71 },
      }),
    } as Response);
    const service = new CurrencyRateService();

    await expect(service.getInrToCurrencyRate('JPY')).resolves.toEqual({
      rate: 1.71,
      date: '2026-11-25',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.frankfurter.dev/v1/latest?base=INR&symbols=JPY',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('uses the broad-currency rate endpoint for currencies outside the ECB reference set', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        result: 'success',
        base_code: 'INR',
        time_last_update_unix: Date.parse('2026-11-25T00:00:00.000Z') / 1000,
        rates: { AED: 0.039518 },
      }),
    } as Response);
    const service = new CurrencyRateService();

    await expect(service.getInrToCurrencyRate('AED')).resolves.toEqual({
      rate: 0.039518,
      date: '2026-11-25',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://open.er-api.com/v6/latest/INR',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
});
