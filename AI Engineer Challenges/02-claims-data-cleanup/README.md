# AI Challenge 02 — Claims Data Cleanup & Report

Beginner · ~2–3 hours · Node.js (no dependencies)

## What this is

Ops teams get claims dumps from all over the place. The files look usable until you notice the duplicates, the `Outpateint` typos, the dates written three different ways, and the amounts that somehow went negative. Nothing useful happens until that mess is cleaned.

This project does two things:

1. **Generate** a 500-row dirty CSV with intentional quality issues (~18% of rows messed up on purpose, plus exact duplicates).
2. **Clean** that file into a consistent CSV and write a data-quality report with the stats the brief asks for.

## Timeline

| Phase | Time |
| --- | --- |
| Sketch issue types + clean rules | ~20 min |
| Generator (seeded, reproducible dirty data) | ~40 min |
| Cleaning script + report | ~60–75 min |
| Sanity checks + README | ~20 min |

**Total estimate: ~2.5 hours.**

## How the cleaning logic works

I kept the pipeline boring on purpose — same steps, every row:

1. **Drop exact duplicates.** Same values across all columns → keep the first, toss the rest.
2. **Normalize text.** Names go to Title Case. Claim types go through a typo map (`Outpateint` / `OP` → `OUTPATIENT`, and the same idea for inpatient, dental, pharmacy, emergency). Status becomes uppercase (`approved` → `APPROVED`).
3. **Dates → ISO.** Accept `YYYY-MM-DD`, `DD/MM/YYYY`, and `March 15, 2024`. Everything lands as `YYYY-MM-DD`. If it can’t be parsed, mark it `NULL`.
4. **Amounts.** Strip commas (`"15,000"` → `15000`). **Negative or zero amounts get the row removed** from the clean file (and counted in the report). That matched the brief’s “remove or flag” — I chose remove for the clean output and flag in the report so reviewers see both.
5. **Currency.** `thb` / `Baht` → `THB`, `vnd` / `Dong` → `VND`. Always uppercase ISO.
6. **Empty / N/A.** `""`, `N/A`, `n/a`, `NA` → a consistent `NULL` marker (especially for diagnosis).
7. **Missing IDs.** Empty `claim_id` / `policy_id` stay in the clean file as `NULL` so you can still see them — they’re counted as issues, not silently deleted.

Rows can (and do) carry multiple issues at once. The report counts how many rows had more than one problem.

After cleaning, the report also shows:

- claims by type / by status  
- average submitted amount by type  
- top 5 diagnoses  

## What’s in the repo

```
data/claims_dirty.csv              500-row messy input (committed)
data/claims_clean.csv              Clean output
reports/data_quality_report.md     Human-readable report
reports/data_quality_report.json   Same numbers as JSON
src/generate.js                    Builds the dirty CSV (seeded RNG)
src/clean.js                       Cleaning + report
src/csv.js                         Tiny CSV parse/write helpers
```

## Run it

```bash
cd "AI Engineer Challenges/02-claims-data-cleanup"

npm run generate   # rebuild dirty data (optional — already committed)
npm start          # clean → writes claims_clean.csv + reports
# or
npm run rebuild    # generate + clean in one go
```

Needs Node 14+. No `npm install`.

## Latest run (snapshot)

| Metric | Value |
| --- | ---: |
| Rows before | 500 |
| Duplicates removed | 12 |
| Invalid-amount rows removed | 8 |
| Rows after | 480 |

Issue hits on the last run included missing IDs, name casing, claim-type typos, null diagnoses, currency/date/status fixes — see `reports/data_quality_report.md` for the full table.

## Design notes

- **Generator is seeded** (`mulberry32` with a fixed seed), so `npm run generate` rebuilds the same dirty file. Reviewers aren’t chasing a moving target.
- **Data and logic stay separate.** The cleaner never hardcodes row values; it only knows rules.
- **Report comes in two flavors.** Markdown for reading, JSON if you want to diff or pipe it somewhere later.
