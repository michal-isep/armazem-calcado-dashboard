# User guide: warehouse operations dashboard

A walk through every page, section and control, written for the person who uses the dashboard (the warehouse operations director) and for anyone presenting it. For how it is built, see `docs/deliverables/01-repository-guide.pdf`; for the exact definitions, `docs/spec.md`.

## 1. What the dashboard is for
A footwear warehouse is finding order preparation harder. One camp says **relocate products**; another says **change how picking waves are built**. The dashboard gives evidence for both so you can decide **which to test first**. It describes the **current state of the data only**: no forecasts, no estimated time or cost savings.

The data covers **2023-01-05 to 2023-10-19**. January and October are **partial months** and are marked wherever they appear.

Three questions it answers:
1. **Concentration:** is demand concentrated enough in a few products (ABC) to justify closer locations?
2. **Orders and waves:** how big are orders and waves, how often are orders split across waves, and is that changing?
3. **Where the work is:** in which aisles does picking effort pile up?

## 2. Starting it
Follow the run steps in the README (database, ETL, API, web app), then open **http://localhost:3000**. The Overview opens first.

## 3. The header (on every page)

### Title and Theme
- **Theme** (top right): **System** (default, follows your operating system or browser), **Light** or **Dark**. Your choice is remembered in this browser and applied before the page appears.

### Navigation
Four links: **Overview**, **Products (ABC)**, **Waves and orders**, **Warehouse zones**. The current page is underlined and bold. **The active filters travel with you** when you change page, so a filtered view stays filtered.

### The filter bar
The filters are the same on every page and are written into the address bar (URL), so **you can copy the link and send it**: the other person sees exactly the same view. All calculations happen on the server.

| Control | What it does |
|---|---|
| **From / To** | Date range of the orders (end date included). Defaults to the whole data period. The two dates cannot be reversed; a bad date is rejected with a message. |
| **ABC class** | All, A, B or C. Shows only products of that class. The class itself is **never changed** by the other filters (see section 6). |
| **Reference** | The product code. Type to search; only a listed value (or empty) is accepted. |
| **Customer** | Searchable list of customers (588 in the data). |
| **Operator** | The operator who handled the order or pick (24). |
| **Aisle** | An aisle letter (the first letter of the pick location). It applies **only to figures that come from Picking_Wave** (pick data). On cards sourced from Customer_Order it is not applied, and the card says so. |
| **Exclude exact duplicate lines** | Off by default. When on, lines that are identical in every column to an earlier line are removed from the calculations (2,559 lines, about 2.1%). |
| **Reset** | Clears all filters. On the Products and Zones pages it also resets the ABC basis and thresholds. |

Below the bar a line reminds you: *The data covers 2023-01-05 to 2023-10-19 only. The first and last months are partial months.*

### Reading a card: "Source" and "filters"
Every indicator card ends with its **source file** (Customer_Order or Picking_Wave) and tells you **which active filters do and do not apply** to it (for example "Aisle: not applied, Aisle exists only in Picking_Wave", or "No filters active"). A filtered number is therefore never mistaken for an unfiltered one. Each card also shows the **orders and lines behind the number**.

## 4. Overview (main page)

### KPI cards (M1 to M5)
| Card | What it shows | How to read it |
|---|---|---|
| **M1 ABC classification** | A short explanation and a link to the Products page. | The classes are computed from order lines, **not** read from the supplied `Product.ABCCOD`. |
| **M2 Average order size** | Units per order (6.99 for the whole period, 32,632 orders). | A bigger number means more units to pick per order. |
| **M3 Average orders per wave** | Orders per picking wave (4.07, 9,784 waves). | Low values mean waves carry few orders each. An order split across waves counts once in each wave. |
| **M4 Sector share** | Percent of units per sector. | Marked **Not informative: all products are PF**, so it is 100% PF. The badge links to the aisle view (a proxy). |
| **M5 Multi-sector orders** | Percent of orders with products from more than one sector. | Marked **Not informative** for the same reason: 0.0%. |

Under M2 and M3 a line compares with the **previous period of the same length** immediately before your selected range ("Previous period (from to): value, change"). If that period starts before the data (2023-01-05) it says **no data**, never zero.

### Monthly trend
Four small charts, one point per month: **M2 average order size, M3 average orders per wave, X1 lines per order, X2 orders split across waves**.
- **Hover or focus (Tab key) a point** for a tooltip with that month's orders, units and days covered. This is the dashboard's tooltip.
- **Hollow points with a star (Jan\*, Oct\*)** are partial months: compare them with care.
- A month with no matching orders is left empty, not drawn as zero.

