"use strict";

/**
 * Unit tests for Policy Benefits Calculator
 * Run: npm test
 */

const assert = require("assert");
const path = require("path");
const fs = require("fs");
const {
  calculateBenefits,
  DECISIONS,
  daysBetween,
  findExclusion,
  computeCopay,
} = require("../src/calculator");

const root = path.join(__dirname, "..");
const policy = JSON.parse(
  fs.readFileSync(path.join(root, "data", "policy.json"), "utf8")
);

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
  }
}

function basePolicy(overrides = {}) {
  return JSON.parse(JSON.stringify({ ...policy, ...overrides }));
}

console.log("\nPolicy Benefits Calculator — Unit Tests\n");

// ---------------------------------------------------------------------------
test("daysBetween counts whole days from effective date", () => {
  assert.strictEqual(daysBetween("2024-01-01", "2024-01-01"), 0);
  assert.strictEqual(daysBetween("2024-01-01", "2024-01-31"), 30);
  assert.strictEqual(daysBetween("2024-01-01", "2024-04-01"), 91);
});

test("findExclusion matches diagnosis text case-insensitively", () => {
  const benefit = policy.benefits.OUTPATIENT;
  assert.strictEqual(
    findExclusion(benefit, { diagnosis: "Cosmetic surgery consult", sub_benefit: "x" }),
    "Cosmetic surgery"
  );
  assert.strictEqual(
    findExclusion(benefit, { diagnosis: "Flu", sub_benefit: "Doctor Visit" }),
    null
  );
});

test("computeCopay supports percentage and fixed types", () => {
  assert.strictEqual(computeCopay({ type: "percentage", value: 20 }, 2500), 500);
  assert.strictEqual(computeCopay({ type: "fixed", value: 500 }, 1800), 500);
  assert.strictEqual(computeCopay({ type: "fixed", value: 500 }, 200), 200);
  assert.strictEqual(computeCopay({ type: "percentage", value: 0 }, 1500), 0);
});

test("normal coverage with zero copay returns COVERED", () => {
  const p = basePolicy({ deductible: { annual: 0 } });
  const { results } = calculateBenefits(p, [
    {
      expense_id: "T-COVERED",
      date: "2024-06-01",
      benefit_type: "PREVENTIVE",
      sub_benefit: "Wellness",
      amount: 1000,
      diagnosis: "Annual checkup",
      provider: "Clinic",
    },
  ]);
  assert.strictEqual(results[0].decision, DECISIONS.COVERED);
  assert.strictEqual(results[0].covered_amount, 1000);
  assert.strictEqual(results[0].copay_amount, 0);
  assert.strictEqual(results[0].member_pays, 0);
});

test("percentage copay produces PARTIALLY_COVERED", () => {
  const p = basePolicy();
  // Satisfy deductible first with a small inpatient claim
  const { results } = calculateBenefits(p, [
    {
      expense_id: "T-DED",
      date: "2024-01-02",
      benefit_type: "INPATIENT",
      sub_benefit: "Stay",
      amount: 1000,
      diagnosis: "Observation",
      provider: "H",
    },
    {
      expense_id: "T-COPAY",
      date: "2024-02-15",
      benefit_type: "OUTPATIENT",
      sub_benefit: "Doctor Visit",
      amount: 2500,
      diagnosis: "Bronchitis",
      provider: "H",
    },
  ]);
  const r = results.find((x) => x.expense_id === "T-COPAY");
  assert.strictEqual(r.decision, DECISIONS.PARTIALLY_COVERED);
  assert.strictEqual(r.covered_amount, 2000);
  assert.strictEqual(r.copay_amount, 500);
  assert.strictEqual(r.member_pays, 500);
  assert.ok(r.reason.includes("20% copay"));
});

test("waiting period denial", () => {
  const p = basePolicy();
  const { results } = calculateBenefits(p, [
    {
      expense_id: "T-WAIT",
      date: "2024-01-10",
      benefit_type: "OUTPATIENT",
      sub_benefit: "Doctor Visit",
      amount: 2500,
      diagnosis: "Cold",
      provider: "H",
    },
  ]);
  assert.strictEqual(results[0].decision, DECISIONS.DENIED);
  assert.strictEqual(results[0].covered_amount, 0);
  assert.ok(results[0].reason.includes("waiting period"));
});

