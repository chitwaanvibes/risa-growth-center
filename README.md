# CampusFest Sponsor Growth Center

**RISA Labs · Growth APM assignment · Challenge B: Sponsorship Growth · Bengaluru**
Aditya Biswas (23HS10002), IIT Kharagpur

| Deliverable | Where |
|---|---|
| Three-slide strategy (PDF) | `deck/` (added with the final deck) |
| Working product | Vercel link: `https://<your-project>.vercel.app` |
| This README | Research, assumptions, calculations, sources, framework, setup, tools, limitations |

---

## 1. Evaluate it in five minutes

1. Open the app. It starts on the **2027 plan (simulated)** workspace at the end of week 4 (14 Feb 2027).
2. **Overview:** signed ₹7.7L against ₹7.38L plan to date; collected ₹2.48L against ₹1.31L; projected collection ₹24.4L, a ₹2.84L gap to the ₹27.2L base target.
3. **Decide:** the rules call P02 *Scale*, P05 *Stop*, and P01/P03/P04 *Change*. Each shows the metric, sample size and thresholds.
4. **AI Copilot (right panel):** ask *"Which campaign should we stop, and what evidence supports that?"*, then *"Draft a task for the owner"*, then **Confirm**. The task appears in **Execute → Tasks**, marked AI, and in **Data → Activity log**.
5. Follow-ups: *"What happens if we move ₹15,000 from it to alumni intros?"*. Then a question the data cannot answer: *"What is our sponsor renewal rate from last year?"*
6. Change data and watch everything move: **Execute → Deals**, set a negotiating deal to *partner confirmed*. Signed cash, the forecast, rules and the copilot's answers all update. Invoices for the 50% advance are raised automatically.
7. Switch to **2025 original data**. This is the provided dataset, unchanged. Ask *"How much sponsorship cash was actually collected before the festival?"*. The copilot explains that the data has no receipts and gives the closest supported answer.

## 2. Decisions

**Challenge B (sponsorship cash collected before the festival).** The sponsorship file is the harder and more honest test. It contains no bank receipts, so "cash collected" must be modelled and then tracked. The plan is built around that gap.

