# Monthly stock and portfolio research

Use this workflow whenever I ask for this month's options, stock research, a portfolio review, or a dashboard update. Read `RESEARCH_WORKFLOW.md`, `AGENTS.md`, `FRAMEWORK.md`, `data/config.json`, current `data/holdings.json`, `data/prices.json`, `data/quotes.json`, `data/index.json` and recent entries from the current default branch first. Do not ask me to restate saved information.

## Defaults already supplied

- Monthly budget: $300; target split 80% core / 20% satellite.
- I am in Romania and am an EU retail investor.
- My horizon is 1–2 years.
- My preference is about 80% steadier exposure and 20% higher-risk growth exposure. Do not claim that stocks are steady or capital-protected.
- Published holdings include VWCE, MSFT, BRK.B and GOOGL; re-read the live ledger every run.
- Broker, fees, fractional-share availability, benchmark and emergency fund status are not confirmed. Do initial research without blocking on these; mark affected checks unverified. Ask only if one answer is essential to resolve a real choice, and ask a single bundled question.

## Required live research

1. Check Twelve Data authentication, then use the connected Twelve Data plugin for dated current prices and all available company statistics, profiles and earnings dates for holdings, the configured benchmark, and each candidate. Use the returned source timestamps, exchange and currency. If the plan blocks statistics or targets, state the endpoint restriction and use `null`; do not carry forward old values.
2. Use Firecrawl search to compare suitable alternatives across the market. Scrape primary company investor-relations, SEC/regulatory and ETF-provider pages for the facts used. Record source URLs and access dates. Secondary sources may add context but must be labelled. Do not invent sentiment, analyst targets or unverified flow claims.
3. Apply `FRAMEWORK.md` exactly: ETF-first core; core-stock eligibility; one satellite maximum; market-cap/growth-or-catalyst and bear-case rules; earnings window; broker fees and access; position/sector limits. Unknown broker checks are not passes. Account for the user’s current sector exposures.
4. Compare candidates on the same research date where possible. State plainly if none is suitable. A 1–2 year horizon means equities may be unsuitable for money needed then; do not force the $300 into picks.
5. Score each displayed candidate 0–100 with the fixed rubric in `RESEARCH_WORKFLOW.md`: operating momentum /30, durability and financial quality /25, horizon/portfolio fit /25, evidence and valuation completeness /20. Show the component math in `sentiment_reason`; components must sum to the score. This is a comparative research judgment, not a profit probability, forecast, analyst rating or buy instruction. Keep `confidence` separate. Rank cards from highest to lowest score. Score labels in the UI are neutral conviction labels, not buy signals.
6. Save a schema-valid `data/entries/YYYY-MM.json` with the exact request and saved preferences in `research_prompt`, sources and dates in each pick, and an honest overall summary. Keep recommendations separate from actual holdings. Add the path first in `data/index.json` using current blob SHAs. Never rewrite old months or modify holdings unless I separately report a completed purchase.
7. Publish, verify the saved files and confirm the Pages workflow completed before calling the dashboard update live. Link the current month page, summarize the ranking and material risks, and disclose missing Twelve Data / Firecrawl fields.

The live dashboard is a static viewer. Monthly research runs when I ask; the hourly quote snapshot automation is separate. Never ask for my API key in chat or commit it.
