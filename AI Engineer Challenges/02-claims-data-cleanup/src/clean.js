"use strict";

/**
 * Cleans the messy claims CSV and writes:
 *   - data/claims_clean.csv
 *   - reports/data_quality_report.md
 *   - reports/data_quality_report.json
 */

const fs = require("fs");
const path = require("path");
const { parseCsv, toCsv } = require("./csv");

const ROOT = path.join(__dirname, "..");
const DIRTY = path.join(ROOT, "data", "claims_dirty.csv");
const CLEAN = path.join(ROOT, "data", "claims_clean.csv");
const REPORT_MD = path.join(ROOT, "reports", "data_quality_report.md");
const REPORT_JSON = path.join(ROOT, "reports", "data_quality_report.json");

const NULL_MARKER = "NULL";

const COLUMNS = [
  "claim_id",
  "policy_id",
  "member_name",
  "claim_type",
  "diagnosis",
  "submitted_amount",
  "currency",
  "submitted_date",
  "status",
];

const VALID_STATUSES = new Set([
  "APPROVED",
  "REJECTED",
  "PENDING",
  "IN_REVIEW",
]);

/** Map messy claim_type values → canonical */
const CLAIM_TYPE_MAP = {
  OUTPATIENT: "OUTPATIENT",
  outpatient: "OUTPATIENT",
  Outpateint: "OUTPATIENT",
  OutPatient: "OUTPATIENT",
  OP: "OUTPATIENT",
  op: "OUTPATIENT",
  INPATIENT: "INPATIENT",
  inpatient: "INPATIENT",
  Inpatinet: "INPATIENT",
  InPatient: "INPATIENT",
  IP: "INPATIENT",
  ip: "INPATIENT",
  DENTAL: "DENTAL",
  dental: "DENTAL",
  Dentl: "DENTAL",
  DENT: "DENTAL",
  PHARMACY: "PHARMACY",
  pharmacy: "PHARMACY",
  Pharmcy: "PHARMACY",
  RX: "PHARMACY",
  rx: "PHARMACY",
  EMERGENCY: "EMERGENCY",
  emergency: "EMERGENCY",
  Emergncy: "EMERGENCY",
  ER: "EMERGENCY",
  er: "EMERGENCY",
};

const CURRENCY_MAP = {
  THB: "THB",
  thb: "THB",
  Baht: "THB",
  baht: "THB",
  BAHT: "THB",
  VND: "VND",
  vnd: "VND",
  Dong: "VND",
  dong: "VND",
  DONG: "VND",
  USD: "USD",
  usd: "USD",
};

const MONTHS = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

function isBlankOrNa(value) {
  if (value === null || value === undefined) return true;
  const v = String(value).trim();
  if (v === "") return true;
  const upper = v.toUpperCase();
  return upper === "N/A" || upper === "NA" || upper === "NULL" || upper === "-";
}

function toTitleCase(name) {
  return String(name)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function parseAmount(raw) {
  if (raw === null || raw === undefined) return { ok: false, reason: "missing" };
  let s = String(raw).trim();
  if (s === "") return { ok: false, reason: "missing" };
  // strip currency symbols / spaces, keep leading minus
  s = s.replace(/[^0-9.,\-]/g, "");
  // remove thousands separators
  s = s.replace(/,/g, "");
  const n = Number(s);
  if (!Number.isFinite(n)) return { ok: false, reason: "not_a_number" };
  if (n < 0) return { ok: false, reason: "negative", value: n };
  if (n === 0) return { ok: false, reason: "zero", value: n };
  return { ok: true, value: n };
}

function parseDate(raw) {
  if (isBlankOrNa(raw)) return { ok: false, reason: "missing" };
  const s = String(raw).trim();

  // YYYY-MM-DD
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) {
    return isoResult(+m[1], +m[2], +m[3]);
  }

  // DD/MM/YYYY or D/M/YYYY
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) {
    return isoResult(+m[3], +m[2], +m[1]);
  }

  // Month D, YYYY  /  Month DD, YYYY
  m = /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/.exec(s);
  if (m) {
    const month = MONTHS[m[1].toLowerCase()];
    if (!month) return { ok: false, reason: "unknown_month" };
    return isoResult(+m[3], month, +m[2]);
  }

  return { ok: false, reason: "unrecognized_format" };
}

