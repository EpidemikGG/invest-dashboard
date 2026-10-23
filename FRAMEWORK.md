# Investing framework

## Budget and split
- Monthly budget and the core/satellite split come from config.json (default $300: $240 core, $60 satellite).
- Unspent money is never carried into riskier picks. If nothing passes, it goes to the core benchmark ETF.

## Core: low to moderate risk
Core ETF (the default home for core money):
- Broad index (world or S&P 500), UCITS, buyable by EU retail.
- Total expense ratio 0.25% or less; fund size above EUR 1 billion.

Core stock (only when it beats the ETF case):
- Market cap of USD 20 billion or more, listed on a major exchange.
- Profitable over the last four quarters and positive free cash flow over the last twelve months.
- Debt-to-equity of 1.0 or less (banks and utilities: explain why the measure does not fit).
- Five-year beta of 1.1 or less.
- A written reason why this stock should beat buying more of the core ETF.

## Satellite: high risk, high potential
- At most one new satellite name per month.
- Market cap of USD 1 billion or more. No penny stocks, OTC listings or SPACs.
- Either revenue growth of 20% a year or more, or a specific dated catalyst.
- Bear case required: what breaks the thesis and the realistic loss on the amount invested.

## Portfolio limits
- No single stock above 15% of total portfolio value.
- Satellite holdings at or below 25% of the portfolio; above that, new satellite money goes to the core.
- Maximum positions as set in config.json. Prefer adding to a holding with an intact thesis over opening a new one.
- No sector above 35% of the portfolio, not counting broad index ETFs.

## Never
- Leveraged or inverse ETFs, options, margin, short selling, anything in config.json exclusions.

## Before any buy
- Buyable by EU retail investors at my broker (config.json).
- Broker fee below 1% of the order.
- No earnings report within 14 days for a new position; flag it if one is due.

## Selling
- Thesis broken: recommend selling, whatever the price.
- Satellite down 50% or more: review the thesis in full; sell if weakened.
- Never recommend selling only because of a short-term dip.

## Honesty rules
- Every figure has a source URL and the date it was read. Nothing from memory.
- Separate facts (sourced) from judgment (labelled as opinion).
- Give a confidence level and say what you could not verify.
- No hype words. If the honest answer is "buy the index again", say that.
- Each month, report picks vs benchmark plainly, including when the picks are losing.
