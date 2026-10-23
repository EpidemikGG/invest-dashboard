## Inline editing and Total Value P&L

Modify expands a configuration row immediately below the chosen position. Close, Cancel or clicking Modify again collapses it without saving. Saving also closes the editor. Total Value includes an account P&L graph: historical unrealized profit/loss when at least two complete dated valuations exist; otherwise a contribution bar graph by holding. Missing quotes are labelled N/A and excluded only from the explicitly labelled known P&L subtotal. The complete account P&L is never guessed. P&L equals shares times market price minus original outlay, excludes uninvested cash, dividends and sales, and requires no benchmark. Intraday snapshots remain separate from historical closing data.

## Portfolio navigation and gain/loss bars

Modify and Remove sit immediately beside each stock symbol. Back to stocks and Cancel discard unsaved form changes and return focus to the position list. Saving or removing a purchase closes the editor and returns to the list. Each symbol shows a green/red diverging bar, percentage return on actual outlay and USD gain/loss when amounts are visible. The center line is break-even; the bar uses a ±10% scale, expanding for moves beyond that range. These bars show a single valuation, not a historical price trend. Missing prices display Awaiting market price.

## Stocktwits snapshots and portfolio controls

Portfolio now reads data/quotes.json separately from daily closing histories. ChatGPT refreshes the published holdings’ Stocktwits quotes hourly through its connected tools. The site reloads snapshots on open, on the Reload latest snapshot button, and every five minutes while visible. This is an hourly snapshot feed, not a real-time stream; Stocktwits quotes may be delayed. Each price displays the provider timestamp and quotes older than two hours are marked Older quote. A quote after the current time by more than five minutes is rejected. Unsupported symbols show missing prices. VWCE is currently unsupported by Stocktwits and no USD conversion is guessed. Current account valuation uses snapshots only when all holdings have usable quotes; otherwise the dated-history or recorded-cost fallback remains explicitly labelled. Intraday snapshots are never used as historical daily closes.

Edit and Remove in Active Positions operate on individual purchase records or whole positions. Edits validate dates, costs, shares and bucket consistency. They do not execute broker trades. Overrides are saved locally in this browser; Undo last change and Restore published records reverse them. Export updated holdings and ask ChatGPT to replace the published ledger to sync devices. The price automation can only read published holdings. Purchase prices remain actual historical inputs, distinct from market quotes.

# Invest Dashboard

A static, mobile-friendly investing research dashboard. Upload the contents of this folder to a GitHub repository. There is no installation, build step, backend, API key or automatic trading. Chart.js 4.4.8 is the only external script.

## Current UI: supplied HTML reference

The UI follows `code(2).html`: fixed dark appearance, Space Grotesk/Geist typography, Material Symbols, rounded stock cards, conviction meters, a sticky investment panel, a dismissible save notification, and the portfolio summary/table. CSS is hand-written; no Tailwind runtime or build step is needed. Fonts and symbols load from Google Fonts; Chart.js loads from cdnjs. `DESIGN.md` documents the reference and deliberate data-integrity differences.

`data/design-preview.json` contains the five **unverified example cards** copied from the supplied HTML (NVDA, PLTR, CRWD, SOFI, TSLA). They appear only when no research report exists for the current month. They are not real-time quotes, verified research, purchases, or portfolio data. A normal current-month entry automatically replaces them. The Add to Investment Form buttons select a ticker; users must supply their actual execution price and shares. The source HTML's arbitrary 20-share default is intentionally not used.

The real portfolio always reads `data/holdings.json` plus locally saved purchases. Mockup balances and positions are never imported. Stocktwits/Stocklake/SEC content is not fetched live. Charts need actual dated records in `data/prices.json` and a configured benchmark. The source layout's invalid closing tags are corrected so portfolio elements stay inside their own route.

## Files and setup

- `index.html`, `styles.css`, `app.js`: interface and calculations.
- `FRAMEWORK.md`: rules extracted verbatim from your supplied document.
- `data/config.json`: settings extracted verbatim from your document. The config lives under data so every JSON request stays there.
- `data/index.json`: entry paths, newest first. This Month selects the entry for the current Europe/Bucharest calendar month. A missing report displays explicitly labelled design-preview cards; an invalid report displays its validation error.
- `data/entries/example.json`: invented demonstration, not investment advice. Dates and enum values retain schema-valid forms; descriptive text starts with EXAMPLE. Remove its index line when your first real issue is ready.
- `data/holdings.json`: actual purchases only, initially empty.
- `data/design-preview.json`: separately validated, labelled examples from the supplied UI.
- `data/prices.json`: dated USD price histories, initially empty.
- `.nojekyll`: empty file; retain it at the repository root.

