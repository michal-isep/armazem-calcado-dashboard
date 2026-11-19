# Indicator validation (issue #22)

Every indicator was recomputed from the original CSVs by a separate script and compared with the running API. Run on 2026-11-19.

## How it was done
- Script: `docs/validation/validate_indicators.py` (Python, pandas). It reads only the CSVs in `data/` and shares no code with the ETL or the API. The rules (ABC, duplicates, quantity 0, filters, wave start for picks) were rewritten from `docs/spec.md` and the ADRs.
- API side: current `main`, ETL run on the real CSVs into a throwaway Postgres 17 container, API started on it, nothing else changed.
- Run: `python docs/validation/validate_indicators.py --data-dir data --api http://localhost:3001 --out report.md` (the API must be running). Exit code 1 if any check differs.
- Compared with a relative tolerance of 1e-9. Integer counts are compared exactly. ABC class boundaries use integer arithmetic.

## What was compared
M1 (rank, class, lines, units, share, cumulative share for every selected reference, plus the per-class totals), M2, M3, M4, M5, X1, X2, X3 (picks and units per aisle and per ABC class), X4 (class, `ABCCOD`, status per product and the summary), A1 (aisle shares and the rare-aisle bucket), and the monthly trend (per-month counts and M2, M3, X1, X2, partial-month flag, previous-period comparison). Also a recount of the facts in `data-profile.md`.

20 scenarios, each against all endpoints:
- Full period: lines and units bases, duplicates kept and excluded (S01-S04).
- Date ranges: a four-month range, January (starts before the data), a summer range with units and duplicates excluded, an empty range, one day (S05-S07, S19, S20).
- Filters: reference (top and least ordered product), abcClass A, B and C, other thresholds (60/90 and 70/90), customer, operator, aisle, and combinations (S08-S18).

## Result
**3,647 checks, 0 differences.** All of M1-M5, X1-X4 and A1 match the independent script on the full period and on every filtered case, on both bases and with the duplicates toggle on and off.

| Indicator | Checks |
|---|---|
| M1 | 280 |
| M2, X1 | 80 |
| M3, X2 | 100 |
| M4, M5 | 116 |
| X3 | 1,204 |
| X4 | 160 |
| A1 | 249 |
| Monthly trend and comparison | 1,412 |
| Data profile recount | 6 |

Real-data anchors that agree with the spec: M2 = 228,195 / 32,632 = 6.993; M3 = 4.073; X1 = 3.749; X2 = 12.33% (4,023 of 32,632 orders); lines basis 49/53/106 with 121 of 208 matching `ABCCOD`; units basis 51/49/108 with 112 of 208.

## Differences
None in the indicator values. One point where the first version of the script disagreed with the API, and the script was wrong:
- For a date range outside the data (S19), the monthly trend returns no months. The script first expected one empty month per calendar month of the range. The API lists only months inside the data range, which is how it is documented, so the script was changed.

## Limits of this check
- The script and the API follow the same written rules. It finds implementation errors, not wrong rules. Where the spec was ambiguous, the script follows the documented decisions: the date range selects picks by wave start (#13); A1 share is over the selected picks; customer and operator select products for X4 and M1 only through lines in the date range.
- Not covered: `GET /indicators/abc/sizes`, `GET /waves`, `GET /waves/:waveNumber`, `GET /filters/options` and `GET /indicators/data-quality` (data quality was checked in #5). The web pages were not checked; that is #23 and #24.
- The scenarios are a sample, not every filter combination.
