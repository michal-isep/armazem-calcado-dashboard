# Sprint 1 summary

Read this first in a new session. Update it before the session is cleared (CLAUDE.md, working rules). Last updated: 2026-11-19 (after issue #10).

## Project in one paragraph
Dashboard for the warehouse operations director of a footwear warehouse. The director decides which lever to test first: relocate products or change how picking waves are built. The dashboard describes the current state only; no forecasts or savings. Stack: Next.js, NestJS, PostgreSQL. Spec: `docs/spec.md` (v2). Vocabulary: `docs/GLOSSARY.md`. Decisions: `docs/adr/0001`-`0007`. Data facts: `docs/data-profile.md`.

## Decisions made (from the spec grilling)
- ABC ranks by **order lines** by default, units as an alternative; thresholds 80/95, adjustable. ABC is computed on the date range only; other filters select from the computed classes (ADR 0001, 0002).
- M4 (sector share) and M5 (multi-sector orders) stay as KPI cards marked "not informative", because every product has Sector `PF`. A1 (aisle share of picks) is a labelled proxy and is never called Sector (ADR 0006).
- A2 (multi-aisle orders) is dropped: `Picking_Wave` has no `orderNumber` (ADR 0005). X5 and the layout, coordinate and navigation files are deferred.
- Exact duplicates are kept, with a toggle to exclude them (ADR 0003). The order and picking files are not reconciled (ADR 0004). Raw CSVs are never committed (ADR 0007).
- Pages: Overview (main) plus Products, Waves and orders, Warehouse zones. Data quality is a panel on the Overview. Wave detail is a detail view, not a page.
- Monthly grain; January and October are partial months; comparison is the previous equal-length period.
- ABC class counts (80/95): lines 49/53/106 with 121 of 208 matching `ABCCOD`; units 51/49/108 with 112 of 208.

## Repository state
- `main` has PR #1 (spec v2, glossary, ADRs) and PR #2 (agent skills setup, ABC figures). Both were merged by Claude at the lead's request; their commits carry a Claude co-author line (the lead chose not to rewrite `main`).
- Issue tracker: GitHub Issues on `michal-isep/armazem-calcado-dashboard`, default triage labels. Docs in `docs/agents/`.
- Sprint board: project #3 `sprint1`. Issues #3-#26 are on it, Target date 2026-11-23, status Backlog, nobody assigned (owner is written in each issue body).

## Issues (owner in the body)
| # | Issue | Owner |
|---|---|---|
| 3 | Scaffold web, api and database | Michal |
| 4 | ETL | Michal |
| 5 | Check ETL counts against the data profile | Federico |
| 6 | Automated tests from the spec fixtures | Leo |
| 7, 12, 13 | API: M1 ABC, X4, filters and duplicates toggle | Michal |
| 8, 9, 10, 14 | API: M2/X1, M3/X2, M4/M5, monthly trend | Federico |
| 11, 15 | API: X3/A1 aisle, wave detail | Leo |
| 16, 18 | Web: shell and filter bar, Products page | Michal |
| 17 | Web: Overview page | Federico |
| 19, 20, 21 | Web: Waves page, Warehouse zones page, wave detail view | Leo |
| 22 | Validate indicators independently | Federico |
| 23 | Manual test plan and run | Paola |
| 24 | Check limitations appear in the UI | Leo |
| 25 | README run instructions | Leo |
| 26 | Ask the teacher two questions | Michal |

## Open items
- Does the brief count the wave detail view as a page? (issue #26, spec section 9)
- What do Picking_Wave locations in aisles C, E, Z, G mean? 120 picks, unknown. (issue #26)
- 24 issues due Monday 2026-11-23 is probably too much for Michal alone; on 2026-11-19 the programming issues were spread over Federico and Leo, who will use Claude Code themselves (README rule 4 still says to ask the lead first).
- Issue #3 (scaffold) is done: PR #29 is merged into `main`.
- Issue #4 (ETL) is done and merged (see ETL section). Next: #16 (web shell), #5 (Federico, check ETL counts) and the API issues #7-#15, which were waiting on the data.
- Scaffold decisions: npm, one `package.json` per app, no workspaces. API uses the plain `pg` driver, so the ORM choice (spec section 7) stays open. API port comes from `API_PORT` (default 3001); web reads `API_URL` on the server only. `GET /health` returns 200 `{status:"ok",database:"up"}` or 503. Compose has Postgres only; credentials come from env vars with no defaults. Port 5432 was already taken on Michal's machine, so set `POSTGRES_PORT` (e.g. 5433) in `.env`.
- Verified locally: health 200 with the database up, 503 with it stopped, web page shows the API health. Used throwaway shell variables, no `.env` file created.
- The `Picking_Wave` and `Customer_Order` files do not reconcile (77 waves missing, 13,003 fewer units); this is documented, not solved.

## ETL (issue #4)
- Code in `apps/api/src/etl/` (`transform.ts` row rules, `schema.ts` DDL, `load.ts` loader, `cli.ts`). Run: `cd apps/api && npm run etl` (needs `DATABASE_URL`; CSV folder `DATA_DIR`, default `../../data`; or `npm run etl -- <folder>`). Uses `csv-parse`.
- One transaction: drops and recreates `product`, `customer_order_line`, `picking_wave_pick`, `etl_run_summary`, then loads. A failed run keeps the old data. Run twice on the real files gives identical counts. The CSVs are only read (checksums unchanged).
- Quantity-0 lines are loaded with `is_valid = false` (not deleted); blank size is stored as `unknown`; `is_duplicate` marks every repeat after the first row identical in all columns. Indicators must filter `is_valid`, and exclude `is_duplicate` only when the toggle is on. Aisle is stored in `picking_wave_pick.aisle`. Sizes are kept as written, so Picking_Wave has `9.0` where Customer_Order has `9` (opaque label, not normalised).
- Real-data counts: 122,370 order rows, 33 quantity 0, 16 blank sizes, 2,559 duplicates, 122,337 valid lines, 32,634 orders before and 32,632 after exclusion, 228,195 units; 215,192 picks and units; 208 products. All match the profile.
- Correction: the profile described duplicates as same order/reference/size/quantity; that gives 4,627. The 2,559 figure is identical in all columns. Profile text fixed.
- Tests: `src/etl/transform.spec.ts` (unit) and `test/etl.e2e-spec.ts` (spec section 8 fixture). The e2e test only runs with `TEST_DATABASE_URL` set, because the ETL wipes the tables.
- Tested on a throwaway compose project (`-p etl4`, port 5433, throwaway credentials in shell variables, no `.env`). Remove it with `docker compose -p etl4 down -v`.

## Working preferences learned
- No Claude attribution in commits or PRs.
- The lead rejects large inline scripts; save scripts as files outside the repo first (temp folder), then run them, and take one step at a time.
- Show a diff before saving edits when asked; do not commit or merge unless asked.
- Never read or write secrets. `data/` is local only; the CSVs are git-ignored.
- Scripts used so far live in `C:\Users\Admin\AppData\Local\Temp\abc_check\` (`abc_check.py`, `create_issues.sh`), outside the repo.

## ETL count check (issue #5, Federico)
- Ran the ETL on the real CSVs into a throwaway Postgres 17 cluster (Homebrew, port 5544, throwaway credentials, no `.env`), then checked two ways: SQL queries on the loaded tables and a separate Python script that reads only the raw CSVs (no ETL code). Scripts were kept outside the repo.
- Result: no differences. Rows 122,370 / 215,192 / 208; 33 quantity-0 rows; 2,559 exact duplicates; 16 blank sizes stored as `unknown`; 32,634 distinct orders in the file, 32,632 once quantity-0 lines are excluded (also 32,632 with duplicates excluded); 228,195 order units; 215,192 pick units; Sector is `PF` for all 208 products; text fields are trimmed; order dates run 2023-01-05 to 2023-10-19.
- Wording note for the acceptance criteria: quantity-0 rows are not deleted. They stay in `customer_order_line` with `is_valid = false` (33 rows) and every indicator must filter `is_valid`.
- Stop the throwaway cluster with `pg_ctl -D /tmp/etl5/db stop`.

## Proposed work split (Federico, 2026-11-19; not yet applied to the issue bodies)
The owner is written in each issue body, so these changes only count once the bodies are edited.
- Federico: #8, #9, #10, #14 (API) and #17 (Overview page). #5 is done.
- Paola takes #22 (validate indicators independently) because it needs only the CSVs and a spreadsheet or script, not the repo, and it is more independent when written by someone who did not build the API. She also drafts the #23 test plan now from `docs/spec.md` and runs it once #17-#20 exist, and takes #24 from Leo (Leo has #6, #11, #15, #19, #20, #21, #24, #25). Paola still needs a GitHub account; until then Federico posts her results in the issues.
- Leo keeps #6, #11, #15, #19, #20, #21, #25.

## M2 and X1 API (issue #8, Federico)
- `GET /indicators/order-size` returns M2 (`m2AverageOrderSize` = units / distinct orders) and X1 (`x1LinesPerOrder` = lines / distinct orders) from `customer_order_line`, with `orders`, `lines`, `units`, `source: "Customer_Order"` and the filters applied. Both are `null` when no order matches. Code in `apps/api/src/indicators/`.
- Filters supported now: `from`, `to` (YYYY-MM-DD, end date inclusive), `reference`, `excludeDuplicates=true|false`. Quantity-0 lines are always excluded. Bad input gives 400. `filters.ts` (`parseOrderFilters`, `orderFilterSql`) is meant to be reused by the other indicator endpoints; issue #13 can extend it.
- Not done: the ABC class filter, because it needs the computed ABC from M1 (#7). Customer and operator filters are not added.
- Tests: `filters.spec.ts` (unit) and `test/order-size.e2e-spec.ts` (spec section 8 fixture; needs `TEST_DATABASE_URL`, it recreates `customer_order_line`). Ran the e2e on a throwaway Postgres with trust auth on port 5588, then removed it.
- Next for Federico: #9, #10, #14, #17.

## M3 and X2 API (issue #9, Federico)
- `GET /indicators/wave-split` returns M3 (`m3AverageOrdersPerWave` = distinct (wave, order) pairs / distinct waves) and X2 (`x2SplitOrdersPercent` = orders in more than one wave / orders, as a percentage 0-100), with `orders`, `waves`, `lines`, `waveOrderPairs`, `splitOrders`, `source: "Customer_Order"` and the filters applied. Both are `null` when no order matches. Code: `apps/api/src/indicators/wave-split.service.ts`, same filters as #8 (`parseOrderFilters`, `orderFilterSql`). The ABC class filter is still missing (needs #7).
- Tests: `wave-split.service.spec.ts` (unit, mocked database) and `test/wave-split.e2e-spec.ts` (spec section 8 fixture gives M3 = 1.5, X2 = 0; a February order split over two waves tests X2). Ran the e2e on a throwaway Postgres with trust auth on port 5599, then removed it.
- The e2e files recreate the same tables, so `vitest.config.e2e.ts` now sets `fileParallelism: false`; before this, running all e2e files at once could make them overwrite each other's fixture.
- Paola is listed as co-author of the commits in the issue body; the commit has no co-author trailer because her git email is unknown. Add it if she wants it.
- Next for Federico: #10, #14, #17.

## M4 and M5 API (issue #10, Federico)
- `GET /indicators/sector` returns M4 (`m4SectorShare`: per sector `units`, `lines`, `orders`, `sharePercent` = units / total units, 0-100) and M5 (`m5MultiSectorOrdersPercent` = orders with more than one distinct sector / orders, 0-100), with `orders`, `lines`, `units`, `multiSectorOrders`, `source: "Product + Customer_Order"` and the filters applied. `m5MultiSectorOrdersPercent` is `null` and `m4SectorShare` is `[]` when no order matches. Code: `apps/api/src/indicators/sector.service.ts`, same filters as #8/#9.
- `notInformative` is `true` when at most one sector is present (today: every product is PF, so M4 = 100% and M5 = 0%), so the UI can show the badge (ADR 0006). No substitute for M5 is offered (ADR 0005); aisle is never called sector.
- `orderFilterSql` uses unqualified columns and `reference` exists in both `customer_order_line` and `product`, so the filters are applied to `customer_order_line` in a CTE before the join with `product`. `filters.ts` is unchanged. Inner join is safe: every ordered reference exists in Product (data profile).
- Tests: `sector.service.spec.ts` (unit, mocked database) and `test/sector.e2e-spec.ts` (spec section 8 fixture with fictional sectors S1 and S2: M4 = 40/60, M5 = 33.3%; single-sector case 100%/0%; empty result; duplicates toggle). Ran the e2e on a throwaway Postgres with trust auth on port 5611, then removed it.
- The ABC class filter is still missing (needs #7).
- `gh project item-list 3` failed in this session: the token lacks the `read:project` scope (`gh auth refresh -s read:project`), so the sprint1 board was not read.
- Next for Federico: #14, #17.

## Monthly trend API (issue #14, Federico)
- `GET /indicators/monthly-trend` returns one entry per calendar month between the selected range and the data range, each with M2, M3, X1, X2 (`m2AverageOrderSize`, `m3AverageOrdersPerWave`, `x1LinesPerOrder`, `x2SplitOrdersPercent`) plus `orders`, `lines`, `units`, `waves`, `from`/`to` (part of the month actually covered), `daysCovered`, `daysInMonth` and `partial`. A month without matching orders is listed with null ratios. Code: `apps/api/src/indicators/monthly-trend.service.ts`, same filters as #8-#10 (`parseOrderFilters`, `orderFilterSql`).
- `dataRange` is the first and last `created_at` in `customer_order_line`, ignoring filters. `partial` is true when the data does not cover the whole calendar month (January, October today); it is derived from `dataRange`, not hard-coded. An order counts in the month of its `created_at`, and X2 is measured inside the month.
- `period` is the selected range (the data range when `from`/`to` are missing) with `current` over the whole range. `comparison` is the previous period of equal length immediately before it. It returns `status: "no-data"`, `indicators: null` and a `reason` when that period starts before the data (`before-data-start`, also when only partly before, because a shorter period would not be equal length) or has no matching order (`no-matching-orders`); never zeros.
- The ABC class filter is still missing (needs #7), as in the other endpoints.
- Tests: `monthly-trend.service.spec.ts` (unit, mocked database) and `test/monthly-trend.e2e-spec.ts` (spec section 8 fixture for January plus orders in February and April; checks partial flags, days covered, gap month, comparison ok and no-data). Ran all e2e files on a throwaway Postgres 17 (trust auth, port 5622), then removed it.
- Next for Federico: #17 (Overview page).
