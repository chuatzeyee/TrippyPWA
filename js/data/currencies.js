import { formatNumber } from '../lib/locale.js';

const RATES_FROM_USD = {
  USD: 1, SGD: 1.35, EUR: 0.92, GBP: 0.79, JPY: 155, AUD: 1.55,
  THB: 35, KRW: 1350, IDR: 16000, MYR: 4.7, PHP: 56, NZD: 1.7,
  TWD: 32, HKD: 7.8, CNY: 7.2, INR: 83, VND: 25000, AED: 3.67,
  QAR: 3.64, OMR: 0.385, JOD: 0.71, SAR: 3.75, TRY: 32, CZK: 23,
  CHF: 0.88, SEK: 10.5, DKK: 6.9, PLN: 4, HUF: 370, ISK: 140,
  MAD: 10, ZAR: 18.5, BRL: 5, MXN: 17, CAD: 1.36, COP: 4000,
  PEN: 3.75, ARS: 900, CUP: 24
};

export function convert(amount, fromCurrency, toCurrency) {
  const fromRate = RATES_FROM_USD[fromCurrency] || 1;
  const toRate = RATES_FROM_USD[toCurrency] || 1;
  return Math.round(amount / fromRate * toRate);
}

export function formatCurrency(amount, symbol) {
  return `${symbol}${formatNumber(amount)}`;
}