The bracketed benchmark, investor and broker fields in your original config are preserved intentionally. Fill them before using real data. No benchmark choice or investment research is supplied by this website.

## Publish with GitHub Pages

1. Create a repository named `invest-dashboard` on GitHub.
2. Upload this folder's CONTENTS, preserving `data/entries/`. Ensure `index.html` is at the repository root, not in an additional enclosing folder.
3. Commit the files to `main`. If `.nojekyll` was omitted by your uploader, use Add file → Create new file to create an empty file with that exact name.
4. Open Settings → Pages. Under Build and deployment select Deploy from a branch, then `main` and `/(root)`. Save.
5. Wait for the Pages deployment to finish. Open the URL shown in Settings → Pages, normally `https://YOUR-USERNAME.github.io/invest-dashboard/`.
6. Check the two large navigation buttons: This month and Portfolio. Check both pages and the labelled example cards before adding a real monthly report.

GitHub's instructions: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

## Add a monthly entry in GitHub's web editor

1. Run your research workflow using `data/config.json`, `FRAMEWORK.md`, actual holdings, prices and recent entries. Ask for a complete JSON entry matching `entrySchema` in `app.js`. Your document's older prompt refers to root config and a separate schema file; use the paths in this README instead.
2. Open the repository's Code tab. Select Add file → Create new file.
3. Enter `data/entries/2026-11.json` (substitute the actual month). Paste the complete entry. JSON needs double quotes, no comments and no trailing commas.
4. Select Commit changes. Use a message such as `Entry 2026-11`; commit to your publishing branch or merge a pull request into it.
5. Open `data/index.json`, select the pencil/Edit button, and insert `"entries/2026-11.json",` as the first item in `entries`. Leave older entries in their original order. Ensure the final item has no trailing comma. Remove `entries/example.json` when desired.
6. Commit this index change. Once deployment finishes, refresh This month to see the new issue. If validation fails, the page names all missing or invalid fields. Edit the JSON and commit the correction.

Only the new issue and its index line are needed to add a month. Updating real purchases and price snapshots is separate. Old entry files are never rewritten by the website. Archive and Framework are hidden from the interface. Their source files remain in the repository.

GitHub's file editor instructions: https://docs.github.com/en/repositories/working-with-files/managing-files/creating-new-files

## Entry conventions

Every property shown in the example is required, including all nested metrics and checks. Arrays may be empty. Unknown numeric metrics and the next earnings date use JSON `null`; never invent values. `no_buy_reason` may be an empty string when buying. A previous change percentage may be null when unknown.

Dates use `YYYY-MM-DD`, month uses `YYYY-MM`, and generated_at uses an ISO date-time. Metrics for revenue growth, free-cash-flow margin and dividend yield are percentage points: enter `12.5` for 12.5%, not `0.125`. P/E, beta and debt/equity are plain ratios. Checks are booleans. Source URLs must use http or https.

Entry names may contain letters, digits, hyphens or underscores and must be directly inside `data/entries/`. The index uses paths such as `entries/2026-11.json`, not `/data/entries/2026-11.json`. List newest first; month order is intentionally not guessed from filenames.

## Add investments directly on the dashboard

Use the Add an Investment panel on the right of This Month (below the stock list on mobile). Enter the ticker, actual share quantity, USD execution price, purchase date and bucket. The estimated total is shares × price plus the optional fee amount. Expand Amount paid, fees & security details to enter the original total outlay or an ISIN. Fees default explicitly to zero; a total outlay must cover the execution cost and stated fees.

New purchases immediately update portfolio totals and are stored locally in this browser under `invest-dashboard.purchases.v1`. They survive refreshes but do not sync to other devices or write to GitHub. Clearing browser data removes them. Amount inputs are visible while you fill them in; saved summaries follow the percentage-only display setting.

