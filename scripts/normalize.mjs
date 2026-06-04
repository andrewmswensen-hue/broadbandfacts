// Read each active ISP's raw file(s), map through that ISP's FORMAT into ONE
// common schema, compute total-cost numbers, dedupe, and write the single
// source of truth: data/normalized/plans.json
//
// Different ISPs publish different column layouts ("formats") AND different
// price meanings. The two big gotchas this handles:
//   1. Column names differ  -> each FORMAT has a fieldMap of OUR keys -> their columns.
//   2. Price MEANING differs -> priceSemantics says whether the "main price"
//      column is the PROMO price (AT&T) or the REGULAR price (Spectrum & most).
//
// Adding a standard-format ISP needs no code here — just a registry entry that
// names a format. Only genuinely new layouts need a new FORMAT below.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseCsv, parseMoney, parseSpeedMbps, parseMonths, parseIntroFlag,
  parseFeeList, cleanNull,
} from "./lib/parse.mjs";
import { planTco } from "./lib/tco.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// FORMAT presets. Each maps OUR semantic keys to an ISP file's column headers.
// priceSemantics:
//   "main_is_regular" -> mainPrice column = ongoing price; altPrice = promo price
//   "main_is_promo"   -> mainPrice column = promo/current price; altPrice = price after
// serviceTypeField: which column says Fixed/Mobile/etc (null = no such column).
// ---------------------------------------------------------------------------
const FORMATS = {
  // AT&T's own layout.
  att: {
    priceSemantics: "main_is_promo",
    serviceTypeField: "serviceType",
    fieldMap: {
      planId: "FCCPlanId", planName: "planName",
      mainPrice: "priceAmount", altPrice: "priceAfterIntroductory",
      introFlag: "introductoryRateValue", introMonths: "introductoryPeriodLength",
      contractMonths: "contractPeriod", earlyTerminationFee: "terminationFee",
      monthlyFee: "monthlyFee", oneTimeFee: "oneTimeFee",
      downloadSpeed: "speedsDownloadSpeed", uploadSpeed: "speedsUploadSpeed",
      dataCap: "dataMonthly",
    },
  },

  // The common FCC machine-readable layout (snake_case). Used by Spectrum, Cox,
  // WOW!, Breezeline, Windstream/Kinetic, Metronet.
  "fcc-snake": {
    priceSemantics: "main_is_regular",
    serviceTypeField: "connection_type",
    fieldMap: {
      planId: "unique_plan_id", planName: "service_plan_name",
      mainPrice: "monthly_price", altPrice: "intro_rate_price",
      introFlag: "intro_rate", introMonths: "intro_rate_time",
      contractMonths: "contract_time", earlyTerminationFee: "early_termination_fee",
      monthlyFee: "monthly_provider_fee", oneTimeFee: "single_purchase_fees",
      downloadSpeed: "typical_download_speed", uploadSpeed: "typical_upload_speed",
      dataCap: "monthly_data_allow",
    },
  },

  // Same as fcc-snake but CamelCase headers. Used by Starlink.
  "fcc-camel": {
    priceSemantics: "main_is_regular",
    serviceTypeField: "ConnectionType",
    fieldMap: {
      planId: "UniquePlanID", planName: "ServicePlanName",
      mainPrice: "MonthlyPrice", altPrice: "IntroRatePrice",
      introFlag: "IntroRate", introMonths: "IntroRateTime",
      contractMonths: "ContractTime", earlyTerminationFee: "EarlyTerminationFee",
      monthlyFee: "MonthlyProviderFee01", oneTimeFee: "SinglePurchaseFees",
      downloadSpeed: "TypicalDownloadSpeed", uploadSpeed: "TypicalUploadSpeed",
      dataCap: "MonthlyDataAllow",
    },
  },

  // Brightspeed's human-readable layout. mainPrice is the current/promo price,
  // "Price After Intro" is the post-promo price.
  brightspeed: {
    priceSemantics: "main_is_promo",
    serviceTypeField: "Fixed / Mobile",
    fieldMap: {
      planId: "UPI", planName: "Plan Name",
      mainPrice: "Monthly Price", altPrice: "Price After Intro",
      introFlag: "Introductory Rate?", introMonths: "Time Intro Applies",
      contractMonths: "Length of Contract", earlyTerminationFee: "ETF",
      monthlyFee: null, oneTimeFee: null, // fee columns are ambiguous; omit for now
      downloadSpeed: "Download", uploadSpeed: "Upload", dataCap: "Data Included",
    },
  },

  // Google Fiber per-state files. No promos, no service-type column.
  "google-fiber": {
    priceSemantics: "main_is_promo",
    serviceTypeField: null,
    fieldMap: {
      planId: "Fcc Unique Plan Id", planName: "Product Name",
      mainPrice: "Monthly Price", altPrice: null,
      introFlag: null, introMonths: null,
      contractMonths: null, earlyTerminationFee: "Early Termination Fee",
      monthlyFee: "Provider Fees", oneTimeFee: "One-time Fees at the Time of Purchase",
      downloadSpeed: "Typical Download Speed", uploadSpeed: "Typical Upload Speed",
      dataCap: "Data Included with Monthly Price",
    },
  },
};

