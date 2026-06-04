# BroadbandFacts.io — Feasibility Report
*Prepared June 4, 2026. No code written yet — this is the "should we build it?" investigation.*

## Bottom line: YES, build it — but treat it as time-sensitive

The core bet works. I downloaded a real, live ISP data file during this research and it contains
exactly the fields the tool needs. No one is currently doing the comparison/total-cost angle you
want to do. **But** the federal rule that forces ISPs to publish this data in an easy-to-grab format
is actively being rolled back right now, which is an argument for building *sooner*, not later — and
for designing the tool so it survives the rule going away.

---

## What I actually verified (not assumptions)

### 1. The data is real and live today ✅
I pulled AT&T's machine-readable "Broadband Facts" file straight off their website during this
research:
- **348 plans** in a single file (218 KB), downloaded cleanly.
- It contains every field the comparison tool depends on: plan ID, monthly price, "is this an
  intro rate?", the price *after* the promo ends, how many months the promo lasts, contract length,
  early-termination fee, one-time fees, monthly fees (modem rental, etc.), taxes, download/upload
  speeds, and data caps.
- File location: `att.com/scmsassets/nutritionlabels/csv/csvfile/BBFMachineReadable.csv`

That single confirmation de-risks the whole project. The "intro price vs. real price after the promo"
data — the headline number you care most about — is right there in the file.

### 2. The rule that requires this is live, but being deleted ⚠️ (the urgency)
- ISPs have been **required** to publish this machine-readable file since **October 10, 2024**.
- On **October 28, 2025** the FCC adopted a proposal literally titled *"Empowering Broadband
  Consumers Through Transparency; Delete, Delete, Delete"* that proposes to **eliminate the
  requirement** that ISPs host these files at a findable URL (along with a few other consumer
  protections like phone read-outs and itemized fees).
- The public comment window **closed Jan 16, 2026** (replies Feb 16, 2026). As of today, **a final
  FCC vote to kill the requirement could happen at any time.**

**What this means for us:** the easy, structured data may not be required much longer. That's not a
reason to skip the project — it's the reason to build it now and start *archiving* the data weekly.
If the mandate dies, a tool that already captured the history becomes one of the few places this
information still exists in comparable form. The brief already anticipated this; the research confirms
it's not hypothetical — it's in motion.

### 3. Nobody is doing the comparison tool you want ✅ (open lane)
I checked the existing players:
- **BroadbandNow** — has a big gallery of label *images* from 40+ ISPs, but no ZIP search, no
  side-by-side price comparison, and no total-cost math. It's a reference library, not a tool.
- **nationalbroadband.com** — just a list of links out to each ISP's page, wrapped in a lead-gen
  pitch ("talk to our agents"). Not a real aggregator.
- **jlivingood/Broadband-Labels** (GitHub) — a technical standards project about the *file format*,
  not a consumer aggregator. Useful as a reference for us, not a competitor.

So the specific thing you described — enter an address/ZIP, see every available plan's **true total
cost over a 1- and 3-year lease**, with the promo-rate trap flagged, compared against a bulk/group
rate — **does not exist today.** That's the gap.

### 4. The "address → which ISPs serve this home" piece is doable ✅ (with setup)
The FCC's National Broadband Map has an official API for "which providers serve this address."
It requires a free registration (username + token) and has rate limits, so we cache results
aggressively. Standard stuff, no blocker.

---

## The real costs and landmines (verified, not guessed)

### Landmine #1: Every ISP hides the file differently
This is the biggest *time* cost. There is no standard URL.
- **AT&T** — easy. The download link was embedded in the page; one direct fetch gets all 348 plans.
- **Xfinity (Comcast)** — hard. The file is buried behind JavaScript and an address-entry gate;
  I could not find a direct file link in the page. This one likely needs a headless browser
  (a robot that loads the page like a real visitor) or hand-finding the URL once.
- **Verizon** — page loads fine, not yet dug into.
- **Spectrum** — their server threw a connection error on first try; needs a retry with different
  settings.