test("exclusion denial", () => {
  const p = basePolicy();
  const { results } = calculateBenefits(p, [
    {
      expense_id: "T-EXCL",
      date: "2024-03-01",
      benefit_type: "OUTPATIENT",
      sub_benefit: "Cosmetic Consultation",
      amount: 5000,
      diagnosis: "Cosmetic surgery",
      provider: "Clinic",
    },
  ]);
  assert.strictEqual(results[0].decision, DECISIONS.DENIED);
  assert.ok(results[0].reason.includes("exclusion"));
});

test("per-visit limit caps eligible amount", () => {
  const p = basePolicy();
  const { results } = calculateBenefits(p, [
    {
      expense_id: "T-DED",
      date: "2024-01-02",
      benefit_type: "INPATIENT",
      sub_benefit: "Stay",
      amount: 2000,
      diagnosis: "Obs",
      provider: "H",
    },
    {
      expense_id: "T-VISIT",
      date: "2024-03-10",
      benefit_type: "OUTPATIENT",
      sub_benefit: "Specialist",
      amount: 4500,
      diagnosis: "Migraine",
      provider: "H",
    },
  ]);
  const r = results.find((x) => x.expense_id === "T-VISIT");
  // eligible capped at 3000, then 20% copay → covered 2400
  assert.strictEqual(r.covered_amount, 2400);
  assert.ok(r.reason.includes("Per-visit limit"));
});

test("earlier claims consume limits that affect later ones", () => {
  const p = basePolicy({
    annual_limit: 5000,
    deductible: { annual: 0 },
    benefits: {
      OUTPATIENT: {
        waiting_period_days: 0,
        annual_sub_limit: 5000,
        per_visit_limit: 5000,
        max_visits: 10,
        copay: { type: "percentage", value: 0 },
        exclusions: [],
      },
    },
  });

  const { results, summary } = calculateBenefits(p, [
    {
      expense_id: "T-A",
      date: "2024-02-01",
      benefit_type: "OUTPATIENT",
      sub_benefit: "Visit",
      amount: 4000,
      diagnosis: "A",
      provider: "H",
    },
    {
      expense_id: "T-B",
      date: "2024-02-15",
      benefit_type: "OUTPATIENT",
      sub_benefit: "Visit",
      amount: 3000,
      diagnosis: "B",
      provider: "H",
    },
  ]);

  assert.strictEqual(results[0].covered_amount, 4000);
  assert.strictEqual(results[0].decision, DECISIONS.COVERED);
  // Only 1000 remaining → partial
  assert.strictEqual(results[1].covered_amount, 1000);
  assert.strictEqual(results[1].decision, DECISIONS.PARTIALLY_COVERED);
  assert.ok(results[1].reason.includes("remaining annual limit"));
  assert.strictEqual(summary.remaining_annual_limit, 0);
});

test("limit exhaustion denies subsequent claims", () => {
  const p = basePolicy({
    annual_limit: 3000,
    deductible: { annual: 0 },
    benefits: {
      OUTPATIENT: {
        waiting_period_days: 0,
        annual_sub_limit: 3000,
        per_visit_limit: 3000,
        max_visits: 10,
        copay: { type: "percentage", value: 0 },
        exclusions: [],
      },
    },
  });

  const { results } = calculateBenefits(p, [
    {
      expense_id: "T-FULL",
      date: "2024-02-01",
      benefit_type: "OUTPATIENT",
      sub_benefit: "Visit",
      amount: 3000,
      diagnosis: "A",
      provider: "H",
    },
    {
      expense_id: "T-DENIED",
      date: "2024-02-15",
      benefit_type: "OUTPATIENT",
      sub_benefit: "Visit",
      amount: 500,
      diagnosis: "B",
      provider: "H",
    },
  ]);

  assert.strictEqual(results[1].decision, DECISIONS.DENIED);
  assert.strictEqual(results[1].covered_amount, 0);
  assert.ok(results[1].reason.toLowerCase().includes("exhausted"));
});

