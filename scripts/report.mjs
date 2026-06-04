// Quick text report to prove the pipeline works end-to-end on real data.
// (The real UI comes later as a Next.js page that reads the same plans.json.)
//
// Usage:
//   node scripts/report.mjs
//   node scripts/report.mjs --offer=69          compare every plan to a $69/mo alternative
//   node scripts/report.mjs --min-speed=100     only plans with >=100 Mbps download
//   node scripts/report.mjs --offer=69 --min-speed=300 --limit=15

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { offerTco } from "./lib/tco.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function arg(name, def) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : def;
}
const offerMonthly = arg("offer") != null ? parseFloat(arg("offer")) : null;
const minSpeed = arg("min-speed") != null ? parseFloat(arg("min-speed")) : 0;
const limit = parseInt(arg("limit", "20"), 10);

const money = (n) => (n == null ? "  --  " : "$" + n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }));
const pad = (s, n) => String(s).slice(0, n).padEnd(n);
const padL = (s, n) => String(s).padStart(n);

async function main() {
  const data = JSON.parse(await readFile(join(ROOT, "data/normalized/plans.json"), "utf8"));

  const showSuspect = process.argv.includes("--include-bulk");
  const all = data.plans.filter((p) => (p.downloadMbps ?? 0) >= minSpeed);
  let plans = showSuspect ? all : all.filter((p) => !p.priceSuspect);
  const hidden = all.length - plans.length;
  plans.sort((a, b) => (a.tco36 ?? Infinity) - (b.tco36 ?? Infinity));
  plans = plans.slice(0, limit);

  const offer = offerMonthly != null ? { monthlyPrice: offerMonthly } : null;
  const offer36 = offer ? offerTco(offer, 36) : null;

  console.log(`\nBroadbandFacts — ${data.planCount} plans, generated ${data.generatedAt.slice(0, 10)}`);
  if (minSpeed) console.log(`Filter: download >= ${minSpeed} Mbps`);
  if (hidden && !showSuspect) console.log(`(${hidden} bulk/$0 placeholder plans hidden — add --include-bulk to show)`);
  if (offer) console.log(`Comparing against your offer: ${money(offerMonthly)}/mo  (36-mo total ${money(offer36)})`);
  console.log("");

  // header
  const cols = ["PROVIDER", "PLAN", "DOWN", "MONTHLY", "PROMO?", "AFTER", "12-MO", "36-MO"];
  if (offer) cols.push("VS OFFER(36mo)");
  console.log(
    pad(cols[0], 10) + pad(cols[1], 26) + padL(cols[2], 7) + " " + padL(cols[3], 8) +
    "  " + pad(cols[4], 7) + padL(cols[5], 7) + " " + padL(cols[6], 8) + padL(cols[7], 9) +
    (offer ? "   " + cols[8] : "")
  );
  console.log("-".repeat(offer ? 110 : 92));

  for (const p of plans) {
    const promo = p.isIntroductory ? `${p.introMonths ?? "?"}mo` : "no";
    let line =
      pad(p.provider, 10) +
      pad(p.planName, 26) +
      padL(p.downloadMbps != null ? Math.round(p.downloadMbps) : "?", 7) + " " +
      padL(money(p.monthlyPrice), 8) + "  " +
      pad(promo, 7) +
      padL(p.isIntroductory ? money(p.postIntroPrice) : "", 7) + " " +
      padL(money(p.tco12), 8) +
      padL(money(p.tco36), 9);
    if (offer) {
      const delta = p.tco36 != null && offer36 != null ? p.tco36 - offer36 : null;
      const tag = delta == null ? "" :
        delta > 0 ? `offer saves ${money(delta)}` : `plan saves ${money(-delta)}`;
      line += "   " + tag;
    }
    console.log(line);
  }
  console.log("");
}

main().catch((e) => {
  console.error("report.mjs crashed:", e);
  process.exitCode = 1;
});
