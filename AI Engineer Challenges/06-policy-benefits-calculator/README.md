# AI Challenge 06 — Policy Benefits Calculator

Intermediate · ~3 hours · Node.js (no dependencies)

## What this is

Insurance math in plain terms: a member submits medical bills, and the system has to figure out how much the insurer pays vs how much the member pays. Getting that wrong either burns the insurer’s money or frustrates the member.

So I built a small reusable calculator. You hand it a policy JSON and a list of expenses. It walks through the claims in date order, applies the policy rules, and returns a decision for each claim — with a reason a human can actually read. At the end you also get a summary of what’s left on each benefit.

## How I thought about the logic

Before writing code, I locked the rule order. That’s the whole game here — if you apply copay before checking waiting period, or let a later claim eat limit before an earlier one, the numbers look “fine” until someone audits them.

For every expense I ask, in this order:

1. **Do we even know this benefit type?** If not → deny.
2. **Has the waiting period passed?** Policy starts on day zero. Outpatient needs 30 days, pharmacy 14, dental 90, inpatient none. Too early → deny, and say exactly how many days have elapsed.
3. **Is this excluded?** Things like cosmetic surgery or orthodontics → deny with the matched exclusion name.
4. **Any visits left? Any money left on the annual / benefit limit?** Already at zero → deny.
5. **What’s the eligible amount?** Take the submitted amount, then chop it down by the per-visit cap, then by whatever annual and benefit sub-limit are still left. That number is what we’re allowed to work with.
6. **Deductible.** Member still owes annual deductible? Peel it off the eligible amount first. Once it’s used up for the year, later claims skip this step.
7. **Copay.** Percentage (e.g. 20% outpatient) or fixed (e.g. 500 THB dental). What’s left after copay is what the insurer covers.
8. **Write it down.** `COVERED` if the insurer pays the full submitted amount, `PARTIALLY_COVERED` if the member still owes something, `DENIED` if covered is zero. The reason string spells out which rules fired.

One design choice worth calling out: **limits are reduced by the eligible amount**, not only by what the insurer pays. Copay is the member’s slice of that eligible pot, so the whole eligible figure counts against the benefit maximum. That way “remaining limit is smaller than the bill” and “limit exhausted on the next claim” behave the way you’d expect.

And yes — **order matters**. Claims are sorted by date before anything runs. An inpatient stay in January eats the shared pool; a September claim sees whatever is left. Feed the same list shuffled and you still get the same answers.

## Timeline

Roughly how I spent the time:

| Phase | Time |
| --- | --- |
| Map the rule order on paper | ~30 min |
| Design the policy + 20 expenses so every rule path shows up | ~45 min |
| Build the calculator module | ~1–1.25 hrs |
| Tests, expected outputs, README | ~45 min |

**Total: about 2.5–3.5 hours**, inside the 2–4 hour band.

## What’s in the repo

```
data/policy.json            Policy terms (limits, copay, waiting, exclusions)
data/expenses.json          20 expenses designed to hit every rule path
data/expected-outputs.json  Full run: per-claim results + summary
src/calculator.js           calculateBenefits(policy, expenses) — the module
src/run.js                  CLI that prints results and refreshes expected outputs
tests/calculator.test.js    15 unit tests, plain Node assert, no test framework
results/test-results.txt    Saved test output for submission
```

## Run it

```bash
cd "AI Engineer Challenges/06-policy-benefits-calculator"

npm start       # adjudicate the 20 expenses
npm test        # 15 unit tests
npm run test:save
```

Needs Node 14+. No `npm install` — nothing to install.

## The 20 expenses (why each one exists)

I didn’t randomize the data. Each claim is there to prove something:

| ID | What it shows |
| --- | --- |
| EXP-001 / 002 / 006 | Waiting period denials (outpatient, pharmacy, dental) |
| EXP-003 | Deductible + inpatient copay on the first real claim |
| EXP-004 / 007 | Normal partial coverage via percentage copay |
| EXP-005 / 009 / 011 | Exclusion denials |
| EXP-008 / 012 | Per-visit limit kicking in before copay |
| EXP-010 / 017 | Fixed dental copay |
| EXP-013–016 | Later claims still drawing down the same pools |
| EXP-018 | Remaining inpatient sub-limit is smaller than the bill → partial |
| EXP-019 | Inpatient sub-limit gone → denied |
| EXP-020 | Preventive, 0% copay → fully covered |

## Using it as a module

```js
const { calculateBenefits } = require("./src/calculator");

const { results, summary } = calculateBenefits(policy, expenses);
```

Each result looks like:

```json
{
  "expense_id": "EXP-004",
  "submitted_amount": 2500,
  "covered_amount": 2000,
  "copay_amount": 500,
  "member_pays": 500,
  "decision": "PARTIALLY_COVERED",
  "reason": "20% copay applied: 500 THB. Covered: 2000 THB. Member pays: 500 THB.",
  "remaining_annual_limit": 106100,
  "remaining_visit_limit": 29,
  "remaining_benefit_limit": 47500
}
```

The summary tells you what’s left on the annual limit, deductible, and each benefit after every claim has been processed.

## Tests

Fifteen tests covering the boring-but-important stuff: helpers, full coverage, percentage and fixed copay, waiting period, exclusion, per-visit cap, chronological limit consumption, limit exhaustion, deductible once-then-done, input order doesn’t matter, the full 20-expense run, and bad-argument guards.

If `npm test` says 15 passed, the core logic is holding.

## Quick mental check

Want to sanity-check without reading code? Pick EXP-004 after the deductible is already satisfied:

> 2,500 THB outpatient × 20% copay → member 500, insurer 2,000.

That’s exactly what `npm start` prints. Same idea for waiting periods: policy starts 2024-01-01, outpatient needs 30 days, EXP-001 on Jan 10 is only 9 days in → denied.
