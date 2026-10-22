"use strict";

/**
 * Generates a messy 500-row claims CSV with intentional data-quality issues
 * (~15–20% of rows have at least one problem).
 *
 * Seeded RNG so rebuilds stay reproducible for reviewers.
 */

const fs = require("fs");
const path = require("path");
const { toCsv } = require("./csv");

const OUT = path.join(__dirname, "..", "data", "claims_dirty.csv");
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

const FIRST = [
  "John", "Jane", "Somchai", "Malee", "Anh", "Minh", "Sarah", "David",
  "Niran", "Ploy", "Khoa", "Linh", "James", "Emma", "Wei", "Yuki",
];
const LAST = [
  "Doe", "Smith", "Sukjai", "Nguyen", "Tran", "Patel", "Chen", "Wong",
  "Johnson", "Brown", "Lee", "Kim", "Garcia", "Martinez", "Taylor",
];

const DIAGNOSES = [
  "Flu", "Acute bronchitis", "Hypertension", "Diabetes checkup",
  "Migraine", "Sprained ankle", "Dental cavity", "Allergic rhinitis",
  "Gastritis", "Back pain", "Pneumonia", "Sinusitis", "UTI",
  "Skin rash", "Fracture follow-up",
];

const STATUSES = ["APPROVED", "REJECTED", "PENDING", "IN_REVIEW"];
const CLAIM_TYPES = ["OUTPATIENT", "INPATIENT", "DENTAL", "PHARMACY", "EMERGENCY"];

// --- seeded PRNG (mulberry32) ---
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20240601);

function pick(arr) {
  return arr[Math.floor(rand() * arr.length)];
}

function pad(n, width) {
  return String(n).padStart(width, "0");
}

