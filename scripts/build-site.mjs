// Generate a single self-contained web page (web/index.html) from plans.json.
// Everything (data + CSS + JS) is inlined so the file can be opened by
// double-clicking — no server, no install, works offline. This is the MVP UI;
// it migrates to Next.js when we add live address-availability lookup.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const data = JSON.parse(await readFile(join(ROOT, "data/normalized/plans.json"), "utf8"));
  // Hide $0/$1 bulk/MDU placeholder rows from the consumer view.
  const plans = data.plans.filter((p) => !p.priceSuspect).map((p) => ({
    provider: p.provider, planName: p.planName,
    dl: p.downloadMbps, ul: p.uploadMbps,
    price: p.monthlyPrice, intro: p.isIntroductory, introMo: p.introMonths,
    after: p.postIntroPrice, mFee: p.monthlyFee, oFee: p.oneTimeFee,
    contract: p.contractMonths, etf: p.earlyTerminationFee,
    cap: p.dataCap, approx: p.feesApproximate,
    tco12: p.tco12, tco36: p.tco36, src: p.sourceUrl,
  }));
  const providers = [...new Set(plans.map((p) => p.provider))].sort();
  const dateStr = data.generatedAt.slice(0, 10);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Broadband Facts — true cost of internet plans</title>
<style>
:root{--ink:#10212b;--muted:#5b6b75;--line:#e2e8ee;--bg:#f6f8fa;--card:#fff;--accent:#0b6b9c;--promo:#b4530a;--promobg:#fff3e6;--good:#0a7d52;--bad:#b21f2d}
*{box-sizing:border-box}
body{margin:0;font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:var(--ink);background:var(--bg)}
header{background:var(--card);border-bottom:1px solid var(--line);padding:22px 20px}
.wrap{max-width:1180px;margin:0 auto;padding:0 20px}
h1{margin:0 0 4px;font-size:24px;letter-spacing:-.3px}
.sub{color:var(--muted);font-size:14px;max-width:760px}
.controls{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-end;margin:18px auto;max-width:1180px;padding:16px 20px;background:var(--card);border:1px solid var(--line);border-radius:12px}
.ctrl{display:flex;flex-direction:column;gap:5px}
.ctrl label{font-size:12px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.4px}
.ctrl input,.ctrl select{padding:9px 11px;border:1px solid var(--line);border-radius:8px;font-size:14px;background:#fff;min-width:140px}
.ctrl input:focus,.ctrl select:focus{outline:2px solid var(--accent);outline-offset:0;border-color:var(--accent)}
.note{font-size:12px;color:var(--muted);margin-top:3px}
.pill{display:inline-block;font-size:11px;font-weight:700;padding:2px 7px;border-radius:999px;background:var(--promobg);color:var(--promo);vertical-align:middle}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}
th,td{padding:11px 12px;text-align:left;border-bottom:1px solid var(--line);font-size:14px;white-space:nowrap}
th{background:#fafcfd;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);cursor:pointer;user-select:none}
th.num,td.num{text-align:right}
tr:last-child td{border-bottom:none}
tbody tr:hover{background:#f9fcfe}
.prov{font-weight:600}
.plan{color:var(--muted);font-size:13px;white-space:normal;max-width:240px}
.tco{font-weight:700;font-size:15px}
.promo-row{background:var(--promobg)!important}
.after{color:var(--promo);font-weight:600}
.delta-good{color:var(--good);font-weight:600}
.delta-bad{color:var(--bad);font-weight:600}
.src a{color:var(--accent);text-decoration:none}
.src a:hover{text-decoration:underline}
.count{color:var(--muted);font-size:13px;margin:14px 20px}
.tip{position:relative;cursor:help;border-bottom:1px dotted var(--muted)}
.tip .box{display:none;position:absolute;left:0;top:130%;width:300px;white-space:normal;background:#10212b;color:#fff;padding:10px 12px;border-radius:8px;font-size:12px;font-weight:400;z-index:5;box-shadow:0 6px 22px rgba(0,0,0,.18)}
.tip:hover .box{display:block}
footer{max-width:1180px;margin:30px auto;padding:0 20px;color:var(--muted);font-size:12px}
.legend{display:flex;gap:18px;flex-wrap:wrap;margin:8px 20px 0;font-size:12px;color:var(--muted)}
@media(max-width:720px){.plan{max-width:160px}th,td{padding:8px}}
</style>
</head>
<body>
<header><div class="wrap" style="padding:0">
  <h1>Broadband Facts</h1>
  <div class="sub">The real cost of internet plans, pulled straight from each provider's FCC-mandated
  Broadband Facts label. We show <strong>total cost over a 1- and 3-year term</strong> — not the
  teaser monthly price — and flag every
  <span class="tip">promotional rate<span class="box"><strong>Promotional (intro) pricing:</strong>
  a low rate for the first few months that jumps to a higher "regular" price afterward. A plan with a
  cheap intro rate can cost more over 3 years than one with a higher flat price. That's why we rank by
  total cost, not the sticker price.</span></span>.</div>
</div></header>

<div class="controls wrap">
  <div class="ctrl">
    <label>Address or ZIP</label>
    <input id="addr" placeholder="e.g. 43215" autocomplete="off">
    <div class="note">Availability lookup coming soon — showing all plans for now.</div>
  </div>
  <div class="ctrl">
    <label>Minimum speed</label>
    <select id="speed">
      <option value="0">Any speed</option>
      <option value="100">100+ Mbps</option>
      <option value="300">300+ Mbps</option>
      <option value="500">500+ Mbps</option>
      <option value="940">Gigabit (940+)</option>
    </select>
  </div>
  <div class="ctrl">
    <label>Provider</label>
    <select id="provider"><option value="">All providers</option>
      ${providers.map((p) => `<option>${esc(p)}</option>`).join("")}
    </select>
  </div>
  <div class="ctrl">
    <label>Compare term</label>
    <select id="term"><option value="36">3 years (36 mo)</option><option value="12">1 year (12 mo)</option></select>
  </div>
  <div class="ctrl">
    <label>Your alternative offer</label>
    <input id="offer" type="number" min="0" placeholder="$ / month">
    <div class="note">e.g. a bulk "group rate" to compare against.</div>
  </div>
</div>

<div class="legend">
  <span><span class="pill">PROMO</span> price rises after the intro period</span>
  <span>Total cost includes monthly + recurring fees + one-time fees</span>
</div>
<div class="count" id="count"></div>
<div class="wrap"><table>
  <thead><tr>
    <th data-sort="provider">Provider</th>
    <th data-sort="planName">Plan</th>
    <th class="num" data-sort="dl">Down</th>
    <th class="num" data-sort="price">Monthly</th>
    <th data-sort="intro">Promo?</th>
    <th class="num" data-sort="after">After promo</th>
    <th class="num" data-sort="tco">Total cost</th>
    <th class="num" data-sort="delta">vs your offer</th>
    <th>Source</th>
  </tr></thead>
  <tbody id="rows"></tbody>
</table></div>

<footer>
  Data generated ${dateStr} from each provider's machine-readable FCC Broadband Facts file
  (${plans.length} residential plans across ${providers.length} providers). Prices and fees come
  directly from the providers; total-cost figures are computed by this tool. Always verify against
  the linked source label before purchasing. Bulk/MDU $0 placeholder rows are excluded.
  This is a public-interest transparency project, not affiliated with the FCC or any ISP.
</footer>

<script>
const PLANS = ${JSON.stringify(plans)};
const $ = (id) => document.getElementById(id);
let sortKey = "tco", sortDir = 1;

const money = (n) => n==null ? "—" : "$" + Math.round(n).toLocaleString();
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;"}[c]));

function offerTco(term){ const v = parseFloat($("offer").value); return (v>0) ? v*term : null; }

function render(){
  const minSpeed = +$("speed").value;
  const prov = $("provider").value;
  const term = +$("term").value;
  const oTco = offerTco(term);
  const tcoKey = term===12 ? "tco12" : "tco36";

  let rows = PLANS.filter(p => (p.dl||0) >= minSpeed && (!prov || p.provider===prov));

  rows.forEach(p => {
    p._tco = p[tcoKey];
    p._delta = (oTco!=null && p._tco!=null) ? (p._tco - oTco) : null;
  });
  rows.sort((a,b)=>{
    let av,bv;
    if(sortKey==="tco"){av=a._tco??1e15;bv=b._tco??1e15;}
    else if(sortKey==="delta"){av=a._delta??1e15;bv=b._delta??1e15;}
    else {av=a[sortKey]; bv=b[sortKey];}
    if(typeof av==="string"){return av.localeCompare(bv)*sortDir;}
    return ((av??1e15)-(bv??1e15))*sortDir;
  });

  $("count").textContent = rows.length + " plans" +
    (oTco!=null ? "  ·  your offer: " + money(parseFloat($("offer").value)) + "/mo = " + money(oTco) + " over " + term + " months" : "");

  $("rows").innerHTML = rows.slice(0,400).map(p => {
    const promo = p.intro
      ? '<span class="pill">PROMO '+(p.introMo||"?")+'mo</span>'
      : '<span style="color:#9aa7b0">flat</span>';
    const after = p.intro ? '<span class="after">'+money(p.after)+'</span>' : "—";
    let delta = "—";
    if(p._delta!=null){
      delta = p._delta>0
        ? '<span class="delta-good">offer saves '+money(p._delta)+'</span>'
        : '<span class="delta-bad">plan saves '+money(-p._delta)+'</span>';
    }
    const feeNote = p.approx ? ' <span class="tip" style="color:#9aa7b0">*<span class="box">This provider lists several fees in one field; the fee figure is a best-effort estimate. Check the source label.</span></span>' : "";
    return '<tr class="'+(p.intro?'promo-row':'')+'">'
      + '<td class="prov">'+esc(p.provider)+'</td>'
      + '<td class="plan">'+esc(p.planName)+'</td>'
      + '<td class="num">'+(p.dl!=null?Math.round(p.dl):"?")+'</td>'
      + '<td class="num">'+money(p.price)+'</td>'
      + '<td>'+promo+'</td>'
      + '<td class="num">'+after+'</td>'
      + '<td class="num tco">'+money(p._tco)+feeNote+'</td>'
      + '<td class="num">'+delta+'</td>'
      + '<td class="src">'+(p.src?'<a href="'+esc(p.src)+'" target="_blank" rel="noopener">label ↗</a>':"—")+'</td>'
      + '</tr>';
  }).join("");
}

document.querySelectorAll("th[data-sort]").forEach(th=>{
  th.addEventListener("click",()=>{
    const k = th.dataset.sort;
    if(sortKey===k){sortDir*=-1;} else {sortKey=k;sortDir=(k==="provider"||k==="planName")?1:1;}
    render();
  });
});
["speed","provider","term","offer","addr"].forEach(id=>{
  $(id).addEventListener("input",render);
});
render();
</script>
</body>
</html>`;

  await mkdir(join(ROOT, "docs"), { recursive: true });
  await writeFile(join(ROOT, "docs/index.html"), html);
  console.log(`Wrote docs/index.html — ${plans.length} plans, ${providers.length} providers, ${(html.length / 1024).toFixed(0)} KB.`);
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

main().catch((e) => { console.error("build-site.mjs crashed:", e); process.exitCode = 1; });
