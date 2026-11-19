# Sprint 1 summary

Read this first in a new session. Update it before the session is cleared (CLAUDE.md, working rules). Last updated: 2026-11-19 (after issues #11, #46, #12 and #19).

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

## Global filters API (issue #13, Michal)
- Code in `apps/api/src/filters/`: `filters.ts` (`parseFilters`, `buildWhere`, `describeFilters`), `query-filters.decorator.ts` (`@QueryFilters()`, 400 on bad input), `filters.controller.ts` (`GET /filters/options`: period, references, customers, operators, aisles, for the filter bar in #16).
- Params: `from`, `to` (inclusive), `abcClass`, `reference`, `customer`, `operator`, `aisle`, `excludeDuplicates` (default false). `buildWhere(filters, source, { scope: 'dateOnly' })` gives the clause for computing ABC (ADR 0002). `abcClass` is parsed but never in SQL: #7 selects from the computed classes.
- `describeFilters` returns `applied`, `notApplied` (with reason) and the duplicates toggle as requested/applied. Aisle is not applied to order indicators; customer and the toggle are not applied to picks.
- Decision: Picking_Wave has no date, so the date range selects picks by wave start (earliest valid order line of the wave). Customer is not applied to picks.
- Real data on a throwaway DB: period 2023-01-05 to 2023-10-19, 208 references, 588 customers, 24 operators, aisles C E G H I J K L M N O P Q R Z.
- **Duplicate code to clean up:** Federico's `src/indicators/filters.ts` (`parseOrderFilters`, `orderFilterSql`, issues #8-#10) was merged while #13 was in progress, so there are now two filter implementations. The new one is a superset. Not refactored in #13 to avoid touching #8-#10; a follow-up should move the indicator services to `src/filters/` and add `describeFilters` to their responses.
- Tests: 40 unit, 19 e2e (the e2e tests need `TEST_DATABASE_URL`). Throwaway Postgres (`-p f13`, port 5434) removed.
- Next: #7 (M1 ABC), which uses `scope: 'dateOnly'`.

## Monthly trend API (issue #14, Federico)
- `GET /indicators/monthly-trend` returns one entry per calendar month between the selected range and the data range, each with M2, M3, X1, X2 (`m2AverageOrderSize`, `m3AverageOrdersPerWave`, `x1LinesPerOrder`, `x2SplitOrdersPercent`) plus `orders`, `lines`, `units`, `waves`, `from`/`to` (part of the month actually covered), `daysCovered`, `daysInMonth` and `partial`. A month without matching orders is listed with null ratios. Code: `apps/api/src/indicators/monthly-trend.service.ts`, same filters as #8-#10 (`parseOrderFilters`, `orderFilterSql`).
- `dataRange` is the first and last `created_at` in `customer_order_line`, ignoring filters. `partial` is true when the data does not cover the whole calendar month (January, October today); it is derived from `dataRange`, not hard-coded. An order counts in the month of its `created_at`, and X2 is measured inside the month.
- `period` is the selected range (the data range when `from`/`to` are missing) with `current` over the whole range. `comparison` is the previous period of equal length immediately before it. It returns `status: "no-data"`, `indicators: null` and a `reason` when that period starts before the data (`before-data-start`, also when only partly before, because a shorter period would not be equal length) or has no matching order (`no-matching-orders`); never zeros.
- The ABC class filter is still missing (needs #7), as in the other endpoints.
- Tests: `monthly-trend.service.spec.ts` (unit, mocked database) and `test/monthly-trend.e2e-spec.ts` (spec section 8 fixture for January plus orders in February and April; checks partial flags, days covered, gap month, comparison ok and no-data). Ran all e2e files on a throwaway Postgres 17 (trust auth, port 5622), then removed it.
- Next for Federico: #17 (Overview page).

## Web shell and filter bar (issue #16, Michal)
- Code in `apps/web/app/`: `lib/filters.ts` (URL <-> filter helpers, mirrors the API names; `notAppliedReason` mirrors `describeFilters`), `lib/api.ts` (server-only client: `getFilterOptions()`, `fetchIndicator(path, filters)`, `ApiError`), `components/` (`FilterBar`, `FilterBarLoader`, `NavLinks`, `CardFilters`), pages `/`, `/products`, `/waves`, `/zones` (the last three are placeholders for #18, #19, #20).
- Filter state lives in the URL; the bar uses `router.replace`. The date range shows the full data period from `/filters/options` by default, and the default is not written to the URL (no `from`/`to` means the whole period). Reference and customer are `<input list>` and commit only a listed value. Reset clears the query. The nav links carry the query string.
- The browser calls only Next.js: options are fetched in a Server Component (`connection()` inside `Suspense`, because of `cacheComponents`) and passed as props; `API_URL` is never in the client bundle (checked). No route handlers were needed.
- For the card pages: `<CardFilters source="customer_order" | "picking_wave" report={response.filters} />` (inside `Suspense`) lists the active filters and greys out, with the reason, those that do not apply. Without `report` it uses the same rules from the source file. Pages read their data on the server with `filtersFromSearchParams(await searchParams)` and `fetchIndicator`.
- Verified: `npm run lint`, `npm run build`, and a real run (throwaway Postgres 17 with trust auth on port 5436, ETL, API, `next start`): options, URL filters, nav links and greyed filters render server-side. Not tested in a real browser: the client-side `router.replace` interactions. An invalid URL value such as `from=garbage` is shown in the bar and only fails (400) when a card calls the API; cards must show that error, not fall back to data.
- No web tests yet (no runner in the scaffold); not added because it was not requested.
- Co-author on the commits: Paola, with `1260244@isep.ipp.pt` (derived from her ISEP number, confirm it).
- Next: #7 (M1 ABC API). Per CLAUDE.md rule 6, start by adding the ABC class filter to `apps/api/src/indicators/filters.ts` and to the #8, #9, #10, #14 endpoints. Then #18 (Products page, needs #7) and #17 (Overview, needs #7 and the other APIs), which can now use the shell.

## M1 ABC API (issue #7, Michal)
- `GET /indicators/abc` takes the global filters plus `basis` (`lines` default, or `units`), `thresholdA`, `thresholdB` (default 80/95, must satisfy 0 < A < B <= 100; bad input gives 400). Code in `apps/api/src/abc/`: `abc.ts` (pure `classify`, `parseAbcParams`), `abc.service.ts`, `abc.controller.ts`. Uses the new `src/filters/` (`@QueryFilters()`, `buildWhere`, `describeFilters`), not Federico's `src/indicators/filters.ts`.
- ABC is computed with `buildWhere(..., { scope: 'dateOnly' })` (date range, valid lines, duplicates toggle). Then `reference`, `customer`, `operator` and `abcClass` only select from the ranking (ADR 0002); a second query finds references with a line matching reference/customer/operator. Aisle is reported in `filters.notApplied`.
- Response: `basis`, `thresholds`, `filters`, `ranked` (references, lines, units behind the ranking), `classes` (per class over the selected references), `references` (rank, class, lines, units, `sharePercent`, `cumulativeBeforePercent`; from the full ranking). Empty range gives empty lists, no error.
- Tests: `abc.spec.ts` (unit: spec fixture 1 on both bases, fixture 2, thresholds, params) and `test/abc.e2e-spec.ts` (fixture 2 through the API: scoping test reference = T stays C, customer/operator scoping, abcClass = A gives P, Q, R, date-range-only, units basis, 400s). Throwaway Postgres 17 container (`abc7-pg`, trust auth, port 5640), stopped. All 8 e2e files pass together. Real data via the API: lines 49/53/106, units 51/49/108, as in the decisions above.
- Next: per CLAUDE.md rule 6, add the ABC class filter to `apps/api/src/indicators/filters.ts` and the #8, #9, #10, #14 endpoints (or move them to `src/filters/`, see the duplicate-code note under #13). Then #12 (X4), #18 (Products page), #17 (Overview).

## Indicators on shared filters and the ABC class filter (issue #46, Michal)
- #8, #9, #10 and #14 now use `src/filters/` (`@QueryFilters()`, `buildWhere`, `describeFilters`); `src/indicators/filters.ts` and its spec are removed, so the duplicate filter code noted under #13 is gone. This also replaces the thin layer (`parseOrderFilters`, `describeOrderFilters`) that #17 added; the override that reported `abcClass` as not applied is removed. Their `filters` response field is now the `describeFilters` report (what `CardFilters` in the web already expected); other fields are unchanged.
- `abcClass` works on order-size, wave-split, sector and monthly-trend. `AbcService.referencesInClass(filters, abcParams)` ranks on the date range only (ADR 0002) and `buildWhere(..., { abcReferences })` adds `reference = ANY(...)`. The endpoints also read `basis`, `thresholdA`, `thresholdB` (`@QueryAbcParams()`, same defaults as M1, 400 on bad input) so a class means the same as on the Products page. In monthly-trend the class is computed once on the selected range and reused for the months and the comparison period.
- Customer, operator and aisle on these endpoints behave as in #13 (customer/operator applied, aisle reported as not applied).
- Tests: unit specs updated; new `test/indicators-abc-filter.e2e-spec.ts` (fixture 2 through all four endpoints, scoping with reference, basis/thresholds, 400s). All 9 e2e files pass on a throwaway Postgres 17 (`abc46-pg`, port 5641, stopped). Real data: order-size by class A/B/C gives 98,380 / 17,911 / 6,046 lines, summing to 122,337.
- CLAUDE.md rule 6 is now done and can be removed.
- Next: #12 (X4), #18 (Products page); on the Overview, replace the M1 "Not available yet" card and the M1 line of the duplicates comparison with `GET /indicators/abc` (web, not done here).

## Overview page (issue #17, Federico)
- Page `apps/web/app/page.tsx` (data loaded server-side in an `Overview` component inside `Suspense`, because `searchParams` must be read under a boundary). Components: `Kpi.tsx` (card, badge, comparison), `TrendChart.tsx` (client, inline SVG, no chart library), `DataQualityPanel.tsx`, `ToggleDuplicatesLink.tsx`; formatting in `lib/format.ts`; types and fetchers in `lib/api.ts`.
- KPI cards M1-M5. M4/M5 show the "not informative" badge from `notInformative`. **M1 shows "Not available yet"**: no ABC endpoint until #7. M2 and M3 show the change against the previous equal-length period or "no data" with the reason. Trend charts M2, M3, X1, X2: partial months hollow and marked `*`, empty months are gaps, tooltip shows orders, units, days covered.
- Data quality panel (collapsed): quantity 0, blank size, duplicates, the duplicates toggle with M2/X1 with and without, and the source-disagreement note. Real data: 33 / 16 / 2,559, 77 waves missing from Picking_Wave (9,784 vs 9,707), 13,003 fewer units.
- API changes made inside #17: new `GET /indicators/data-quality`; the indicator services (#8-#14) now use the shared filters through `indicators/filters.ts`, a thin layer over `src/filters/`. This was the duplicate-code follow-up from #13. Customer and operator now apply to the order indicators, and each response returns `filters` as the `FilterReport` (before, it was the parsed filters and the web cards crashed on it). The ABC class is reported as not applied by `describeOrderFilters` until #7; remove that override when #7 adds the filter (CLAUDE.md rule 6).
- Tests: 45 unit, 30 e2e (new `data-quality.e2e-spec.ts` and a customer/operator/report case in `order-size.e2e-spec.ts`). `next build` and lint pass. Checked on real data with a throwaway Postgres (trust auth, port 5633) and headless Chrome; remove it with `pg_ctl -D /tmp/i17/db stop`.
- Not done: the hover tooltip was not exercised in a browser (only rendered); M1 card and the M1 line of the duplicates comparison wait for #7.
- Next: #7 (M1 ABC; start with the ABC class filter, rule 6, then replace the M1 card and drop the `describeOrderFilters` override), #18-#21 (other pages), #22, #23.

## Aisle picks API (issue #11, Leo)
- `GET /indicators/aisle-picks` returns X3 (picks and units per aisle, most picks first) and A1 (`sharePercent` = aisle picks / selected picks, 0-100), labelled `"proxy, not Sector"` (ADR 0006). Code in `apps/api/src/aisle/` (`aisle.ts` pure grouping, `aisle.service.ts`, `aisle.controller.ts`).
- Response: `totals`, `aisles` (each with `byClass` A/B/C/unclassified), `unknownAisles` (C, E, Z, G in their own bucket with a `label` saying the meaning is unknown, and its own picks, units and share), `classes` (picks per class over all aisles), `abc` (basis and thresholds used), `coverageNote` (about 94% of ordered units, ADR 0004), `filters` (the `FilterReport`).
- Classes come from `AbcService.compute` on the date range only (ADR 0002), then picks are grouped through `reference`. Reference, operator, aisle and abcClass select picks and never change a class. A reference with picks but no class in the range is `unclassified` (0 on the real data). Accepts `basis`, `thresholdA`, `thresholdB` like `/indicators/abc`; the default is lines, 80/95, so classes match the Products page.
- Filters: date range selects picks by wave start (#13); `customer` is reported as not applied. The duplicates toggle is reported as not applied to picks but still reaches the ABC ranking (same as M1), so with the toggle on the classes can differ slightly. Empty result: empty lists, null shares, no error. Bad input: 400.
- Tests: `aisle.spec.ts` and `aisle.service.spec.ts` (unit, mocked database), `test/aisle.e2e-spec.ts` (fixture 2 orders plus hand-made picks: aisle bucket, unknown aisles, split by class, reference scoping, abcClass, wave-start date range, coverage note, empty result, 400s). 69 unit and 55 e2e tests pass on a throwaway Postgres 17 (trust auth, port 5655), removed afterwards. Lint passes; prettier reports two older files (`etl/load.ts`, `health.controller.ts`) that were not touched.
- Real data (lines basis, 80/95): 215,192 picks and units. Per aisle: I 36,288, R 25,925, J 24,153, M 22,750, L 22,373, K 21,211, H 17,244, O 14,574, P 13,902, N 13,777, Q 2,875; unknown bucket 120 (C 76, E 17, Z 15, G 12). Per class: A 168,181 (78.2%), B 33,407 (15.5%), C 13,604 (6.3%).
- `gh project item-list 3` failed again (token lacks `read:project`), so the sprint1 board was not read this session.
- Next for Leo: #15 (wave detail), then #19-#21 (web pages). #20 (Warehouse zones) can use this endpoint.

## X4 computed ABC vs ABCCOD API (issue #12, Michal)
- `GET /indicators/abc-comparison` takes the global filters plus `basis`, `thresholdA`, `thresholdB` (`@QueryFilters()`, `@QueryAbcParams()`, same as `/indicators/abc`). Code in `apps/api/src/abc/`: `abc-comparison.ts` (pure `compareAbc`, `summarise`, the notes), `abc-comparison.service.ts`, route in `abc.controller.ts`.
- Response: `source`, `basis`, `thresholds`, `abccodNote` (the origin of `ABCCOD` is unknown; the UI shows it), `notRankedNote`, `filters` (the `FilterReport`), `summary` (`products`, `compared`, `matches`, `mismatches`, `notRanked`, `matchPercent`) and `references`, one per product: `computedClass` (null if none), `abccod`, `status` (`match`, `mismatch`, `not-ranked`), `rank`, `lines`, `units`.
- Decision: a product with no valid order line in the date range has no computed class, so it is `not-ranked`, counted separately, and left out of the match count; `matchPercent` is matches / compared (null when nothing was compared). On the full range all 208 products are ranked. `ABCCOD` is compared trimmed and upper case.
- Class comes from `AbcService.rank` (date range only, ADR 0002; the duplicates toggle reaches it, as in M1). Reference selects products (an unranked product can still be selected); customer and operator select products with a matching order line, so unranked products drop out; `abcClass` selects by computed class. None of them changes a class. Aisle is reported as not applied.
- Real data (throwaway Postgres 17, `abc12-pg`, port 5660, stopped): lines 121 of 208 (87 mismatches), units 112 of 208 (96), no duplicates effect on lines; January only: 171 compared, 37 not ranked.
- Tests: `abc-comparison.spec.ts` and `abc-comparison.service.spec.ts` (unit), `test/abc-comparison.e2e-spec.ts` (fixture 2 plus a product ordered only in February and one never ordered: match, mismatch, not-ranked, scoping with reference and customer, class filter, thresholds, 400s, empty range). After merging main (with #15) the full run gave 102 unit and 83 e2e (14 files) passing; lint and build pass. Prettier still reports `etl/load.ts` and `health.controller.ts` (older, untouched).
- Not done: the Products page X4 panel (#18) should show `abccodNote` and `notRankedNote`.
- Next: #18 (Products page), #19-#21.

## Wave detail API (issue #15, Leo)
- `GET /waves/:waveNumber` returns two separate lists: `orders` (source `Customer_Order`) and `picks` (source `Picking_Wave`), plus `unitCheck`, `coverageNote`, `linkNote` and `filters`. Code in `apps/api/src/waves/` (`waves.ts` pure functions, `waves.service.ts`, `waves.controller.ts`).
- Orders: valid lines of the wave grouped by order (customer, `createdAt`, `operator` or null with `operators` when the lines differ, lines, units, `items` with reference, size, quantity). A split order shows only this wave's lines. Quantity 0 is always excluded; exact duplicates are kept unless `excludeDuplicates=true` (ADR 0003). Picks: reference, size, quantity, location, aisle, operator. Picks are never linked to orders (ADR 0005).
- ADR 0004: a wave in one file only gives 200 with the other list empty, `inFile: false` and a note (not an error). `unitCheck.status` is `match`, `mismatch` (both unit totals and the difference, neither file declared right) or `not-comparable` (one file only). A wave whose only Customer_Order lines have quantity 0 is found (`inFile: true`, empty orders), not a 404.
- Errors: 404 when neither file has the wave; 400 for a `waveNumber` that is not 1 to 9 digits (all 9,784 and 9,707 real wave numbers are 5 digits) and for bad filters (`excludeDuplicates`, dates, and so on, through `@QueryFilters()`). `GET /waves/` with no number has no route and gives Nest's 404.
- Filters: only the duplicates toggle applies. Every other global filter that is set (from, to, abcClass, reference, customer, operator, aisle) is listed in `filters.notApplied` with the reason, never ignored silently. `filters` is not the shared `FilterReport` shape, because `describeFilters` would claim reference/operator/date apply.
- Tests: `waves.spec.ts` and `waves.service.spec.ts` (unit, mocked database) and `test/waves.e2e-spec.ts` (both files, one file only each way, quantity-0-only wave, split order, duplicates toggle, unit mismatch and match, 404, 400s, not-applied filters). Throwaway Postgres 17 (trust auth, port 5671, `/tmp/w15`), stopped. After merging main (with #46) the full run gave 89 unit and 74 e2e passing; lint passes; prettier still reports `etl/load.ts` and `health.controller.ts` (older, untouched).
- Real data: wave 33168 in both files (24 order lines and 24 picks, 24 units each, match); 43117 only in Customer_Order (1 order, 0 picks, not-comparable); 33170 mismatch (24 order units vs 23 pick units); 43175 split orders show only that wave's lines; 99999 gives 404; `abc` gives 400. 2,313 waves in both files have different units; no wave is in Picking_Wave only; no order has different operators within a wave.
- `gh project item-list 3` failed again (token lacks `read:project`), so the sprint1 board was not read.
- Next for Leo: #19-#21 (web pages; #21 uses this endpoint), #6 is done, #25 README.

## Waves and orders page and wave list API (issue #19, Leo)
- No endpoint listed waves (#9 gives totals, #15 one wave), so `GET /waves` was added (asked first, approved). Code in `apps/api/src/waves/` (`parseListParams` in `waves.ts`, `WavesService.list`, `WavesController.listWaves`). Source `Customer_Order`, valid lines only; per wave `orders`, `lines`, `units`, `firstCreatedAt`, `lastCreatedAt`. Shared filters, `abcClass` with `basis`/`thresholdA`/`thresholdB` like the indicators, duplicates toggle, `FilterReport` in `filters` (aisle reported as not applied). Paging `page`, `pageSize` (default 50, max 200); `sort` = `waveNumber` (default) or `firstCreatedAt`, `order` = `asc|desc`, ties by wave number. Bad input gives 400; a page past the end gives an empty list with `total`. No picks, aisle or "in Picking_Wave" flag (ADR 0004, 0005).
- `WavesService` now also takes `AbcService`.
- Web `apps/web/app/waves/page.tsx`: cards M3, X1, X2 (value, comparison from monthly-trend or "no data" with reason, orders/lines/waves behind it, source `Customer_Order`, `CardFilters`), M3/X1/X2 trend charts with partial months (January, October) marked and listed, and the wave list (paging and sort links, URL params `page`, `sort`, `order`; changing a filter resets them). Each wave links to `/waves/<n>` carrying the filters; `apps/web/app/waves/[waveNumber]/page.tsx` is a **placeholder for #21**.
- API errors (400 and others) are shown on the page with the API's reason; `ApiError` in `lib/api.ts` now keeps the API's `message`. Nothing falls back to data. The Overview still hides errors behind "API did not answer".
- Tests: 116 unit and 89 e2e (new list cases in `waves.e2e-spec.ts`) on a throwaway Postgres 17 (trust auth, port 5681), removed. API lint passes; prettier still flags `etl/load.ts` and `health.controller.ts`. Web: `npm run lint` and `npm run build` pass; no web test runner (not added). Note: `web` has no prettier config, so use `--config ../api/.prettierrc` or it rewrites quotes.
- Real data (ETL on a throwaway database, API and `next start`, checked through the rendered HTML): 9,784 waves; M3 4.07, X1 3.75, X2 12.3%, comparison "no data" on the full period; Jun-Jul 2023 compares against Apr-May (M3 3.69 vs 3.81); filters shown greyed (aisle not applied); `from=garbage` and `page=0` show the 400 reason; no match shows "no data", never zero; a page past the end says so. Links `/waves/33168` (both files) and `/waves/33219` (one of the 77 missing from Picking_Wave) return 200 and the API answers match / not-comparable.
- Not tested in a real browser: the pager and sort clicks, the trend tooltips, and the filter bar resetting the page (checked only as URLs and server HTML).
- `gh project item-list 3` failed again (token lacks `read:project`), so the board was not read.
- Next for Leo: #21 (wave detail view at `/waves/[waveNumber]`, uses `GET /waves/:waveNumber`), #20, #25.