function isoResult(y, month, day) {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return { ok: false, reason: "invalid_calendar" };
  }
  const iso = `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(
    2,
    "0"
  )}`;
  // validate round-trip
  const dt = new Date(Date.UTC(y, month - 1, day));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() + 1 !== month ||
    dt.getUTCDate() !== day
  ) {
    return { ok: false, reason: "invalid_calendar" };
  }
  return { ok: true, value: iso };
}

function normalizeClaimType(raw) {
  const key = String(raw || "").trim();
  if (!key) return { ok: false, reason: "missing" };
  if (CLAIM_TYPE_MAP[key]) {
    return {
      ok: true,
      value: CLAIM_TYPE_MAP[key],
      changed: CLAIM_TYPE_MAP[key] !== key,
    };
  }
  // last resort: uppercase
  const upper = key.toUpperCase();
  if (["OUTPATIENT", "INPATIENT", "DENTAL", "PHARMACY", "EMERGENCY"].includes(upper)) {
    return { ok: true, value: upper, changed: upper !== key };
  }
  return { ok: false, reason: "unknown_type", value: key };
}

function normalizeCurrency(raw) {
  const key = String(raw || "").trim();
  if (!key) return { ok: false, reason: "missing" };
  if (CURRENCY_MAP[key]) {
    return {
      ok: true,
      value: CURRENCY_MAP[key],
      changed: CURRENCY_MAP[key] !== key,
    };
  }
  const upper = key.toUpperCase();
  if (/^[A-Z]{3}$/.test(upper)) {
    return { ok: true, value: upper, changed: upper !== key };
  }
  return { ok: false, reason: "unknown_currency", value: key };
}

function normalizeStatus(raw) {
  const key = String(raw || "").trim();
  if (!key) return { ok: false, reason: "missing" };
  // handle in_review / In_Review variants
  const compact = key.replace(/\s+/g, "_").toUpperCase();
  if (VALID_STATUSES.has(compact)) {
    return { ok: true, value: compact, changed: compact !== key };
  }
  return { ok: false, reason: "unknown_status", value: key };
}

function rowFingerprint(row) {
  return COLUMNS.map((c) => String(row[c] ?? "")).join("||");
}

