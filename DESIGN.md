# Design System: SYNTH.QUANT

## 1. Visual Theme & Atmosphere
The user-supplied code(2).html is the authoritative visual reference. Reproduce its dark stock-research dashboard, including the exact two-tab header, rounded research cards, compact conviction gauges, right-hand investment form, and portfolio summary/table. Density 7/10, variance 3/10, motion 2/10. The user explicitly requested every element of this reference; it takes precedence over prior bottom-form placement and generic design-skill defaults.

## 2. Color Palette & Roles
- Deep canvas (#0A0E16): page, header and footer.
- Slate panel (#181C24): stock cards, purchase panel and portfolio summary.
- Inset surface (#1C2028): form inputs and conviction score containers.
- Structural line (#3D494C at 40–80% opacity): dividers and panel boundaries.
- Primary ink (#DFE2EE): headings and labels.
- Secondary ink (#BCC9CD): research text and subtitles.
- Muted ink (#869397): metadata and annotations.
- Cyan (#4CD7F6): active navigation, primary action and confident state.
- Emerald (#4EDEA3): bullish state, positive results and research icons.
- Rose (#FFB2B7): weak state, errors and negative results.
The reference uses three semantic signal colors, overriding a generic single-accent rule. No gradients, neon outer glows, or pure black surfaces.

## 3. Typography Rules
Use Space Grotesk for the brand, headings and actions, Geist for body copy and numerical values, and Material Symbols Outlined for the exact reference icons. Google Fonts serves these assets; system sans-serif fallback remains readable if unavailable. Header title 30px, ticker 24px, company 16px, body 14px, metadata 12px and score label 10px. Use tabular numerals. Maintain the reference hierarchy; never inflate headlines into a marketing hero.

## 4. Component Stylings
Stock cards: 12px radius, 24px desktop padding, 1px slate border. Card header separates ticker/company/sentiment from a compact score block. Thin horizontal dividers separate header, research notes and bottom-right action. Sentiment badges use a 15% signal tint and 30% border. Conviction tracks use #31353E and a fully rounded 8px bar.

Form: inset inputs with 4px corners, explicit labels above, cyan focus border, estimated total row, full-width cyan submit button, sync note below. Preserve original amount, fees, bucket, backup and local-purchase controls needed for accurate records. Prefill actions select a security only; never invent execution prices or share quantities.

Portfolio: three equal summary cards, Add New Position shortcut, rounded full-width holdings table. This explicit reference overrides generic bans on equal three-column cards. Additional history and chart tools remain available in a disclosure panel.

Notifications: dismissible, accessible status banner. Errors: readable inline messages. Empty market data stays visibly unavailable.

## 5. Layout Principles
Maximum width 1280px including 32px side gutters. Header height 80px, sticky at top. Main top padding 40px. Monthly grid uses 2:1 columns and 32px gap; form stays sticky 112px from the top. Cards stack with 20px gap. At widths below 1000px, the form follows the stock list. Below 768px, summary and form fields become single-column; no whole-page horizontal overflow. Tables may scroll inside their own labelled region. Preserve two visible navigation tabs on mobile, never a sidebar/menu replacement.

## 6. Motion & Interaction
Use restrained 180ms color/border feedback and 1px pressed-button translation. Smooth-scroll to the form only after a direct action. Respect prefers-reduced-motion. No perpetual financial-score pulses, fake live activity, or animation of layout dimensions. Both hash routes work directly and after reload. Manual purchases persist in the established browser storage key and can be exported.

## 7. Anti-Patterns (Banned)
No invented current stock prices, financial scores, verified-source claims, holdings, returns, or live-feed status. Imported example cards must be explicitly identified as unverified design examples. Do not turn example data into the current monthly research report. Do not replace real holdings with the mockup portfolio. No fabricated purchase quantity or price in prefill. No Tailwind runtime, build step, backend, secrets, or code changes for each new monthly research entry. Escape imported content and validate JSON before rendering. No third-party tracking scripts.
