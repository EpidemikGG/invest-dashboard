# Monthly ChatGPT stock research

Run monthly with an assistant that has live web search. This is the prompt to paste; replace the opening notes with your current request.

Research month: current month in Europe/Bucharest. My notes and stock-research request: describe your preferences or say "use my saved framework".

1. Read data/config.json, FRAMEWORK.md, data/holdings.json, data/prices.json and recent entries. Follow my framework and current notes. Ask only for missing investor or broker information that materially affects eligibility or the recommendation.
2. Use current web research. Never invent a quote, ratio, earnings date or sentiment score. Prefer filings, investor relations and ETF provider materials. Date every price, attach sources, cross-check prices and earnings dates, and disclose unresolved conflicts. If the evidence is inadequate, use null metrics, a null sentiment_score and an explicit warning.
3. Review suitable candidates for the configured core/satellite budget. Explain the investment case, bear case, dated catalysts, key metrics, confidence and buyability/fee/earnings/position checks. Preserve the option of no purchase. Never change actual purchases in holdings.json.
4. Give each researched pick a sentiment_score: an integer from 0 to 100 measuring the strength of the current buy case under the saved framework. The dashboard labels 80–100 Strong buy, 60–79 Buy, 40–59 Neutral, 20–39 Weak buy, and 0–19 Avoid. This is a judgment score, not a probability of success. Add sentiment_reason explaining valuation, business quality, balance-sheet risk, timing and uncertainties. Keep confidence as a separate assessment of evidence quality. Never assign a strong score merely to fill the budget.
5. Create data/entries/YYYY-MM.json following entrySchema and researchExtras in app.js. Include every original required field. Also include research_prompt (the exact user request and notes for this run), research_summary (the overall conclusion), and sentiment_score and sentiment_reason on each pick. Use price_at_research, price_date and currency for the share price. Unknown sentiment scores must be null. No client-side code changes are needed.
6. Add the new entry path first in data/index.json. Update data/prices.json with dated USD closes for actual holdings and the configured benchmark, including each real purchase date. Do not fabricate histories to make the charts look full. Adjust FX, splits and price conventions consistently with README.md. The price file is a snapshot, not a live feed.
7. If GitHub access is unavailable, output the complete JSON files and their exact paths. In chat, summarize the month’s research, the highest-priority risks and any broker checks still required before buying.

The website displays saved research; it does not run ChatGPT or generate new research itself. Each monthly file stores its own user prompt and author/model information.
