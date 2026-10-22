"use strict";

const fs = require("fs");
const path = require("path");
const { calculateBenefits } = require("./calculator");

const root = path.join(__dirname, "..");
const policy = JSON.parse(
  fs.readFileSync(path.join(root, "data", "policy.json"), "utf8")
);
const expenses = JSON.parse(
  fs.readFileSync(path.join(root, "data", "expenses.json"), "utf8")
);

const { results, summary } = calculateBenefits(policy, expenses);

const output = { results, summary };
const outPath = path.join(root, "data", "expected-outputs.json");
fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + "\n");

console.log("=== Policy Benefits Calculator — Run Results ===\n");
for (const r of results) {
  console.log(
    `${r.expense_id} | ${r.decision.padEnd(20)} | submitted=${r.submitted_amount} covered=${r.covered_amount} member_pays=${r.member_pays}`
  );
  console.log(`  → ${r.reason}\n`);
}

console.log("=== Summary ===");
console.log(JSON.stringify(summary, null, 2));
console.log(`\nWrote expected outputs → ${outPath}`);
