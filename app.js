'use strict';

// All fetched JSON is local to ./data/. Personal purchase additions use browser storage.
const FILES = { config: './data/config.json', index: './data/index.json', holdings: './data/holdings.json', prices: './data/prices.json' };
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
    if (days > 7) notes.push(`Price snapshot is ${days} days old (${state.prices.asOf}). This site never fetches live prices.`);
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
  return panel(title, `<div class="scroll"><table><thead><tr>${['Date', 'Ticker', 'Bucket', privateMode() ? 'Contribution %' : 'Invested (USD)', ...(!privateMode() ? ['Fill price (USD)', 'Shares'] : []), ...(values ? [privateMode() ? 'Value %' : 'Value / cost (USD)'] : [])].map(label => `<th scope="col">${esc(label)}</th>`).join('')}</tr></thead><tbody>${holdings.map((h, i) => `<tr><td>${esc(h.date)}</td><td>${text(h.ticker)}</td><td>${esc(h.bucket)}</td><td>${money(h.amount_usd, total)}</td>${!privateMode() ? `<td>${fmt(h.price)}</td><td>${fmt(h.shares)}</td>` : ''}${values ? `<td>${money(values[i], total)}</td>` : ''}</tr>`).join('')}</tbody></table></div>`);
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
function researchCard(pick, budget) {
  const grade = sentiment(pick.sentiment_score);
  const scored = grade.className !== 'unscored';
  return `<article class="research-card"><div class="section-head"><div><h3 class="stock-symbol">${text(pick.ticker)}</h3><p>${text(pick.name)} · ${text(pick.exchange)}</p></div>${tag(`${pick.risk} risk`)}</div><div class="research-numbers"><div><span class="kpi-label">Share price at research</span><strong class="num">${researchPrice(pick)}</strong><small>As of ${esc(pick.price_date)}</small></div><div><span class="kpi-label">Buy sentiment</span><strong class="sentiment ${grade.className}">${grade.label}</strong><span class="sentiment-score num">${scored ? `${pick.sentiment_score} / 100` : '— / 100'}</span></div></div>${scored ? `<meter min="0" max="100" value="${pick.sentiment_score}" aria-label="${text(pick.ticker)} research sentiment score">${pick.sentiment_score}</meter>` : '<p class="meta">This research did not include a sentiment score.</p>'}${pick.sentiment_reason ? paragraph(pick.sentiment_reason) : ''}<div class="research-tags">${tag(`${pick.confidence} confidence`)}${tag(pick.bucket)}${tag(`${pick.sources.length} sources`)}</div><h4>Investment case</h4>${paragraph(pick.thesis)}<h4>Biggest risk</h4>${paragraph(pick.bear_case)}<div class="check-row"><span>Proposed allocation</span><strong class="num">${money(pick.amount_usd, budget)}</strong></div>${pickDetails(pick, budget)}</article>`;
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
      if (next !== undefined) { event.preventDefault(); select(tabs[next]); }
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
  return panel('Stock performance', table + (hasPrices ? `<h3>Return by stock (%)</h3><p class="meta">Cumulative gain divided by cash invested to each date. Dates without quotes remain gaps.</p><div class="chart-wrap"><canvas id="stock-returns-chart" role="img" aria-label="Return on actual purchases for each stock"></canvas></div><p id="stock-returns-note" class="meta"></p>` : empty('No dated prices are available yet. Add each holding’s price history to see real performance; purchase prices alone are not treated as market quotes.')) + `<div class="section-head stock-history-head"><h3>Stock price history</h3><label>Stock <select id="stock-select" aria-label="Stock price history">${positions.map(p => `<option value="${esc(p.ticker)}" ${p.ticker === selected.ticker ? 'selected' : ''}>${text(p.ticker)}</option>`).join('')}</select></label></div>${selected.rows.length ? `<div class="chart-wrap"><canvas id="stock-price-chart" role="img" aria-label="${text(selected.ticker)} closing prices and your fill prices"></canvas></div><p id="stock-price-note" class="meta">USD prices. Points mark your actual fills.</p><details><summary>${text(selected.ticker)} / exact history</summary><div class="detail-body scroll"><table><thead><tr><th>Date</th><th>Close (USD)</th><th>Value</th><th>Return</th></tr></thead><tbody>${selected.rows.map(r => `<tr><td>${r.date}</td><td>${privateMode() ? 'Hidden' : fmt(r.close)}</td><td>${money(r.value, r.cost)}</td><td>${pct(r.returnPct)}</td></tr>`).join('')}</tbody></table></div></details>` : empty(`No price history is available for ${selected.ticker}.`)}`);
}
function drawPositionCharts() {
  const positions = positionHistory(state.holdings || [], state.errors.prices ? null : state.prices);
  const returnsCanvas = $('#stock-returns-chart'), priceCanvas = $('#stock-price-chart');
  if (!returnsCanvas && !priceCanvas) return;
  if (!window.Chart) { if ($('#stock-returns-note')) $('#stock-returns-note').textContent = 'Chart.js could not load. The stock table remains available.'; if ($('#stock-price-note')) $('#stock-price-note').textContent = 'Chart.js could not load. The exact history table remains available.'; return; }
  const css = getComputedStyle(document.documentElement), ink = css.getPropertyValue('--muted').trim(), grid = css.getPropertyValue('--border').trim();
  const colors = [css.getPropertyValue('--accent').trim(), '#51a98a', '#638fda', '#b587c4', '#c19442', '#39a4ac', '#c87290', '#799342', '#8d83db', '#d48b56'];
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
    state.positionCharts.push(new Chart(priceCanvas, { type: 'line', data: { labels: dates, datasets: [{ label: privateMode() ? `${p.ticker} price change (%)` : `${p.ticker} close (USD)`, data: dates.map(d => closes.has(d) ? scale(closes.get(d)) : null), borderColor: colors[0], borderWidth: 2, pointRadius: 2, spanGaps: false }, { label: 'Your fills', data: p.lots.map(lot => ({ x: lot.date, y: scale(lot.price) })), showLine: false, pointRadius: 5, pointBackgroundColor: colors[1], borderColor: colors[1] }] }, options: options('USD') }));
  }
}
function bindStockSelect() {
  $('#stock-select')?.addEventListener('change', event => { state.selectedStock = event.target.value; render(); $('#stock-select')?.focus(); });
}

