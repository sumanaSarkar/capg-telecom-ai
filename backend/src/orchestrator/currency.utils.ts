export type TelecomCurrency =
  | 'AED'
  | 'AUD'
  | 'BRL'
  | 'BTN'
  | 'CAD'
  | 'CHF'
  | 'CNY'
  | 'CZK'
  | 'DKK'
  | 'EUR'
  | 'GBP'
  | 'HKD'
  | 'HUF'
  | 'IDR'
  | 'ILS'
  | 'INR'
  | 'ISK'
  | 'JPY'
  | 'KES'
  | 'KRW'
  | 'MXN'
  | 'MVR'
  | 'MYR'
  | 'NOK'
  | 'NZD'
  | 'PHP'
  | 'PLN'
  | 'RON'
  | 'SEK'
  | 'SGD'
  | 'THB'
  | 'TRY'
  | 'USD'
  | 'ZAR';

const currencyLocales: Record<TelecomCurrency, string> = {
  AED: 'en-AE',
  AUD: 'en-AU',
  BRL: 'pt-BR',
  BTN: 'en-BT',
  CAD: 'en-CA',
  CHF: 'de-CH',
  CNY: 'zh-CN',
  CZK: 'cs-CZ',
  DKK: 'da-DK',
  EUR: 'en-NL',
  GBP: 'en-GB',
  HKD: 'zh-HK',
  HUF: 'hu-HU',
  IDR: 'id-ID',
  ILS: 'he-IL',
  INR: 'en-IN',
  ISK: 'is-IS',
  JPY: 'ja-JP',
  KES: 'en-KE',
  KRW: 'ko-KR',
  MXN: 'es-MX',
  MVR: 'en-MV',
  MYR: 'ms-MY',
  NOK: 'nb-NO',
  NZD: 'en-NZ',
  PHP: 'en-PH',
  PLN: 'pl-PL',
  RON: 'ro-RO',
  SEK: 'sv-SE',
  SGD: 'en-SG',
  THB: 'th-TH',
  TRY: 'tr-TR',
  USD: 'en-US',
  ZAR: 'en-ZA',
};

const zeroDecimalCurrencies = new Set<TelecomCurrency>(['IDR', 'ISK', 'JPY', 'KRW']);

export function roundCurrencyAmount(amount: number, currency: TelecomCurrency = 'INR'): number {
  const fractionDigits = zeroDecimalCurrencies.has(currency) ? 0 : 2;
  const multiplier = 10 ** fractionDigits;
  return Math.round((amount + Number.EPSILON) * multiplier) / multiplier;
}

export function formatCurrencyAmount(amount: number, currency: TelecomCurrency): string {
  const fractionDigits = zeroDecimalCurrencies.has(currency) ? 0 : 2;
  return new Intl.NumberFormat(currencyLocales[currency], {
    style: 'currency',
    currency,
    minimumFractionDigits: currency === 'INR' ? 0 : fractionDigits,
    maximumFractionDigits: currency === 'INR' ? 2 : fractionDigits,
  }).format(amount);
}