### Data quality panel (click to open)
A collapsible panel at the bottom:
- **Excluded or flagged rows:** 33 lines with quantity 0 (excluded from every indicator), 16 with a blank size (kept as "unknown"), 2,559 exact duplicate lines (kept by default).
- **Duplicates toggle:** a link **Exclude them** (or **Include them again**) switches the filter. A small table shows M2 and X1 with duplicates included and excluded (M2 6.99 against 6.60, X1 3.75 against 3.67), so you see how much it matters. M1 is not part of this comparison.
- **The two source files disagree:** 77 of 9,784 waves in Customer_Order are missing from Picking_Wave, and Picking_Wave has 13,003 fewer units (215,192 against 228,195). The dashboard does not hide or fix this; aisle figures are approximate.

## 5. Products (ABC) page

### M1 ABC classification
A banner states the **active basis** and thresholds: A while the cumulative share before a product is below 80%, B below 95%, otherwise C. It also says what is ranked (208 products, 122,337 lines, 228,195 units).

- **ABC basis:** **order lines** (default) or **units**. Lines count how often a picker must visit a product; units count how many leave. The choice is in the URL.
- **Thresholds (cumulative %):** two boxes, **A below** and **B below**, then **Apply**. **Reset to 80/95** restores the defaults.
- **Pareto chart:** one bar per product in rank order (the left axis is each product's share), a white line for the **cumulative share** (right axis), dashed lines at the A and B thresholds, and colours for **Class A, B, C**. Rank 1 on the left to rank 208 on the right. With the defaults, class A holds 49 products and 80.4% of lines.

### Drill-down (three steps)
This is the dashboard's drill-down:
1. **Classes:** a table of Class A, B, C with the number of products, lines, units and share. Click a class (**Class A**).
2. **References in class:** the products of that class in rank order with lines, units, share and cumulative share before. Click a product code. **close** goes back.
3. **Sizes of one reference:** the sizes ordered for that product. **close** goes back.

### X4 Computed ABC against Product.ABCCOD
Compares our computed class with the class supplied in the data. Result: **58.2% match, 121 of 208 products** (87 mismatches). The page states that the origin of `ABCCOD` is unknown, so this compares the two and **does not say which is right**. Products with no valid order line in the range are listed as "not ranked", neither match nor mismatch. A **Per product** section opens the detail.

### Why filters do not change the class
ABC is computed on the **date range only** with the active basis and thresholds. The product, class, customer, operator and aisle filters then **select from** those classes. Filtering to one product does not make it class A. (ADR 0002.)

## 6. Waves and orders page
- **M3, X1, X2 cards:** average orders per wave (4.07), lines per order (3.75), and the share of orders split across more than one wave (**12.3%**, 4,023 of 32,632 orders), each with the previous-period comparison.
- **Monthly trend:** M3, X1, X2 by month with the same tooltip. A line lists the partial months: *Jan 2023 (27 of 31 days), Oct 2023 (19 of 31 days)*.
- **X6 Wave size distribution:** the spread behind M3. Waves are grouped by the number of distinct orders they carry (1, 2 to 3, 4 to 5, 6 to 10, more than 10), with the share of waves and the share of **order placements** (an order split across waves counts once in each). On the real data 38.3% of waves (3,751) carry a single order but only 9.4% of order placements; waves of 6 or more orders are 28.0% of waves and carry about 63% of placements. A second table lists the **most common wave sizes in units**: 74.3% of waves (7,274) have exactly 24 units, then 25 (8.5%), 28, 27 and 26. A third table splits the **split orders** (X2: 4,023 of 32,632, 12.3%) by how many waves they are spread over: 2 waves 78.8%, 3 waves 10.6%, 4 or more 10.6%. It does not say why waves are built this way.
- **Waves list:** the number of waves that match ("9,784 waves match. Showing 1 to 50; page 1 of 196"), with columns **Wave, Orders, Lines, Units, Orders created (first to last)**. Click the **Wave** or **Orders created** heading to sort (an arrow shows the direction; click again to reverse). Use **Previous** and **Next** to page. A page past the end says so. The list uses Customer_Order only; picks are not shown here because they cannot be tied to orders.

### Drill-through: the wave detail view
Click a **wave number** to open its detail view (the filters come with you). It is not in the navigation. It shows:
- **Back to waves and orders** link.
- **Units in the two files:** the units for this wave in Customer_Order and in Picking_Wave and the difference. A notice repeats that the files are not reconciled and neither is declared right.
- **Orders:** the orders of this wave (customer, creation time, operator, lines, units and the items: reference, size, quantity). An order split across waves shows only its lines in this wave. A **show or hide** control opens the list.
- **Picks:** the pick lines of the wave from Picking_Wave: reference, size, quantity, location, aisle and operator (**show or hide**). Picks are **not matched line by line** with orders because the picking file has no order number.

## 7. Warehouse zones page
A permanent note at the top: Picking_Wave covers about **94%** of ordered units; 77 waves are missing; aisle figures are approximate; picks cannot be tied to orders.

- **X3 / A1 Picks by aisle:** labelled **Proxy, not Sector: aisle is the first letter of the pick location**. The same **ABC basis** and **Thresholds** controls as the Products page appear here, because each aisle's picks are split by the class of the product picked. Effort is the **number of picks**; units are secondary.
- **Table:** for each aisle: picks, units, **share of picks** (I is highest with 16.9%; I, R and J together are about 40%), and picks of **class A, class B, class C** and **no class**.
- **Aisles with unknown meaning:** aisles **C, E, Z, G** (120 picks, 0.1%) are kept in a **separate table** marked *Meaning unknown: the data does not say what locations in these aisles are*. They are not merged, hidden or guessed.
- **Aisle R note:** when most of a busy aisle's picks are at codes without coordinates, a note appears under the aisle table. On the real data aisle R (12.0% of picks) shows *90.5% of its picks are at codes without coordinates (mostly RC-01), not on a shelf*. So aisle R is not as busy on its shelves as its share suggests (ADR 0009).
- **X8 Location coverage:** how many picks can be placed in the layout. A pick has **coordinates** when its location is in `Storage_Location`: 191,583 picks (**89.0%**). The other 23,609 (**11.0%**) are at codes with no coordinates in any file. A second table lists those codes: **RC-01 alone has 22,979 picks (10.7% of all picks)**, then RC-04 (361) and RC-05 (100). What `RC-01` is has not been explained. These picks are shown, never dropped or guessed.
- **X7 Picks by shelf position:** labelled **Proxy, not distance: the files do not say where the dock is**. Only picks with coordinates are shown, and the page says how many were left out. One table groups picks by **band along the y axis** (six bands of 240, from 0 to 1,440) with a small bar and the picks of class A, B and C; a second groups them by **shelf level** (z). On the real data no picks happen in the first two bands (y below 480); the 720 to 960 band holds 41.2% of picks and about half of the class A picks with coordinates (51.3%); the levels are 1 (49.5%) and 2 (50.5%), with one pick on level 3. Read it as *where the picks are in the layout*, not how far a picker walks.
- **X3 Picks by ABC class:** a summary of picks by class (A 78.2%, B 15.5%, C 6.3%).
- Use the **Aisle** filter to look at one aisle; the other pages show that it does not apply to order-based figures.

## 8. The interactions the brief asks for
| Interaction | Where |
|---|---|
| **Dynamic filters** (product, period, others), applied consistently | The filter bar on every page |
| **Comparison over time** | The previous-period line on the cards and the monthly trend charts |
| **Tooltip** | Hover or focus a point on a trend chart |
| **Drill-down** | Products page: class, then references, then sizes |
| **Drill-through** | Waves and orders: click a wave to open its detail |

## 9. Known limitations, in plain words
- **M4 and M5 cannot distinguish anything:** every product is in the same sector (PF). They are shown and marked *Not informative* instead of hidden.
- **Aisle is a proxy**, not a sector. It is never called Sector.
- **The two source files do not reconcile.** The dashboard shows which file each number comes from and does not decide which is right.
- **Part of the picks have no coordinates:** 11.0% of picks (10.7% at `RC-01`) are at codes that are not shelf locations in any file. They are reported, not placed. The position view is a proxy for where picks are in the layout and is not a distance.
- **No order number in the picking file:** picks cannot be tied to orders, so there is no multi-aisle order indicator.
- **Partial months** (January and October) are marked.
- **Duplicates:** kept by default; use the toggle to see the effect of removing them.
- **No forecasts and no savings estimates.**

## 10. Typical tasks
| I want to... | Do this |
|---|---|
| See how concentrated demand is | Products: look at the Pareto chart; click Class A, then a product. |
| Check if the supplied ABC classes are still valid | Products: read the X4 match (58.2%). |
| See whether orders are split across waves | Waves and orders: read X2 and the trend. |
| See whether waves are small or large, in orders and in units | Waves and orders: Wave size distribution (X6). |
| Understand one wave | Waves and orders: click the wave number. |
| Find the busiest aisles | Warehouse zones: read the share of picks, and the note about aisle R. |
| See where class A products are picked in the layout | Warehouse zones: Picks by shelf position, the class A column by band and level. |
| Check how much of the picking data can be placed in the layout | Warehouse zones: Location coverage (89.0% with coordinates). |
| Look at one customer, operator or period | Set the filter in the filter bar; the number of orders behind each card tells you how much data is left. |
| Share exactly what I see | Copy the page address. |
| Work in a dark room, or present on a projector | Use the Theme control. |
| Start again | Click Reset. |
