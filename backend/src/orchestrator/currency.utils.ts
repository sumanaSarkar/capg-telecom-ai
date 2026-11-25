export type TelecomCurrency = 'EUR' | 'INR' | 'USD';

export function roundCurrencyAmount(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function formatCurrencyAmount(amount: number, currency: TelecomCurrency): string {
  const locale = currency === 'EUR' ? 'en-NL' : currency === 'INR' ? 'en-IN' : 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: currency === 'EUR' ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amount);
}
