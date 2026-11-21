# Data profile (measured on the original CSVs, unchanged)

Source: `Customer_Order.csv`, `Picking_Wave.csv`, `Product.csv`, plus storage files.
All numbers below were computed with a script, not estimated. Re-check them with the ETL once it exists.

## Files
| File | Separator | Rows | Notes |
|---|---|---|---|
| Customer_Order.csv | `;` | 122,370 | One row = one order line. Dates `dd/mm/yyyy hh:mm`. Text fields padded with spaces (trim them). |
| Picking_Wave.csv | `;` | 215,192 | One row = one pick of `quantityToPick (units)`, with `locations` (padded). |
| Product.csv | `;` | 208 | `Reference`, `ABCCOD`, `Sector` (padded). |
| Storage_Location.csv | `,` | 2,292 | Location with x, y, z coordinates. |
| Support_Points_Navigation.csv | `;` | 44 | Navigation points with labels. |
| Class_Based / Dedicated / Hybrid / Random_Storage.csv | `;` or `,` | ~2,300 | Alternative storage layouts per location (18 slots each). Not analysed yet. |

Different files use different separators. The ETL must handle each one explicitly.

## Customer_Order.csv
- Period: 2023-01-05 to 2023-10-19 (10 months). All dates parse.
- 32,634 distinct orders, 588 customers, 208 distinct references, 9,784 waves, 24 operators.
- Each order has exactly one customer and one creation date.
- Total units: 228,195. Average units per order = 228,195 / 32,634 = 6.99 (before cleaning).
- 33 rows have quantity 0. 16 rows have a blank `Size (US)`.
- 2,559 rows are exact duplicates of an earlier row (identical in all nine columns; confirmed by the ETL, issue #4). Matching only on order, reference, size and quantity would give 4,627, so that is not the definition used.
  Picking_Wave also repeats identical single-unit rows, so these are probably real repeated lines, not errors.
  They are kept (see spec, data handling).
- 4,024 orders (12.3%) appear in more than one wave: an order can be split across waves.
- Size codes mix scales (for example 9, 105, 215, 270). Meaning not documented; treat as an opaque label.

## Product.csv
- 208 references, all with Sector `PF`. There is only one sector in the whole dataset.
- `ABCCOD` provided: A 44, B 70, C 94.
- Every ordered reference exists in Product, and every product is ordered.

## Picking_Wave.csv columns
`waveNumber; reference; Size (US); quantityToPick (units); locations; operator`. It has `reference` and `operator`, but **no `orderNumber`**, so picks cannot be tied to orders. Customer_Order columns: `codCustomer; orderNumber; orderToCollect; Reference; Size (US); quantity (units); creationDate; waveNumber; operator`.

## Cross-file checks
- 77 waves in Customer_Order have no rows in Picking_Wave (9,784 vs 9,707 waves).
- Units in Picking_Wave (215,192) are lower than units in Customer_Order (228,195). The difference is not explained by the data.
- Picking locations start with an aisle letter (I, R, J, M, L, K, H, O, P, N, Q, with a few C, E, Z, G).
  Picks are concentrated in aisles I (36,288), R, J, M, L.

## Order recount after cleaning (script on the original file)
Distinct orders: 32,634 before, 32,632 after excluding the 33 quantity-0 rows. Two orders had only zero-quantity lines. M2 after exclusion = 228,195 / 32,632 = 6.993.

## Rare aisles in Picking_Wave (meaning unknown)
120 of 215,192 picks fall in aisles C, E, Z, G. They do not follow the `H-06-13` pattern of the main aisles.

Nobody has explained them (nobody was asked; decided 2026-11-19, spec section 9). The dashboard keeps them as their own bucket, labelled "meaning unknown", and does not merge or drop them.

| Aisle | Picks | Example locations |
|---|---|---|
| C | 76 | C-102 (31), C-026 (27), C-014 (6) |
| E | 17 | E-25-20 (8), EX-11 (6), EX-01 (2) |
| Z | 15 | ZN-COR (15) |
| G | 12 | G-25-10 (12) |

Meaning not documented. They stay in their own bucket (spec, A1).

## Locations and coordinates (checked on the original CSVs)
- `Storage_Location.csv` has 2,292 locations; x runs 86 to 666, y 0 to 1,440, z (level) 1 to 4. Aisles A to R; aisle R has only 48 locations.
- 191,583 of 215,192 picks (89.0%) are at a location in that file. The other 23,609 (11.0%) are not, and have no coordinates in any file.
- 22,979 picks (10.7% of all picks) are at `RC-01`, then `RC-04` (361), `RC-05` (100) and `RC-03` (19). They are named like the navigation points (`LC-`, `CC-`, `RC-`), not like shelves. Aisle R has 25,925 picks (12.0%), but only about 1.4% of all picks are on real R shelves. What `RC-01` is has not been explained.
- `Support_Points_Navigation.csv` has 44 points: `LC-01` to `LC-17`, `CC-01` to `CC-17` and `RC-08` to `RC-17`. `RC-01` to `RC-07` are missing, so it cannot place the picks above (ADR 0008, 0009).

## Consequences for the indicators
1. **Sector share and multi-sector orders cannot distinguish anything**: 100% of units are `PF`, and 0% of orders are multi-sector.
   The dashboard must show this honestly and offer a clearly labelled proxy (picking aisle/zone) as a separate, additional view.
2. **Our ABC differs from `Product.ABCCOD`** (A 44, B 70, C 94). Computed with the 80/95 rule on valid order lines (quantity 0 excluded, duplicates kept), by script on the original files:

   | Basis | A | B | C | Same class as `ABCCOD` |
   |---|---|---|---|---|
   | **Order lines (default)**, 122,337 lines | 49 | 53 | 106 | 121 of 208 |
   | Units (alternative), 228,195 units | 51 | 49 | 108 | 112 of 208 |

   The units-basis row is the figure originally reported here, before the line basis was chosen (ADR 0001).
   We must say which one the dashboard uses and show the disagreement.