**City: Bengaluru.** Its sponsor density fits a cash-first, warm-introduction plan:
- India's most-funded startup hub. Bengaluru led Q1 2026 with $823M across 89 deals ([Deccan Herald](https://www.deccanherald.com/business/startups/bengaluru-dominates-countrys-startup-scene-in-q1-2026-3984461)) and ranks 15th globally in GSER 2026 ([GKToday](https://www.gktoday.in/bengaluru-ranks-second-in-asias-ai-native-startup-clusters/)).
- A deep consumer-brand base. Bengaluru D2C brands raised about $3.4B across 342 deals since 2015 ([Inc42](https://inc42.com/lists/top-30-funded-ecommerce-d2c-startups-in-bengaluru-2026-2/)). That matches the dataset's winning industries (consumer, food, mobility).
- Alumni and creator networks concentrate there, which is what bets 3 and 4 need.

**Framing.** 2025 is history. The plan targets the next edition (12-week campaign, 18 Jan to 10 Apr 2027) and uses 2025 as the evidence base.

## 3. Data audit (original dataset)

All figures are as of the end of **11 Apr 2025**, the day before the event, India time.

| Step | Rule applied |
|---|---|
| Duplicates | Removed identical import retries: 3 interactions, 1 qualification row, 2 opportunity-history rows. Same ID with different payloads would be flagged; there are none. |
| Versioning | Latest full-state version per brand or opportunity, on or before the selected date (ties broken by history ID). History states are never summed. |
| No leakage | Every view is a snapshot: rows after the date are excluded, so later outcomes never appear in earlier weeks. |
| Populations | Brands, contacts, attempts, qualified brands and opportunities are counted separately. Repeat outreach is not a new brand. |

**Baseline funnel:** 180 brands worked (141 by outreach) → 109 replied → 60 meetings held → 60 qualified → 58 opportunities → 46 reached proposal → **24 confirmed** (20 cash = **₹20.0L**, 4 in-kind = ₹2.4L). Targets (revised 15 Mar): 55 qualified (actual 60), 28 confirmed (actual 24).

**Findings that drive the plan**
1. Warm and inbound channels (SC02 introductions, SC04 partner form, SC05 creator referrals) produced 24 of 25 confirmations from 44 brands. Outbound (SC01, SC03, SC06) produced **0** retained deals from 148 brand touches; one signed, then withdrew.
2. Email replies by touch number: 1st 37/109 (34%), 2nd 11/79 (14%), 3rd or later 2/79 (2.5%).
3. Open pipeline of ₹14.4L, but only ₹10.5L is with qualified brands. All 26 open deals had been idle for 12+ days. Every historical negotiation that converted did so in 2 days.
4. **18 qualified brands never got an opportunity** (12 from referrals or the form).
5. No opportunity was created after 24 Mar and no confirmation after 2 Apr. Median first touch to signature was about 16 days.
6. 16 opportunities were opened before the brand was qualified.
7. **No payment data at all**, so confirmed value is not cash collected.

Caveats: warm leads are pre-selected, so campaign association is not causation. Samples are small. Synthetic timings are unusually regular.

## 4. Target model (Slide 1)

`Cash collected = Σ channel (brands × brand→cash-deal rate × average deal) × collection rate`

| Channel | Base: brands × rate × deal = signed | Stretch | 2025 evidence |
|---|---|---|---|
| P02 Recovery sprint (32 qualified, unclosed 2025 brands) | 32 × 25% × ₹0.8L = ₹6.4L | 32 × 30% × ₹0.9L = ₹8.64L | Brands already qualified; stalled deals averaged ₹0.75L |
| P03 Alumni introductions | 25 × 40% × ₹1.0L = ₹10.0L | 36 × 45% × ₹1.1L = ₹17.82L | 2025 introductions: 8 brands → 6 cash deals, ₹1.07L average |
| P04 Creator & community referrals + partner form | 36 × 40% × ₹1.0L = ₹14.4L | 52 × 40% × ₹1.05L = ₹21.84L | 2025 SC04+SC05: 36 brands → 14 cash deals (39%), ₹13.6L |
| P05 Ambassador two-touch outbound | 100 × 2% × ₹0.6L = ₹1.2L | 150 × 2.5% × ₹0.8L = ₹3.0L | 2025 outbound: 0 retained of 148 touches; capped test |
| **Signed cash** | **₹32.0L** | **₹51.3L** | 2025: ₹20.0L |
| × collection before event | 85% | 88% | Assumption: 50% advance × 90% + 50% balance × 80% (stretch 92% / 84%). KYC and GST details are sent with the proposal so the PO is raised at signing; balances fall due 27 Mar, before brands' 31 Mar financial-year close |
| **Cash collected** | **₹27.2L** | **₹45.1L** | 2025 counterfactual: ₹20L × 70% = ₹14L |

Deal-cycle risk: 2025's ~16-day cycle comes from synthetic data; real corporate cycles can run 4+ weeks, so a portfolio guardrail pulls the sourcing cutoff earlier if median days-to-sign exceeds 21.

Capacity check: base needs about 34 cash deals, 14 more than 2025's 20, across 5 owners over 7.4 sourcing weeks (sourcing stops 30 days before the event: ~16 days to sign plus ~14 to collect). Deal sizes are consistent with published college-fest packages, e.g. title ₹2L, gold ₹1L, silver ₹50k ([IIT Jodhpur](https://iitj.ac.in/flying-wings/en/sponsor)). Advance payment terms are standard in fest sponsorship ([Amity Unifest](https://www.amity.edu/unifest/sponsorship.asp)).

Targets entered in the app: 70 qualified brands, 38 partnerships (34 cash + about 4 in-kind), ₹32.0L signed, ₹27.2L / ₹45.1L collected.

## 5. Five bets and prioritisation (Slide 2)

**Incremental contribution** is measured against "repeat 2025" (₹14L collected): volume gains at the old 70% collection rate, plus the collection uplift attributed to P01.

| Rank | Bet | Base / stretch incremental | Budget | Confidence | Call |
|---|---|---|---|---|---|
| 1 | P01 Cash-first, FY-end pricing: 50% advance, invoice within 24h, prices step up after 15 Feb and 1 Mar, balance before 31 Mar | +₹4.80L / +₹9.23L (15 to 18 pp collection uplift × signed) | ₹10k | High | Double down |
| 2 | P02 Recovery sprint on 32 qualified 2025 brands | +₹4.48L / +₹6.05L | ₹10k | Med-high | Double down |
| 3 | P03 Alumni intro engine | +₹2.52L / +₹7.99L | ₹40k | Medium | Double down |
| 4 | P04 Creator & club packages: category exclusivity, creator content, QR-tracked sampling, proof-of-reach report; partners paid on cash received | +₹0.56L / +₹5.77L (protects the ₹13.6L 2025 base) | ₹45k | Medium | Test, then scale |
| 5 | P05 Ambassador precision outbound (two touches max) | +₹0.84L / +₹2.10L | ₹35k | Low | Deprioritise: capped test |
| | **Total** | **+₹13.2L / +₹31.1L** → ₹27.2L / ₹45.1L | ₹1.4L + ₹10k buffer | | |

Framework: **expected incremental cash (60% base + 40% stretch) × confidence ÷ cost**, then checked for dependencies and overlap. P01 multiplies every channel. P03 and P04 share brands, so first-touch attribution applies. P05 excludes warm-list brands.

**Rejected:** scaling bulk cold email (2.5% reply after touch 2, 7 opt-outs, 0 deals), betting on a single title sponsor (one decision maker, one-shot risk), and paid ads (no evidence that reach converts sponsors).

Budget figures are assumptions; the dataset has no spend data.

## 6. Signals and thresholds (Slide 3)

These are stored as editable rules in the app. The primary rule decides. A breached guardrail turns Scale into Change and Change into Stop. Below the minimum sample, the status is "too early".

| Bet | Primary metric: scale / stop (min n, from week) | Guardrail | Early signal |
|---|---|---|---|
| P01 | Advances paid within 7 days ≥70% / ≤40% (5, wk 3) | Win rate ≥50% / ≤30% | Days from signature to invoice |
| P02 | Meeting rate ≥35% / ≤15% (10, wk 2) | Stalled share ≤20% / ≥50% | Replies in the first 5 days |
| P03 | Meeting rate ≥70% / ≤45% (8, wk 3) | Volume vs plan ≥90% / ≤60% | Intro asks accepted per alumnus |
| P04 | Meeting rate ≥60% / ≤35% (12, wk 3) | Cost per signed deal ≤₹8k / ≥₹15k | Referral partners signed |
| P05 | Meeting rate ≥15% / ≤5% (40, wk 3) | Opt-out rate ≤2% / ≥5% | Reply rate after touch 1 |

The meeting → signed conversion uses **mature meetings only**: those held at least 16 days ago. A young cohort therefore never looks like a failure.

## 7. Product (Part 2)

| Brief requirement | Where |
|---|---|
| Measure: funnel, campaign KPIs, targets vs actuals, conversion, budgets, projection | **Overview**: tiles, funnel, weekly pace vs plan, projection build-up, campaign table |
| Diagnose: winners, underperformers, bottlenecks, drivers | **Diagnose**: per-campaign stage vs plan (or portfolio) with bottleneck, portfolio conversion, "what changed" between any two dates, stalled deals, data-quality notes |
| Support decisions | **Decide**: scale/change/stop calls, editable rules, budget what-if, ranked bets |
| Manage execution | **Execute**: tasks (owner, due date, status, priority), deals (stage changes as new dated versions), invoices and payments, campaigns and budgets, spend ledger. **Data**: edit any table, CSV import/export, assumptions, activity log, reset |
| AI copilot | Right panel on every page |

**Forecast.** Projected collected = collected + collection rate × (unpaid signed + weighted open pipeline + expected new deals). Weighted pipeline is value × stage probability (prospecting 8%, contacted 15%, proposal 40%, negotiating 65%), halved if stalled. Expected new deals = (brands touched recently without a deal + run-rate brands until sourcing closes) × value per brand. Value per brand blends observed mature-brand value with plan value, with plan weighted as 10 brands (credibility shrinkage).

**AI Growth Analyst & Copilot**
- Gemini with function calling. Every number comes from 12 tools that run the same analytics engine as the dashboard on the latest saved data: overview, campaigns, diagnose, explain_change, list_deals, evaluate_rules, flexible query_table (filter/group/aggregate any table), exact calculate, list_tasks, simulate_budget_shift, get_data_catalog, propose_action.
- Changes are **drafted** with `propose_action` (task, task update, budget/status, deal stage, payment, rule thresholds) and saved only when the user clicks **Confirm**. Task drafts can be edited first.
- Honest uncertainty: the system prompt requires the copilot to label points as evidence, simulated or assumption, quote sample sizes, check the data catalog's known gaps before declaring something unanswerable, and avoid causal claims.
- Each answer shows the tools and arguments used ("Data used"). Follow-ups keep conversation context. Confirmed actions are fed back so the model knows what changed.
- Thought signatures and function-call IDs are passed back exactly, as Gemini 3 requires. If a model hits a quota it falls back to the next one (`GEMINI_MODELS`).

**Persistence.** Seed data is read-only in code. Every edit is a full row in Supabase `app_records(ws, tbl, id, data, deleted)` layered on top, so "reset" restores the original. Writes are validated on the server (types, enums, referential integrity, stage/value rules). The browser never sees database keys.

## 8. Setup

Needs Node 20+.

```bash
npm run dev          # http://localhost:3000, saves to .data/store.json if Supabase is not set
npm test             # 24 checks: audited figures, no-leak snapshots, validation, tools, Gemini loop
```

**Deploy (free tiers)**
1. **Supabase**: create a project, then SQL Editor → paste `supabase/setup.sql` → Run. In Project Settings → API Keys, copy the project URL and a **secret** key (`sb_secret_…`).
2. **Google AI Studio**: create an API key.
3. **Vercel** (from the VS Code terminal in this folder): `npx vercel` (log in, accept defaults), then add environment variables in the Vercel dashboard → Project → Settings → Environment Variables: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `GEMINI_API_KEY` (optional: `GEMINI_MODELS`, `APP_PASSCODE`). Then run `npx vercel --prod`.
4. Open the URL. The header pill should read "Saved to Supabase".

To rebuild the 2025 seed from the workbook: `python3 scripts/build_history.py Sponsor_Dataset.xlsx > public/lib/data/history-source.js`. The simulated plan is generated with `npm run seed`.

## 9. Tools used

VS Code; Node.js (no frameworks, no npm dependencies); Supabase (Postgres via REST, free tier); Google AI Studio / Gemini API (free tier; default models `gemini-3.8-flash`, then `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`); Vercel (Hobby). Python + openpyxl/pandas for the data audit. Built with help from Claude (Anthropic). I directed the analysis and checked every figure against independent pandas calculations; the test suite encodes those checks. Nothing was copied from templates.

## 10. Sourced facts vs assumptions

- **Sourced (provided data):** every 2025 figure in section 3 and the 2025 columns of section 4.
- **Sourced (web):** city facts and package benchmarks linked above.
- **Assumptions:** 2027 volumes, conversion rates, deal sizes, collection rates, stage probabilities, budgets, thresholds and weekly plan. All are editable in **Data & settings** or **Execute → Campaigns**.
- **Simulated:** all records in the 2027 plan workspace (labelled in the app).
- **App-added to the 2025 workspace:** assumptions and retrospective rules (labelled).

## 11. Known limitations

- The 2025 data cannot show cash collected, spend, loss reasons or attendee impact. The app and the copilot say so rather than guess.
- Campaign attribution is observational. Rules are decision aids, not causal tests; a true lift test would need holdouts.
- The free Gemini tier has tight daily limits. Heavy testing may hit quota (the app shows the error). A paid key raises the limits.
- No user accounts. Optional `APP_PASSCODE` protects edits; chat history lives in the browser session only.
- Rules use fixed thresholds without confidence intervals; small samples are handled by minimum-sample gates and forecast shrinkage.
