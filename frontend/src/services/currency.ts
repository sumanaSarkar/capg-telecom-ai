export type CurrencyCode = 'EUR' | 'INR' | 'USD';

export function formatCurrency(amount: number, currency: CurrencyCode = 'USD'): string {
  const locale = currency === 'EUR' ? 'en-NL' : currency === 'INR' ? 'en-IN' : 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: currency === 'EUR' ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amount);
}