function resolveFormat(isp) {
  const base = FORMATS[isp.format];
  if (!base) throw new Error(`Unknown format "${isp.format}" for ${isp.name}`);
  // Allow per-ISP overrides (e.g. Spectrum uses plural "monthly_provider_fees";
  // WOW! puts "Fixed" in tier_plan_name instead of connection_type).
  return {
    priceSemantics: isp.priceSemantics || base.priceSemantics,
    serviceTypeField: isp.serviceTypeField ?? base.serviceTypeField,
    fieldMap: { ...base.fieldMap, ...(isp.fieldMapOverride || {}) },
  };
}

/** Keep only residential fixed-internet rows for this ISP. */
function keepRow(row, fmt, isp) {
  const field = fmt.serviceTypeField;
  if (!field) return true; // ISP file has no service-type column (e.g. Google Fiber)
  const val = cleanNull(row[field]);
  if (val === "") return true; // blank -> can't tell, keep it
  if (isp.keepServiceTypes && isp.keepServiceTypes.length) {
    return isp.keepServiceTypes.some((t) => t.toLowerCase() === val.toLowerCase());
  }
  return !/mobile|wireless/i.test(val); // default: drop mobile/cellular rows
}

/** Map one raw row -> common normalized plan with correct price semantics + TCO. */
function normalizeRow(row, fmt, isp) {
  const f = fmt.fieldMap;
  const get = (key) => (f[key] ? cleanNull(row[f[key]]) : "");

  const mainPrice = parseMoney(get("mainPrice"));
  const altPrice = parseMoney(get("altPrice"));
  const introFlag = parseIntroFlag(get("introFlag"));
  const introMonths = parseMonths(get("introMonths"));
  const hasIntro = introFlag && introMonths != null && altPrice != null;

  // Resolve the two prices into "what you pay now" vs "what you pay after promo".
  let monthlyPrice, postIntroPrice;
  if (hasIntro && fmt.priceSemantics === "main_is_regular") {
    monthlyPrice = altPrice;        // promo price is in the alt column
    postIntroPrice = mainPrice;     // regular price is the main column
  } else if (hasIntro && fmt.priceSemantics === "main_is_promo") {
    monthlyPrice = mainPrice;       // promo price is the main column
    postIntroPrice = altPrice;      // regular price is the alt column
  } else {
    monthlyPrice = mainPrice;       // no promo -> one price
    postIntroPrice = null;
  }

  const monthly = parseFeeList(get("monthlyFee"), "sum");   // recurring add-ons stack
  const oneTime = parseFeeList(get("oneTimeFee"), "first"); // fee menu -> take primary

  const plan = {
    ispId: isp.id,
    provider: isp.name,
    planId: get("planId") || null,
    planName: get("planName") || "(unnamed plan)",
    monthlyPrice,
    isIntroductory: hasIntro,
    introMonths: hasIntro ? introMonths : null,
    postIntroPrice: hasIntro ? postIntroPrice : null,
    contractMonths: parseMonths(get("contractMonths")),
    earlyTerminationFee: parseMoney(get("earlyTerminationFee")),
    monthlyFee: monthly.value,
    oneTimeFee: oneTime.value,
    feesApproximate: monthly.multi || oneTime.multi, // flag when fee cell had a menu
    downloadMbps: parseSpeedMbps(get("downloadSpeed")),
    uploadMbps: parseSpeedMbps(get("uploadSpeed")),
    dataCap: get("dataCap") || null,
    sourceUrl: isp.labelPageUrl || isp.homepage || null,
  };
  // $0/$1 cells are real in the files but are bulk/MDU or placeholder rows, not
  // consumer retail offers. Flag them so the default comparison can hide them.
  plan.priceSuspect = plan.monthlyPrice != null && plan.monthlyPrice < 5;
  plan.tco12 = planTco(plan, 12);
  plan.tco36 = planTco(plan, 36);
  return plan;
}

