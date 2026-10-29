'use strict';

// All fetched JSON is local to ./data/. Personal purchase additions use browser storage.
const FILES = { config: './data/config.json', index: './data/index.json', holdings: './data/holdings.json', prices: './data/prices.json', preview: './data/design-preview.json', quotes: './data/quotes.json' };
const state = { config: null, entries: [], errors: {}, chart: null, localPurchases: [], pendingPurchases: [], publishedHoldings: [], purchaseMessage: '', cashBalance: 0, cashMessage: '', researchTab: 'stocks', selectedStock: null, positionCharts: [] };
const $ = s => document.querySelector(s);
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const number = v => typeof v === 'number' && Number.isFinite(v);
const date = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = v => number(v) ? `${v.toFixed(2)}%` : '—';
const fmt = v => number(v) ? v.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '—';
const privateMode = () => state.config?.public_amounts !== true;
const money = (v, base) => !number(v) ? '—' : privateMode() ? (base > 0 ? pct(v / base * 100) : '—') : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);
function redact(v) {
  if (!privateMode()) return String(v ?? '');
  return String(v ?? '').replace(/(?:[$€£]|\b(?:USD|EUR|RON|GBP))\s*\d[\d,.]*(?:\s*(?:billion|million|trillion|[kmb])\b)?|\b\d[\d,.]*\s*(?:USD|EUR|RON|GBP)\b/gi, '[amount hidden]');
}
const text = v => esc(redact(v));
const paragraph = v => `<p class="copy">${text(v)}</p>`;
const panel = (title, body) => `<section class="panel"><h2>${text(title)}</h2>${body}</section>`;
const errorBox = e => `<div class="error" role="alert"><strong>Unable to display this data</strong><ul>${String(e.message || e).split('\n').map(x => `<li>${text(x)}</li>`).join('')}</ul><p>Check the named file, correct it, and reload.</p></div>`;
const empty = s => `<p class="empty">${text(s)}</p>`;
const tag = s => `<span class="tag">${text(s)}</span>`;
const safeURL = s => { try { const u = new URL(s); return ['http:', 'https:'].includes(u.protocol) ? u.href : null; } catch { return null; } };

// A small recursive validator reports every missing field with its full path.
const T = fn => fn;
const str = T(v => typeof v === 'string');
const nonempty = T(v => typeof v === 'string' && v.trim().length > 0);
const positive = T(v => number(v) && v > 0);
const nonnegative = T(v => number(v) && v >= 0);
const bool = T(v => typeof v === 'boolean');
const oneOf = (...values) => T(v => values.includes(v));
const nullable = fn => T(v => v === null || fn(v));
const metricSchema = { pe_forward: nullable(number), revenue_growth_yoy: nullable(number), fcf_margin: nullable(number), debt_to_equity: nullable(number), beta: nullable(number), dividend_yield: nullable(number), next_earnings_date: nullable(date) };
const checkSchema = { eu_retail_buyable: bool, fee_under_1pct: bool, no_earnings_within_14d: bool, position_cap_ok: bool };
const entrySchema = {
  month: v => /^\d{4}-(0[1-9]|1[0-2])$/.test(v),
  generated_at: v => typeof v === 'string' && date(v.slice(0, 10)) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v)),
  model: nonempty, data_as_of: date, budget_usd: nonnegative,
  allocation: { core_usd: nonnegative, satellite_usd: nonnegative }, market_context: str,
  review_of_previous: [{ ticker: nonempty, change_pct: nullable(number), thesis_status: oneOf('intact', 'weakened', 'broken'), action: oneOf('hold', 'add', 'sell', 'watch'), note: str }],
  picks: [{ ticker: nonempty, isin: nonempty, name: nonempty, exchange: nonempty, instrument: oneOf('stock', 'etf'), bucket: oneOf('core', 'satellite'), risk: oneOf('low', 'moderate', 'high'), amount_usd: nonnegative, price_at_research: positive, price_date: date, currency: nonempty, thesis: str, bear_case: str, catalysts: [str], metrics: metricSchema, checks: checkSchema, confidence: oneOf('high', 'medium', 'low'), sources: [{ title: nonempty, url: v => typeof v === 'string' && !!safeURL(v), accessed: date }] }],
  watchlist: [{ ticker: nonempty, trigger: str }], rejected: [{ ticker: nonempty, reason: str }], no_buy_reason: str, warnings: [str]
};
function validate(value, schema, path = '', errors = []) {
  if (value === undefined) {
    if (object(schema)) Object.entries(schema).forEach(([k, s]) => validate(undefined, s, path ? `${path}.${k}` : k, errors));
    else errors.push(`${path}: missing required field`);
  } else if (typeof schema === 'function') {
    if (!schema(value)) errors.push(`${path}: invalid value or type`);
  } else if (Array.isArray(schema)) {
    if (!Array.isArray(value)) errors.push(`${path}: expected array`);
    else value.forEach((v, i) => validate(v, schema[0], `${path}[${i}]`, errors));
  } else if (!object(value)) errors.push(`${path || 'root'}: expected object`);
  else Object.entries(schema).forEach(([k, s]) => validate(value[k], s, path ? `${path}.${k}` : k, errors));
  return errors;
}
function assertValid(data, schema, file) {
  const errors = validate(data, schema);
  if (schema === entrySchema) errors.push(...researchExtras(data));
  if (errors.length) throw new Error(`${file}\n${errors.join('\n')}`);
  return data;
}
async function read(path, json = true) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(path, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.text();
    try { return json ? JSON.parse(body) : body; }
    catch { throw new Error('Invalid JSON. Check commas, quotation marks and brackets.'); }
  } catch (e) { throw new Error(`${path}: ${e.name === 'AbortError' ? 'Request timed out.' : e.message}`); }
  finally { clearTimeout(timer); }
}
function validateConfig(c) {
  assertValid(c, { budget_usd_per_month: positive, split: { core_pct: nonnegative, satellite_pct: nonnegative }, benchmark: { ticker: nonempty, name: nonempty, isin: nonempty }, limits: { max_positions: positive, max_single_stock_pct: nonnegative, max_satellite_pct_of_portfolio: nonnegative, max_sector_pct: nonnegative }, public_amounts: bool }, FILES.config);
  if (Math.abs(c.split.core_pct + c.split.satellite_pct - 100) > .001) throw new Error(`${FILES.config}: split percentages must total 100.`);
  return c;
}
function validatePrices(p) {
  assertValid(p, { asOf: nullable(date), prices: object }, FILES.prices);
  const errors = [];
  Object.entries(p.prices).forEach(([ticker, rows]) => {
    validate(rows, [{ date, close: positive }], `prices.${ticker}`, errors);
    if (Array.isArray(rows)) {
      const days = rows.map(r => r?.date);
      if (new Set(days).size !== days.length) errors.push(`prices.${ticker}: duplicate dates`);
      if (rows.some(r => p.asOf && r?.date > p.asOf)) errors.push(`prices.${ticker}: date later than asOf`);
    }
  });
  if (Object.keys(p.prices).length && !p.asOf) errors.push('asOf: required when prices are supplied');
  if (errors.length) throw new Error(`${FILES.prices}\n${errors.join('\n')}`);
  return p;
}
function validateHoldings(h) {
  assertValid(h, [{ date, ticker: nonempty, isin: str, bucket: oneOf('core', 'satellite'), amount_usd: positive, price: positive, shares: positive }], FILES.holdings);
  const buckets = new Map();
  const ids = new Set();
  h.forEach(r => {
    if ('id' in r) {
      if (!nonempty(r.id)) throw new Error(`${FILES.holdings}: purchase id must be a non-empty string.`);
      if (ids.has(r.id)) throw new Error(`${FILES.holdings}: duplicate purchase id.`);
      ids.add(r.id);
    }
    if (buckets.has(r.ticker) && buckets.get(r.ticker) !== `${r.bucket}:${r.isin}`) throw new Error(`${FILES.holdings}: ${r.ticker} has inconsistent bucket or ISIN.`);
    buckets.set(r.ticker, `${r.bucket}:${r.isin}`);
    if (r.shares * r.price > r.amount_usd + Math.max(.02, r.amount_usd * .001)) throw new Error(`${FILES.holdings}: ${r.ticker} purchase cost is below shares × USD price.`);
  });
  return h;
}
function setupNotices() {
  const notes = [];
  if (state.prices?.asOf) {
    const days = Math.floor((Date.now() - Date.parse(state.prices.asOf)) / 86400000);
    if (days > 7) notes.push(`Price snapshot is ${days} days old (${state.prices.asOf}). Historical closing prices have not been updated.`);
    if (days < 0) notes.push('Price snapshot is dated in the future. Check data/prices.json.');
  }
  $('#notices').innerHTML = notes.map(n => `<div class="notice">${text(n)}</div>`).join('');
}

