# Specification: warehouse operations dashboard

Status: v2, decisions from the team grilling session (Q1-Q13) applied. Items marked **[ASSUMPTION]** are team assumptions not stated in the brief.
Written before any code. Data facts are in `data-profile.md`.

## 1. Primary user and questions
**Primary user [ASSUMPTION]:** the warehouse operations director, who reads the dashboard directly (no analyst in between). They decide which lever to test first: reorganising locations or changing how picking waves are built. It is not a strict either/or; the dashboard shows evidence for both.

**Scope of claims:** the dashboard describes the current state only. It does not forecast and does not estimate time or cost savings.

| # | Business question | Decision it supports |
|---|---|---|
| Q1 | How is order volume concentrated across products (ABC), and does the class A group justify closer or dedicated locations? | Reorganise locations or not. |
| Q2 | How big are orders and waves, how often are orders split across waves, and has that changed over time? | Change wave composition or not. |
| Q3 | Where in the warehouse (aisle) does picking effort concentrate, per period and per ABC class? | Where to test a layout change first. Required: it is the only link between product popularity (Q1) and physical position. |

## 2. Indicators
Common rules: all indicators are computed in the backend/database, respond to the same filters (see section 5), show the number of orders and lines behind them, and are labelled with their source file.

### Minimum indicators
| ID | Indicator | Source | Definition |
|---|---|---|---|
| M1 | ABC classification | Customer_Order | **Primary basis: order lines** per `Reference` in the filtered period. Selectable alternative basis: units. Sort descending, tie-break by reference ascending. A reference is **A** if the cumulative share *before* it is below 80%, **B** if below 95%, otherwise **C**. Thresholds are parameters (default 80/95), adjustable on the Products page; reset restores the default. ABC is computed on the selected date range only (active basis and thresholds), ignoring product, ABC class, customer, operator and aisle filters; the UI says which basis is active. |
| M2 | Average order size | Customer_Order | Sum of `quantity (units)` / number of distinct `orderNumber`. |
| M3 | Average orders per wave | Customer_Order | Number of distinct (`waveNumber`, `orderNumber`) pairs / number of distinct `waveNumber`. An order split across waves counts once in each wave. |
| M4 | Sector share | Product + Customer_Order | Units per `Sector` / total units, as a percentage. **Not informative** (see section 3). |
| M5 | Multi-sector orders | Product + Customer_Order | Orders with more than one distinct `Sector` / total orders, as a percentage. **Not informative** (see section 3). |

### Additional indicators
| ID | Indicator | Source | Why useful |
|---|---|---|---|
| X1 | Lines per order | Customer_Order | Pick effort per order, separate from units. |
| X2 | % of orders split across waves | Customer_Order | Directly measures the wave-composition problem (12.3% overall). |
| X3 | Picks and units by aisle (first letter of `locations`), also by ABC class via `reference` | Picking_Wave | Shows concentration of work (Q3). **Effort = number of picks** (rows of Picking_Wave); units shown as secondary. |
| X4 | Agreement between computed ABC and `Product.ABCCOD` | Customer_Order + Product | Tells whether the supplied classes are still valid. We do not know how `ABCCOD` was produced, and the response says so. Compares the computed class (M1, date range only) with `ABCCOD` per product; the match percentage is over products that have a computed class. Products with no valid order line in the range are reported as not ranked, neither match nor mismatch. |
| A1 | Aisle share of picks (**proxy, not Sector**) | Picking_Wave | Picks per aisle / total picks. Rare aisles (C, E, Z, G) stay in their own bucket; their meaning is unknown. |

### Deferred (not dropped)
- **X5** Units per wave and per operator (workload balance). May return as an operator filter, not an indicator.
- **A2** (multi-aisle orders) is **dropped**: Picking_Wave has no `orderNumber`, so picks cannot be tied to orders. A wave-level substitute was rejected because it could be read as an order metric.
- Layout files (Class_Based, Dedicated, Hybrid, Random storage), `Storage_Location` coordinates and `Support_Points_Navigation` are not loaded in this version. Future work.

## 3. Known limitations (must appear in the UI)
- **M4 and M5 are degenerate:** every product has Sector `PF`, so M4 is 100% and M5 is 0%. They stay as KPI cards on the Overview with a "not informative: all products are PF" badge and a link to A1. **No substitute exists for multi-sector orders**; A1 is labelled a proxy and is never called Sector.
- **Two ABC sources:** the dashboard uses the computed ABC (M1) and shows `Product.ABCCOD` for comparison (X4).
- The data covers 2023-01-05 to 2023-10-19 only. January and October are partial months and are marked as such.
- **The two order/wave files do not reconcile and we do not reconcile them.** 77 waves in Customer_Order are missing from Picking_Wave; Picking_Wave has 13,003 fewer units (about 94% coverage of ordered units). Neither file is declared right. Aisle shares are therefore approximate; the Warehouse zones page shows a permanent note.
- **Picking_Wave has no `orderNumber`.** Picks link to waves and references, not to orders. Only Customer_Order links orders to waves.

