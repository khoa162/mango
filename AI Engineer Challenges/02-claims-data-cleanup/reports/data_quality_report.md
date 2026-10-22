# Claims Data Quality Report

Generated: 2026-10-22T19:34:04.842Z

## Cleaning overview

| Metric | Value |
| --- | ---: |
| Rows before cleaning | 500 |
| Exact duplicates removed | 12 |
| Rows removed for invalid amount (negative / zero / unparseable) | 8 |
| Rows after cleaning | 480 |
| Total rows removed | 20 |
| Rows that had at least one issue (among deduped rows) | 84 |
| Rows with multiple issues | 56 |

## Issues detected (counts)

| Issue | Count |
| --- | ---: |
| Missing claim_id | 18 |
| Missing policy_id | 16 |
| Member name casing normalized | 23 |
| Claim type typo / casing fixed | 21 |
| Diagnosis empty / N/A → NULL | 20 |
| Invalid amount (negative) | 1 |
| Invalid amount (zero) | 7 |
| Invalid amount (other) | 0 |
| Currency standardized to ISO | 17 |
| Date parsed into YYYY-MM-DD | 11 |
| Date unparseable | 0 |
| Status casing normalized | 10 |
| Unknown claim type | 0 |
| Unknown currency | 0 |
| Unknown status | 0 |

## Summary statistics (clean data)

### Claims by type

| Claim type | Count |
| --- | ---: |
| DENTAL | 104 |
| EMERGENCY | 107 |
| INPATIENT | 95 |
| OUTPATIENT | 94 |
| PHARMACY | 80 |

### Claims by status

| Status | Count |
| --- | ---: |
| APPROVED | 97 |
| IN_REVIEW | 109 |
| PENDING | 147 |
| REJECTED | 127 |

### Average submitted amount by type

| Claim type | Avg amount |
| --- | ---: |
| DENTAL | 23204.48 |
| EMERGENCY | 26071.37 |
| INPATIENT | 25726.92 |
| OUTPATIENT | 26323.41 |
| PHARMACY | 25336.69 |

### Top 5 diagnoses

| Rank | Diagnosis | Count |
| ---: | --- | ---: |
| 1 | Gastritis | 43 |
| 2 | Acute bronchitis | 39 |
| 3 | Pneumonia | 39 |
| 4 | Dental cavity | 35 |
| 5 | Sprained ankle | 34 |

## Notes

- Empty / `N/A` / `n/a` / `NA` values are replaced with the consistent marker `NULL`.
- Rows with negative, zero, or unparseable amounts are **removed** from the clean CSV (and counted above).
- Exact duplicate rows are removed before field-level cleaning; the first occurrence is kept.
- Dates are normalized to ISO 8601 date only: `YYYY-MM-DD`.