// Compare actual shares with benchmark units bought with identical USD cash flows.
// Only exact price dates are used; never forward-fill or fabricate a close.
function performance(holdings, prices, benchmark) {
  if (!holdings.length) return { rows: [], latest: null };
  if (!benchmark || benchmark.includes('[')) throw new Error('Select a real benchmark ticker in data/config.json before calculating performance.');
  const maps = new Map(Object.entries(prices.prices).map(([t, rows]) => [t, new Map(rows.map(r => [r.date, r.close]))]));
  const bm = maps.get(benchmark);
  const missing = [];
  holdings.forEach(h => {
    if (!maps.get(h.ticker)?.size) missing.push(`No price history for ${h.ticker}.`);
    if (!bm?.has(h.date)) missing.push(`Missing ${benchmark} close on purchase date ${h.date}.`);
  });
  if (missing.length) throw new Error([...new Set(missing)].join('\n'));
  const first = holdings.reduce((d, h) => h.date < d ? h.date : d, holdings[0].date);
  const lastBuy = holdings.reduce((d, h) => h.date > d ? h.date : d, first);
  const rows = [];
  const dates = [...new Set([...maps.values()].flatMap(m => [...m.keys()]))].filter(d => d >= first && d <= prices.asOf).sort();
  dates.forEach(d => {
    const active = holdings.filter(h => h.date <= d);
    if (!bm.has(d) || active.some(h => !maps.get(h.ticker).has(d))) { rows.push({ date: d, gap: true }); return; }
    const invested = active.reduce((s, h) => s + h.amount_usd, 0);
    const value = active.reduce((s, h) => s + h.shares * maps.get(h.ticker).get(d), 0);
    const benchmarkValue = active.reduce((s, h) => s + h.amount_usd / bm.get(h.date) * bm.get(d), 0);
    rows.push({ date: d, invested, value, benchmarkValue, portfolioReturn: (value / invested - 1) * 100, benchmarkReturn: (benchmarkValue / invested - 1) * 100 });
  });
  const latest = rows.filter(r => !r.gap && r.date >= lastBuy).at(-1);
  if (!latest) throw new Error('No shared valuation date on or after the last purchase. Supply closes for every holding and the benchmark on the same date.');
  return { rows, latest, maps };
}
function getPerformance() {
  if (state.errors.holdings) throw state.errors.holdings;
  if (state.errors.prices) throw state.errors.prices;
  return performance(state.holdings, state.prices, state.config.benchmark.ticker);
}
function currentMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit' }).formatToParts(now);
  return `${parts.find(p => p.type === 'year').value}-${parts.find(p => p.type === 'month').value}`;
}
function monthPurchases(holdings, month) {
  return holdings.filter(h => h.date.slice(0, 7) === month);
}
function accountSummary(holdings, prices, cash = 0) {
  if (!nonnegative(cash)) throw new Error('Cash balance must be zero or greater.');
  const invested = holdings.reduce((sum, h) => sum + h.amount_usd, 0);
  const maps = new Map(Object.entries(prices?.prices || {}).map(([ticker, rows]) => [ticker, new Map(rows.map(r => [r.date, r.close]))]));
  const lastBuy = holdings.reduce((latest, h) => h.date > latest ? h.date : latest, '');
  const candidates = holdings.length ? [...(maps.get(holdings[0].ticker)?.keys() || [])].filter(d => d >= lastBuy && d <= prices.asOf).sort().reverse() : [];
  const valuedAt = candidates.find(d => holdings.every(h => maps.get(h.ticker)?.has(d))) || null;
  const values = holdings.map(h => valuedAt ? h.shares * maps.get(h.ticker).get(valuedAt) : h.amount_usd);
  const investmentsValue = values.reduce((sum, value) => sum + value, 0);
  return { invested, investmentsValue, cash, balance: investmentsValue + cash, gain: valuedAt ? investmentsValue - invested : null, valuedAt, values };
}
function tiles(items, extra = '') {
  return `<div class="kpis ${extra}">${items.map(([label, value, note]) => `<div class="kpi"><span class="kpi-label">${text(label)}</span><span class="kpi-value">${esc(value)}</span><small>${text(note)}</small></div>`).join('')}</div>`;
}
function accountTiles(account, holdings) {
  return tiles([
    ['Account balance', money(account.balance, account.invested + account.cash), account.valuedAt ? `Investments + cash · ${account.valuedAt}` : 'Recorded cost + cash · prices unavailable'],
    ['Total invested', money(account.invested, account.invested), 'All purchase dates'],
    ['Uninvested cash', money(account.cash, account.invested + account.cash), 'Your manual cash balance'],
    ['Investment gain / loss', account.gain === null ? '—' : money(account.gain, account.invested), account.valuedAt ? 'Excludes cash and dividends' : 'Requires a complete price snapshot'],
    ['Positions', new Set(holdings.map(h => h.ticker)).size, `Limit ${state.config.limits.max_positions}`]
  ], 'account-kpis');
}
function purchaseLedger(holdings, title, values = null) {
  const total = holdings.reduce((sum, h) => sum + h.amount_usd, 0);
  if (!holdings.length) return panel(title, empty('No purchases recorded for this period. Add and manage investments in This month.'));
  return panel(title, `<div class="scroll"><table><thead><tr>${['Date', 'Ticker', 'Bucket', privateMode() ? 'Contribution %' : 'Invested (USD)', ...(!privateMode() ? ['Recorded price/share (USD)', 'Shares'] : []), ...(values ? [privateMode() ? 'Value %' : 'Value / cost (USD)'] : [])].map(label => `<th scope="col">${esc(label)}</th>`).join('')}</tr></thead><tbody>${holdings.map((h, i) => `<tr><td>${esc(h.date)}</td><td>${text(h.ticker)}</td><td>${esc(h.bucket)}</td><td>${money(h.amount_usd, total)}</td>${!privateMode() ? `<td>${fmt(h.price)}${h.price_basis === 'average_cost_per_reported_share' ? '<small class="price-basis">Average cost / reported share</small>' : '<small class="price-basis">Execution price</small>'}</td><td>${fmt(h.shares)}</td>` : ''}${values ? `<td>${money(values[i], total)}</td>` : ''}</tr>`).join('')}</tbody></table></div>`);
}
const CASH_KEY = 'invest-dashboard.cash.v1';
function cashForm() {
  return panel('Uninvested account cash', `<p class="meta">Optional: enter the cash currently available in your investment account. Update this balance after deposits, withdrawals or trades; purchases do not deduct it automatically.</p><form id="cash-form" class="cash-form"><label for="cash-amount">Cash balance (USD)</label><div class="form-actions"><input id="cash-amount" name="cash" type="number" min="0" step="any" inputmode="decimal" required value="${esc(state.cashBalance)}"><button class="action-button" type="submit">Save cash balance</button></div></form><p class="local-note">Saved in this browser. The account balance combines this cash with all recorded investments.</p><p id="cash-message" class="form-message" role="status" aria-live="polite">${esc(state.cashMessage || '')}</p>${state.cashError ? '<p class="flag">Saved cash could not be loaded. Enter and save the correct balance to restore it.</p>' : ''}`);
}
function bindCash() {
  const form = $('#cash-form');
  if (!form) return;
  form.addEventListener('submit', event => {
    event.preventDefault();
    try {
      const amount = Number(form.elements.cash.value);
      if (!nonnegative(amount) || !form.elements.cash.value.trim()) throw new Error('Enter a cash balance of zero or greater.');
      localStorage.setItem(CASH_KEY, JSON.stringify(amount));
      state.cashBalance = amount; state.cashError = null; state.cashMessage = 'Cash balance saved. Account total updated.'; render();
    } catch (error) { $('#cash-message').dataset.error = 'true'; $('#cash-message').textContent = error.message; }
  });
}