## 4. Data handling rules
1. Original CSVs are never edited. The ETL reads them and writes to PostgreSQL.
2. Trim padding spaces on text fields. Parse dates as `dd/mm/yyyy hh:mm`.
3. Rows with quantity 0 are excluded from all indicators and counted in a data-quality table (33 rows).
4. Blank `Size (US)` is kept as "unknown" (16 rows).
5. Exact duplicate rows are **kept by default** (2,559 rows), since repeated lines are normal in picking data. A toggle "Exclude exact duplicate lines" (off by default) shows how much M1, M2 and X1 change when they are removed.
6. The ETL is re-runnable: it empties and reloads the tables, giving the same result each time.
7. The ETL prints row counts per file and per exclusion rule.

## 5. Filters and interactions
- **Global filters:** date range, ABC class, product (reference). They work on both source files.
- **ABC scoping rule (M1):** ABC is computed on the selected date range only, with the active basis and thresholds, and ignores the product, ABC class, customer, operator and aisle filters. Those filters then *select from* the computed classes. A reference's class never changes because of them.
- **Aisle** applies only to indicators sourced from Picking_Wave. On other cards it is greyed out with a note, never silently ignored.
- **Customer:** searchable selector (588 values). **Operator:** available in both files, kept as a filter.
- The page shows when a filter is not applied to a card, so a filtered number is never read as unfiltered.
- Filters are sent to the API as query parameters and computed in SQL.
- **Time:** monthly grain only. Trend charts show only ratio indicators (M2, M3, X1, X2). Counts and units appear in tooltips with the days covered. Partial months (January, October) are marked.
- **Comparison:** default is the previous equal-length period immediately before the selected range. If it falls before 2023-01-05 it shows "no data", never zero.
- **Tooltip:** hovering a month point shows its orders, units, days covered and M2/M3 values.
- **Drill-down:** ABC class -> references in that class -> sizes of one reference.
- **Drill-through:** clicking a wave opens a detail view listing its orders and picks (locations). This is a detail view, not a fourth subpage. If the brief counts it as a page, cut the drill-through before cutting Warehouse zones.

## 6. Pages
Maximum: main page plus three subpages, as in the brief.
1. **Overview (main):** M1-M5 as KPI cards, filters, monthly trend, and a collapsible **data quality panel** (excluded rows, duplicates toggle, source-disagreement note).
2. **Products (ABC):** Pareto chart, basis switch (lines/units), adjustable thresholds, drill-down by class, X4 comparison.
3. **Waves and orders:** M3, X1, X2, wave detail (drill-through).
4. **Warehouse zones (required):** X3 and A1 by aisle and by ABC class, labelled proxy, with the coverage note.

## 7. Technical rules
- Browser -> Next.js -> NestJS -> PostgreSQL. The browser never reads CSVs or connects to the database.
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
- M1, **units basis**: units A 4, C 4, B 2. Order A, C, B. Cumulative before: A 0%, C 40%, B 80%. Classes: A = **A**, C = **A**, B = **B** (80% is not below 80%).
- M1, **lines basis** (default): lines A 2, B 1, C 1 (D excluded). Order A, B, C (tie B/C broken by reference). Cumulative before: A 0%, B 50%, C 75%. Classes: all **A**. This tiny fixture cannot separate B and C; use fixture 2 below.

**Fixture 2 (M1, lines basis, 80/95).** Valid order lines per reference in one date range:

| reference | lines |
|---|---|
| P | 8 |
| Q | 6 |
| R | 3 |
| S | 2 |
| T | 1 |
| V | 1 line with quantity 0 (excluded, not ranked) |

Total = 20 lines. Order: P 8, Q 6, R 3, S 2, T 1 (no ties).

| ref | cumulative lines before | share before | rule | class |
|---|---|---|---|---|
| P | 0 | 0% | < 80 | **A** |
| Q | 8 | 40% | < 80 | **A** |
| R | 14 | 70% | < 80 | **A** |
| S | 17 | 85% | not < 80, < 95 | **B** |
| T | 19 | 95% | not < 95 | **C** |

- **Scoping test:** with the filter reference = T and the same date range, T must still be class **C**. A wrong implementation that recomputes ABC on the filtered rows gives T a share before of 0%, so class A.
- **Filter-selects test:** filtering ABC class = A returns exactly P, Q and R.
- Real-data cross-check (script on the original file): 122,370 rows, 33 with quantity 0. Distinct orders: 32,634 before, **32,632 after** exclusion (2 orders had only zero-quantity lines). Total units stay 228,195. M2 after exclusion = 228,195 / 32,632 = **6.993** (6.99 before).
- Edge cases: empty filter result returns zeros/nulls without errors; a single-sector dataset gives M4 = 100% and M5 = 0%.

## 9. Open items
1. Ask the teacher whether the brief counts the wave detail view as a page (section 5).
2. The meaning of Picking_Wave locations in aisles C, E, Z, G is unknown (see data-profile.md); not resolvable from the data.