Use Download holdings.json to back up the combined published and local ledger. To sync it across devices, replace `data/holdings.json` in GitHub with that download. The file contains exact financial amounts and share quantities, so publishing it makes those values accessible. Matching local purchase lots are counted only once after the file is published; repeated identical lots are matched by count.

Open Purchases saved on this device to remove an unpublished local purchase. Undo remove restores the last removed purchase during the current session. Published purchase lots must be edited in `data/holdings.json`.

## Log purchases and update prices

`data/holdings.json` is an array of purchase lots. Each object requires date, ticker, isin (an empty string is allowed when unknown), bucket (`core` or `satellite`), amount_usd, price and shares. The date is the real execution date. Price is the USD-equivalent execution price per share; amount_usd is total USD cash outlay, including fees if applicable. Shares are actual acquired shares, including fractions. Keep the same ticker, ISIN and bucket for repeated purchases of one position. Numbers must be positive.

`data/prices.json` has an `asOf` date and a `prices` object keyed by ticker. Each ticker maps to an array of `{ "date": "2026-11-02", "close": 100 }` objects. This numeric example illustrates the shape only. Closes must be positive, dates unique per ticker, and no date later than asOf. With no data, retain `{ "asOf": null, "prices": {} }`.

Include benchmark closes on EVERY purchase date and shared valuation dates for the benchmark and all holdings. All closes must be converted to USD consistently before publication; the app does not fetch FX rates. Historical dates with incomplete prices become chart gaps. At least one complete shared date on or after the latest purchase is needed for the scorecard. A missing benchmark purchase-date close blocks comparison rather than guessing. Snapshots older than seven days show a stale-data notice.

## Calculation assumptions

Portfolio value is the sum of actual shares multiplied by their close on a shared valuation date. Benchmark units for each purchase are amount_usd divided by the benchmark close on that purchase date; benchmark value is the sum of those units multiplied by its valuation-date close.

Each return is `(value / contributed capital - 1) * 100`. The difference is portfolio return minus benchmark return in percentage points. This is cumulative return on outlay, not annualized, not time-weighted and not IRR. The same cash flows are compared, including repeated buys and fractional shares. Benchmark purchases assume zero fees; actual outlays may include fees.

This schema models purchases only. It does not model sales, uninvested cash, dividends, taxes or corporate actions automatically. Maintain split-adjusted quantities and matching prices consistently; do not mix total-return adjusted benchmark prices with unadjusted holdings. For dividend-paying assets this is a price-return comparison unless distributions are handled consistently outside the tool. A sales ledger or complete total-return accounting would require a schema extension.

Allocation uses current market value at the same comparison date. Position count and satellite limits are checked. Single-stock and sector compliance cannot be verified fully because holdings have no instrument/sector fields; issue check flags are researcher-supplied, not independent verification.

## Percentage view and public data

`public_amounts: false` hides monetary figures and share quantities in the rendered UI. Contributions show percentages of total purchase outlay; current values show percentages of that same base. Monthly allocations show percentages of the issue budget; issue budgets show percentages of the configured monthly budget. Performance charts use percentage returns. Research prices are omitted; currency amounts in narrative text and framework rules are masked. Bare unlabelled numbers in prose cannot reliably be recognized as amounts: label monetary figures with their currency in research text.

This is DISPLAY PRIVACY ONLY. JSON and Markdown files remain downloadable from a public website, regardless of what the interface hides. A private repository does not by itself make a GitHub Pages website private. Do not publish actual financial data you want to keep confidential. Source files preserve the supplied framework and config exactly; masking happens only when rendering.

## Troubleshooting and local preview

Open the site through GitHub Pages or an HTTP server, not by double-clicking index.html: browsers commonly block local-file fetches. If Python is available, run `python -m http.server 8000` from this folder, then visit `http://localhost:8000/`. Python is only an optional preview tool, not a site dependency.

If a file fails, check its exact capitalization, path and JSON syntax. A config error blocks rendering to avoid accidentally revealing amounts. An invalid current issue displays a readable error instead of substituting preview recommendations. Price errors leave the purchase ledger visible. If cdnjs is blocked, the chart has a readable fallback and the exact performance table remains usable.

## Fetch path check

