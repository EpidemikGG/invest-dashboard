# Monthly investment research workflow

This file is the operating procedure for each request such as “find the best option for this month.” Read it with `AGENTS.md`, `FRAMEWORK.md`, `data/config.json`, the current holdings, price snapshots and recent monthly entries.

## Saved investor context

- Monthly budget: USD 300; core/satellite target: 80/20.
- Country: Romania; EU retail investor.
- Horizon: 1–2 years, as supplied by the user.
- Preference: roughly 80% steadier exposure / 20% higher-risk growth exposure. “Steadier” does not mean safe or capital-protected.
- Current published holdings: VWCE, MSFT, BRK.B and GOOGL. Always re-read the current ledger before making a portfolio-specific comparison.
- Broker, fees, fractional-share availability, emergency-fund status and benchmark are not yet configured. Do not block initial research to ask about them; mark eligibility as unverified and do not recommend a trade that depends on unknown details. Ask one concise bundled question only when the answer materially changes the next decision.

## Run sequence

1. **Read the current state.** Fetch the latest default-branch versions of this workflow, `AGENTS.md`, `FRAMEWORK.md`, `MONTHLY_PROMPT.md`, `data/config.json`, `data/holdings.json`, `data/prices.json`, `data/quotes.json`, the entry index, and recent monthly entries. Treat GitHub main as authoritative. Never reuse an old candidate score or stale quote as current evidence.
2. **Check Twelve Data first.** Confirm the connected Twelve Data tool is authenticated. For the existing holdings, configured benchmark and every candidate, retrieve a dated price and the available statistics/profile/earnings data. Use the Twelve Data values for the quote snapshot and mark the exact retrieval date, time, currency and exchange. Use the statistics and analyst-data endpoints when available. If an endpoint is blocked by the connected plan, record that specific limit and leave the metric unknown. Never imply Twelve Data supplied a field it did not return.
3. **Research with Firecrawl.** Search broadly enough to compare relevant alternatives, not just the stocks already on the dashboard. Prefer official investor-relations releases, SEC/regulatory filings and official ETF-provider documents. Scrape the source pages for material claims. Use reputable secondary sources for context only, label them as such, and check publication dates. Do not invent social sentiment, options flow, dark-pool trades, analyst consensus or “conviction” from a price move.
4. **Build a comparable shortlist.** Include the existing names and plausible alternatives that fit the saved horizon, risk preference, EU access, current portfolio concentrations and the core/satellite framework. Compare facts on the same research date when possible. Check sector concentration and overlap with MSFT/GOOGL and VWCE. A single stock is not a substitute for a diversified core ETF.
5. **Apply the saved framework.** Core money goes to an eligible broad UCITS ETF first. A stock can replace that only if it passes every saved core-stock test and the evidence explains why it should beat the ETF. At most one new satellite per month, with the saved growth/catalyst and downside tests. Verify the 14-day earnings window, broker buyability, fee, position and sector limits before marking any check true. Unknown means unknown, not a pass.
6. **Score and rank transparently.** Give every displayed pick a 0–100 research-conviction score and sort cards highest to lowest. Use this fixed rubric and show the four component scores in `sentiment_reason`:
   - Reported operating momentum: 0–30.
   - Business durability and financial quality: 0–25.
   - Risk, diversification and fit with the user’s horizon: 0–25.
   - Evidence completeness, including valuation: 0–20.
   The components must sum to the displayed score. Scores compare the researched candidates for this run; they are not probabilities of profit, expected returns, target prices, or instructions to buy. Reduce the evidence score when data or valuation is missing. Keep evidence confidence separate from conviction. Do not assign a score simply to fill the budget.
7. **Make the 1–2 year risk explicit.** If the user may need the money within 1–2 years, explain that stocks can fall sharply even when the business is strong. Do not label an equity as “steady” in the capital-protection sense. Keep the option of no stock purchase. If no candidate passes the framework, show the reason and leave the allocation uncommitted rather than inventing a buy. Do not make a specific cash product recommendation without checking access, protections, currency and terms.
8. **Prepare the dashboard entry.** Use the existing stock-card layout and the `entrySchema` in `app.js`. Add dated prices, sourced thesis, bear case, catalysts, available metrics, check status, confidence, score and score explanation. Sort picks by score descending. Put evidence links in each card. Preserve the exact request/preferences in `research_prompt` and the overall conclusion in `research_summary`. Never copy the fictional claims in `data/design-preview.json`.
9. **Keep portfolio records separate.** A recommendation/watchlist entry is not a purchase. Never add picks to `data/holdings.json` unless the user reports a completed trade and follows the purchase-record procedure. Do not rewrite previous entries or fabricate daily closing prices. Intraday Twelve Data quotes belong in `data/quotes.json`, not `data/prices.json`.
10. **Publish and verify.** Re-read the current main branch immediately before each GitHub write and use the current file SHA. Add only the new monthly entry and its index path unless the user asked for other changes. Verify the JSON/schema, index order, GitHub commit and Pages workflow result. Tell the user what is live, the data date, source/API limitations, and whether any checks remain unknown.

## Automation and privacy

- The existing hourly GitHub Actions workflow refreshes portfolio quote snapshots from Twelve Data using the repository secret `TWELVE_DATA_API_KEY`. Keep that key in GitHub Actions secrets; never ask the user to paste it in chat, expose it in a page, or commit it. Never report secret contents; confirm only whether an authenticated/API call succeeded.
- A monthly recommendation is generated when the user asks, using the live Twelve Data and Firecrawl connections. Do not pretend the static Pages site generates recommendations by itself or schedule recurring research unless the user requests it.
- If Twelve Data or Firecrawl is unavailable, explain which source is missing and continue only with clearly labelled available evidence. Do not silently substitute stale data or present another provider’s figure as a Twelve Data result.