**Takeaway:** onboarding each ISP is a small one-time research job, not a copy-paste. Budget for
"AT&T-easy" vs. "Xfinity-hard" tiers. This is exactly why the brief called for a discovery utility
and a manual-entry fallback — both are justified.

### Landmine #2: Bot-blocking is real but beatable
The ISP pages block generic automated fetchers (my first AT&T attempt got a "403 Forbidden").
Sending a normal browser identity fixed it instantly (200 OK). So this is a speed bump, not a wall —
but it means the weekly fetch job has to pretend to be a browser, and a few ISPs may need the
full headless-browser treatment.

### Landmine #3: Files mix mobile + home internet
AT&T's file includes mobile phone plans alongside home internet. We filter to fixed/residential
internet only. Minor, but a real data-cleaning step per ISP.

---

## Recommended path (revised based on findings)

The original brief's plan is sound. The research suggests two adjustments:

1. **Lead with archiving, not just display.** Start capturing weekly snapshots of every ISP file
   *immediately*, even before the pretty UI exists. If the FCC kills the mandate mid-build, you'll
   already own the historical record — which becomes the moat. (This was a stretch goal; the
   deregulation timing promotes it to a core feature.)

2. **Phase the ISPs by difficulty.** Start the MVP with the "easy" direct-file ISPs (AT&T confirmed;
   likely Verizon, Frontier, CenturyLink) to prove the full pipeline end-to-end fast. Add the
   "hard" JS-gated ones (Xfinity, maybe Spectrum/Cox) in a second pass with a headless browser.
   Don't let Xfinity's difficulty hold up the whole launch.

### Suggested next step if you green-light it
A 1–2 ISP **proof-of-pipeline**: fetch AT&T (done) + one more, normalize both into one clean JSON
format, compute the 12- and 36-month total-cost numbers, and render a bare-bones results table for
one ZIP. That proves the entire spine — fetch → normalize → compare → display — on real data before
investing in the full registry and polished UI.

---

## Go / No-Go scorecard

| Question | Verdict |
|---|---|
| Does the structured data actually exist? | ✅ Yes — confirmed with a real download |
| Does it contain the fields we need (intro vs. real price, fees, etc.)? | ✅ Yes — all present |
| Can we fetch it programmatically? | ✅ Yes — with a browser identity; some ISPs need a headless browser |
| Is the comparison/TCO niche open? | ✅ Yes — nobody does it |
| Can we map address → available ISPs? | ✅ Yes — FCC API, free, cache it |
| Is the data source stable? | ⚠️ No — actively being deregulated; build now, archive now |
| Per-ISP onboarding effort | ⚠️ Moderate — uneven, manual-ish, one-time per ISP |

**Overall: GO, with urgency.** The data is real, the lane is open, and the only serious risk
(the rule going away) is itself a reason to move quickly and lean into archiving.

---

## Sources
- [FCC Broadband Consumer Labels (official hub)](https://www.fcc.gov/broadbandlabels)
- [FCC FNPRM Fact Sheet, Oct 7 2025 (PDF)](https://docs.fcc.gov/public/attachments/DOC-415057A1.pdf)
- [Federal Register: "Empowering Broadband Consumers Through Transparency; Delete, Delete, Delete"](https://www.federalregister.gov/documents/2025/12/03/2025-21807/empowering-broadband-consumers-through-transparency-delete-delete-delete)
- [FCC machine-readable file data specifications (PDF)](https://www.fcc.gov/sites/default/files/broadband-label-machine-readable-file-data-specifications.pdf)
- [AT&T machine-readable plans page](https://www.att.com/broadbandlabels/broadband-facts-machine-readable-plans/)
- [Xfinity broadband labels](https://www.xfinity.com/broadband-labels)
- [FCC National Broadband Map Public Data API spec (PDF)](https://www.fcc.gov/sites/default/files/bdc-public-data-api-spec.pdf)
- [BroadbandNow Consumer Labels Hub (existing player)](https://broadbandnow.com/broadband-consumer-labels)
- [jlivingood/Broadband-Labels (format standards project)](https://github.com/jlivingood/Broadband-Labels)
