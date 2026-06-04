// Small, dependency-free helpers for reading messy ISP CSV files and turning
// their values into clean numbers/booleans. No npm packages on purpose.

/**
 * Parse RFC-4180 CSV text into an array of row objects keyed by header name.
 * Handles quoted fields, commas inside quotes, escaped quotes (""), and
 * \r\n or \n line endings.
 */
export function parseCsv(text) {
  const rows = [];
  let field = "";
  let record = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } // escaped quote
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      record.push(field); field = "";
    } else if (c === "\n") {
      record.push(field); field = "";
      rows.push(record); record = [];
    } else if (c === "\r") {
      // ignore; \n handles the line break
    } else {
      field += c;
    }
  }
  // flush last field/record if the file didn't end in a newline
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    rows.push(record);
  }

  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1)
    .filter((r) => r.some((v) => v.trim() !== "")) // drop blank lines
    .map((r) => {
      const obj = {};
      header.forEach((key, idx) => { obj[key] = (r[idx] ?? "").trim(); });
      return obj;
    });
}

/** Some ISPs write "NULL"/"N/A" as the empty value. Treat those as blank. */
export function cleanNull(raw) {
  if (raw == null) return "";
  const s = String(raw).trim();
  if (/^(null|n\/a|na|none|-)$/i.test(s)) return "";
  return s;
}

/** "$60.00*", "110*", "Varies" -> 60.0, 110, null. Returns null if no number. */
export function parseMoney(raw) {
  const s = cleanNull(raw);
  if (s === "") return null;
  const m = s.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

/**
 * Some ISPs cram several fees into one cell, separated by ";" or ",".
 * e.g. monthly_provider_fees = "0.00;20.00".
 * mode "sum"   -> add them all (right for recurring add-ons that stack)
 * mode "first" -> just the first number (right for a one-time-fee menu where
 *                 only one typically applies; summing would wildly overstate)
 * Returns { value, multi } where multi=true if the cell had more than one number.
 */
export function parseFeeList(raw, mode = "sum") {
  const s = cleanNull(raw);
  if (s === "") return { value: 0, multi: false };
  const nums = (s.match(/-?\d+(\.\d+)?/g) || []).map(parseFloat);
  if (nums.length === 0) return { value: 0, multi: false };
  const value = mode === "first" ? nums[0] : nums.reduce((a, b) => a + b, 0);
  return { value, multi: nums.length > 1 };
}

/** "106.0 Mbps", "1 Gbps" -> 106.0, 1000 (Mbps). Returns null if no number. */
export function parseSpeedMbps(raw) {
  const s = cleanNull(raw);
  if (s === "") return null;
  const m = s.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  let val = parseFloat(m[0]);
  if (/gbps|gig/i.test(s)) val *= 1000;
  return val;
}

/** "12", "12 months" -> 12. Returns null if blank/none. */
export function parseMonths(raw) {
  const s = cleanNull(raw);
  if (s === "") return null;
  const m = s.match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

/**
 * Is this price an introductory (promotional) rate?
 * Handles the many ways ISPs phrase it: "is"/"is not", "Y"/"N",
 * "Yes"/"No", "true"/"false". Defaults to false when unclear.
 */
export function parseIntroFlag(raw) {
  if (raw == null) return false;
  const s = String(raw).trim().toLowerCase();
  if (s === "" ) return false;
  if (s.includes("not") || s === "n" || s === "no" || s === "false") return false;
  if (s === "is" || s === "y" || s === "yes" || s === "true") return true;
  // Some files put the word "introductory" in the cell when true.
  return s.includes("intro") || s.includes("is");
}
