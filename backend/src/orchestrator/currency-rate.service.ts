import { Injectable, ServiceUnavailableException } from '@nestjs/common';

export interface ExchangeRate {
  rate: number;
  date: string;
}

interface CachedExchangeRate extends ExchangeRate {
  expiresAt: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

@Injectable()
export class CurrencyRateService {
  private cachedInrToEurRate: CachedExchangeRate | null = null;
  private inFlightRequest: Promise<ExchangeRate> | null = null;

  async getInrToEurRate(): Promise<ExchangeRate> {
    if (this.cachedInrToEurRate && this.cachedInrToEurRate.expiresAt > Date.now()) {
      return { rate: this.cachedInrToEurRate.rate, date: this.cachedInrToEurRate.date };
    }

    if (!this.inFlightRequest) {
      this.inFlightRequest = this.fetchInrToEurRate();
    }

    const request = this.inFlightRequest;
    try {
      return await request;
    } finally {
      if (this.inFlightRequest === request) {
        this.inFlightRequest = null;
      }
    }
  }

  private async fetchInrToEurRate(): Promise<ExchangeRate> {
    let response: Response;
    try {
      response = await fetch(
        'https://api.frankfurter.dev/v1/latest?base=INR&symbols=EUR',
        { signal: AbortSignal.timeout(5000) },
      );
    } catch {
      throw new ServiceUnavailableException(
        'Live INR-to-EUR exchange rates are unavailable. Please try the roaming recommendation again shortly.',
      );
    }

    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Exchange-rate service returned HTTP ${response.status}. Please try again shortly.`,
      );
    }

    const payload: unknown = await response.json();
    if (!isRecord(payload) || typeof payload.date !== 'string' || !isRecord(payload.rates)) {
      throw new ServiceUnavailableException('Exchange-rate service returned an invalid response.');
    }

    const rate = payload.rates.EUR;
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
      throw new ServiceUnavailableException('Exchange-rate service returned an invalid INR-to-EUR rate.');
    }

    const exchangeRate: CachedExchangeRate = {
      rate,
      date: payload.date,
      expiresAt: Date.now() + 6 * 60 * 60 * 1000,
    };
    this.cachedInrToEurRate = exchangeRate;
    return { rate: exchangeRate.rate, date: exchangeRate.date };
  }
}