test("annual deductible is applied once then exhausted", () => {
  const p = basePolicy({
    annual_limit: 50000,
    deductible: { annual: 1000 },
    benefits: {
      PREVENTIVE: {
        waiting_period_days: 0,
        annual_sub_limit: 5000,
        per_visit_limit: 3000,
        max_visits: 5,
        copay: { type: "percentage", value: 0 },
        exclusions: [],
      },
    },
  });

  const { results, summary } = calculateBenefits(p, [
    {
      expense_id: "T-D1",
      date: "2024-01-05",
      benefit_type: "PREVENTIVE",
      sub_benefit: "Checkup",
      amount: 1500,
      diagnosis: "Screening",
      provider: "H",
    },
    {
      expense_id: "T-D2",
      date: "2024-02-05",
      benefit_type: "PREVENTIVE",
      sub_benefit: "Checkup",
      amount: 1000,
      diagnosis: "Screening",
      provider: "H",
    },
  ]);

  assert.strictEqual(results[0].covered_amount, 500); // 1500 - 1000 deductible
  assert.strictEqual(results[0].member_pays, 1000);
  assert.strictEqual(results[1].covered_amount, 1000); // deductible already met
  assert.strictEqual(summary.remaining_deductible, 0);
});

test("fixed dental copay is applied correctly", () => {
  const p = basePolicy({ deductible: { annual: 0 } });
  const { results } = calculateBenefits(p, [
    {
      expense_id: "T-DENTAL",
      date: "2024-04-10",
      benefit_type: "DENTAL",
      sub_benefit: "Filling",
      amount: 1800,
      diagnosis: "Cavity",
      provider: "Dentist",
    },
  ]);
  assert.strictEqual(results[0].copay_amount, 500);
  assert.strictEqual(results[0].covered_amount, 1300);
  assert.ok(results[0].reason.includes("Fixed copay"));
});

test("expenses are processed chronologically regardless of input order", () => {
  const p = basePolicy({
    annual_limit: 5000,
    deductible: { annual: 0 },
    benefits: {
      OUTPATIENT: {
        waiting_period_days: 0,
        annual_sub_limit: 5000,
        per_visit_limit: 5000,
        max_visits: 10,
        copay: { type: "percentage", value: 0 },
        exclusions: [],
      },
    },
  });

  // Later expense listed first in the array
  const { results } = calculateBenefits(p, [
    {
      expense_id: "LATER",
      date: "2024-03-01",
      benefit_type: "OUTPATIENT",
      sub_benefit: "Visit",
      amount: 3000,
      diagnosis: "B",
      provider: "H",
    },
    {
      expense_id: "EARLIER",
      date: "2024-02-01",
      benefit_type: "OUTPATIENT",
      sub_benefit: "Visit",
      amount: 4000,
      diagnosis: "A",
      provider: "H",
    },
  ]);

  assert.strictEqual(results[0].expense_id, "EARLIER");
  assert.strictEqual(results[0].covered_amount, 4000);
  assert.strictEqual(results[1].expense_id, "LATER");
  assert.strictEqual(results[1].covered_amount, 1000);
});

test("summary reports remaining balance per benefit", () => {
  const p = basePolicy();
  const expenses = JSON.parse(
    fs.readFileSync(path.join(root, "data", "expenses.json"), "utf8")
  );
  const { summary, results } = calculateBenefits(p, expenses);

  assert.strictEqual(results.length, 20);
  assert.ok(summary.remaining_by_benefit.OUTPATIENT);
  assert.ok(summary.remaining_by_benefit.INPATIENT);
  assert.ok(typeof summary.remaining_annual_limit === "number");
  assert.ok(summary.decisions.DENIED >= 1);
  assert.ok(
    summary.decisions.PARTIALLY_COVERED + summary.decisions.COVERED >= 1
  );
});

test("calculateBenefits rejects invalid arguments", () => {
  assert.throws(() => calculateBenefits(null, []), /policy/);
  assert.throws(() => calculateBenefits({}, null), /expenses/);
});

// ---------------------------------------------------------------------------
console.log(`\nResults: ${passed} passed, ${failed} failed out of ${passed + failed}\n`);
process.exit(failed > 0 ? 1 : 0);