function cleanRows(rawRows) {
  const stats = {
    rows_before: rawRows.length,
    duplicates_removed: 0,
    issues: {
      missing_claim_id: 0,
      missing_policy_id: 0,
      name_casing_normalized: 0,
      claim_type_typo_or_casing: 0,
      diagnosis_nullified: 0,
      invalid_amount_negative: 0,
      invalid_amount_zero: 0,
      invalid_amount_other: 0,
      currency_standardized: 0,
      date_reformatted: 0,
      date_unparseable: 0,
      status_normalized: 0,
      unknown_claim_type: 0,
      unknown_currency: 0,
      unknown_status: 0,
      rows_with_multiple_issues: 0,
      rows_flagged_invalid_amount_removed: 0,
      rows_with_any_issue: 0,
    },
    flagged_invalid_amount_rows: [],
  };

  // 1) Drop exact duplicate rows (keep first)
  const seen = new Set();
  const deduped = [];
  for (const row of rawRows) {
    const fp = rowFingerprint(row);
    if (seen.has(fp)) {
      stats.duplicates_removed += 1;
      continue;
    }
    seen.add(fp);
    deduped.push(row);
  }

  const cleaned = [];

  for (const row of deduped) {
    const issueTags = [];
    const out = {};

    // claim_id
    const claimId = String(row.claim_id || "").trim();
    if (!claimId) {
      stats.issues.missing_claim_id += 1;
      issueTags.push("missing_claim_id");
      out.claim_id = NULL_MARKER;
    } else {
      out.claim_id = claimId.toUpperCase();
    }

    // policy_id
    const policyId = String(row.policy_id || "").trim();
    if (!policyId) {
      stats.issues.missing_policy_id += 1;
      issueTags.push("missing_policy_id");
      out.policy_id = NULL_MARKER;
    } else {
      out.policy_id = policyId.toUpperCase();
    }

    // member_name
    const rawName = String(row.member_name || "").trim();
    const titled = rawName ? toTitleCase(rawName) : NULL_MARKER;
    out.member_name = titled;
    if (rawName && titled !== rawName) {
      stats.issues.name_casing_normalized += 1;
      issueTags.push("name_casing");
    }
    if (!rawName) {
      out.member_name = NULL_MARKER;
      issueTags.push("missing_name");
    }

    // claim_type
    const ct = normalizeClaimType(row.claim_type);
    if (!ct.ok) {
      stats.issues.unknown_claim_type += 1;
      issueTags.push("unknown_claim_type");
      out.claim_type = NULL_MARKER;
    } else {
      out.claim_type = ct.value;
      if (ct.changed) {
        stats.issues.claim_type_typo_or_casing += 1;
        issueTags.push("claim_type_normalized");
      }
    }

    // diagnosis
    if (isBlankOrNa(row.diagnosis)) {
      stats.issues.diagnosis_nullified += 1;
      issueTags.push("diagnosis_nullified");
      out.diagnosis = NULL_MARKER;
    } else {
      out.diagnosis = String(row.diagnosis).trim();
    }

    // amount
    const amt = parseAmount(row.submitted_amount);
    let dropForAmount = false;
    if (!amt.ok) {
      if (amt.reason === "negative") {
        stats.issues.invalid_amount_negative += 1;
        issueTags.push("invalid_amount_negative");
      } else if (amt.reason === "zero") {
        stats.issues.invalid_amount_zero += 1;
        issueTags.push("invalid_amount_zero");
      } else {
        stats.issues.invalid_amount_other += 1;
        issueTags.push("invalid_amount_other");
      }
      dropForAmount = true;
      out.submitted_amount = "";
    } else {
      // detect comma-string normalization as an issue if original had commas / differed
      const rawAmt = String(row.submitted_amount).trim();
      if (rawAmt.includes(",") || rawAmt !== String(amt.value)) {
        issueTags.push("amount_normalized");
      }
      out.submitted_amount = amt.value;
    }

    // currency
    const cur = normalizeCurrency(row.currency);
    if (!cur.ok) {
      stats.issues.unknown_currency += 1;
      issueTags.push("unknown_currency");
      out.currency = NULL_MARKER;
    } else {
      out.currency = cur.value;
      if (cur.changed) {
        stats.issues.currency_standardized += 1;
        issueTags.push("currency_standardized");
      }
    }

    // date
    const dt = parseDate(row.submitted_date);
    if (!dt.ok) {
      stats.issues.date_unparseable += 1;
      issueTags.push("date_unparseable");
      out.submitted_date = NULL_MARKER;
    } else {
      out.submitted_date = dt.value;
      if (String(row.submitted_date).trim() !== dt.value) {
        stats.issues.date_reformatted += 1;
        issueTags.push("date_reformatted");
      }
    }

    // status
    const st = normalizeStatus(row.status);
    if (!st.ok) {
      stats.issues.unknown_status += 1;
      issueTags.push("unknown_status");
      out.status = NULL_MARKER;
    } else {
      out.status = st.value;
      if (st.changed) {
        stats.issues.status_normalized += 1;
        issueTags.push("status_normalized");
      }
    }

    if (issueTags.length > 0) {
      stats.issues.rows_with_any_issue += 1;
    }
    if (issueTags.length > 1) {
      stats.issues.rows_with_multiple_issues += 1;
    }

    if (dropForAmount) {
      stats.issues.rows_flagged_invalid_amount_removed += 1;
      stats.flagged_invalid_amount_rows.push({
        claim_id: out.claim_id,
        original_amount: row.submitted_amount,
        issues: issueTags,
      });
      continue; // remove row from clean output
    }

    cleaned.push(out);
  }

  stats.rows_after = cleaned.length;
  stats.rows_removed_total = stats.rows_before - stats.rows_after;

  return { cleaned, stats };
}