function allocationBar(core, satellite, label) {
  const total = core + satellite;
  const cp = total ? core / total * 100 : 0;
  return `<div class="bar-label"><span>${text(label)}</span><span class="num">${total ? `${pct(cp)} / ${pct(100 - cp)}` : 'No allocation'}</span></div><div class="bar" aria-label="${esc(label)}"><span style="width:${cp}%"></span><span style="width:${total ? 100 - cp : 0}%"></span></div>`;
}
function scorecard() {
  try {
    const p = getPerformance().latest;
    if (!p) return empty('No purchases yet. Use Add an investment below to start your portfolio.');
    return `<p class="meta">Common valuation date ${esc(p.date)}</p><div class="check-row"><span>Your purchases</span><strong class="num">${pct(p.portfolioReturn)}</strong></div><div class="check-row"><span>${text(state.config.benchmark.ticker)}</span><strong class="num">${pct(p.benchmarkReturn)}</strong></div><div class="check-row"><span>Difference</span><strong class="num accent">${(p.portfolioReturn - p.benchmarkReturn).toFixed(2)} pp</strong></div>`;
  } catch (e) { return errorBox(e); }
}
const metricLabels = { pe_forward: 'Forward P/E', revenue_growth_yoy: 'Revenue YoY (%)', fcf_margin: 'FCF margin (%)', debt_to_equity: 'Debt / equity', beta: 'Beta', dividend_yield: 'Dividend yield (%)', next_earnings_date: 'Next earnings' };
const checkLabels = { eu_retail_buyable: 'EU retail buyable', fee_under_1pct: 'Fee below 1%', no_earnings_within_14d: 'No earnings within 14 days', position_cap_ok: 'Position cap' };
const metric = (k, v) => v === null ? 'Not available' : k === 'next_earnings_date' ? esc(v) : ['revenue_growth_yoy', 'fcf_margin', 'dividend_yield'].includes(k) ? pct(v) : fmt(v);
function checksHTML(checks) {
  return Object.entries(checks).map(([k, v]) => `<div class="check-row"><span>${esc(checkLabels[k])}</span><strong class="${v ? 'ok' : 'flag'}">${v ? 'OK' : 'FLAG'}</strong></div>`).join('');
}
function pickDetails(p, budget) {
  return `<details><summary>${text(p.ticker)} · ${text(p.name)} <span class="tag">${money(p.amount_usd, budget)}</span></summary><div class="detail-body"><p class="meta">${text(p.isin)} · ${text(p.exchange)} · ${text(p.currency)} · price dated ${esc(p.price_date)}</p>${[p.instrument, p.bucket, `${p.risk} risk`, `${p.confidence} confidence`].map(tag).join('')}<h3>Why now</h3>${paragraph(p.thesis)}<h3>What would prove it wrong</h3>${paragraph(p.bear_case)}<h3>Catalysts</h3>${p.catalysts.length ? p.catalysts.map(paragraph).join('') : empty('None recorded.')}<dl class="metric-grid">${Object.entries(p.metrics).map(([k, v]) => `<div><dt>${esc(metricLabels[k])}</dt><dd class="num">${metric(k, v)}</dd></div>`).join('')}</dl><h3>Research checks</h3>${checksHTML(p.checks)}<h3>Numbered sources</h3><ol class="sources">${p.sources.map(s => `<li><a href="${esc(safeURL(s.url))}" target="_blank" rel="noopener noreferrer">${text(s.title)}</a> · accessed ${esc(s.accessed)}</li>`).join('')}</ol>${!p.sources.length ? '<p class="flag">FLAG: no sources supplied.</p>' : ''}</div></details>`;
}
function picksTable(picks, budget) {
  if (!picks.length) return empty('No picks in this issue.');
  const cols = [['ticker', 'Ticker'], ['name', 'Name'], ['isin', 'ISIN'], ['exchange', 'Exchange'], ['instrument', 'Type'], ['bucket', 'Bucket'], ['risk', 'Risk'], ['amount_usd', privateMode() ? 'Budget %' : 'Amount (USD)'], ...(!privateMode() ? [['price_at_research', 'Research price']] : []), ['price_date', 'Price date'], ['currency', 'Currency'], ...Object.entries(metricLabels).map(([k, v]) => [`metrics.${k}`, v]), ['confidence', 'Confidence'], ['sources', 'Sources']];
  const val = (p, k) => k === 'sources' ? p.sources.length : k.split('.').reduce((v, x) => v?.[x], p);
  const cell = (p, k) => k === 'amount_usd' ? money(p.amount_usd, budget) : k.startsWith('metrics.') ? metric(k.slice(8), val(p, k)) : k === 'price_at_research' ? fmt(p[k]) : text(val(p, k) ?? 'Not available');
  return `<div class="scroll"><table class="sortable"><caption class="meta">Select a column heading to sort. Open each pick below for its full research.</caption><thead><tr>${cols.map(([, label]) => `<th scope="col" aria-sort="none"><button type="button">${esc(label)} ↕</button></th>`).join('')}</tr></thead><tbody>${picks.map(p => `<tr>${cols.map(([k]) => `<td data-sort="${esc(val(p, k) ?? '')}">${cell(p, k)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function entryHTML(e) {
  const flags = [];
  if (/EXAMPLE/i.test(e.model + e.market_context)) flags.push('EXAMPLE ISSUE — synthetic data only. These instruments and values are not recommendations.');
  if (Math.abs(e.allocation.core_usd + e.allocation.satellite_usd - e.budget_usd) > .01) flags.push('Allocation does not equal the issue budget.');
  for (const bucket of ['core', 'satellite']) {
    const sum = e.picks.filter(p => p.bucket === bucket).reduce((s, p) => s + p.amount_usd, 0);
    if (Math.abs(sum - e.allocation[`${bucket}_usd`]) > .01) flags.push(`${bucket} picks do not equal the stated allocation; review unallocated cash or overspending.`);
  }
  if (e.picks.filter(p => p.bucket === 'satellite').length > 1) flags.push('More than one satellite pick in this issue.');
  if (!e.picks.length && !e.no_buy_reason.trim()) flags.push('No picks and no no-buy explanation supplied.');
  return `<article><div class="section-head"><div><h2>Monthly brief / ${esc(e.month)}</h2><p>Generated ${esc(e.generated_at)} · ${text(e.model)} · data as of ${esc(e.data_as_of)}</p></div>${tag('RESEARCH SNAPSHOT')}</div>${[...flags, ...e.warnings].map(w => `<div class="notice">${text(w)}</div>`).join('')}<div class="grid">${panel('Market context', paragraph(e.market_context) + (e.no_buy_reason ? '<h3>No-buy reason</h3>' + paragraph(e.no_buy_reason) : ''))}${panel('Monthly allocation', allocationBar(e.allocation.core_usd, e.allocation.satellite_usd, 'Issue plan · core / satellite') + allocationBar(state.config.split.core_pct, state.config.split.satellite_pct, 'Current target · core / satellite') + `<p class="meta">Budget ${money(e.budget_usd, state.config.budget_usd_per_month)} · Core ${money(e.allocation.core_usd, e.budget_usd)} · Satellite ${money(e.allocation.satellite_usd, e.budget_usd)}</p>`)}</div>${panel('Picks / research metrics', picksTable(e.picks, e.budget_usd))}<div class="grid">${panel('Investment cases', e.picks.map(p => pickDetails(p, e.budget_usd)).join('') || empty('No purchases proposed.'))}${panel('Framework checks', `<p class="meta">Reported by this issue’s researcher; not independently verified by the website.</p>${e.picks.map(p => `<h3>${text(p.ticker)}</h3>${checksHTML(p.checks)}`).join('') || empty('No pick checks recorded.')}`)}</div>${panel('Last month revisited', e.review_of_previous.map(r => `<div class="list-row"><strong>${text(r.ticker)}</strong> ${tag(r.thesis_status)} ${tag(r.action)} <span class="num">${pct(r.change_pct)}</span>${paragraph(r.note)}</div>`).join('') || empty('No previous review recorded.'))}<div class="grid equal">${panel('Watchlist', e.watchlist.map(w => `<div class="list-row"><strong>${text(w.ticker)}</strong>${paragraph(w.trigger)}</div>`).join('') || empty('No watchlist names.'))}${panel('Rejected names', e.rejected.map(r => `<div class="list-row"><strong>${text(r.ticker)}</strong>${paragraph(r.reason)}</div>`).join('') || empty('No rejected names recorded.'))}</div></article>`;
}
function researchExtras(entry) {
  const errors = [];
  if (!object(entry)) return errors;
  for (const key of ['research_prompt', 'research_summary']) if (key in entry && !str(entry[key])) errors.push(`${key}: expected text`);
  if (Array.isArray(entry.picks)) entry.picks.forEach((p, i) => {
    if (!object(p)) return;
    if ('sentiment_score' in p && p.sentiment_score !== null && (!Number.isInteger(p.sentiment_score) || p.sentiment_score < 0 || p.sentiment_score > 100)) errors.push(`picks[${i}].sentiment_score: expected an integer from 0 to 100, or null`);
    if ('sentiment_reason' in p && !str(p.sentiment_reason)) errors.push(`picks[${i}].sentiment_reason: expected text`);
  });
  return errors;
}
function sentiment(score) {
  if (!Number.isInteger(score) || score < 0 || score > 100) return { label: 'Not scored', className: 'unscored' };
  return score >= 80 ? { label: 'Strong buy', className: 'positive' } : score >= 60 ? { label: 'Buy', className: 'positive' } : score >= 40 ? { label: 'Neutral', className: 'neutral' } : score >= 20 ? { label: 'Weak buy', className: 'cautious' } : { label: 'Avoid', className: 'cautious' };
}
function researchPrice(pick) {
  if (privateMode()) return 'Hidden';
  try { return new Intl.NumberFormat('en-US', { style: 'currency', currency: pick.currency }).format(pick.price_at_research); }
  catch { return `${fmt(pick.price_at_research)} ${text(pick.currency)}`; }
}
function icon(name, cls = '') {
  return `<span class="material-symbols-outlined ${cls}" aria-hidden="true">${name}</span>`;
}
function stockCardHeader(ticker, name, label, score, category, price, example = false) {
  const tone = example ? (label === 'Confident' ? 'confident' : label === 'Bullish' ? 'bullish' : 'weak') : score === null ? 'unscored' : score >= 80 ? 'confident' : score >= 60 ? 'bullish' : score >= 40 ? 'neutral' : 'weak';
  return `<div class="stock-card-head"><div class="stock-identity"><div class="stock-title"><h2>${text(ticker)}</h2><span class="company-name">${text(name)}</span><span class="sentiment-badge ${tone}">${text(label)}</span></div><p class="stock-meta">${text(category)} · ${example ? 'Sample price' : 'Research price'}: ${price}</p></div><div class="conviction ${tone}"><div><span class="score-label">Conviction score</span><strong>${score === null ? '—' : score}<small>/100</small></strong></div>${score === null ? '' : `<meter min="0" max="100" value="${score}" aria-label="${text(ticker)} conviction score">${score} / 100</meter>`}</div></div>`;
}
function cardAction(ticker, bucket = '', isin = '') {
  return `<div class="stock-card-action"><button type="button" class="outline-button" data-prefill-ticker="${esc(ticker)}" data-prefill-bucket="${esc(bucket)}" data-prefill-isin="${esc(isin)}">${icon('add')}Add to Investment Form</button></div>`;
}
function researchCard(pick, budget) {
  const grade = sentiment(pick.sentiment_score), score = grade.className === 'unscored' ? null : pick.sentiment_score;
  return `<article class="stock-card">${stockCardHeader(pick.ticker, pick.name, grade.label, score, `${pick.exchange} / ${pick.instrument} · ${pick.price_date}`, researchPrice(pick))}<div class="stock-notes"><div>${icon('chat','signal-positive')}<p><strong>Investment case:</strong> ${text(pick.thesis)}</p></div><div>${icon('waterfall_chart','signal-positive')}<p><strong>Catalysts:</strong> ${text(pick.catalysts.join(' · ') || 'No catalysts supplied.')}</p></div><div>${icon('shield','signal-risk')}<p><strong>Biggest risk:</strong> ${text(pick.bear_case)}</p></div><div>${icon('description','signal-positive')}<p><strong>Sources & filings:</strong> ${pick.sources.length} linked sources in the research details below.</p></div></div>${pick.sentiment_reason ? `<p class="meta score-reason">${text(pick.sentiment_reason)}</p>` : ''}<div class="research-tags">${tag(`${pick.confidence} confidence`)}${tag(`${pick.risk} risk`)}${tag(pick.bucket)}${tag(`Allocation: ${money(pick.amount_usd,budget)}`)}</div>${pickDetails(pick,budget)}${cardAction(pick.ticker,pick.bucket,pick.isin)}</article>`;
}
function validatePreview(data) {
  return assertValid(data, {kind: oneOf('design_preview'), source: nonempty, notice: nonempty, stocks: [{ticker: nonempty,name: nonempty,category: nonempty,price: positive,currency: oneOf('USD'),sentiment: oneOf('Confident','Bullish','Weak'),score: v => Number.isInteger(v) && v >= 0 && v <= 100,notes:[{label:nonempty,text:nonempty}]}]}, FILES.preview);
}
function previewCards() {
  if (state.errors.preview) return errorBox(state.errors.preview);
  if (!state.preview) return empty('No research or design examples are available.');
  return `<div class="stock-list">${state.preview.stocks.map(p => `<article class="stock-card" data-design-example="true">${stockCardHeader(p.ticker,p.name,p.sentiment,p.score,p.category,money(p.price),true)}<div class="stock-notes">${p.notes.map((n,i) => `<div>${icon(['chat','waterfall_chart','verified'][i] || 'description',p.sentiment === 'Weak' ? 'signal-risk' : 'signal-positive')}<p><strong>${text(n.label.replace('Verified Sources','Sources'))}:</strong> ${text(n.text)}</p></div>`).join('')}</div>${cardAction(p.ticker)}</article>`).join('')}</div>`;
}
function researchPanel(entry, month) {
  const selected = ['stocks', 'context', 'prompt'].includes(state.researchTab) ? state.researchTab : 'stocks';
  const tabs = [['stocks', 'Stock reviews'], ['context', 'Market & decisions'], ['prompt', 'Prompt & method']];
  const stocks = entry ? (entry.picks.length ? `<div class="research-cards">${entry.picks.map(p => researchCard(p, entry.budget_usd)).join('')}</div>` : empty(entry.no_buy_reason || 'This month’s research proposed no purchases.')) : empty('No ChatGPT research has been saved for this month yet. A monthly research run will add the stock symbols, dated share prices, sentiment scores, thesis and sources here.');
  const context = entry ? `<h3>Monthly view</h3>${paragraph(entry.research_summary || entry.market_context)}${entry.no_buy_reason ? `<h3>No-buy explanation</h3>${paragraph(entry.no_buy_reason)}` : ''}${entry.warnings.map(w => `<div class="notice">${text(w)}</div>`).join('')}<h3>Watchlist</h3>${entry.watchlist.map(w => `<div class="list-row"><strong>${text(w.ticker)}</strong>${paragraph(w.trigger)}</div>`).join('') || empty('No watchlist recorded.')}<h3>Rejected names</h3>${entry.rejected.map(w => `<div class="list-row"><strong>${text(w.ticker)}</strong>${paragraph(w.reason)}</div>`).join('') || empty('No rejected names recorded.')}` : empty('Market context and research decisions will appear with this month’s report.');
  const prompt = `<h3>Your research prompt</h3>${entry?.research_prompt ? paragraph(entry.research_prompt) : empty('No user prompt was saved for this month.')}<h3>Sentiment scale</h3><p>80–100 Strong buy · 60–79 Buy · 40–59 Neutral · 20–39 Weak buy · 0–19 Avoid.</p><p>Scores are the monthly researcher’s assessment, not a probability of profit. No score is calculated from confidence or invented by the dashboard. Share prices are research snapshots, not live quotes.</p>${entry ? `<p class="meta">Model: ${text(entry.model)} · Generated ${esc(entry.generated_at)} · Data as of ${esc(entry.data_as_of)}</p>` : '<p class="meta">The monthly entry can save research_prompt, research_summary, and a sentiment_score and sentiment_reason for each pick.</p>'}`;
  return `<section class="panel research-panel" aria-labelledby="research-heading"><div class="section-head"><div><h2 id="research-heading">Research / ${esc(month)}</h2><p>ChatGPT stock research · based on your monthly prompt</p></div>${tag(entry ? 'SAVED MONTHLY REPORT' : 'AWAITING THIS MONTH’S RESEARCH')}</div><div class="research-tabs" role="tablist" aria-label="Monthly research">${tabs.map(([id, label]) => `<button type="button" role="tab" id="research-tab-${id}" data-research-tab="${id}" aria-selected="${selected === id}" aria-controls="research-pane-${id}" tabindex="${selected === id ? 0 : -1}">${label}</button>`).join('')}</div>${[['stocks', stocks], ['context', context], ['prompt', prompt]].map(([id, body]) => `<div id="research-pane-${id}" role="tabpanel" aria-labelledby="research-tab-${id}" ${selected === id ? '' : 'hidden'}>${body}</div>`).join('')}</section>`;
}
function bindResearch() {
  const tabs = [...document.querySelectorAll('[data-research-tab]')];
  const select = tab => {
    state.researchTab = tab.dataset.researchTab;
    tabs.forEach(button => { const active = button === tab; button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; document.getElementById(button.getAttribute('aria-controls')).hidden = !active; });
    tab.focus();
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      if (next !== undefined && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); select(tabs[next]); }
    });
  });
}

function positionHistory(holdings, prices) {
  const groups = new Map();
  holdings.forEach(h => { if (!groups.has(h.ticker)) groups.set(h.ticker, []); groups.get(h.ticker).push(h); });
  return [...groups].map(([ticker, lots]) => {
    const first = lots.reduce((d, p) => p.date < d ? p.date : d, lots[0].date);
    const lastBuy = lots.reduce((d, p) => p.date > d ? p.date : d, first);
    const invested = lots.reduce((sum, p) => sum + p.amount_usd, 0);
    const rows = (prices?.prices?.[ticker] || []).filter(r => r.date >= first && r.date <= prices.asOf).sort((a, b) => a.date.localeCompare(b.date)).map(r => {
      const active = lots.filter(p => p.date <= r.date);
      const cost = active.reduce((sum, p) => sum + p.amount_usd, 0);
      const value = active.reduce((sum, p) => sum + p.shares * r.close, 0);
      return { date: r.date, close: r.close, cost, value, returnPct: (value / cost - 1) * 100 };
    });
    return { ticker, lots, invested, rows, latest: rows.filter(r => r.date >= lastBuy).at(-1) || null };
  });
}
function positionsPanel() {
  const positions = positionHistory(state.holdings, state.errors.prices ? null : state.prices);
  if (!positions.length) return panel('Stock performance', empty('Your individual stocks, dated returns and charts will appear here after purchases and price history are recorded.'));
  const total = positions.reduce((sum, p) => sum + p.invested, 0);
  const table = `<div class="scroll"><table><caption class="meta">Returns on your actual purchase outlays. Each position uses its own latest available price date; the account balance uses a shared date.</caption><thead><tr><th>Symbol</th><th>Invested</th><th>Value</th><th>Gain / loss</th><th>Return</th><th>Price date</th></tr></thead><tbody>${positions.map(p => `<tr><td>${text(p.ticker)}</td><td>${money(p.invested, total)}</td><td>${p.latest ? money(p.latest.value, total) : '—'}</td><td>${p.latest ? money(p.latest.value - p.invested, p.invested) : '—'}</td><td>${p.latest ? pct(p.latest.returnPct) : '—'}</td><td>${p.latest?.date || 'Awaiting prices'}</td></tr>`).join('')}</tbody></table></div>`;
  const hasPrices = positions.some(p => p.rows.length);
  const selected = positions.find(p => p.ticker === state.selectedStock) || positions[0];
  state.selectedStock = selected.ticker;
  return panel('Stock performance', table + (hasPrices ? `<h3>Return by stock (%)</h3><p class="meta">Cumulative gain divided by cash invested to each date. Dates without quotes remain gaps.</p><div class="chart-wrap"><canvas id="stock-returns-chart" role="img" aria-label="Return on actual purchases for each stock"></canvas></div><p id="stock-returns-note" class="meta"></p>` : empty('No dated prices are available yet. Add each holding’s price history to see real performance; purchase prices alone are not treated as market quotes.')) + `<div class="section-head stock-history-head"><h3>Stock price history</h3><label>Stock <select id="stock-select" aria-label="Stock price history">${positions.map(p => `<option value="${esc(p.ticker)}" ${p.ticker === selected.ticker ? 'selected' : ''}>${text(p.ticker)}</option>`).join('')}</select></label></div>${selected.rows.length ? `<div class="chart-wrap"><canvas id="stock-price-chart" role="img" aria-label="${text(selected.ticker)} closing prices and your fill prices"></canvas></div><p id="stock-price-note" class="meta">USD closing prices. Points mark known execution fills; derived average costs are excluded.</p><details><summary>${text(selected.ticker)} / exact history</summary><div class="detail-body scroll"><table><thead><tr><th>Date</th><th>Close (USD)</th><th>Value</th><th>Return</th></tr></thead><tbody>${selected.rows.map(r => `<tr><td>${r.date}</td><td>${privateMode() ? 'Hidden' : fmt(r.close)}</td><td>${money(r.value, r.cost)}</td><td>${pct(r.returnPct)}</td></tr>`).join('')}</tbody></table></div></details>` : empty(`No price history is available for ${selected.ticker}.`)}`);
}
function drawPositionCharts() {
  const positions = positionHistory(state.holdings || [], state.errors.prices ? null : state.prices);
  const returnsCanvas = $('#stock-returns-chart'), priceCanvas = $('#stock-price-chart');
  if (!returnsCanvas && !priceCanvas) return;
  if (!window.Chart) { if ($('#stock-returns-note')) $('#stock-returns-note').textContent = 'Chart.js could not load. The stock table remains available.'; if ($('#stock-price-note')) $('#stock-price-note').textContent = 'Chart.js could not load. The exact history table remains available.'; return; }
  const css = getComputedStyle(document.documentElement), ink = css.getPropertyValue('--muted').trim(), grid = css.getPropertyValue('--border').trim();
  const colors = [css.getPropertyValue('--accent').trim(), '#4edea3', '#638fda', '#b587c4', '#c19442', '#39a4ac', '#c87290', '#799342', '#8d83db', '#d48b56'];
  const options = unit => ({ responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { labels: { color: ink } }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${unit === '%' ? pct(c.parsed.y) : privateMode() ? pct(c.parsed.y) : money(c.parsed.y)}` } } }, scales: { x: { ticks: { color: ink, maxTicksLimit: 6 }, grid: { display: false } }, y: { ticks: { color: ink, callback: v => unit === '%' || privateMode() ? `${v}%` : `$${v}` }, grid: { color: grid } } } });
  if (returnsCanvas) {
    const dates = [...new Set(positions.flatMap(p => p.rows.map(r => r.date)))].sort();
    state.positionCharts.push(new Chart(returnsCanvas, { type: 'line', data: { labels: dates, datasets: positions.filter(p => p.rows.length).map((p, i) => { const values = new Map(p.rows.map(r => [r.date, r.returnPct])); return { label: p.ticker, data: dates.map(d => values.get(d) ?? null), borderColor: colors[i % colors.length], borderWidth: 2, pointRadius: 2, spanGaps: false }; }) }, options: options('%') }));
  }
  if (priceCanvas) {
    const p = positions.find(p => p.ticker === state.selectedStock);
    const dates = [...new Set([...p.rows.map(r => r.date), ...p.lots.map(r => r.date)])].sort();
    const closes = new Map(p.rows.map(r => [r.date, r.close]));
    const baseline = p.rows[0].close;
    const scale = value => privateMode() ? (value / baseline - 1) * 100 : value;
    state.positionCharts.push(new Chart(priceCanvas, { type: 'line', data: { labels: dates, datasets: [{ label: privateMode() ? `${p.ticker} price change (%)` : `${p.ticker} close (USD)`, data: dates.map(d => closes.has(d) ? scale(closes.get(d)) : null), borderColor: colors[0], borderWidth: 2, pointRadius: 2, spanGaps: false }, { label: 'Known execution fills', data: p.lots.filter(lot => lot.price_basis !== 'average_cost_per_reported_share').map(lot => ({ x: lot.date, y: scale(lot.price) })), showLine: false, pointRadius: 5, pointBackgroundColor: colors[1], borderColor: colors[1] }] }, options: options('USD') }));
  }
}
function bindStockSelect() {
  $('#stock-select')?.addEventListener('change', event => { state.selectedStock = event.target.value; render(); $('#stock-select')?.focus(); });
}

