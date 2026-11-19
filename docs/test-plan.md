# Manual test plan and run (issue #23)

Run on 2026-11-19 against `main` at 03d9c46. Scope: the four pages, the wave detail view, every filter, the empty and error states, partial months, the comparison before the data start, thresholds, and the duplicates toggle (spec sections 3, 5 and 6).

## How it was run
- Real data: the ETL loaded the original CSVs into a throwaway Postgres 17 container (trust auth, port 5700, removed afterwards). API on port 3701, web built with `next build` and served with `next start` on port 3700. No `.env` file, no secrets.
- Browser: headless Chrome (1400x1000) driven by puppeteer-core. The scripts were kept outside the repo. Every case below ran in the real browser: clicks, typing, `router.replace`, hover and focus, `<details>`, pager and sort links, and the page text after the client code ran. The expected numbers come from the API (which `docs/validation/report.md` checks against the CSVs) or from the spec.
- Not covered in a browser: the native date-picker popup (dates were set through the input and its change event), the datalist suggestion popup (values were typed), other browsers, small screens and print.

## Result
94 cases: 89 pass, 3 fail, 2 observations. Defects, none fixed in this branch:

| Issue | Defect | Cases |
|---|---|---|
| #66 | Unclosed CSS rule in `globals.css` (line 382) nests every later rule; wave table, pager, scroll box and sticky header are unstyled | V03 |
| #67 | Overview and Products say "the API did not answer" when the API answered 400 | E02, E03 |
| #68 | Zones badge repeats "meaning unknown" (minor wording) | Z01 |