function buildSummaries(cleaned) {
  const byType = {};
  const byStatus = {};
  const amountByType = {};
  const diagnosisCount = {};

  for (const row of cleaned) {
    byType[row.claim_type] = (byType[row.claim_type] || 0) + 1;
    byStatus[row.status] = (byStatus[row.status] || 0) + 1;

    if (!amountByType[row.claim_type]) {
      amountByType[row.claim_type] = { total: 0, count: 0 };
    }
    amountByType[row.claim_type].total += Number(row.submitted_amount);
    amountByType[row.claim_type].count += 1;

    if (row.diagnosis && row.diagnosis !== NULL_MARKER) {
      diagnosisCount[row.diagnosis] = (diagnosisCount[row.diagnosis] || 0) + 1;
    }
  }

  const avgAmountByType = {};
  for (const [type, info] of Object.entries(amountByType)) {
    avgAmountByType[type] = Math.round((info.total / info.count) * 100) / 100;
  }

  const topDiagnoses = Object.entries(diagnosisCount)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 5)
    .map(([diagnosis, count]) => ({ diagnosis, count }));

  return {
    claims_by_type: byType,
    claims_by_status: byStatus,
    average_amount_by_type: avgAmountByType,
    top_5_diagnoses: topDiagnoses,
  };
}

