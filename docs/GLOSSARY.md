# Warehouse operations dashboard

Vocabulary for a dashboard that helps a footwear warehouse's operations director decide between relocating products and changing how picking waves are built.

## Language

### Demand

**Order**:
A customer's request, identified by its order number, with one customer and one creation date. An order can be split across several waves.
_Avoid_: Purchase, transaction

**Order line**:
One row of an order: one reference in one size with a quantity. Lines with quantity 0 are not counted.
_Avoid_: Item, row

**Unit**:
One item counted in a quantity field. Order size and volume are measured in units.
_Avoid_: Piece, article

**Reference**:
A product code identifying one product. The data has 208.
_Avoid_: SKU, product code, article

**Size**:
The US size label of a reference. Codes mix scales and have no documented meaning, so it is treated as an opaque label.
_Avoid_: Variant

### Picking

**Wave**:
A batch of orders released together for picking, identified by its wave number.
_Avoid_: Batch, lot

**Pick**:
One collection of units of a reference from a location within a wave. A pick belongs to a wave and a reference but is not linked to an order.
_Avoid_: Picking line, task

**Aisle**:
The first letter of a pick's location code. It is used as a proxy for position in the warehouse and is never called Sector.
_Avoid_: Zone, sector

### Classification

**Sector**:
A product attribute from the product file. Every product has the same value (`PF`), so it cannot tell products apart.
_Avoid_: Aisle, zone

**ABC class**:
The class (A, B or C) of a reference, from its cumulative share of demand on the active basis within the selected date range. A is the most demanded group.
_Avoid_: Category, rank

**Basis**:
What ABC counts to rank references: order lines (default) or units.
_Avoid_: Metric, measure

**Threshold**:
The cumulative-share cut-off between classes. A reference is A if the cumulative share before it is below the first threshold (default 80%), B if below the second (default 95%), otherwise C.
_Avoid_: Limit, cut