Observations (not defects):
- T07: filter changes use `router.replace`, so the browser Back button leaves the page instead of undoing a filter (decided in #16).
- T08: the filter-bar Reset clears the whole query, including ABC basis and thresholds on Products and Zones.

## Cases
| ID | Case | Result | Evidence |
|---|---|---|---|
| P01 | Overview page loads | PASS | status 200, errors [] |
| P02 | Products page loads | PASS | status 200, errors [] |
| P03 | Waves and orders page loads | PASS | status 200, errors [] |
| P04 | Warehouse zones page loads | PASS | status 200, errors [] |
| P05 | Nav links go through all four pages | PASS | / |
| F01 | Date range written to URL by router.replace | PASS | /?from=2023-06-01&to=2023-07-31 |
| F01b | M2 card equals API for the range | PASS | API M2 7.717054263565892, orders 5418 |
| F01c | Comparison with previous equal-length period shown | PASS | Previous period (2023-04-01 to 2023-05-31): 7.71 (+0.1%) / Previous period (2023-04-01 to 2023-05-31): 3.81 (-3.1%) |
| F02 | ABC class A filter applied | PASS | /?from=2023-06-01&to=2023-07-31&abcClass=A; API lines 18179 |
| F03 | Reference: unlisted text is not committed, listed value is | PASS | First run failed because the test helper did not clear the field ("NOP"+text); re-run with select-all passed (unlisted text not committed, listed value committed). |
| F04 | Customer filter applied | PASS | C0000013: API orders 172 |
| F05 | Operator filter written to URL | PASS | /?customer=C0000013&operator=Operator_3 |
| F06 | Aisle on Overview is reported as not applied | PASS | Source: Customer_OrderAisle: I(not applied: Aisle exists only in Picking_Wave) |
| F07 | Duplicates toggle changes M2 and writes the URL | PASS | M2 6.99 -> 6.60 |
| F08 | Reset clears all filters | PASS | / |
| F09 | Nav links keep the filter query | PASS | /waves?from=2023-03-01&abcClass=B |
| F10 | Empty filter result shows no data, not zero | PASS | API orders 0; url /?from=2023-10-19&reference=122OKQ&operator=Operator_1 |
| M01 | All 4 trend charts mark Jan* and Oct* as partial | PASS | [["Jan*","Oct*"],["Jan*","Oct*"],["Jan*","Oct*"],["Jan*","Oct*"]] |
| M02 | Hover Jan point: tooltip says partial, 27 of 31 days, orders and units | PASS | "Jan 2023 (partial): 5.69\n3,936 orders, 22,407 units, 27 of 31 days covered" |
| M03 | Hover Oct point: partial, 19 of 31 days | PASS | "Oct 2023 (partial): 7.26\n2,319 orders, 16,834 units, 19 of 31 days covered" |
| M04 | Hover May point on M3 chart: full month, not partial | PASS | "May 2023: 3.52\n3,704 orders, 31,862 units, 31 of 31 days covered" |
| M05 | Tooltip resets when the pointer leaves | PASS | "Hover or focus a point for orders, units and days covered" |
| M06 | Keyboard focus on a point shows the tooltip | PASS | "Apr 2023: 3.92\n3,258 orders, 21,837 units, 30 of 30 days covered" |
| M07 | Partial months drawn hollow (class partial) for Jan and Oct only | PASS | ["point partial","point","point","point","point","point","point","point","point","point partial"] |
| M08 | Month without matching orders is a gap, not a zero point | PASS | reference 02MRUH: 1 empty of 10 months; points per chart [{"pts":9,"segs":7},{"pts":9,"segs":7},{"pts":9,"segs":7},{"pts":9,"segs":7}] |
| C01 | Full data period: comparison is "no data" (starts before data) | PASS | Previous period: no data (the previous period starts before the data) |
| C02 | Mar-Apr: previous period partly before data start -> no data, not a partial figure | PASS | Previous period: no data (the previous period starts before the data) |
| C03 | Range starting at the first data day -> no data | PASS | Previous period: no data (the previous period starts before the data) |
| C04 | Jun-Jul compares with Apr-May (2023-04-01 to 2023-05-31) | PASS | Previous period (2023-04-01 to 2023-05-31): 7.71 (+0.1%) |
| C05 | Feb compared with the 28 days before (2023-01-04 .. 2023-01-31) -> before data | PASS | Previous period: no data (the previous period starts before the data) / API no-data before-data-start |
| C06 | Sep-Oct19 (partial end) compares with the previous 49 days | PASS | Previous period (2023-07-14 to 2023-08-31): 6.89 (+12.0%) |
| T01 | Thresholds 70/90 applied: URL and class counts equal API | PASS | /products?thresholdA=70&thresholdB=90; API [[null,35],[null,42],[null,131]] |
| T01b | Banner shows active thresholds 70/90 | PASS |  |
| T02 | A >= B is rejected with a message and the URL does not change | PASS | Thresholds must satisfy 0 < A < B <= 100. / /products?thresholdA=70&thresholdB=90 |
| T03 | Empty threshold is rejected | PASS | Thresholds must satisfy 0 < A < B <= 100. |
| T04 | B = 101 is rejected | PASS | Thresholds must satisfy 0 < A < B <= 100. |
| T05 | Reset to 80/95 clears URL params and inputs | PASS | /products 80,95 |
| T06 | Basis units: URL basis=units, counts 51/49/108 equal API, banner says units | PASS | /products?basis=units [51,49,108] |
| T07 | After browser Back the threshold inputs match the URL | NOTE | Not a valid case: every filter change uses router.replace, so Back leaves the page instead of stepping through filters. By design (#16); recorded as an observation. |
| T08 | Filter-bar Reset on Products: what happens to basis and thresholds | NOTE | Filter-bar Reset on /products?basis=units&thresholdA=70... clears the whole query, including basis and thresholds (URL becomes /products). |
| T09 | After filter-bar Reset the threshold inputs show the URL state | PASS | /products inputs 80,95 |
| T10 | ABC class A filter on Products still shows class A only in drill-down | PASS | Class References Lines Units Share of order lines / Class A 49 98,380 173,383 80.4% / Class B 0 0 0 0.0% / Class C 0 0 0 0.0% |
| T11 | Nav link "Products (ABC)" while on Products with 70/90 + units: inputs agree with what is applied | PASS | url /products; inputs before 70,90, after 80,95; radios after true,false |
| D01 | Drill-down: Class A link lists its references | PASS | /products?drillClass=A |
| D02 | Drill-down: reference link shows its sizes (step 3) equal to API | PASS | /products?drillClass=A&drillRef=8N10W9; API sizes 15 |
| D03 | Changing basis clears the drill-down position and keeps basis | PASS | /products?basis=units |
| D04 | Changing a global filter drops the drill position | PASS | /products?operator=Operator_2 |
| D05 | Duplicates toggle on Products: line total equals API | PASS | API ranked lines 119782; before: Ranked on the date range only: 208 references, 122,337 lines, 228,195 units. Product, class, customer and operator filters select from... |
| Q01 | Data quality panel is collapsed by default and opens on click | PASS | closed=false open=true |
| Q02 | Panel shows quantity 0 (33), blank size (16), duplicates (2,559), 77 waves missing, 13,003 fewer units | PASS | all present |
| Q03 | Panel collapses again on second click | PASS |  |
| W01 | Wave list shows total and page 1 of N equal to API | PASS | API total 9784, pageSize 50; text: 9,784 waves match. Showing 1 to 50; page 1 of 196. |
| W02 | Pager Next goes to page 2 with the API rows | PASS | /waves?sort=waveNumber&order=asc&page=2; first rows 33168,33169,33170 -> 33218,33219,33220 |
| W03 | Pager Previous goes back to page 1 | PASS | /waves?sort=waveNumber&order=asc&page=1 33168,33169,33170 |
| W04 | Sort link by first created date ascending equals API order | PASS | /waves?sort=firstCreatedAt&order=asc; 33168,33169,33170 API 33168 |
| W05 | Second click on the same sort link reverses it | PASS | /waves?sort=firstCreatedAt&order=desc; 43175,43174,43173 |
| W06 | Pager keeps the sort | PASS | /waves?sort=firstCreatedAt&order=desc&page=2 |
| W07 | Changing a filter resets the wave page to 1 | PASS | /waves?operator=Operator_5 |
| W08 | Page past the end says so and does not crash | PASS | This page is past the last wave. |
| W09 | page=0 shows the API 400 reason, no data fallback | PASS | Page shows "API answered 400 for /waves: page must be a whole number from 1 to 1000000"; first run flagged it only because of a loose regex. |
| W10 | Empty wave selection: no data message, not zero | PASS | no data orders per wave |
| V01 | Wave detail 33168: both lists, unit check match, linkNote shown | PASS | unitCheck {"status":"match","orderUnits":24,"pickUnits":24,"difference":0,"note":"Both files have 24 units for this wave."} |
| V02 | Wave detail <details> collapses and expands on click | PASS | open true -> false |
| V03 | Long wave 36611 (30 lines): table scrolls inside its box, header sticky | FAIL | Tables do not scroll and the header is not sticky: #66. |
| V04 | Back link present and keeps the filters | PASS | [["Back to waves and orders","/waves"]] |
| V05 | Wave detail lists non-applicable filters as not applied (operator, reference) | PASS | Exclude duplicate lines: on (applies to Customer_Order only; picks have no duplicate flag)Reference: active(not applied: A single wave is shown whole: the global filte... |
| V06 | Wave 33219 (only in Customer_Order): "no rows" for picks, not-comparable, no error | PASS | Units not comparable Customer_Order: 2 units. Picking_Wave: no rows. |
| V07 | Unknown wave 99999 shows the API 404 message and a back link | PASS | Wave 99999 not found. API answered 404 for /waves/99999: Wave 99999 was not found in Customer_Order or Picking_Wave |
| V08 | Non-numeric wave number shows the API 400 message | PASS | The request was not valid. API answered 400 for /waves/abc: waveNumber must be a number of 1 to 9 digits, for example 33168 |
| V09 | Click wave in list opens its detail carrying the filters | PASS | /waves/33366?operator=Operator_5 |
| Z01 | Zones: proxy label, coverage note, unknown aisles table (C,E,Z,G) present | PASS | Passes, but the badge wording is duplicated: #68. |
| Z02 | Zones: top aisle I and its pick count equal API | PASS | API top I 36288 |
| Z03 | Zones: aisle filter I applies (picks total equals API) | PASS | API totals {"picks":36288,"units":36288} |
| Z04 | Zones: operator filter changes the URL | PASS | /zones?operator=Operator_1 |
| Z05 | Zones: customer filter reported as not applied to picks | PASS | Source: Picking_WaveCustomer: C0000013(not applied: Picking_Wave has no customer; picks are not tied to orders) |
| Z06 | Zones: ABC basis and thresholds apply (class picks equal API) | PASS | [["A",156749],["B",37650],["C",20793],["unclassified",0]] |
| Z07 | Zones: empty selection says "No picks match", not zero | PASS | No picks match the filters. |
| Z08 | Zones: basis radio writes basis=units | PASS | /zones?basis=units |
| E01 | from after to (URL): page shows a clear message or empty, no crash | PASS | API status 400; page: From |
| E02 | from=garbage shows the 400 reason on cards, no fallback to data | FAIL | Overview says "the API did not answer" instead of the 400 reason: #67 (E03 same cause). |
| E03 | abcClass=Z (invalid) shows an error, not data | FAIL | Same as E02: #67. |
| E04 | reference=NOPE (unknown) shows no data, not an error or zero | PASS | no data units per order |
| E05 | Date range entirely before the data: no data | PASS | M2 Average order size  no data units per order  Previous period: no data (the previous period starts before the data)  0 orders, 0 |
| E06 | Date range entirely after the data: no data | PASS | M2 Average order size  no data units per order  Previous period: no data (no matching orders in the previous period)  0 orders, 0  |
| E07 | Date inputs default to the data period and are bounded by it | PASS | [["2023-01-05","2023-10-19","2023-01-05"],["2023-01-05","2023-10-19","2023-10-19"]] |
| E08 | Setting From to the default date does not add it to the URL | PASS | / |
| E09 | Unknown route gives 404 page | PASS | 404 |
| L01 | M4 and M5 cards carry "not informative: all products are PF" with link to A1 | PASS |  |
| L02 | ABCCOD origin unknown is stated on Products (X4) | PASS |  |
| L03 | Data period and partial months stated on every page | PASS |  |
| L04 | Files not reconciled stated: Overview panel, Waves list, wave detail, Zones | PASS |  |
| L05 | No order number in Picking_Wave stated: Waves list, wave detail, Zones | PASS |  |
| L06 | Aisle is never called Sector: Zones says "Proxy, not Sector" | PASS |  |
| L07 | No forecast or savings wording on any page | PASS | /// |

## Limitation checks (issue #24)
L01 to L07 repeat the #24 table in the browser: all present, no forecast or savings wording. The M1 card on the Overview still shows no class counts (it points to Products); this is known and not a defect.

## Not run, and why
- Aisle filter on the order cards is checked as "reported as not applied" (F06), not as a number, because the order source has no aisle.
- Wave 'quantity-0-only' note: no such wave in the real data; covered by the API e2e test only.
- The pager, sort, filter bar, thresholds, tooltips and details were clicked (W02-W07, F01-F10, T01-T11, M02-M06, V02), which earlier sessions could not do.

## Is the project done?
Not yet. Open on the tracker: #26 (the two questions for the teacher, which also decide whether the wave detail view counts as a page), plus the three defects above (#66 matters most: it makes the wave pages look broken). The sprint board could not be read (the token lacks `read:project`). Everything else in the spec is built, validated (3,647 checks, 0 differences) and now manually tested.

## Recheck after fixes
- 2026-11-19, V03 (defect #66): fixed by PR #72. Rechecked by building `apps/web`, confirming the built CSS has `.wave-table`, `.pager`, `.scroll-table`, `.wave-lists` and `.item-list` as top-level rules, and looking at headless Chrome screenshots of `/waves` and `/waves/36611` on the real data (cell padding, underlined links, orders list cut at its scroll box, two lists side by side). The sticky header while scrolling was not rechecked. The original FAIL result above is unchanged.

