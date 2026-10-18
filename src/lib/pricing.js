// Prices, fair for where you live.
//
// Each country sits in a purchasing-power tier. Big currencies have their own hand-rounded
// price lists; everywhere else pays in US dollars, scaled by the tier. Checkout must charge
// the same numbers (set them up per region in the payment provider), so this file is the
// one place to change them.

// What the plans cost, by currency. world = one world forever, month / year = Pro, life = lifetime.
const LISTS = {
  USD: { world: 1.99, month: 4, year: 29, life: 49 },
  EUR: { world: 1.99, month: 3.99, year: 27, life: 45 },
  GBP: { world: 1.79, month: 3.49, year: 24, life: 39 },
  INR: { world: 79, month: 149, year: 999, life: 1699 },
  BRL: { world: 5.9, month: 12.9, year: 89, life: 149 },
  IDR: { world: 15000, month: 29000, year: 199000, life: 349000 },
  JPY: { world: 300, month: 600, year: 4200, life: 7000 },
  CAD: { world: 2.49, month: 4.99, year: 37, life: 65 },
  AUD: { world: 2.99, month: 5.99, year: 43, life: 75 },
};
// US-dollar scale for countries without their own list.
const TIERS = { 1: 1, 2: 0.7, 3: 0.45, 4: 0.3 };

// [code, name, lat, lng, currency (if it has a list), tier]
const C = [
  ['US', 'United States', 39.8, -98.6, 'USD', 1], ['IN', 'India', 22.6, 79, 'INR', 4], ['GB', 'United Kingdom', 54, -2.5, 'GBP', 1],
  ['DE', 'Germany', 51.2, 10.4, 'EUR', 1], ['FR', 'France', 46.6, 2.4, 'EUR', 1], ['CA', 'Canada', 56, -96, 'CAD', 1],
  ['AU', 'Australia', -25.3, 133.8, 'AUD', 1], ['BR', 'Brazil', -10.8, -52.9, 'BRL', 3], ['ID', 'Indonesia', -2.5, 118, 'IDR', 4],
  ['JP', 'Japan', 36.2, 138.3, 'JPY', 1], ['ES', 'Spain', 40.4, -3.7, 'EUR', 2], ['IT', 'Italy', 42.8, 12.6, 'EUR', 1],
  ['NL', 'Netherlands', 52.2, 5.3, 'EUR', 1], ['BE', 'Belgium', 50.6, 4.6, 'EUR', 1], ['AT', 'Austria', 47.6, 14.1, 'EUR', 1],
  ['IE', 'Ireland', 53.2, -8.2, 'EUR', 1], ['PT', 'Portugal', 39.6, -8, 'EUR', 2], ['FI', 'Finland', 64.5, 26, 'EUR', 1],
  ['GR', 'Greece', 39.1, 22, 'EUR', 2], ['SE', 'Sweden', 62, 15, null, 1], ['NO', 'Norway', 61, 9, null, 1],
  ['DK', 'Denmark', 56, 10, null, 1], ['CH', 'Switzerland', 46.8, 8.2, null, 1], ['PL', 'Poland', 52, 19.4, null, 2],
  ['CZ', 'Czechia', 49.8, 15.5, null, 2], ['RO', 'Romania', 45.9, 25, null, 2], ['HU', 'Hungary', 47.2, 19.5, null, 2],
  ['UA', 'Ukraine', 49, 31.4, null, 3], ['TR', 'Türkiye', 39, 35.2, null, 3], ['IL', 'Israel', 31.4, 35, null, 1],
  ['AE', 'United Arab Emirates', 24.3, 54.4, null, 1], ['SA', 'Saudi Arabia', 24, 45, null, 2], ['EG', 'Egypt', 26.8, 30.8, null, 4],
  ['NG', 'Nigeria', 9.1, 8.7, null, 4], ['KE', 'Kenya', 0.2, 37.9, null, 4], ['ZA', 'South Africa', -30.6, 22.9, null, 3],
  ['MA', 'Morocco', 31.8, -7.1, null, 3], ['GH', 'Ghana', 7.9, -1, null, 4], ['ET', 'Ethiopia', 9.1, 40.5, null, 4],
  ['PK', 'Pakistan', 30.4, 69.3, null, 4], ['BD', 'Bangladesh', 23.7, 90.4, null, 4], ['LK', 'Sri Lanka', 7.9, 80.8, null, 4],
  ['NP', 'Nepal', 28.4, 84.1, null, 4], ['CN', 'China', 35.9, 104.2, null, 2], ['KR', 'South Korea', 36.5, 127.8, null, 1],
  ['TW', 'Taiwan', 23.7, 121, null, 1], ['HK', 'Hong Kong', 22.3, 114.2, null, 1], ['SG', 'Singapore', 1.35, 103.8, null, 1],
  ['MY', 'Malaysia', 4.2, 101.9, null, 3], ['TH', 'Thailand', 15.9, 101, null, 3], ['VN', 'Vietnam', 14.1, 108.3, null, 4],
  ['PH', 'Philippines', 12.9, 121.8, null, 4], ['NZ', 'New Zealand', -41, 174, null, 1], ['MX', 'Mexico', 23.6, -102.6, null, 3],
  ['AR', 'Argentina', -38.4, -63.6, null, 3], ['CL', 'Chile', -35.7, -71.5, null, 2], ['CO', 'Colombia', 4.6, -74.3, null, 3],
  ['PE', 'Peru', -9.2, -75, null, 3], ['VE', 'Venezuela', 6.4, -66.6, null, 4], ['UY', 'Uruguay', -32.5, -55.8, null, 2],
  ['RU', 'Russia', 61.5, 105.3, null, 3], ['KZ', 'Kazakhstan', 48, 68, null, 3], ['IR', 'Iran', 32.4, 53.7, null, 4],
];