function renderMarkdown(stats, summaries) {
  const lines = [];
  lines.push("# Claims Data Quality Report");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## Cleaning overview");
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`| --- | ---: |`);
  lines.push(`| Rows before cleaning | ${stats.rows_before} |`);
  lines.push(`| Exact duplicates removed | ${stats.duplicates_removed} |`);
  lines.push(
    `| Rows removed for invalid amount (negative / zero / unparseable) | ${stats.issues.rows_flagged_invalid_amount_removed} |`
  );
  lines.push(`| Rows after cleaning | ${stats.rows_after} |`);
  lines.push(`| Total rows removed | ${stats.rows_removed_total} |`);
  lines.push(
    `| Rows that had at least one issue (among deduped rows) | ${stats.issues.rows_with_any_issue} |`
  );
  lines.push(
    `| Rows with multiple issues | ${stats.issues.rows_with_multiple_issues} |`
  );
  lines.push("");
  lines.push("## Issues detected (counts)");
  lines.push("");
  lines.push("| Issue | Count |");
  lines.push("| --- | ---: |");
  const issueOrder = [
    ["missing_claim_id", "Missing claim_id"],
    ["missing_policy_id", "Missing policy_id"],
    ["name_casing_normalized", "Member name casing normalized"],
    ["claim_type_typo_or_casing", "Claim type typo / casing fixed"],
    ["diagnosis_nullified", "Diagnosis empty / N/A → NULL"],
    ["invalid_amount_negative", "Invalid amount (negative)"],
    ["invalid_amount_zero", "Invalid amount (zero)"],
    ["invalid_amount_other", "Invalid amount (other)"],
    ["currency_standardized", "Currency standardized to ISO"],
    ["date_reformatted", "Date parsed into YYYY-MM-DD"],
    ["date_unparseable", "Date unparseable"],
    ["status_normalized", "Status casing normalized"],
    ["unknown_claim_type", "Unknown claim type"],
    ["unknown_currency", "Unknown currency"],
    ["unknown_status", "Unknown status"],
  ];
  for (const [key, label] of issueOrder) {
    lines.push(`| ${label} | ${stats.issues[key]} |`);
  }
  lines.push("");
  lines.push("## Summary statistics (clean data)");
  lines.push("");
  lines.push("### Claims by type");
  lines.push("");
  lines.push("| Claim type | Count |");
  lines.push("| --- | ---: |");
  for (const [k, v] of Object.entries(summaries.claims_by_type).sort()) {
    lines.push(`| ${k} | ${v} |`);
  }
  lines.push("");
  lines.push("### Claims by status");
  lines.push("");
  lines.push("| Status | Count |");
  lines.push("| --- | ---: |");
  for (const [k, v] of Object.entries(summaries.claims_by_status).sort()) {
    lines.push(`| ${k} | ${v} |`);
  }
  lines.push("");
  lines.push("### Average submitted amount by type");
  lines.push("");
  lines.push("| Claim type | Avg amount |");
  lines.push("| --- | ---: |");
  for (const [k, v] of Object.entries(
    summaries.average_amount_by_type
  ).sort()) {
    lines.push(`| ${k} | ${v} |`);
  }
  lines.push("");
  lines.push("### Top 5 diagnoses");
  lines.push("");
  lines.push("| Rank | Diagnosis | Count |");
  lines.push("| ---: | --- | ---: |");
  summaries.top_5_diagnoses.forEach((d, i) => {
    lines.push(`| ${i + 1} | ${d.diagnosis} | ${d.count} |`);
  });
  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push(
    `- Empty / \`N/A\` / \`n/a\` / \`NA\` values are replaced with the consistent marker \`${NULL_MARKER}\`.`
  );
  lines.push(
    "- Rows with negative, zero, or unparseable amounts are **removed** from the clean CSV (and counted above)."
  );
  lines.push(
    "- Exact duplicate rows are removed before field-level cleaning; the first occurrence is kept."
  );
  lines.push(
    "- Dates are normalized to ISO 8601 date only: `YYYY-MM-DD`."
  );
  lines.push("");
  return lines.join("\n");
}

function main() {
  if (!fs.existsSync(DIRTY)) {
    console.error(`Missing dirty CSV. Run: npm run generate\nExpected: ${DIRTY}`);
    process.exit(1);
  }

  const rawText = fs.readFileSync(DIRTY, "utf8");
  const rawRows = parseCsv(rawText);
  const { cleaned, stats } = cleanRows(rawRows);
  const summaries = buildSummaries(cleaned);

  fs.mkdirSync(path.dirname(CLEAN), { recursive: true });
  fs.mkdirSync(path.dirname(REPORT_MD), { recursive: true });

  fs.writeFileSync(CLEAN, toCsv(cleaned, COLUMNS));

  const report = {
    generated_at: new Date().toISOString(),
    null_marker: NULL_MARKER,
    cleaning: stats,
    summary: summaries,
  };
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2) + "\n");
  fs.writeFileSync(REPORT_MD, renderMarkdown(stats, summaries));

  console.log("=== Claims Data Cleanup ===");
  console.log(`Input:  ${DIRTY}`);
  console.log(`Output: ${CLEAN}`);
  console.log(`Report: ${REPORT_MD}`);
  console.log("");
  console.log(`Rows before:     ${stats.rows_before}`);
  console.log(`Duplicates:      ${stats.duplicates_removed}`);
  console.log(
    `Invalid amounts removed: ${stats.issues.rows_flagged_invalid_amount_removed}`
  );
  console.log(`Rows after:      ${stats.rows_after}`);
  console.log("");
  console.log("Top 5 diagnoses:");
  for (const d of summaries.top_5_diagnoses) {
    console.log(`  - ${d.diagnosis}: ${d.count}`);
  }
}

main();
