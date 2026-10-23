# Record a purchase with ChatGPT

Use ChatGPT with your GitHub connection enabled. Paste this request, followed by the completed purchase details:

Read AGENTS.md in https://github.com/EpidemikGG/invest-dashboard using my connected GitHub account. Record the completed investment purchase I provide below in data/holdings.json. Ask me together for any essential missing details. Preserve all current purchases, check for duplicates, validate the full ledger, commit using the current file SHA, and verify the saved purchase. Give me the commit and live dashboard links. Do not treat a plan as a completed purchase. If you cannot write to GitHub, tell me it has not been saved.

Purchase details to provide: ticker, purchase date, total paid and currency, actual shares, execution price, fees and core/satellite bucket. ISIN is optional if unknown. You can provide the details in normal language; they do not need to be JSON.

The site reads the saved ledger after deployment. ChatGPT-recorded purchases sync through GitHub. The website's manual form stores purchases only in that browser. Files in this repository are public, including recorded amounts and shares.
