# Sprint 1 summary

Read this first in a new session. Update it before the session is cleared (CLAUDE.md, working rules). Last updated: 2026-11-19 (after issue #4).

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
