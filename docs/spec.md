# Specification: warehouse operations dashboard

Status: DRAFT v1 for team review. Items marked **[CONFIRM]** are proposals the team must accept or change.
Written before any code. Data facts are in `data-profile.md`.

## 1. Primary user and questions
**Primary user [CONFIRM]:** the warehouse operations director, who must decide between reorganising locations and changing how picking waves are built.

| # | Business question | Decision it supports |
|---|---|---|
| Q1 | How is order volume concentrated across products (ABC), and does the class A group justify closer or dedicated locations? | Reorganise locations or not. |
| Q2 | How big are orders and waves, how often are orders split across waves, and has that changed over time? | Change wave composition or not. |
| Q3 | Where in the warehouse (aisle/zone) does picking effort concentrate, per period and per ABC class? | Where to test a layout change first. |

## 2. Indicators
Common rules: all indicators are computed in the backend/database, respond to the same filters, and show the number of orders and lines behind them.

### Minimum indicators
| ID | Indicator | Definition |
|---|---|---|
| M1 | ABC classification | Units ordered per `Reference` in the filtered period. Sort descending, tie-break by reference ascending. A reference is **A** if the cumulative share of units *before* it is below 80%, **B** if below 95%, otherwise **C**. Thresholds are parameters (default 80/95). |
| M2 | Average order size | Sum of `quantity (units)` / number of distinct `orderNumber`. |
| M3 | Average orders per wave | Number of distinct (`waveNumber`, `orderNumber`) pairs / number of distinct `waveNumber`. An order split across waves counts once in each wave. |
| M4 | Sector share | Units per `Sector` / total units, as a percentage. |
| M5 | Multi-sector orders | Orders with more than one distinct `Sector` / total orders, as a percentage. |

### Additional indicators [CONFIRM]
| ID | Indicator | Why useful |
|---|---|---|
| X1 | Lines per order | Pick effort per order, separate from units. |
| X2 | % of orders split across waves | Directly measures the wave-composition problem (12.3% overall). |
| X3 | Picks and units by aisle (first letter of `locations`) | Shows concentration of work (Q3). |
| X4 | Agreement between computed ABC and `Product.ABCCOD` | Tells whether the supplied classes are still valid. |
| X5 | Units per wave and per operator | Workload balance. |

## 3. Known limitations (must appear in the UI)
- **M4 and M5 are degenerate:** every product has Sector `PF`, so M4 is 100% and M5 is 0%. The dashboard shows them and states that they cannot distinguish situations. It then offers aisle/zone as a **proxy, labelled as a proxy**, never as Sector.
- **Two ABC sources:** the dashboard uses the computed ABC (M1) and shows `Product.ABCCOD` for comparison (X4).
- The data covers 2023-01-05 to 2023-10-19 only. Nothing here is a performance forecast; no time or cost savings are claimed.
- Picking_Wave and Customer_Order do not fully agree (77 waves missing, 13,003 fewer units). Indicators from each file are labelled with their source file.

## 4. Data handling rules
1. Original CSVs are never edited. The ETL reads them and writes to PostgreSQL.
2. Trim padding spaces on text fields. Parse dates as `dd/mm/yyyy hh:mm`.
3. Rows with quantity 0 are excluded from all indicators and counted in a data-quality table (33 rows).
4. Blank `Size (US)` is kept as "unknown" (16 rows).
5. Exact duplicate rows are **kept**, since repeated lines are normal in picking data. The count is reported (2,559).
6. The ETL is re-runnable: it empties and reloads the tables, giving the same result each time.
7. The ETL prints row counts per file and per exclusion rule.

## 5. Filters and interactions
- **Filters** (apply to every chart on the page): date range, product (reference, ABC class), customer, operator, aisle. Filters are sent to the API as query parameters and computed in SQL.
- **Time comparison:** monthly trend of M2, M3, X1, X2, with a selectable comparison against the previous period.
- **Tooltip:** hovering a month point shows its orders, units and M2/M3 values.
- **Drill-down:** ABC class → references in that class → sizes of one reference.
- **Drill-through:** clicking a wave opens a detail page listing its orders and picks (locations).

## 6. Pages
1. **Overview:** M1–M5 as KPI cards, filters, monthly trend.
2. **Products (ABC):** Pareto chart, drill-down by class, X4 comparison.
3. **Waves and orders:** M3, X1, X2, X5, wave detail (drill-through).
4. **Warehouse zones** (optional, only if time allows): X3 by aisle, labelled proxy.
Maximum: main page plus three subpages, as in the brief.

## 7. Technical rules
- Browser → Next.js → NestJS → PostgreSQL. The browser never reads CSVs or connects to the database.
- Config and credentials only in environment variables. `.env.example` lists names without values.
- ORM, chart library and module layout: decided after this spec is approved.

## 8. Acceptance tests for the minimum indicators
Use this tiny fixture (hand-calculated, independent of the code). Sectors S1 and S2 are fictional, used only to test M4/M5.

| order | reference | sector | qty | wave |
|---|---|---|---|---|
| O1 | A | S1 | 3 | W1 |
| O1 | B | S2 | 2 | W1 |
| O2 | A | S1 | 1 | W1 |
| O3 | C | S2 | 4 | W2 |
| O3 | D | S2 | 0 | W2 (excluded, quantity 0) |

Expected results:
- M2 = 10 units / 3 orders = **3.333**
- M3 = 3 (wave, order) pairs / 2 waves = **1.5**
- M4: S1 = 4/10 = **40%**, S2 = 6/10 = **60%**
- M5 = 1 multi-sector order (O1) / 3 = **33.3%**
- M1: units A 4, C 4, B 2. Order A, C, B. Cumulative before: A 0%, C 40%, B 80%. Classes: A = **A**, C = **A**, B = **B** (80% is not below 80%).
- Real-data cross-check: before cleaning, total units = 228,195 and orders = 32,634 (M2 = 6.99). After excluding quantity 0 rows the total units stay 228,195; the order count can only drop if an order had only zero lines, so recount it and record the result here.
- Edge cases: empty filter result returns zeros/nulls without errors; a single-sector dataset gives M4 = 100% and M5 = 0%.

## 9. Open questions for the team
1. Is the primary user and Q1–Q3 correct?
2. Which additional indicators do we keep (X1–X5)?
3. Are 80/95 the right ABC thresholds?
4. Do we include the storage-layout CSVs (class-based, dedicated, hybrid, random) in a later slice? They are not used in this spec.