- `./data/config.json` → included
- `./data/index.json` → included
- `./data/holdings.json` → included
- `./data/prices.json` → included
- `./data/entries/example.json` → included via index
- `./FRAMEWORK.md` → included; fetched as text, not JSON

All requests are relative to the site directory, so the GitHub Pages project subpath works. Future entry paths are resolved relative to `./data/`. No live price API is called.

## Monthly activity and entire account

This Month shows stock cards in the supplied HTML layout, with monthly allocation and purchases in an expandable section. A saved research issue must match the current Europe/Bucharest calendar month. Portfolio shows all purchase lots and the full recorded account balance in USD. Amount display is enabled in data/config.json.

Account balance equals recorded investment value plus the optional uninvested cash balance saved in this browser. Investment prices use the most recent date shared by every holding, without depending on a benchmark. When there is no complete price snapshot, investment value falls back to purchase outlay and is labelled recorded cost; gain/loss is unavailable. Any legacy cash balance saved in the browser remains a manual snapshot; this layout has no cash editor. Purchases do not deduct cash automatically. Cash is excluded from investment allocation and performance returns. It is not included in the holdings.json export.

The Add an Investment form appears only in the right-hand panel of This Month, stacked below the stock list on mobile. Portfolio is a read-only history and performance view. The setup and percentage-view notices have been removed.

## Monthly research reviews

Saved research is displayed above the expandable monthly allocation and has three accessible tabs: Stock reviews, Market & decisions, and Prompt & method. Use MONTHLY_PROMPT.md to request a monthly ChatGPT research run. The dashboard reads its saved report; it does not call ChatGPT.

The original entry schema remains valid. New optional top-level fields are research_prompt and research_summary (strings). A pick may additionally include sentiment_score (integer 0–100 or null) and sentiment_reason (string). Invalid supplied values fail validation. The UI maps 80–100 to Strong buy, 60–79 to Buy, 40–59 to Neutral, 20–39 to Weak buy, and 0–19 to Avoid. A missing/null score shows Not scored. Confidence is separate; no score is guessed from it. Share prices are dated research snapshots in each pick’s stated currency.

Stock cards show ticker, share price, score, sentiment, confidence, risk, suggested allocation, thesis, bear case, catalysts, metrics, checks and numbered sources. The prompt tab records the actual request used for that month. No current-month research or financial history is invented when files are empty.

## Individual-stock performance

Portfolio shows all purchases, account totals, each position’s gain/loss, a multi-stock return chart and a selected stock’s closing-price chart with actual fills marked. Individual position values use each ticker’s latest quote on or after its last purchase; account totals use a shared valuation date. Returns equal value divided by cumulative actual purchase outlay, minus one. They include repeat buys and fractional shares and are not annualized or time-weighted. Dates with no quote remain chart gaps. The exact-history table remains usable if Chart.js fails.

Add real dated prices to data/prices.json to populate performance charts. Empty price files show an explanation and purchase history, never made-up market performance. Research sentiment does not affect performance calculations. Portfolio has no purchase or cash-edit forms; any cash value saved previously is preserved in the account total.

## Let ChatGPT record a purchase

With GitHub connected in ChatGPT, tell it what you actually bought and ask it to add that purchase to this dashboard. Use the copyable instructions in Add an investment → Add with ChatGPT, or CHATGPT_PURCHASE_PROMPT.md. The canonical agent workflow is AGENTS.md, and the purchase schema is schema/holding.schema.json.

ChatGPT can append completed fills to data/holdings.json through the GitHub connection. It reads current holdings, resolves missing date/currency/price/share/fee/bucket details, checks duplicates, validates the full ledger and writes with the current file SHA. It then verifies the saved purchase and reports the commit. New agent-recorded lots should include a stable random id; duplicate ids are rejected by the dashboard. Existing purchases without ids remain valid.

No API key or GitHub credential is stored on the site. The site itself does not run ChatGPT or write to GitHub. A connected assistant performs the requested write. If no working GitHub connection exists, the purchase is not saved merely because an assistant outputs JSON. No investment has been recorded as part of enabling this capability.

GitHub-recorded purchases load on every device after deployment. The manual form still saves locally. Identical local/published lots are matched by their original fields and counted once per occurrence. Use an export when asking ChatGPT to sync locally entered fills so their exact values are retained. The public JSON ledger includes exact amounts and quantities.
