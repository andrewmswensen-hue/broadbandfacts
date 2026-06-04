// Fetch each active ISP's machine-readable Broadband Facts file and save:
//   - a dated snapshot   -> data/snapshots/YYYY-MM-DD/<id>.csv   (the archive / history)
//   - a "latest" copy    -> data/raw/<id>.csv                    (what normalize reads)
//
// ISPs 403 generic bots, so we send a real browser User-Agent. Failures are
// logged but don't crash the run — a stale "latest" copy is better than none.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function today() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": BROWSER_UA, Accept: "text/csv,text/plain,*/*" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function main() {
  const registry = JSON.parse(await readFile(join(ROOT, "data/isps.json"), "utf8"));
  const date = today();
  const snapDir = join(ROOT, "data/snapshots", date);
  const rawDir = join(ROOT, "data/raw");
  await mkdir(snapDir, { recursive: true });
  await mkdir(rawDir, { recursive: true });

  const active = registry.isps.filter(
    (i) => i.status === "active" && i.method === "direct-csv" && (i.fileUrl || i.fileUrls)
  );

  console.log(`Fetching ${active.length} active ISP(s) for ${date}...\n`);
  const results = [];

  for (const isp of active) {
    // An ISP may publish one file (fileUrl) or several (fileUrls, e.g. per state).
    const urls = isp.fileUrls || [isp.fileUrl];
    let okFiles = 0, totalRows = 0, lastErr = null;
    for (let i = 0; i < urls.length; i++) {
      const fname = isp.fileUrls ? `${isp.id}-${i}.csv` : `${isp.id}.csv`;
      try {
        const text = await fetchText(urls[i]);
        totalRows += text.split("\n").filter((l) => l.trim()).length - 1;
        await writeFile(join(snapDir, fname), text);
        await writeFile(join(rawDir, fname), text);
        okFiles++;
      } catch (err) {
        lastErr = err;
      }
    }
    if (okFiles > 0) {
      console.log(`  ok   ${isp.name.padEnd(22)} ${totalRows} rows` +
        (urls.length > 1 ? ` (${okFiles}/${urls.length} files)` : ""));
      results.push({ id: isp.id, ok: true, rows: totalRows });
    } else {
      const hadCopy = existsSync(join(rawDir, `${isp.id}.csv`)) ||
        existsSync(join(rawDir, `${isp.id}-0.csv`));
      console.warn(`  FAIL ${isp.name.padEnd(22)} ${lastErr?.message}` +
        (hadCopy ? "  (keeping previous copy — will show as stale)" : "  (no prior copy!)"));
      results.push({ id: isp.id, ok: false, error: lastErr?.message, stale: hadCopy });
    }
  }

  const okCount = results.filter((r) => r.ok).length;
  console.log(`\nDone: ${okCount}/${active.length} fetched successfully.`);
  if (okCount === 0 && active.length > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error("fetch.mjs crashed:", e);
  process.exitCode = 1;
});