/** Collapse exact-duplicate plans (regional/per-state repeats of the same offer). */
function dedupe(plans) {
  const seen = new Map();
  for (const p of plans) {
    const key = [p.ispId, p.planName, p.monthlyPrice, p.downloadMbps,
      p.isIntroductory, p.postIntroPrice].join("|");
    if (!seen.has(key)) seen.set(key, p);
  }
  return [...seen.values()];
}

async function main() {
  const registry = JSON.parse(await readFile(join(ROOT, "data/isps.json"), "utf8"));
  const outDir = join(ROOT, "data/normalized");
  await mkdir(outDir, { recursive: true });

  let plans = [];
  const sources = [];

  for (const isp of registry.isps.filter((i) => i.status === "active")) {
    const fmt = resolveFormat(isp);
    const files = isp.fileUrls ? isp.fileUrls.map((_, i) => `${isp.id}-${i}.csv`)
      : [`${isp.id}.csv`];
    let rawCount = 0;
    const ispPlans = [];
    let missing = false;
    for (const fname of files) {
      const rawPath = join(ROOT, "data/raw", fname);
      if (!existsSync(rawPath)) { missing = true; continue; }
      const rows = parseCsv(await readFile(rawPath, "utf8"));
      rawCount += rows.length;
      for (const r of rows) {
        if (!keepRow(r, fmt, isp)) continue;
        const p = normalizeRow(r, fmt, isp);
        if (p.monthlyPrice != null) ispPlans.push(p);
      }
    }
    if (missing && ispPlans.length === 0) {
      console.warn(`  skip ${isp.name}: no raw file (run fetch first)`);
      sources.push({ id: isp.id, name: isp.name, ok: false, reason: "no raw file" });
      continue;
    }
    plans.push(...ispPlans);
    console.log(`  ${isp.name.padEnd(22)} ${rawCount} rows -> ${ispPlans.length} plans`);
    sources.push({ id: isp.id, name: isp.name, ok: true, plans: ispPlans.length });
  }

  const before = plans.length;
  plans = dedupe(plans);
  console.log(`\nDeduped ${before} -> ${plans.length} plans.`);

  const out = {
    generatedAt: new Date().toISOString(),
    schemaVersion: 2,
    sources,
    planCount: plans.length,
    plans,
  };
  await writeFile(join(outDir, "plans.json"), JSON.stringify(out, null, 2));
  console.log(`Wrote data/normalized/plans.json — ${plans.length} plans from ${sources.filter((s) => s.ok).length} ISPs.`);
}

main().catch((e) => {
  console.error("normalize.mjs crashed:", e);
  process.exitCode = 1;
});
