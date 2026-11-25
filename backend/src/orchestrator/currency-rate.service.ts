import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import type { TelecomCurrency } from './currency.utils';

export interface ExchangeRate {
  rate: number;
  date: string;
}

interface CachedExchangeRate extends ExchangeRate {
  expiresAt: number;
}

type ForeignCurrency = Exclude<TelecomCurrency, 'INR'>;

const FRANKFURTER_CURRENCIES = new Set<ForeignCurrency>([
  'AUD', 'BRL', 'CAD', 'CHF', 'CNY', 'CZK', 'DKK', 'EUR', 'GBP', 'HKD',
  'HUF', 'IDR', 'ILS', 'ISK', 'JPY', 'KRW', 'MXN', 'MYR', 'NOK', 'NZD',
  'PHP', 'PLN', 'RON', 'SEK', 'SGD', 'THB', 'TRY', 'USD', 'ZAR',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

@Injectable()
export class CurrencyRateService {
  private readonly cachedRates = new Map<ForeignCurrency, CachedExchangeRate>();
  private readonly inFlightRequests = new Map<ForeignCurrency, Promise<ExchangeRate>>();

  getInrToEurRate(): Promise<ExchangeRate> {
    return this.getInrToCurrencyRate('EUR');
  }

  async getInrToCurrencyRate(currency: ForeignCurrency): Promise<ExchangeRate> {
    const cachedRate = this.cachedRates.get(currency);
    if (cachedRate && cachedRate.expiresAt > Date.now()) {
      return { rate: cachedRate.rate, date: cachedRate.date };
    }

    let request = this.inFlightRequests.get(currency);
    if (!request) {
      request = FRANKFURTER_CURRENCIES.has(currency)
        ? this.fetchFrankfurterRate(currency)
        : this.fetchExchangeRateApiRate(currency);
      this.inFlightRequests.set(currency, request);
    }

    try {
      return await request;
    } finally {
      if (this.inFlightRequests.get(currency) === request) {
        this.inFlightRequests.delete(currency);
      }
    }
  }

  private async fetchFrankfurterRate(currency: ForeignCurrency): Promise<ExchangeRate> {
    let response: Response;
    try {
      response = await fetch(
        `https://api.frankfurter.dev/v1/latest?base=INR&symbols=${currency}`,
        { signal: AbortSignal.timeout(5000) },
      );
    } catch {
      throw new ServiceUnavailableException(
        `Live INR-to-${currency} exchange rates are unavailable. Please try the roaming recommendation again shortly.`,
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

    const rate = payload.rates[currency];
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
      throw new ServiceUnavailableException(`Exchange-rate service returned an invalid INR-to-${currency} rate.`);
    }

    return this.cacheRate(currency, rate, payload.date);
  }

  private async fetchExchangeRateApiRate(currency: ForeignCurrency): Promise<ExchangeRate> {
    let response: Response;
    try {
      response = await fetch('https://open.er-api.com/v6/latest/INR', {
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw new ServiceUnavailableException(
        `Live INR-to-${currency} exchange rates are unavailable. Please try the roaming recommendation again shortly.`,
      );
    }

    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Exchange-rate service returned HTTP ${response.status}. Please try again shortly.`,
      );
    }

    const payload: unknown = await response.json();
    if (
      !isRecord(payload) ||
      payload.result !== 'success' ||
      payload.base_code !== 'INR' ||
      typeof payload.time_last_update_unix !== 'number' ||
      !isRecord(payload.rates)
    ) {
      throw new ServiceUnavailableException('Exchange-rate service returned an invalid response.');
    }

    const rate = payload.rates[currency];
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) {
      throw new ServiceUnavailableException(`Exchange-rate service returned an invalid INR-to-${currency} rate.`);
    }

    const date = new Date(payload.time_last_update_unix * 1000).toISOString().slice(0, 10);
    return this.cacheRate(currency, rate, date);
  }

  private cacheRate(currency: ForeignCurrency, rate: number, date: string): ExchangeRate {
    const exchangeRate: CachedExchangeRate = {
      rate,
      date,
      expiresAt: Date.now() + 6 * 60 * 60 * 1000,
    };
    this.cachedRates.set(currency, exchangeRate);
    return { rate: exchangeRate.rate, date: exchangeRate.date };
  }
}