function monthPage() {
  const month = currentMonth();
  const issue = state.entries.find(e => e.data?.month === month || e.error && e.path === `entries/${month}.json`);
  const entry = issue?.data;
  const research = state.errors.index ? errorBox(state.errors.index) : issue?.error ? errorBox(issue.error) : entry ? researchPanel(entry,month) : previewCards();
  const previewNote = !entry && !issue?.error && !state.errors.index && state.preview ? `<p class="design-note">${icon('info')}<span>${text(state.preview.notice)}</span></p>` : '';
  const holdings = monthPurchases(state.holdings || [],month);
  const core = holdings.filter(h => h.bucket === 'core').reduce((s,h) => s+h.amount_usd,0);
  const satellite = holdings.filter(h => h.bucket === 'satellite').reduce((s,h) => s+h.amount_usd,0);
  return `<section id="view-this-month"><div class="page-intro"><h1 id="page-title">Top Investment Picks for This Month</h1><p>Stock research combining community sentiment, institutional activity, and source filings.</p></div>${previewNote}<div class="month-layout"><div class="month-main">${research}<details class="monthly-details"><summary>Research / ${esc(month)} · allocation & purchases</summary><div class="detail-body">${state.errors.holdings ? errorBox(state.errors.holdings) : panel('This month’s allocation',allocationBar(core,satellite,'Purchases this month · core / satellite')) + purchaseLedger(holdings,'This month’s purchases')}</div></details></div><aside class="investment-sidebar">${purchaseForm()}</aside></div></section>`;
}
function activePositionsTable(holdings, prices) {
  const positions = positionHistory(holdings, prices);
  if (!positions.length) return panel('Active Positions',empty('No investments recorded yet. Use Add New Position to log a completed purchase.'));
  const totalCost = positions.reduce((s,p) => s+p.invested,0);
  const rows = positions.map(p => {
    const shares = p.lots.reduce((s,h) => s+h.shares,0), avg = p.invested/shares;
    const quote = quoteFor(p.ticker, p.lots);
    if (quote) p.latest = {close:quote.price, value:shares*quote.price, date:quote.price_time};
    const first = p.lots.reduce((d,h) => h.date < d ? h.date : d,p.lots[0].date);
    return `<tr><td class="ticker-cell"><div class="symbol-performance"><strong>${text(p.ticker)}</strong>${positionGainGraphic(p)}</div></td><td class="position-actions"><button type="button" class="action-button" data-manage-position="${esc(p.ticker)}" aria-label="Modify ${esc(p.ticker)}" aria-expanded="${state.editTicker===p.ticker}" aria-controls="position-editor-${esc(p.ticker)}">Modify</button> <button type="button" class="action-button danger" data-remove-position="${esc(p.ticker)}" aria-label="Remove ${esc(p.ticker)}">Remove</button></td>${privateMode() ? '' : `<td>${shares.toLocaleString('en-US',{maximumFractionDigits:12})}</td><td>${money(avg)}<small class="price-basis">Average cost / share</small></td><td>${p.latest ? money(p.latest.close) : '—'}<small class="price-basis">${quote ? quoteLabel(quote) : p.latest?.date || 'Awaiting prices'}</small></td>`}<td>${money(p.latest?.value ?? p.invested,totalCost)}${p.latest ? '' : '<small class="price-basis">Recorded cost</small>'}</td><td>${esc(first)}</td></tr>${state.editTicker===p.ticker ? `<tr class="inline-position-editor"><td colspan="${privateMode()?4:7}">${positionEditor(p.ticker)}</td></tr>` : ''}`;
  }).join('');
  return `<section class="panel holdings-panel"><h2>Active Positions</h2><div class="scroll" role="region" aria-label="Active positions table" tabindex="0"><table id="holdings-table"><thead><tr><th>Symbol / gain or loss</th><th>Actions</th>${privateMode() ? '' : '<th>Shares</th><th>Purchase Price</th><th>Current Price</th>'}<th>${privateMode() ? 'Contribution %' : 'Position Value'}</th><th>Date Added</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}
function portfolioPage() {
  if (state.errors.holdings) return errorBox(state.errors.holdings);
  const h = state.holdings, account = quotedAccount(h,state.errors.prices ? null : state.prices,state.cashBalance);
  const count = new Set(h.map(p => p.ticker)).size;
  let result = null, comparisonNote = '';
  if (!state.config.benchmark.ticker.includes('[')) {
    try { result = getPerformance(); } catch(error) { comparisonNote = errorBox(error); }
  }
  const latest = result?.latest;
  let core = 0, satellite = 0;
  h.forEach((lot,i) => { if(lot.bucket === 'core') core += account.values[i]; else satellite += account.values[i]; });
  const allocation = allocationBar(state.config.split.core_pct,state.config.split.satellite_pct,'Target · core / satellite') + allocationBar(core,satellite,account.valuedAt ? 'Actual · market value' : 'Actual · recorded cost');
  const chart = latest ? `<p class="meta">${privateMode() ? 'Return (%)' : 'Market value (USD)'} · same purchase dates and cash flows</p><div class="chart-wrap"><canvas id="performance-chart" role="img" aria-label="Portfolio versus benchmark"></canvas></div><p id="chart-note" class="meta"></p>` : empty('Benchmark comparison will appear when the benchmark and matching dated prices are available.');
  const gainNote = account.gain === null ? 'Price history needed to calculate performance' : `${pct(account.gain/account.invested*100)} cumulative price return`;
  const summary = `<div class="portfolio-summary"><div class="summary-card"><span class="summary-label">Total Value</span><strong id="port-total-value">${money(account.balance,account.invested+account.cash)}</strong><p>${account.valuedAt ? `Investments + cash · ${esc(account.valuedAt)}` : 'Recorded cost + cash · awaiting market prices'}</p>${accountPnlGraphic(h,state.errors.prices ? null : state.prices)}</div><div class="summary-card"><span class="summary-label">Unrealized Gain</span><strong class="${account.gain === null ? '' : account.gain >= 0 ? 'ok' : 'flag'}">${money(account.gain,account.invested)}</strong><p>${gainNote}</p></div><div class="summary-card"><span class="summary-label">Active Positions</span><strong id="port-count">${count} ${count === 1 ? 'Asset' : 'Assets'}</strong><p>From your recorded purchases</p></div></div>`;
  const history = latest ? panel('Performance / all dates',`<details><summary>View exact performance table</summary><div class="detail-body scroll"><table><thead><tr><th>Date</th><th>Purchases return</th><th>Benchmark return</th><th>Difference (pp)</th></tr></thead><tbody>${result.rows.map(r => r.gap ? `<tr><td>${r.date}</td><td colspan="3">Incomplete prices</td></tr>` : `<tr><td>${r.date}</td><td>${pct(r.portfolioReturn)}</td><td>${pct(r.benchmarkReturn)}</td><td>${(r.portfolioReturn-r.benchmarkReturn).toFixed(2)}</td></tr>`).join('')}</tbody></table></div></details>`) : '';
  return `<section id="view-portfolio"><div class="page-intro portfolio-intro"><div><h1 id="page-title">Your Portfolio</h1><p>Active holdings, purchase history and performance across your entire account.</p></div><a class="action-button primary" href="#month" data-new-position>${icon('add')}Add New Position</a></div>${quoteStatus()}${summary}${state.errors.prices ? errorBox(state.errors.prices) : ''}${activePositionsTable(h,state.errors.prices ? null : state.prices)}${managementPanel()}<details class="portfolio-details"><summary>Purchase history & performance</summary><div class="detail-body">${purchaseLedger(h,'All purchases',account.values)}<div class="grid">${panel('Portfolio / benchmark',chart+comparisonNote)}${panel('Investment allocation',allocation)}</div>${positionsPanel()}${history}</div></details></section>`;
}

function drawChart() {
  if (!$('#performance-chart')) return;
  if (!window.Chart) { $('#chart-note').textContent = 'Chart.js could not load. The performance table below remains available.'; return; }
  try {
    const { rows } = getPerformance();
    const css = getComputedStyle(document.documentElement);
    state.chart = new Chart($('#performance-chart'), { type: 'line', data: { labels: rows.map(r => r.date), datasets: [{ label: 'Your purchases', data: rows.map(r => r.gap ? null : privateMode() ? r.portfolioReturn : r.value), borderColor: css.getPropertyValue('--accent').trim() }, { label: state.config.benchmark.ticker, data: rows.map(r => r.gap ? null : privateMode() ? r.benchmarkReturn : r.benchmarkValue), borderColor: css.getPropertyValue('--muted').trim() }].map(d => ({ ...d, borderWidth: 2, pointRadius: rows.length < 3 ? 3 : 0, tension: .15, spanGaps: false })) }, options: { responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { labels: { color: css.getPropertyValue('--text') } }, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${privateMode() ? pct(c.parsed.y) : money(c.parsed.y)}` } } }, scales: { x: { ticks: { color: css.getPropertyValue('--muted'), maxTicksLimit: 6 }, grid: { display: false } }, y: { ticks: { color: css.getPropertyValue('--muted'), callback: v => privateMode() ? `${v}%` : `$${v}` }, grid: { color: css.getPropertyValue('--border') } } } } });
  } catch (e) { $('#chart-note').textContent = `Chart unavailable: ${e.message}. See the performance table.`; }
}
// Local purchases stay in this browser; exports merge them with published holdings.
const PURCHASE_KEY = 'invest-dashboard.purchases.v1';
function purchaseKey(p) {
  return JSON.stringify([p.date, p.ticker, p.isin, p.bucket, p.amount_usd, p.price, p.shares]);
}
function mergePurchases(published, local) {
  const counts = new Map();
  published.forEach(p => counts.set(purchaseKey(p), (counts.get(purchaseKey(p)) || 0) + 1));
  const pending = local.filter(({ purchase }) => {
    const key = purchaseKey(purchase), count = counts.get(key) || 0;
    if (count) { counts.set(key, count - 1); return false; }
    return true;
  });
  return { holdings: [...published, ...pending.map(r => r.purchase)], pending };
}
function loadLocalPurchases(storage) {
  const raw = storage.getItem(PURCHASE_KEY);
  if (raw === null) return [];
  const rows = JSON.parse(raw);
  if (!Array.isArray(rows) || rows.some(r => !object(r) || !nonempty(r.id) || !object(r.purchase))) throw new Error('Invalid saved purchases.');
  if (new Set(rows.map(r => r.id)).size !== rows.length) throw new Error('Duplicate saved purchase IDs.');
  validateHoldings(rows.map(r => r.purchase));
  return rows;
}
function refreshHoldings() {
  if (state.errors.holdings) return;
  const merged = mergePurchases(state.publishedHoldings, state.localPurchases);
  state.holdings = applyOverrides(merged.holdings, state.overrides || {});
  state.pendingPurchases = merged.pending;
}
function persistPurchases(rows, storage) {
  // Write before changing in-memory totals so a storage failure cannot look saved.
  applyOverrides(mergePurchases(state.publishedHoldings, rows).holdings, state.overrides || {});
  storage.setItem(PURCHASE_KEY, JSON.stringify(rows));
  state.localPurchases = rows;
  refreshHoldings();
}
function purchaseFromFields(fields, existing) {
  const ticker = String(fields.ticker || '').trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9.=_^:-]{0,29}$/.test(ticker)) throw new Error('Enter a valid ticker, using letters, numbers, dots or hyphens.');
  const previous = existing.find(p => p.ticker === ticker);
  const amount = Number(fields.amount), price = Number(fields.price);
  if (!positive(amount)) throw new Error('Investment amount must be greater than zero.');
  if (!positive(price)) throw new Error('Fill price must be greater than zero.');
  const shares = String(fields.shares || '').trim() ? Number(fields.shares) : amount / price;
  const purchase = { date: fields.date, ticker, isin: String(fields.isin || previous?.isin || '').trim().toUpperCase(), bucket: previous?.bucket || fields.bucket, amount_usd: amount, price, shares };
  validateHoldings([...existing, purchase]);
  const now = new Date(), today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (purchase.date > today) throw new Error('The purchase date cannot be in the future.');
  return purchase;
}
const CHATGPT_PURCHASE_INSTRUCTIONS = 'Read AGENTS.md in https://github.com/EpidemikGG/invest-dashboard using my connected GitHub account. Record the completed purchase I provide in data/holdings.json. Ask together for essential missing details. Preserve current purchases, check duplicates, validate the full ledger, commit with the current file SHA, and verify the saved purchase. Give me the commit and live dashboard links. If you cannot write to GitHub, tell me it has not been saved.\n\nMy completed purchase: ';
function purchaseForm() {
  const today = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Bucharest',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const unavailable = !!state.errors.holdings || !!state.localError;
  return `<section class="purchase-panel" id="add-investment-card" aria-labelledby="purchase-heading"><div class="purchase-heading">${icon('add_circle','accent')}<div><h2 id="purchase-heading">Add an Investment</h2><p>Quick allocation on the go</p></div></div>
  <form id="purchase-form" class="purchase-form">
    <label for="form-ticker">Stock Ticker / Symbol<input id="form-ticker" name="ticker" required type="text" maxlength="30" placeholder="e.g. NVDA" autocapitalize="characters" autocomplete="off"></label>
    <label for="form-qty">Number of Shares<input id="form-qty" name="shares" required type="number" min="0.000000000001" step="any" placeholder="e.g. 25" inputmode="decimal"></label>
    <label for="form-price">Purchase Price ($)<input id="form-price" name="price" required type="number" min="0.000001" step="any" placeholder="e.g. 142.80" inputmode="decimal"></label>
    <label for="form-date">Date<input id="form-date" name="date" required type="date" value="${today}" max="${today}"></label>
    <label for="form-bucket">Bucket<select id="form-bucket" name="bucket" required><option value="">Choose core or satellite</option><option value="core">Core</option><option value="satellite">Satellite</option></select></label>
    <details class="purchase-options"><summary>Amount paid, fees & security details</summary><div class="detail-body"><label>Original amount paid (USD)<input name="amount" type="number" min="0.000001" step="any" placeholder="Optional total including fees"><small>Overrides the estimated total; must cover shares × price.</small></label><label>Fees (USD)<input name="fees" type="number" min="0" step="any" value="0"><small>Zero unless you enter fees here.</small></label><label>ISIN (optional)<input name="isin" type="text" maxlength="40" placeholder="Security identifier" autocapitalize="characters" autocomplete="off"></label></div></details>
    <div class="total-preview"><span>Estimated Total</span><output id="form-preview-total">${money(0,1)}</output></div>
    <button class="action-button primary submit-investment" type="submit" ${unavailable ? 'disabled' : ''}>${icon('check')}Add Investment</button>
  </form>
  <div class="sync-note">${icon('sync','ok')}<span>Syncs directly with your <strong>Portfolio</strong> tab on this device.</span></div>
  <p id="purchase-message" class="form-message" tabindex="-1" role="status" aria-live="polite">${esc(state.purchaseMessage || '')}</p>
  ${state.localError ? '<p class="flag">Saved purchases could not be loaded. Existing browser data has not been overwritten.</p>' : ''}
  <details class="chatgpt-purchase"><summary>Backup & sync across devices</summary><div class="detail-body"><p class="local-note">Manual entries are saved in this browser. Download a backup before clearing browser data. To sync all devices, replace data/holdings.json in GitHub with your export or ask ChatGPT to record your completed purchases.</p><button class="action-button" id="export-holdings" type="button" ${unavailable ? 'disabled' : ''}>Download holdings.json</button><label for="chatgpt-purchase-instructions">Instructions for ChatGPT</label><textarea id="chatgpt-purchase-instructions" rows="5" readonly>${esc(CHATGPT_PURCHASE_INSTRUCTIONS)}</textarea><button type="button" class="action-button" id="copy-chatgpt-purchase">Copy ChatGPT instructions</button><p class="form-message" id="chatgpt-copy-message" role="status"></p></div></details>
  ${state.pendingPurchases?.length ? `<details><summary>Local purchases (${state.pendingPurchases.length})</summary><div class="detail-body">${state.pendingPurchases.map(r => `<div class="local-purchase"><span><strong>${text(r.purchase.ticker)}</strong> · ${esc(r.purchase.date)} · ${money(r.purchase.amount_usd,state.holdings.reduce((s,h) => s+h.amount_usd,0))}</span><button class="action-button" type="button" data-remove-purchase="${esc(r.id)}" aria-label="Remove local purchase ${text(r.purchase.ticker)}">Remove</button></div>`).join('')}</div></details>` : ''}</section>`;
}
function quickPurchaseFields(fields) {
  const shares = Number(fields.shares), price = Number(fields.price), fees = Number(fields.fees || 0);
  if (!positive(shares)) throw new Error('Enter the actual number of shares purchased.');
  if (!positive(price)) throw new Error('Enter the actual purchase price per share.');
  if (!nonnegative(fees)) throw new Error('Fees must be zero or greater.');
  const total = shares*price+fees;
  const amount = String(fields.amount || '').trim() ? Number(fields.amount) : total;
  if (!positive(amount) || amount + .011 < total) throw new Error('Original amount paid must cover shares × price plus the stated fees.');
  return {...fields,amount,shares,price};
}
function updatePreviewTotal() {
  const form = $('#purchase-form');
  if (!form) return;
  try { const values = quickPurchaseFields(Object.fromEntries(new FormData(form))); $('#form-preview-total').textContent = money(values.amount,values.amount); }
  catch { $('#form-preview-total').textContent = money(0,1); }
}
function bindQuickActions() {
  document.querySelectorAll('[data-prefill-ticker]').forEach(button => button.addEventListener('click',() => {
    const form = $('#purchase-form');
    if (!form) return;
    const ticker = button.dataset.prefillTicker, previous = state.holdings?.find(p => p.ticker === ticker);
    form.elements.ticker.value = ticker;
    form.elements.bucket.value = previous?.bucket || button.dataset.prefillBucket || '';
    form.elements.isin.value = previous?.isin || button.dataset.prefillIsin || '';
    // A research snapshot is not a fill. Never invent a purchase quantity or price.
    form.elements.price.value = ''; form.elements.shares.value = ''; form.elements.amount.value = '';
    form.elements.fees.value = '0';
    $('#purchase-message').textContent = `${ticker} selected. Enter the shares and price from your actual purchase.`;
    $('#purchase-message').dataset.error = 'false';
    updatePreviewTotal();
    $('#add-investment-card').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',block:'center'});
    $('#form-qty').focus({preventScroll:true});
  }));
  document.querySelectorAll('[data-new-position]').forEach(link => link.addEventListener('click',() => {state.focusPurchase = true;}));
  $('#dismiss-sync-alert')?.addEventListener('click',() => {state.purchaseMessage = ''; $('#dynamic-sync-alert').hidden = true;});
}
function bindPurchases() {
  const form = $('#purchase-form');
  if (!form) return;
  $('#copy-chatgpt-purchase').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(CHATGPT_PURCHASE_INSTRUCTIONS); $('#chatgpt-copy-message').textContent = 'Copied. Paste into ChatGPT with GitHub connected and add your purchase details.'; }
    catch { $('#chatgpt-copy-message').textContent = 'Select and copy the instructions above, then add your purchase details in ChatGPT.'; $('#chatgpt-purchase-instructions').focus(); $('#chatgpt-purchase-instructions').select(); }
  });
  const report = error => {
    $('#purchase-message').dataset.error = 'true';
    $('#purchase-message').textContent = error.message;
  };
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (state.errors.holdings || state.localError) return;
    try {
      const fields = quickPurchaseFields(Object.fromEntries(new FormData(form)));
      const purchase = purchaseFromFields(fields, state.holdings);
      const id = crypto.randomUUID();
      persistPurchases([...state.localPurchases, { id, purchase }], localStorage);
      state.purchaseMessage = `${purchase.ticker} purchase saved on this device. Portfolio totals updated.`;
      render(); $('#purchase-message').focus();
    } catch (error) { report(error); }
  });
  ['shares','price','amount','fees'].forEach(name => form.elements[name].addEventListener('input',updatePreviewTotal));
  form.elements.ticker.addEventListener('change', () => {
    const ticker = form.elements.ticker.value.trim().toUpperCase();
    form.elements.ticker.value = ticker;
    const previous = state.holdings?.find(p => p.ticker === ticker);
    if (previous) { form.elements.bucket.value = previous.bucket; form.elements.isin.value = previous.isin; }
  });
  $('#export-holdings').addEventListener('click', () => {
    try {
      const blob = new Blob([JSON.stringify(state.holdings, null, 2) + '\n'], { type: 'application/json' });
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = 'holdings.json'; document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      $('#purchase-message').dataset.error = 'false';
      $('#purchase-message').textContent = 'Backup downloaded. For other devices, replace data/holdings.json in your repository with this file. The export contains your exact amounts and shares.';
    } catch (error) { report(error); }
  });
  document.querySelectorAll('[data-remove-purchase]').forEach(button => button.addEventListener('click', () => {
    try {
      const id = button.dataset.removePurchase;
      const removed = state.localPurchases.find(r => r.id === id);
      const next = state.localPurchases.filter(r => r.id !== id);
      persistPurchases(next, localStorage);
      state.undoPurchase = removed;
      state.purchaseMessage = 'Local purchase removed. Use Undo to restore it.';
      render();
    } catch (error) { report(error); }
  }));
  if (state.undoPurchase) {
    const undo = document.createElement('button');
    undo.type = 'button'; undo.className = 'action-button'; undo.textContent = 'Undo remove';
    undo.addEventListener('click', () => {
      try {
        persistPurchases([...state.localPurchases, state.undoPurchase], localStorage);
        state.undoPurchase = null; state.purchaseMessage = 'Purchase restored.'; render();
      } catch (error) { report(error); }
    });
    $('#purchase-message').after(undo);
  }
}

