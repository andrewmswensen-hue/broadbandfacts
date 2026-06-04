# BroadbandFacts

**Live site → https://andrewmswensen-hue.github.io/broadbandfacts/**

Aggregates FCC **Broadband Facts** label data across ISPs and compares the *true total cost over a
lease term* — not the misleading headline monthly price. Built to expose post-promotional pricing,
which the FCC requires ISPs to disclose but which is scattered across each ISP's own website.

> Status: **data pipeline working** (MVP step 1). The web UI is next. See `CLAUDE.md` for project
> context and `FEASIBILITY.md` for the go/no-go research.

## What works today

```
node scripts/fetch.mjs       # download each active ISP's machine-readable file
node scripts/normalize.mjs   # clean + standardize into data/normalized/plans.json
node scripts/report.mjs --offer=69 --min-speed=100   # compare plans vs. an alternative offer
```

Currently live: **10 ISPs** — AT&T, Spectrum, Cox, WOW!, Breezeline, Windstream/Kinetic, Metronet,
Starlink, Brightspeed, Google Fiber (~1,000 deduped residential fixed plans). Another 14 ISPs are in
the registry as `ready` (verified file, needs special handling) or `todo` (behind a JS/bot gate, needs
a headless browser). Run `node scripts/report.mjs --offer=69 --min-speed=300` to see a comparison.

## How it works

```
ISP's machine-readable CSV  ──fetch──>  data/raw/<id>.csv  +  data/snapshots/<date>/<id>.csv (archive)
                                              │
                                          normalize  (apply each ISP's fieldMap → common schema)
                                              │
                                   data/normalized/plans.json   ← the single source of truth
                                              │
                                   report.mjs (now)  /  Next.js app (later)
```

No database. The JSON files in the repo *are* the database, and each weekly commit is the price
history. (A weekly GitHub Action will run fetch + normalize and commit the result — not wired up yet.)

## The normalized plan schema

Every plan in `data/normalized/plans.json` looks like this:

| field | meaning |
|---|---|
| `provider`, `ispId` | ISP name and short id |
| `planName`, `planId` | plan name and FCC plan ID |
| `monthlyPrice` | headline monthly price (number) |
| `isIntroductory` | **true if this is a promo rate** — the key consumer-protection flag |
| `introMonths` | how many months the promo lasts |
| `postIntroPrice` | the real price after the promo ends |
| `contractMonths` | contract length |
| `earlyTerminationFee` | ETF |
| `monthlyFee` | recurring add-on fees (modem rental, etc.) |
| `oneTimeFee` | activation/install |
| `downloadMbps`, `uploadMbps` | speeds, as numbers |
| `dataCap` | monthly data allowance |
| `sourceUrl` | link back to the ISP's label page |
| `feesApproximate` | true when a fee cell held a menu of values (parsing is best-effort) |
| `priceSuspect` | true for $0/$1 bulk/MDU/placeholder rows (hidden from default ranking) |
| **`tco12`, `tco36`** | **total cost over 12 and 36 months** — the headline comparison number |

Total cost = (intro price × intro months) + (post-intro price × remaining months) +
(monthly fees × months) + one-time fees.

## How to add a new ISP

1. Find the ISP's machine-readable Broadband Facts file (usually linked from a "broadband labels"
   page in their site footer; some embed the file URL in page JavaScript). Use
   [BroadbandNow's label list](https://broadbandnow.com/broadband-consumer-labels) only as a
   *checklist of which ISPs exist* — not as a data source (it's label images, not data).
2. Open the file and note its column header names.
3. Add an entry to `data/isps.json`:
   - `fileUrl` (or `fileUrls` for per-state/multi-file ISPs) — direct link(s) to the file
   - `method` — `"direct-csv"` for a plain file; `"browser-needed"` if hidden behind JavaScript
   - `format` — name a preset in `scripts/normalize.mjs`. If the file uses the standard FCC
     snake_case headers (most do), use `"fcc-snake"` and you're done. CamelCase → `"fcc-camel"`.
   - `keepServiceTypes` — e.g. `["Fixed"]` to drop mobile/wireless rows
   - `fieldMapOverride` / `serviceTypeField` — only if this ISP renames a column or hides the
     service type in a different field (e.g. WOW! puts "Fixed" in `tier_plan_name`)
   - `status` — `"active"` once verified
4. **Verify price semantics** before trusting the numbers: does this ISP's "monthly price" column
   show the PROMO price (`main_is_promo`, like AT&T) or the REGULAR price with the promo in a
   separate column (`main_is_regular`, like Spectrum)? Set it on the format. Getting this wrong
   silently corrupts every total-cost number.
5. Run `node scripts/fetch.mjs && node scripts/normalize.mjs` and check the plan count.

Only genuinely new column layouts need a new `FORMAT` block in `normalize.mjs`; standard-FCC ISPs are
a registry one-liner.

## License

MIT — this is a public-interest transparency project.
