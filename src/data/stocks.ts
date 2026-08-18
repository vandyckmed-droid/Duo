import type { Stock } from './types.ts'

/**
 * The stock universe: approximately the 50 largest S&P 500 companies by
 * market capitalisation.
 *
 * Ordering here is roughly by market cap but nothing depends on it — cards
 * are ranked by the active metric, not by position in this array. The exact
 * membership and order of a market-cap list drifts daily; this is a
 * representative starting universe, not a live index reconstruction.
 *
 * The array is the only thing that grows when the universe becomes 100 or
 * 500. Nothing downstream is indexed by position or by a hardcoded ticker.
 */
export const STOCKS = [
  { ticker: 'NVDA', name: 'NVIDIA', logo: 'nvidia.com' },
  { ticker: 'MSFT', name: 'Microsoft', logo: 'microsoft.com' },
  { ticker: 'AAPL', name: 'Apple', logo: 'apple.com' },
  { ticker: 'GOOGL', name: 'Alphabet', logo: 'abc.xyz' },
  { ticker: 'AMZN', name: 'Amazon', logo: 'amazon.com' },
  { ticker: 'META', name: 'Meta Platforms', logo: 'meta.com' },
  { ticker: 'AVGO', name: 'Broadcom', logo: 'broadcom.com' },
  { ticker: 'TSLA', name: 'Tesla', logo: 'tesla.com' },
  { ticker: 'BRK.B', name: 'Berkshire Hathaway', logo: 'berkshirehathaway.com' },
  { ticker: 'JPM', name: 'JPMorgan Chase', logo: 'jpmorganchase.com' },
  { ticker: 'LLY', name: 'Eli Lilly', logo: 'lilly.com' },
  { ticker: 'WMT', name: 'Walmart', logo: 'walmart.com' },
  { ticker: 'V', name: 'Visa', logo: 'visa.com' },
  { ticker: 'ORCL', name: 'Oracle', logo: 'oracle.com' },
  { ticker: 'MA', name: 'Mastercard', logo: 'mastercard.com' },
  { ticker: 'NFLX', name: 'Netflix', logo: 'netflix.com' },
  { ticker: 'XOM', name: 'Exxon Mobil', logo: 'exxonmobil.com' },
  { ticker: 'COST', name: 'Costco', logo: 'costco.com' },
  { ticker: 'JNJ', name: 'Johnson & Johnson', logo: 'jnj.com' },
  { ticker: 'HD', name: 'Home Depot', logo: 'homedepot.com' },
  { ticker: 'PG', name: 'Procter & Gamble', logo: 'pg.com' },
  { ticker: 'PLTR', name: 'Palantir', logo: 'palantir.com' },
  { ticker: 'ABBV', name: 'AbbVie', logo: 'abbvie.com' },
  { ticker: 'BAC', name: 'Bank of America', logo: 'bankofamerica.com' },
  { ticker: 'AMD', name: 'AMD', logo: 'amd.com' },
  { ticker: 'CVX', name: 'Chevron', logo: 'chevron.com' },
  { ticker: 'KO', name: 'Coca-Cola', logo: 'coca-colacompany.com' },
  { ticker: 'GE', name: 'GE Aerospace', logo: 'geaerospace.com' },
  { ticker: 'CSCO', name: 'Cisco', logo: 'cisco.com' },
  { ticker: 'TMUS', name: 'T-Mobile US', logo: 't-mobile.com' },
  { ticker: 'WFC', name: 'Wells Fargo', logo: 'wellsfargo.com' },
  { ticker: 'PM', name: 'Philip Morris International', logo: 'pmi.com' },
  { ticker: 'CRM', name: 'Salesforce', logo: 'salesforce.com' },
  { ticker: 'IBM', name: 'IBM', logo: 'ibm.com' },
  { ticker: 'UNH', name: 'UnitedHealth', logo: 'unitedhealthgroup.com' },
  { ticker: 'MS', name: 'Morgan Stanley', logo: 'morganstanley.com' },
  { ticker: 'ABT', name: 'Abbott', logo: 'abbott.com' },
  { ticker: 'LIN', name: 'Linde', logo: 'linde.com' },
  { ticker: 'GS', name: 'Goldman Sachs', logo: 'goldmansachs.com' },
  { ticker: 'MCD', name: "McDonald's", logo: 'mcdonalds.com' },
  { ticker: 'DIS', name: 'Walt Disney', logo: 'thewaltdisneycompany.com' },
  { ticker: 'INTU', name: 'Intuit', logo: 'intuit.com' },
  { ticker: 'AXP', name: 'American Express', logo: 'americanexpress.com' },
  { ticker: 'RTX', name: 'RTX', logo: 'rtx.com' },
  { ticker: 'NOW', name: 'ServiceNow', logo: 'servicenow.com' },
  { ticker: 'MRK', name: 'Merck', logo: 'merck.com' },
  { ticker: 'QCOM', name: 'Qualcomm', logo: 'qualcomm.com' },
  { ticker: 'T', name: 'AT&T', logo: 'att.com' },
  { ticker: 'CAT', name: 'Caterpillar', logo: 'caterpillar.com' },
  { ticker: 'PEP', name: 'PepsiCo', logo: 'pepsico.com' },
] as const satisfies readonly Stock[]

/**
 * Union of the tickers actually present in the universe.
 *
 * Derived from the data, never written by hand, so adding a stock above
 * automatically widens it — and makes the generated price series fail to
 * compile until that stock's history is fetched.
 */
export type StockTicker = (typeof STOCKS)[number]['ticker']