function bindSort() {
  document.querySelectorAll('.sortable').forEach(table => table.querySelectorAll('th button').forEach((button, index) => button.addEventListener('click', () => {
    const th = button.parentElement, ascending = th.getAttribute('aria-sort') !== 'ascending';
    table.querySelectorAll('th').forEach(h => h.setAttribute('aria-sort', 'none'));
    th.setAttribute('aria-sort', ascending ? 'ascending' : 'descending');
    const rows = [...table.tBodies[0].rows];
    rows.sort((a, b) => {
      const x = a.cells[index].dataset.sort, y = b.cells[index].dataset.sort;
      if (x === '' || y === '') return x === y ? 0 : x === '' ? 1 : -1;
      const delta = Number.isFinite(Number(x)) && Number.isFinite(Number(y)) ? Number(x) - Number(y) : x.localeCompare(y);
      return ascending ? delta : -delta;
    });
    rows.forEach(r => table.tBodies[0].append(r));
  })));
}
function render() {
  state.chart?.destroy(); state.chart = null;
  state.positionCharts.forEach(chart => chart.destroy()); state.positionCharts = [];
  let route = location.hash.slice(1) || 'month';
  if (['archive','framework','this-month'].includes(route)) {route='month';history.replaceState(null,'','#month');}
  const names = {month:'This Month',portfolio:'Portfolio'};
  document.title = `${names[route] || 'Page not found'} / SYNTH.QUANT`;
  document.querySelectorAll('nav a').forEach(a => {if(a.hash === `#${route}`) a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
  if (!state.config) {$('#content').innerHTML = errorBox(state.errors.config || 'Settings unavailable.');return;}
  try {
    const toast = state.purchaseMessage ? `<div id="dynamic-sync-alert" class="sync-alert" role="status">${icon('check_circle','accent')}<span>${text(state.purchaseMessage)}</span><button type="button" id="dismiss-sync-alert" aria-label="Dismiss notification">${icon('close')}</button></div>` : '';
    const body = route === 'month' ? monthPage() : route === 'portfolio' ? portfolioPage() : panel('Page not found','<p>Choose This Month or Portfolio above.</p>');
    $('#content').innerHTML = toast + body;
    bindPortfolioManagement();bindSort();bindPurchases();bindResearch();bindStockSelect();bindQuickActions();drawChart();drawPositionCharts();
    // Charts hidden in a details section resize once their canvas becomes visible.
    document.querySelectorAll('.portfolio-details').forEach(detail => detail.addEventListener('toggle',() => { if(detail.open) {state.chart?.resize();state.positionCharts.forEach(chart => chart.resize());} }));
    if (route === 'month' && state.focusPurchase) {state.focusPurchase=false;$('#form-ticker')?.focus();}
  } catch(e) {$('#content').innerHTML=errorBox(e);}
}
async function start() {
  $('.skip').addEventListener('click', event => { event.preventDefault(); $('#content').focus(); });
  const keys = Object.keys(FILES);
  const results = await Promise.allSettled(keys.map(k => read(FILES[k])));
  results.forEach((r, i) => {
    const key = keys[i];
    if (r.status === 'rejected') { state.errors[key] = r.reason; return; }
    try { state[key] = key === 'config' ? validateConfig(r.value) : key === 'holdings' ? validateHoldings(r.value) : key === 'prices' ? validatePrices(r.value) : key === 'quotes' ? validateQuotes(r.value) : key === 'preview' ? validatePreview(r.value) : key === 'index' ? assertValid(r.value, { entries: [v => typeof v === 'string' && /^entries\/[A-Za-z0-9_-]+\.json$/.test(v)] }, FILES.index) : r.value; }
    catch (e) { state.errors[key] = e; }
  });
  state.publishedHoldings = state.holdings || [];
  try { const raw = localStorage.getItem(OVERRIDE_KEY); state.overrides = raw ? JSON.parse(raw) : {}; if (!object(state.overrides)) throw new Error('Invalid portfolio changes'); } catch(error) {state.localError=error; state.overrides={};}
  try { state.localPurchases = loadLocalPurchases(localStorage); refreshHoldings(); }
  catch (error) { state.localError = error; }
  try {
    const rawCash = localStorage.getItem(CASH_KEY);
    if (rawCash !== null) { const cash = JSON.parse(rawCash); if (!nonnegative(cash)) throw new Error('Invalid saved cash balance.'); state.cashBalance = cash; }
  } catch (error) { state.cashError = error; }
  if (state.index && !state.errors.index) {
    if (new Set(state.index.entries).size !== state.index.entries.length) state.errors.index = new Error(`${FILES.index}: duplicate entry paths.`);
    else state.entries = await Promise.all(state.index.entries.map(async path => {
      try { return { path, data: assertValid(await read(`./data/${path}`), entrySchema, `./data/${path}`) }; }
      catch (error) { return { path, error }; }
    }));
  }
  render();
  window.addEventListener('hashchange', render);
  setInterval(async () => {
    if (document.hidden || location.hash !== '#portfolio' || state.editTicker || document.activeElement?.closest('form')) return;
    try {state.quotes=validateQuotes(await read(FILES.quotes));delete state.errors.quotes;render();} catch(error) {state.errors.quotes=error;render();}
  }, 300000);
}
if (typeof document !== 'undefined') start().catch(e => { $('#content').innerHTML = errorBox(e); });
// Enables deterministic arithmetic/validation tests without adding browser dependencies.
if (typeof module !== 'undefined') module.exports = { validate, entrySchema, performance, validateHoldings, validatePrices, validateConfig, currentMonth, monthPurchases, accountSummary, researchExtras, sentiment, positionHistory, mergePurchases, purchaseFromFields, loadLocalPurchases, quickPurchaseFields, validatePreview, applyOverrides, validateQuotes, quoteFor, quotedAccount, accountPnlData, state };


// Current market quote snapshots are separate from historical closes and purchase fills.
const OVERRIDE_KEY = 'invest-dashboard.overrides.v1';
function validateQuotes(value) {
  if (!object(value) || !object(value.quotes)) throw new Error('Invalid quote snapshot.');
  for (const [ticker,q] of Object.entries(value.quotes)) {
    if (!object(q) || !positive(q.price) || q.currency !== 'USD' || !['Stocktwits','Twelve Data'].includes(q.source) || !Number.isFinite(Date.parse(q.price_time)) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(q.price_time)) throw new Error(`Invalid USD quote for ${ticker}.`);
  }
  return value;
}
function quoteFor(ticker, lots = []) {
  const q = state.quotes?.quotes?.[ticker];
  if (!q || Date.parse(q.price_time) > Date.now()+300000) return null;
  const quoteDate = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Bucharest',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(q.price_time));
  if (lots.some(h => h.date > quoteDate)) return null;
  return q;
}
function quoteLabel(q) {
  const age = Date.now()-Date.parse(q.price_time);
  return `${age > 7200000 ? 'Older quote · ' : ''}${esc(q.source)} · ${esc(new Date(q.price_time).toLocaleString())}`;
}
function quotedAccount(holdings, prices, cash = 0) {
  const base = accountSummary(holdings, prices, cash);
  if (!holdings.length || !holdings.every(h => quoteFor(h.ticker, [h]))) return base;
  const values = holdings.map(h => h.shares * quoteFor(h.ticker,[h]).price);
  const value = values.reduce((a,b)=>a+b,0);
  return {...base, values, investmentsValue:value, balance:value+cash, gain:value-base.invested, valuedAt:'Current quotes (individual timestamps below)'};
}
function lotKeys(rows) {
  const counts = new Map();
  return rows.map(h => {
    const key = h.id ? `id:${h.id}` : `lot:${purchaseKey(h)}`;
    const n = counts.get(key)||0; counts.set(key,n+1);
    return `${key}:${n}`;
  });
}
function applyOverrides(rows, overrides) {
  if (!object(overrides)) throw new Error('Invalid portfolio changes.');
  const keys = lotKeys(rows);
  return validateHoldings(rows.flatMap((h,i) => {
    if (!Object.hasOwn(overrides,keys[i])) return [h];
    return overrides[keys[i]] === null ? [] : [overrides[keys[i]]];
  }));
}
function baseLots() {return mergePurchases(state.publishedHoldings,state.localPurchases).holdings;}
function saveOverrides(next) {
  applyOverrides(baseLots(),next);
  localStorage.setItem(OVERRIDE_KEY,JSON.stringify(next));
  state.undoOverrides = state.overrides || {};
  state.overrides=next; refreshHoldings();
}
function quoteStatus() {
  const missing = [...new Set(state.holdings.map(h=>h.ticker))].filter(t=>!quoteFor(t,state.holdings.filter(h=>h.ticker===t)));
  return panel('Market prices', `<p class="meta">Twelve Data snapshots refresh hourly through GitHub Actions. Quotes may be delayed depending on your plan; each price shows its provider timestamp. Historical charts use separately saved closing prices. Quotes may be delayed; each price shows its provider timestamp. Historical charts use separately saved closing prices.</p>${missing.length ? `<p class="flag">No usable Twelve Data USD quote: ${text(missing.join(', '))}. A complete current account value is unavailable; totals use dated closes or recorded cost as labelled.</p>` : ''}${state.errors.quotes ? '<p class="flag">Price feed unavailable. Previous historical records remain available.</p>' : ''}<button class="action-button" id="refresh-quotes">Reload latest snapshot</button><p id="quotes-message" role="status">${text(state.quoteMessage||'')}</p>`);
}
function positionEditor(ticker) {
  const keys=lotKeys(baseLots());
  const rows=baseLots().map((h,i)=>({key:keys[i],lot:Object.hasOwn(state.overrides||{},keys[i]) ? state.overrides[keys[i]] : h})).filter(r=>r.lot && r.lot.ticker===ticker);
  return `<div class="inline-editor" id="position-editor-${esc(ticker)}"><div class="editor-toolbar"><h3>Modify ${text(ticker)}</h3><button type="button" class="action-button" data-close-editor>Close</button></div><p class="meta">Close or Cancel discards unsaved changes.</p><p class="form-message" data-editor-message role="status"></p>${rows.map(({key,lot:h})=>`<form class="lot-editor purchase-form" data-edit-lot="${esc(key)}"><h3>${text(h.ticker)} · purchase ${esc(h.date)}</h3><label>Ticker<input name="ticker" required value="${esc(h.ticker)}" pattern="[A-Za-z0-9.=_^:-]{1,30}"></label><label>Date<input name="date" type="date" required value="${esc(h.date)}"></label><label>Shares<input name="shares" type="number" step="any" min="0.000000000001" required value="${h.shares}"></label><label>Original total paid (USD, including fees)<input name="amount_usd" type="number" step="any" min="0.000000000001" required value="${h.amount_usd}"></label><label>Recorded purchase price per share (USD)<input name="price" type="number" step="any" min="0.000000000001" required value="${h.price}"><small>${h.price_basis==='average_cost_per_reported_share' ? 'Currently an effective average cost, not a verified execution fill.' : 'Enter your actual execution price.'} Current market quotes never overwrite this field.</small></label><label>Bucket<select name="bucket"><option value="core" ${h.bucket==='core'?'selected':''}>Core</option><option value="satellite" ${h.bucket==='satellite'?'selected':''}>Satellite</option></select></label><button class="action-button primary" type="submit">Save purchase changes</button><button class="action-button" type="button" data-close-editor>Cancel</button><button class="action-button danger" type="button" data-remove-lot="${esc(key)}">Remove this purchase</button></form>`).join('')}</div>`;
}
function managementPanel() {
  return panel('Manage portfolio', `<p class="meta">Edits and removals save on this device. Export the updated ledger to sync it through GitHub.</p><div class="form-actions"><button class="action-button" id="portfolio-export">Export updated holdings</button><button class="action-button" id="portfolio-undo" ${state.undoOverrides ? '' : 'disabled'}>Undo last change</button><button class="action-button" id="portfolio-reset" ${Object.keys(state.overrides||{}).length ? '' : 'disabled'}>Restore published records</button></div><p class="form-message" id="portfolio-message" role="status">${text(state.managementMessage||'')}</p>${state.localError ? '<p class="flag">Saved browser records could not be loaded. Management is disabled to preserve your data.</p>' : ''}`);
}
function bindPortfolioManagement() {
  const report=e=>{const el=$('[data-editor-message]') || $('#portfolio-message');if(el) el.textContent=e.message;};
  document.querySelectorAll('[data-close-editor]').forEach(button=>button.addEventListener('click',()=>{const ticker=state.editTicker;state.editTicker=null;render();focusStockList(ticker);}));
  const protect=fn=>()=>{try {if(state.localError) throw new Error('Resolve unreadable browser records before editing.'); fn();}catch(e){report(e);}};
  document.querySelectorAll('[data-manage-position]').forEach(b=>b.addEventListener('click',()=>{const ticker=b.dataset.managePosition;state.editTicker=state.editTicker===ticker?null:ticker;render();if(state.editTicker) $('.lot-editor input')?.focus();else focusStockList(ticker);}));
  document.querySelectorAll('[data-remove-position]').forEach(b=>b.addEventListener('click',protect(()=>{
    const ticker=b.dataset.removePosition;
    const next={...(state.overrides||{})}, lots=baseLots(), keys=lotKeys(lots);
    lots.forEach((h,i)=>{const current=Object.hasOwn(next,keys[i])?next[keys[i]]:h;if(current?.ticker===ticker) next[keys[i]]=null;});
    saveOverrides(next);state.editTicker=null;state.managementMessage=`${ticker} removed on this device. Undo is available.`;render();
  })));
  document.querySelectorAll('[data-remove-lot]').forEach(b=>b.addEventListener('click',protect(()=>{const ticker=state.editTicker;saveOverrides({...state.overrides,[b.dataset.removeLot]:null});state.editTicker=null;state.managementMessage='Purchase removed on this device.';render();focusStockList(ticker);})));
  document.querySelectorAll('[data-edit-lot]').forEach(form=>form.addEventListener('submit',event=>{
    event.preventDefault();
    protect(()=>{
      const key=form.dataset.editLot,lots=baseLots(),old=lots[lotKeys(lots).indexOf(key)],current=state.overrides?.[key]||old;
      const fields=Object.fromEntries(new FormData(form)),ticker=fields.ticker.trim().toUpperCase();
      if(!/^[A-Z0-9][A-Z0-9.=_^:-]{0,29}$/.test(ticker)) throw new Error('Enter a valid ticker.');
      const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Bucharest',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
      if(!date(fields.date)||fields.date>today) throw new Error('Enter a valid purchase date, not in the future.');
      const updated={...current,...fields,ticker,shares:Number(fields.shares),price:Number(fields.price),amount_usd:Number(fields.amount_usd)};
      if(ticker!==current.ticker) updated.isin='';
      if(updated.price!==current.price){updated.price_basis='user_reported_execution';updated.execution_price_usd=updated.price;updated.fees_usd=null;}
      saveOverrides({...state.overrides,[key]:updated});state.editTicker=null;state.managementMessage='Purchase updated on this device. Export to sync across devices.';render();focusStockList(ticker);
    })();
  }));
  $('#portfolio-undo')?.addEventListener('click',protect(()=>{const previous=state.undoOverrides;saveOverrides(previous);state.undoOverrides=null;state.managementMessage='Last change undone.';render();}));
  $('#portfolio-reset')?.addEventListener('click',protect(()=>{saveOverrides({});state.managementMessage='Published records restored. Local additions are retained.';render();}));
  $('#portfolio-export')?.addEventListener('click',protect(()=>{const blob=new Blob([JSON.stringify(state.holdings,null,2)+'\n'],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='holdings.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}));
  $('#refresh-quotes')?.addEventListener('click',async()=>{
    const button=$('#refresh-quotes');button.disabled=true;
    try {state.quotes=validateQuotes(await read(FILES.quotes));delete state.errors.quotes;state.quoteMessage='Latest published snapshot loaded. Provider timestamps are shown below.';render();}
    catch(e){state.quoteMessage='Unable to reload prices. Try again shortly.';render();}
  });
}

function focusStockList(ticker) {
  const button=[...document.querySelectorAll('[data-manage-position]')].find(b=>b.dataset.managePosition===ticker);
  const target=button || $('#holdings-table') || $('#page-title');
  if (!target) return;
  if (!button) target.setAttribute('tabindex','-1');
  target.scrollIntoView?.({block:'center',behavior:'auto'});
  target.focus({preventScroll:true});
}
function positionGainGraphic(position) {
  if (!position.latest || !positive(position.invested)) return '<span class="position-gain unavailable">Awaiting market price</span>';
  const gain=position.latest.value-position.invested, percent=gain/position.invested*100;
  const sign=gain>0?'+':'', direction=gain<0?'loss':'profit';
  // A diverging bar compares current value to original outlay, not an invented price history.
  const extent=Math.min(54,Math.abs(percent)/Math.max(10,Math.abs(percent))*54);
  const x=percent<0?60-extent:60;
  const label=`${position.ticker}: ${sign}${percent.toFixed(2)}% ${gain<0?'loss':'gain'} on invested amount`;
  return `<span class="position-gain ${direction}"><svg viewBox="0 0 120 24" width="120" height="24" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title><path d="M6 12H114" stroke="currentColor" opacity=".18" stroke-width="6" stroke-linecap="round"/><path d="M60 3V21" stroke="currentColor" opacity=".6"/><rect x="${x.toFixed(3)}" y="8" width="${extent.toFixed(3)}" height="8" rx="3" fill="currentColor"/><circle cx="${(percent<0?x:x+extent).toFixed(3)}" cy="12" r="3" fill="currentColor"/></svg><span class="gain-copy"><strong>${sign}${pct(percent)}</strong>${privateMode()?'':`<small>${sign}${money(gain)}</small>`}<small>Return on invested amount</small></span></span>`;
}

// P&L uses actual purchase outlay; contributions and cash are not investment profit.
function accountPnlData(holdings, prices) {
  const positions=positionHistory(holdings,prices);
  const contributions=positions.map(p=>{
    const q=quoteFor(p.ticker,p.lots), shares=p.lots.reduce((sum,h)=>sum+h.shares,0);
    const valuation=q?{value:shares*q.price,date:q.price_time}:p.latest;
    return {ticker:p.ticker,gain:valuation?valuation.value-p.invested:null,date:valuation?.date||null};
  });
  const dates=[...new Set(Object.values(prices?.prices||{}).flatMap(rows=>rows.map(r=>r.date)))].filter(d=>d<=prices.asOf).sort();
  const maps=new Map(Object.entries(prices?.prices||{}).map(([ticker,rows])=>[ticker,new Map(rows.map(r=>[r.date,r.close]))]));
  const history=dates.flatMap(d=>{
    const active=holdings.filter(h=>h.date<=d);
    if(!active.length) return [];
    if(active.some(h=>!maps.get(h.ticker)?.has(d))) return [{date:d,gain:null}];
    return [{date:d,gain:active.reduce((sum,h)=>sum+h.shares*maps.get(h.ticker).get(d)-h.amount_usd,0)}];
  });
  return {contributions,history,complete:contributions.length>0 && contributions.every(p=>number(p.gain))};
}
function accountPnlGraphic(holdings, prices) {
  const data=accountPnlData(holdings,prices);
  const totalCost=holdings.reduce((sum,h)=>sum+h.amount_usd,0);
  const known=data.contributions.filter(p=>number(p.gain)), missing=data.contributions.filter(p=>!number(p.gain));
  const gain=known.reduce((sum,p)=>sum+p.gain,0);
  const value=v=>privateMode()?(totalCost?pct(v/totalCost*100):'—'):money(v);
  const sign=v=>v>0?'+':'';
  const label=data.complete?'Account P&L':'Known P&L · incomplete';
  const validHistory=data.history.filter(r=>number(r.gain));
  let graph='';
  if(validHistory.length>=2){
    const width=360,height=125,pad=12,max=Math.max(...validHistory.map(r=>Math.abs(r.gain)),.01);
    const y=v=>height/2-v/max*(height/2-pad), minDate=Date.parse(data.history[0].date),range=Math.max(1,Date.parse(data.history.at(-1).date)-minDate);
    const x=d=>pad+(Date.parse(d)-minDate)/range*(width-pad*2);
    let drawing=false;
    const path=data.history.map(r=>{if(!number(r.gain)){drawing=false;return '';}const point=`${drawing?'L':'M'}${x(r.date).toFixed(2)},${y(r.gain).toFixed(2)}`;drawing=true;return point;}).join(' ');
    const last=validHistory.at(-1);
    graph=`<svg class="account-pnl-svg pnl-history" viewBox="0 0 ${width} ${height}" role="img" aria-label="Account unrealized profit and loss over recorded closing-price dates"><title>Account P&L history. Missing prices remain gaps.</title><path d="M12 ${height/2}H348" stroke="currentColor" opacity=".3" stroke-dasharray="4 4"/><path d="${path}" fill="none" stroke="${last.gain<0?'#ffb4ab':'#4edea3'}" stroke-width="2.5"/><circle cx="${x(last.date)}" cy="${y(last.gain)}" r="3" fill="currentColor"/></svg><div class="pnl-dates"><span>${esc(data.history[0].date)}</span><span>${esc(data.history.at(-1).date)}</span></div><p class="pnl-note">Historical unrealized P&L · zero line = break-even. Missing prices leave gaps.</p>`;
  }else if(data.contributions.length){
    const height=28*data.contributions.length+20,max=Math.max(...known.map(p=>Math.abs(p.gain)),.01);
    graph=`<svg class="account-pnl-svg pnl-contributions" viewBox="0 0 360 ${height}" role="img" aria-label="Unrealized profit and loss by stock; unknown prices are labelled unavailable"><title>Stock contributions to account P&L. Center line is zero.</title><path d="M190 4V${height-8}" stroke="currentColor" opacity=".35"/>${data.contributions.map((p,i)=>{
      const y=16+i*28, extent=number(p.gain)?Math.abs(p.gain)/max*88:0,x=p.gain<0?190-extent:190;
      return `<text x="2" y="${y+4}" fill="currentColor" font-size="11">${text(p.ticker)}</text>${number(p.gain)?`<rect x="${x}" y="${y-6}" width="${extent}" height="11" rx="3" fill="${p.gain<0?'#ffb4ab':'#4edea3'}"/><text x="355" y="${y+4}" text-anchor="end" fill="currentColor" font-size="10">${esc(sign(p.gain)+value(p.gain))}</text>`:`<text x="355" y="${y+4}" text-anchor="end" fill="currentColor" font-size="10">N/A</text>`}`;
    }).join('')}</svg><p class="pnl-note">P&L by stock · latest available prices. The center line is break-even.</p>`;
  }else graph='<p class="pnl-note">Add investments to see account P&L.</p>';
  return `<div class="account-pnl"><div class="pnl-heading"><span>${label}</span><strong class="${gain<0?'flag':'ok'}">${known.length?esc(sign(gain)+value(gain)):'—'}</strong></div>${graph}${missing.length?`<p class="pnl-note flag">Excludes ${text(missing.map(p=>p.ticker).join(', '))}: market prices unavailable. Full account P&L cannot be calculated.</p>`:''}<p class="pnl-note">Unrealized investment P&L; excludes cash, dividends and sales.</p></div>`;
}
