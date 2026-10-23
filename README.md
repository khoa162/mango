# Papaya Insurtech — Full-Stack Engineer Take-Home

Candidate submission for the Papaya Insurtech (Công ty TNHH Xoài Việt Nam) recruitment test.

This repo has **both parts** in one place, as requested: Logical Questions + AI Engineering Challenges.

## What’s inside

```
├── Logical Questions/
│   └── Answers.md
└── AI Engineer Challenges/
    ├── AI_CONVERSATION_LOG.md           # How AI tools were directed
    ├── 02-claims-data-cleanup/          # Beginner · 1 point
    └── 06-policy-benefits-calculator/   # Intermediate · 2 points
```

**AI Challenges score:** 1 + 2 = **3 points** (Beginner + Intermediate).

**AI Conversation Log:** [`AI Engineer Challenges/AI_CONVERSATION_LOG.md`](AI%20Engineer%20Challenges/AI_CONVERSATION_LOG.md) — condensed record of prompts/intent, design decisions, and verification (not a raw chat dump).

---

## Part 1 — Logical Questions

Answers live in [`Logical Questions/Answers.md`](Logical%20Questions/Answers.md).

Includes the two mandatory questions (**Q1**, **Q5**) plus additional answers to meet the minimum of five.

---

## Part 2 — AI Engineering Challenges

### Challenge 02 — Claims Data Cleanup & Report (Beginner)

Messy 500-row claims CSV → clean CSV + data-quality report.

```bash
cd "AI Engineer Challenges/02-claims-data-cleanup"
npm start          # clean dirty data + write report
# npm run rebuild  # optional: regenerate dirty CSV, then clean
```

Details: [`02-claims-data-cleanup/README.md`](AI%20Engineer%20Challenges/02-claims-data-cleanup/README.md)

**Timeline estimate:** ~2.5 hours

### Challenge 06 — Policy Benefits Calculator (Intermediate)

Reusable calculator: policy JSON + medical expenses → covered amounts, reasons, remaining limits. Includes 20 designed expenses and 15 unit tests.

```bash
cd "AI Engineer Challenges/06-policy-benefits-calculator"
npm start    # run calculator on the 20 expenses
npm test     # 15 unit tests
```

Details: [`06-policy-benefits-calculator/README.md`](AI%20Engineer%20Challenges/06-policy-benefits-calculator/README.md)

**Timeline estimate:** ~2.5–3.5 hours

---

## Requirements

- Node.js ≥ 14  
- No `npm install` needed for either challenge (zero dependencies)

## Notes

Both challenges were built with AI coding tools in the loop (Cursor). See the [AI Conversation Log](AI%20Engineer%20Challenges/AI_CONVERSATION_LOG.md) for how the work was directed and checked. Folder READMEs cover rule order and how to run each solution.
