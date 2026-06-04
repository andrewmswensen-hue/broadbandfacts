# BroadbandFacts.io (working title)

A tool that surfaces FCC "Broadband Facts" label data for any U.S. ZIP or address, normalizes
pricing across major ISPs, and computes the **true total cost over a 1- and 3-year lease** — so a
property manager (or anyone) can compare an ISP's real post-promo price against a bulk/group rate.
The headline number is total cost of ownership, not the advertised monthly price, and the
"this is a promo rate" trap is flagged prominently.

## Current status (as of 2026-06-04)
**Data pipeline working across 10 ISPs.** Feasibility done (`FEASIBILITY.md`); registry research done
for all 24 target ISPs. The fetch → normalize → total-cost spine runs on real data: ~1,000 deduped
residential plans from **AT&T, Spectrum, Cox, WOW!, Breezeline, Windstream/Kinetic, Metronet,
Starlink, Brightspeed, Google Fiber**.

**Web UI v1 done + deployed to GitHub Pages.** `scripts/build-site.mjs` generates `docs/index.html` —
a single self-contained page (data + CSS + JS inlined, ~300KB) you can open by double-clicking (works
offline; no server/build). It has speed/provider filters, a 12- vs 36-month term toggle, an
"alternative offer" comparison box, prominent PROMO flags, and source-label links. Served publicly via
GitHub Pages from the `/docs` folder. View locally: double-click `docs/index.html` or `npm run site`.
`web/` is reserved for the future Next.js app (live address lookup).

**Next up:** (a) the four "ready" ISPs that need special handling — Xfinity (56MB/dated URL),
T-Mobile + Optimum (XLSX), HughesNet (vertical format); (b) the 10 "todo" ISPs behind JS/bot gates
(need a headless browser); (c) live address availability via the FCC Broadband Map API; (d) GitHub
repo + weekly Action; (e) migrate UI to Next.js. See the registry `notes` per ISP.

**Critical correctness note:** ISPs disagree on what the "monthly price" column MEANS. AT&T/Brightspeed
put the PROMO price there (`main_is_promo`); Spectrum and the standard-FCC ISPs put the REGULAR price
there with the promo in a separate column (`main_is_regular`). `normalize.mjs` handles this via
per-format `priceSemantics`. Getting it wrong silently corrupts every total-cost number, so verify it
whenever adding an ISP.

**Decided:**
- **Language: JavaScript/Node for the whole repo** (one language; the GitHub Action runs a Node
  script and the future Next.js app reads the same JSON). No Python here, unlike PM-Pricing-Tracker.
- **BroadbandNow is a coverage checklist only, not a data source** — it's 5,200+ label *images*, no
  structured data. We pull each ISP's own machine-readable file. See `FEASIBILITY.md` "alternatives".
- **No external npm deps for ingestion** — dependency-free CSV parsing, native `fetch`. Keeps it
  simple and local-friendly per Andrew's preference.

## Architecture (planned — mirrors the PM-Pricing-Tracker pattern)
- **No database.** Normalized JSON files committed to the repo *are* the database. Each weekly commit
  is the pricing history (`git log` = the archive).
- **Ingestion:** GitHub Actions cron (weekly) fetches each ISP's machine-readable file, normalizes it
  to one common JSON schema, and commits it back. Fetcher must send a real browser user-agent (ISPs
  403 generic bots). Some ISPs (e.g. Xfinity) hide the file behind JavaScript and need a headless
  browser; others (AT&T) expose a direct file link.
- **Availability:** FCC National Broadband Map API maps an address → which ISPs serve it. Requires a
  free username+token; cache aggressively (rate-limited).
- **Web app:** Next.js + Tailwind, deployed to Vercel. Single ZIP/address input → results table with
  total-cost math, intro-rate flag, and a link back to each ISP's source label.
- **Hosting decision:** GitHub repo + GitHub Actions confirmed; Vercel added later (user has GitHub
  only for now).

## Key facts learned in research (don't re-derive these)
- AT&T's file: `att.com/scmsassets/nutritionlabels/csv/csvfile/BBFMachineReadable.csv` — direct CSV,
  ~348 plans, full FCC schema. Mixes mobile + fixed; filter to fixed residential internet.
- FCC schema fields confirmed present: FCCPlanId, priceAmount, introductoryRateValue,
  priceAfterIntroductory, introductoryPeriodLength, contractPeriod, terminationFee, oneTimeFee,
  monthlyFee, tax, speedsDownloadSpeed/UploadSpeed, dataMonthly.
- There is NO standard URL across ISPs — discovery is a one-time manual-ish job per ISP. Phase the
  build "easy direct-file ISPs first, JS-gated ISPs second."

## File structure
```
BroadbandFacts/
├── CLAUDE.md            ← this file
├── FEASIBILITY.md       ← the go/no-go research report
├── README.md            ← schema + how to add an ISP
├── data/
│   ├── isps.json        ← registry of all 24 ISPs: file URL, format, status, notes
│   ├── raw/<id>.csv     ← latest raw file per ISP (what normalize reads)
│   ├── normalized/plans.json  ← cleaned plan data + TCO, the source of truth
│   └── snapshots/YYYY-MM-DD/   ← dated raw archives (the history / moat)
├── scripts/
│   ├── fetch.mjs        ← download active ISPs' files (browser UA; multi-file aware)
│   ├── normalize.mjs    ← FORMAT presets → common schema + price semantics + TCO + dedupe
│   ├── report.mjs       ← CLI comparison view
│   ├── build-site.mjs   ← generates the self-contained docs/index.html
│   └── lib/             ← parse.mjs (CSV + value parsers), tco.mjs (cost math)
├── docs/index.html      ← the generated website (served by GitHub Pages)
├── web/                 ← reserved for the future Next.js app (NOT built yet)
└── .github/workflows/   ← weekly ingestion cron (NOT built yet)
```

## Licensing
Public-interest transparency project → MIT or Apache 2.0 (decide at repo creation).

## Reference projects in this workspace
- `~/Documents/Claude/Projects/PM-Pricing-Tracker/` — same "JSON-in-repo + weekly cron + no DB"
  architecture; reuse its patterns for the ingestion job and data schema.