function monthPage() {
  const month = currentMonth();
  const issue = state.entries.find(e => e.data?.month === month || e.error && e.path === `entries/${month}.json`);
  const entry = issue?.data;
  const holdings = monthPurchases(state.holdings || [], month);
  const invested = holdings.reduce((sum, h) => sum + h.amount_usd, 0);
  const budget = entry?.budget_usd ?? state.config.budget_usd_per_month;
  const core = holdings.filter(h => h.bucket === 'core').reduce((sum, h) => sum + h.amount_usd, 0);
  const satellite = invested - core;
  const difference = budget - invested;
  const summary = tiles([
    ['Invested this month', money(invested, budget), month],
    ['Monthly budget', money(budget, budget), 'Plan for this calendar month'],
    [difference >= 0 ? 'Budget remaining' : 'Above budget', money(Math.abs(difference), budget), 'Based on recorded purchases'],
    ['Purchases this month', holdings.length, 'Current calendar month only'],
    ['Positions added to', new Set(holdings.map(h => h.ticker)).size, 'Tickers bought this month']
  ]);
  const research = state.errors.index ? errorBox(state.errors.index) : issue?.error ? errorBox(issue.error) : researchPanel(entry, month);
  return `<p class="period-label">${esc(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', month: 'long', year: 'numeric' }).format(new Date()))} · current month</p>` + (state.errors.holdings ? errorBox(state.errors.holdings) + research : summary + research + panel('This month’s allocation', allocationBar(core, satellite, 'Purchases this month · core / satellite')) + purchaseLedger(holdings, 'This month’s purchases'));
}