const flag = (code) => String.fromCodePoint(...[...code].map((c) => 0x1f1a5 + c.charCodeAt(0)));
export const COUNTRIES = C.map(([code, name, lat, lng, currency, tier]) => ({ code, name, lat, lng, currency, tier, flag: flag(code) }));
const byCode = Object.fromEntries(COUNTRIES.map((c) => [c.code, c]));

/** The country's prices: { currency, world, month, year, life, perDay: { month, year } }. */
export function pricesFor(code) {
  const c = byCode[code] ?? byCode.US;
  let currency = c.currency ?? 'USD';
  let list = LISTS[currency];
  if (!c.currency) {
    const k = TIERS[c.tier];
    const round = (n) => (n < 10 ? Math.ceil(n) - 0.01 : Math.round(n)); // 0.99, 1.99 … or whole dollars
    list = { world: round(LISTS.USD.world * k), month: round(LISTS.USD.month * k), year: round(LISTS.USD.year * k), life: round(LISTS.USD.life * k) };
  }
  return { country: c, currency, ...list, perDay: { month: list.month / 30, year: list.year / 365 } };
}

/** Formats an amount in the country's currency, with cents only when they matter. */
export function money(amount, currency) {
  const digits = currency === 'IDR' || currency === 'JPY' || Number.isInteger(amount) ? 0 : 2;
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(amount);
}

// Where the visitor probably is, from the browser's language and time zone. A guess they can change.
const ZONES = { 'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Jakarta': 'ID', 'America/Sao_Paulo': 'BR', 'Europe/London': 'GB', 'Asia/Tokyo': 'JP', 'Europe/Berlin': 'DE', 'Europe/Paris': 'FR', 'Australia/Sydney': 'AU' };
export function guessCountry() {
  try {
    const saved = localStorage.getItem('region');
    if (saved && byCode[saved]) return saved;
  } catch {}
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (ZONES[zone]) return ZONES[zone];
  const region = (navigator.language.split('-')[1] || '').toUpperCase();
  return byCode[region] ? region : 'US';
}
export function saveCountry(code) {
  try {
    localStorage.setItem('region', code);
  } catch {}
}