function randomDate2024() {
  const start = Date.UTC(2024, 0, 1);
  const end = Date.UTC(2024, 11, 31);
  const t = start + Math.floor(rand() * (end - start));
  const d = new Date(t);
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

function formatDateISO({ y, m, day }) {
  return `${y}-${pad(m, 2)}-${pad(day, 2)}`;
}

function formatDateSlash({ y, m, day }) {
  return `${pad(day, 2)}/${pad(m, 2)}/${y}`;
}

function formatDateLong({ y, m, day }) {
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${months[m - 1]} ${day}, ${y}`;
}

function cleanName() {
  return `${pick(FIRST)} ${pick(LAST)}`;
}

function messName(name) {
  const r = rand();
  if (r < 0.34) return name.toUpperCase();
  if (r < 0.67) return name.toLowerCase();
  // Title Case already — leave, or weird mix
  return name
    .split(" ")
    .map((p, i) => (i === 0 ? p.toUpperCase() : p.toLowerCase()))
    .join(" ");
}

function messClaimType(type) {
  const typos = {
    OUTPATIENT: ["outpatient", "Outpateint", "OP", "OutPatient"],
    INPATIENT: ["inpatient", "Inpatinet", "IP", "InPatient"],
    DENTAL: ["dental", "Dentl", "DENT"],
    PHARMACY: ["pharmacy", "Pharmcy", "RX"],
    EMERGENCY: ["emergency", "Emergncy", "ER"],
  };
  return pick(typos[type] || [type]);
}

function messCurrency(code) {
  if (code === "THB") return pick(["THB", "thb", "Baht", "baht"]);
  if (code === "VND") return pick(["VND", "vnd", "Dong"]);
  return pick([code, code.toLowerCase()]);
}

function messAmount(amount) {
  const r = rand();
  if (r < 0.25) return String(-Math.abs(amount)); // negative
  if (r < 0.45) return "0"; // zero
  // comma-formatted string, e.g. "15,000"
  return amount.toLocaleString("en-US");
}

function messDiagnosis(diag) {
  const r = rand();
  if (r < 0.35) return "";
  if (r < 0.6) return "N/A";
  if (r < 0.85) return "n/a";
  return "NA";
}

function messStatus(status) {
  return pick([
    status.toLowerCase(),
    status[0] + status.slice(1).toLowerCase(),
    status,
  ]);
}

function messDate(d) {
  const r = rand();
  if (r < 0.4) return formatDateSlash(d);
  if (r < 0.75) return formatDateLong(d);
  return formatDateISO(d);
}

function buildCleanRow(index) {
  const date = randomDate2024();
  const claimType = pick(CLAIM_TYPES);
  const currency = rand() < 0.85 ? "THB" : "VND";
  const amount = Math.round(500 + rand() * 49500);

  return {
    claim_id: `CLM-${pad(index, 5)}`,
    policy_id: `POL-${pad(1000 + Math.floor(rand() * 9000), 4)}`,
    member_name: cleanName(),
    claim_type: claimType,
    diagnosis: pick(DIAGNOSES),
    submitted_amount: String(amount),
    currency,
    submitted_date: formatDateISO(date),
    status: pick(STATUSES),
    _date: date,
    _amount: amount,
  };
}

function applyIssues(row, issueFlags) {
  const dirty = { ...row };
  delete dirty._date;
  delete dirty._amount;

  if (issueFlags.missingClaimId) dirty.claim_id = "";
  if (issueFlags.missingPolicyId) dirty.policy_id = "";
  if (issueFlags.casingName) dirty.member_name = messName(row.member_name);
  if (issueFlags.typoType) dirty.claim_type = messClaimType(row.claim_type);
  if (issueFlags.badDiagnosis) dirty.diagnosis = messDiagnosis(row.diagnosis);
  if (issueFlags.badAmount) dirty.submitted_amount = messAmount(row._amount);
  if (issueFlags.messyCurrency) dirty.currency = messCurrency(row.currency);
  if (issueFlags.messyDate) dirty.submitted_date = messDate(row._date);
  if (issueFlags.messyStatus) dirty.status = messStatus(row.status);

  return dirty;
}

function main() {
  const TARGET = 500;
  const rows = [];
  const cleanSources = [];

  for (let i = 1; i <= TARGET; i += 1) {
    cleanSources.push(buildCleanRow(i));
  }

  // Mark ~18% of rows to receive at least one issue
  const dirtyIndices = new Set();
  while (dirtyIndices.size < Math.round(TARGET * 0.18)) {
    dirtyIndices.add(Math.floor(rand() * TARGET));
  }

  // Pick ~12 row slots that will become exact copies of earlier rows
  const duplicateSlots = new Set();
  while (duplicateSlots.size < 12) {
    const slot = 250 + Math.floor(rand() * 250); // second half of file
    duplicateSlots.add(slot);
  }
  const duplicateSources = [];
  while (duplicateSources.length < 12) {
    duplicateSources.push(Math.floor(rand() * 200));
  }

  let dupCursor = 0;
  for (let i = 0; i < TARGET; i += 1) {
    if (duplicateSlots.has(i)) {
      const srcIdx = duplicateSources[dupCursor++];
      // placeholder — filled after first pass below
      rows.push({ __dupOf: srcIdx });
      continue;
    }

    const src = cleanSources[i];
    if (!dirtyIndices.has(i)) {
      const clean = { ...src };
      delete clean._date;
      delete clean._amount;
      rows.push(clean);
      continue;
    }

    // 1–3 issues per dirty row (edge case: multiple issues on one row)
    const issueFlags = {
      missingClaimId: false,
      missingPolicyId: false,
      casingName: false,
      typoType: false,
      badDiagnosis: false,
      badAmount: false,
      messyCurrency: false,
      messyDate: false,
      messyStatus: false,
    };
    const keys = Object.keys(issueFlags);
    const count = 1 + Math.floor(rand() * 3);
    // Fisher–Yates shuffle of keys
    for (let a = keys.length - 1; a > 0; a -= 1) {
      const b = Math.floor(rand() * (a + 1));
      [keys[a], keys[b]] = [keys[b], keys[a]];
    }
    for (let j = 0; j < count; j += 1) {
      issueFlags[keys[j]] = true;
    }
    rows.push(applyIssues(src, issueFlags));
  }

  // Resolve duplicate placeholders to exact copies of already-built rows
  for (let i = 0; i < rows.length; i += 1) {
    if (rows[i].__dupOf !== undefined) {
      const src = rows[rows[i].__dupOf];
      rows[i] = { ...src };
    }
  }

  for (let i = rows.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, toCsv(rows, COLUMNS));

  const approxDirty = dirtyIndices.size;
  console.log(`Wrote ${rows.length} rows → ${OUT}`);
  console.log(
    `Dirty-marked rows: ${approxDirty} (~${(
      (approxDirty / TARGET) *
      100
    ).toFixed(1)}%). Exact duplicate slots: ${duplicateSlots.size}.`
  );
}

main();