function portfolioPage() {
  if (state.errors.holdings) return errorBox(state.errors.holdings);
  const h = state.holdings;
  const account = accountSummary(h, state.errors.prices ? null : state.prices, state.cashBalance);
  let result = null, comparisonNote = '';
  if (!state.config.benchmark.ticker.includes('[')) {
    try { result = getPerformance(); } catch (error) { comparisonNote = errorBox(error); }
  }
  const p = result?.latest;
  let core = 0, satellite = 0;
  h.forEach((lot, i) => { if (lot.bucket === 'core') core += account.values[i]; else satellite += account.values[i]; });
  const total = core + satellite;
  const actual = total ? satellite / total * 100 : null;
  const limits = [];
  if (new Set(h.map(r => r.ticker)).size > state.config.limits.max_positions) limits.push('Position count exceeds the configured maximum.');
  if (actual !== null && actual > state.config.limits.max_satellite_pct_of_portfolio) limits.push('Satellite weight exceeds the portfolio limit.');
  const allocation = allocationBar(state.config.split.core_pct, state.config.split.satellite_pct, 'Target · core / satellite') + allocationBar(core, satellite, account.valuedAt ? 'All investments · market value' : 'All investments · recorded cost') + `<p class="meta">Cash is excluded from the investment split.${actual === null ? '' : ` Satellite drift: ${(actual - state.config.split.satellite_pct).toFixed(2)} percentage points.`}</p>`;
  const chart = p ? `<p class="meta">${privateMode() ? 'Cumulative gain / contributed capital (%)' : 'Market value (USD)'} · all purchase dates</p><div class="chart-wrap"><canvas id="performance-chart" role="img" aria-label="All recorded investments versus benchmark. Values are in the performance table below."></canvas></div><p id="chart-note" class="meta"></p>` : empty('The benchmark chart will appear when a benchmark and matching price history are available. Your full recorded account balance is shown above.');
  return `<p class="period-label">Entire account · all dates</p>` + accountTiles(account, h) + (state.errors.prices ? errorBox(state.errors.prices) : '') + limits.map(n => `<div class="notice">${text(n)}</div>`).join('') + `<div class="grid">${panel('Portfolio / benchmark', chart + comparisonNote)}${panel('Investment allocation', allocation)}</div>` + positionsPanel() + purchaseLedger(h, 'All purchases', account.values) + (p ? panel('Performance / all dates', `<p class="meta">Comparison as of ${esc(p.date)}. Cash is excluded from investment returns.</p><details><summary>View performance table</summary><div class="detail-body scroll"><table><thead><tr><th>Date</th><th>Purchases return</th><th>Benchmark return</th><th>Difference (pp)</th></tr></thead><tbody>${result.rows.map(r => r.gap ? `<tr><td>${r.date}</td><td colspan="3">Incomplete prices</td></tr>` : `<tr><td>${r.date}</td><td>${pct(r.portfolioReturn)}</td><td>${pct(r.benchmarkReturn)}</td><td>${(r.portfolioReturn - r.benchmarkReturn).toFixed(2)}</td></tr>`).join('')}</tbody></table></div></details>`) : '');
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
  state.holdings = validateHoldings(merged.holdings);
  state.pendingPurchases = merged.pending;
}
function persistPurchases(rows, storage) {
  // Write before changing in-memory totals so a storage failure cannot look saved.
  validateHoldings(mergePurchases(state.publishedHoldings, rows).holdings);
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
  const now = new Date(), today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const unavailable = !!state.errors.holdings || !!state.localError;
  return `<section class="panel purchase-panel" aria-labelledby="purchase-heading"><div class="section-head"><div><h2 id="purchase-heading">Add an investment</h2><p>Log an actual purchase to update your portfolio.</p></div>${tag('SAVED ON THIS DEVICE')}</div>
    <details class="chatgpt-purchase"><summary>Add with ChatGPT · sync across devices</summary><div class="detail-body"><p>Tell ChatGPT what you bought and ask it to record the purchase using your GitHub connection. Include the ticker, date, amount, fill price or shares, fees and bucket. It will ask for missing details.</p><p class="local-note">Purchases recorded through GitHub are saved to this dashboard for all your devices. The ledger is public. The manual form below saves only in this browser.</p><label for="chatgpt-purchase-instructions">Instructions to paste into ChatGPT</label><textarea id="chatgpt-purchase-instructions" rows="5" readonly>${esc(CHATGPT_PURCHASE_INSTRUCTIONS)}</textarea><button type="button" class="action-button" id="copy-chatgpt-purchase">Copy ChatGPT instructions</button><p class="form-message" id="chatgpt-copy-message" role="status" aria-live="polite"></p></div></details>
    <form id="purchase-form" class="purchase-form">
      <label class="amount-field">Investment amount (USD)<input name="amount" type="number" min="0.000001" step="any" inputmode="decimal" required placeholder="300.00"><small>Total paid, including fees.</small></label>
      <label>Ticker<input name="ticker" type="text" maxlength="30" required placeholder="e.g. MSFT" autocapitalize="characters" autocomplete="off"></label>
      <label>Purchase date<input name="date" type="date" value="${today}" max="${today}" required></label>
      <label>Bucket<select name="bucket"><option value="core">Core</option><option value="satellite">Satellite</option></select></label>
      <label>Fill price per share (USD)<input name="price" type="number" min="0.000001" step="any" inputmode="decimal" required placeholder="Price you paid"></label>
      <label>Actual shares (optional)<input name="shares" type="number" min="0.000000000001" step="any" inputmode="decimal" placeholder="Calculated if blank"><small>Leave blank to use amount ÷ price, assuming no fees.</small></label>
      <label>ISIN (optional)<input name="isin" type="text" maxlength="40" placeholder="Security identifier" autocapitalize="characters" autocomplete="off"></label>
      <div class="form-actions"><button class="action-button primary" type="submit" ${unavailable ? 'disabled' : ''}>Add investment</button></div>
    </form>
    <p class="local-note">Purchases are saved in this browser and update your dashboard immediately. They do not sync across devices. Download a backup before clearing browser data.</p>
    <div class="form-actions"><button class="action-button" id="export-holdings" type="button" ${unavailable ? 'disabled' : ''}>Download holdings.json</button></div>
    <p id="purchase-message" class="form-message" tabindex="-1" role="status" aria-live="polite">${esc(state.purchaseMessage || '')}</p>
    ${state.localError ? '<p class="flag">Saved purchases could not be loaded. Browser storage may be unavailable or contain invalid data. Existing saved data has not been overwritten.</p>' : ''}
    ${state.pendingPurchases?.length ? `<details><summary>Purchases saved on this device (${state.pendingPurchases.length})</summary><div class="detail-body">${state.pendingPurchases.map(r => `<div class="local-purchase"><span><strong>${text(r.purchase.ticker)}</strong> · ${esc(r.purchase.date)} · ${money(r.purchase.amount_usd, state.holdings.reduce((s, h) => s + h.amount_usd, 0))}</span><button class="action-button" type="button" data-remove-purchase="${esc(r.id)}" aria-label="Remove local purchase ${text(r.purchase.ticker)} dated ${esc(r.purchase.date)}">Remove</button></div>`).join('')}</div></details>` : ''}
  </section>`;
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
      const fields = Object.fromEntries(new FormData(form));
      const purchase = purchaseFromFields(fields, state.holdings);
      const id = crypto.randomUUID();
      persistPurchases([...state.localPurchases, { id, purchase }], localStorage);
      state.purchaseMessage = `${purchase.ticker} purchase saved on this device. Portfolio totals updated.`;
      render(); $('#purchase-message').focus();
    } catch (error) { report(error); }
  });
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
  if (['archive', 'framework'].includes(route)) { route = 'month'; history.replaceState(null, '', '#month'); }
  const names = { month: 'This month', portfolio: 'Portfolio' };
  $('#page-title').textContent = names[route] || 'Page not found';
  document.title = `${names[route] || 'Page not found'} / Invest`;
  document.querySelectorAll('nav a').forEach(a => { if (a.hash === `#${route}`) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  if (!state.config) { $('#content').innerHTML = errorBox(state.errors.config || 'Settings unavailable.'); return; }
  try {
    setupNotices();
    let body;
    if (route === 'month') body = monthPage();
    else if (route === 'portfolio') body = portfolioPage();
    else body = panel('Page not found', '<p>Choose a page in the navigation.</p>');
    $('#content').innerHTML = body + (route === 'month' ? purchaseForm() : ''); bindSort(); bindPurchases(); bindResearch(); bindStockSelect(); drawChart(); drawPositionCharts();
  } catch (e) { $('#content').innerHTML = errorBox(e); }
}
async function start() {
  $('.skip').addEventListener('click', event => { event.preventDefault(); $('#content').focus(); });
  const keys = Object.keys(FILES);
  const results = await Promise.allSettled(keys.map(k => read(FILES[k])));
  results.forEach((r, i) => {
    const key = keys[i];
    if (r.status === 'rejected') { state.errors[key] = r.reason; return; }
    try { state[key] = key === 'config' ? validateConfig(r.value) : key === 'holdings' ? validateHoldings(r.value) : key === 'prices' ? validatePrices(r.value) : key === 'index' ? assertValid(r.value, { entries: [v => typeof v === 'string' && /^entries\/[A-Za-z0-9_-]+\.json$/.test(v)] }, FILES.index) : r.value; }
    catch (e) { state.errors[key] = e; }
  });
  state.publishedHoldings = state.holdings || [];
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
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', render);
}
if (typeof document !== 'undefined') start().catch(e => { $('#content').innerHTML = errorBox(e); });
// Enables deterministic arithmetic/validation tests without adding browser dependencies.
if (typeof module !== 'undefined') module.exports = { validate, entrySchema, performance, validateHoldings, validatePrices, validateConfig, currentMonth, monthPurchases, accountSummary, researchExtras, sentiment, positionHistory, mergePurchases, purchaseFromFields, loadLocalPurchases };
