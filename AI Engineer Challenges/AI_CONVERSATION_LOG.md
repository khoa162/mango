# AI Conversation Log

**Candidate:** Khoa Huynh  
**Tool:** Cursor  
**Challenges:** 02 (Beginner, 1 pt) + 06 (Intermediate, 2 pts)

Quick note on how I used AI here. I treat it like a fast helper: I decide what done looks like, I set the rules, I check the output. It writes a lot of the code — I don’t let it decide the design. This isn’t a raw chat export, just the useful bits.

---

## How I usually do it

I read the brief first and jot down a few things before I open the chat:

- what goes in, what comes out  
- which edge cases the sample data has to hit  
- how I’ll know it’s right (`npm test` / `npm start`, plus a couple of hand checks)

Then I talk to the AI in that order — constraints first, code second. If the first draft is off, I don’t just hit regenerate. I tell it what to fix and why.

---

## Challenge 06 — Policy Benefits Calculator

### What I wanted going in

This is insurance math. Order matters more than fancy code. So I told the AI straight:

- Make a reusable `calculateBenefits(policy, expenses)` — don’t bake claims into the logic  
- Sort by date; earlier claims eat the limits  
- Every decision needs a reason a human can read  
- At least 10 unit tests, ideally no npm deps  
- Those 20 expenses aren’t filler — each one should prove something (waiting, exclusion, copay, per-visit cap, leftover limit, exhaustion, full cover)

### Rules I locked before it coded

I wrote the pipeline down first, then asked it to implement:

1. Unknown benefit → deny  
2. Waiting period → deny  
3. Exclusion → deny  
4. No visits / annual / sub-limit left → deny  
5. Cap by per-visit, then by what’s left → eligible amount  
6. Deductible  
7. Copay (% or fixed)  
8. Decision + reason  

I also picked this: knock limits down by the **eligible** amount, not only by what the insurer pays. If you only subtract payout, “almost out of limit” and “fully out” get mushy, and EXP-018 → EXP-019 stops making sense.

### When it drifted, what I said

| What I saw | What I told it |
| --- | --- |
| Fixtures felt random | “Don’t guess rows. Make a scenario map — one expense per rule.” |
| Full run didn’t exhaust inpatient cleanly | “Burn limits by eligible amount, then re-check EXP-018 and EXP-019.” |
| Everything was PARTIAL because every benefit had a copay | “Add a 0% PREVENTIVE path and bump the annual limit so EXP-020 can actually be COVERED.” |
| README felt like a pasted spec | “Write it like a person. Explain why the rule order exists.” |

### How I checked it

```bash
cd "06-policy-benefits-calculator"
npm test    # want 15/15
npm start   # read the reasons, not just the totals
```

And yeah, the boring hand math. Once deductible is done, outpatient 2,500 THB at 20% copay should be covered 2,000 / member 500. If that line’s wrong, I don’t care how confident the AI sounds.

**Time:** roughly 2.5–3.5 hours.

---

## Challenge 02 — Claims Data Cleanup & Report

### What I wanted going in

Cleanup is a checklist. So I gave the AI the checklist, not “please clean some CSV”:

- 500 dirty rows, about 15–20% broken on purpose, seeded so rebuilds stay stable  
- Exact dedupe  
- Fix name casing, claim-type typos, status casing  
- Mixed dates → `YYYY-MM-DD`  
- Currency to uppercase ISO (`Baht` → `THB`)  
- Empty / `N/A` / `n/a` → one `NULL` marker  
- Negative or zero amounts: drop from clean file, still count them in the report  
- Report needs before/after, issue counts, by type / status, avg amount by type, top 5 diagnoses  

### Rules I locked

- Generate and clean stay separate (`npm run generate` / `npm start`)  
- Stick to exactly 500 input rows — duplicates sit inside that set, don’t append extras  
- Markdown report for reading, JSON if someone wants to diff  

### When it drifted, what I said

| What I saw | What I told it |
| --- | --- |
| Generator went past 500 by appending dupes | “Keep 500 total. Put duplicate slots in the second half; copy earlier rows.” |
| Only one report format | “Give me Markdown and JSON.” |
| Root repo had no overview | “Add a root README that links both challenges and how to run them.” |

### How I checked it

```bash
cd "02-claims-data-cleanup"
npm start
# 500 → drop 12 dupes → drop 8 bad amounts → 480 clean rows
```

Then I grepped the clean file for junk like `Baht`, `n/a`, `Outpateint`, lowercase `approved`. If any of that is still there, it’s not clean.

**Time:** about 2.5 hours.

---

## Bottom line

AI did a lot of the typing. I owned the brief, the rule order, the fixture design, the “change this” notes, and the final check. If a number or a denial reason didn’t match what I expected, it didn’t ship.

| Challenge | Folder |
| --- | --- |
| 06 | `06-policy-benefits-calculator/` |
| 02 | `02-claims-data-cleanup/` |
| Repo overview | `/README.md` |
