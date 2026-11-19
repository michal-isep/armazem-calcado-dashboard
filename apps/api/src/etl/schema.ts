// Tables are dropped and recreated on every ETL run (spec section 4, rule 6).
// The DDL runs inside the load transaction, so a failed run keeps the old data.

export const SCHEMA_SQL = `
DROP TABLE IF EXISTS customer_order_line, picking_wave_pick, product, etl_run_summary;

CREATE TABLE product (
  reference text PRIMARY KEY,
  abccod    text NOT NULL,
  sector    text NOT NULL
);

CREATE TABLE customer_order_line (
  id               integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer         text      NOT NULL,
  order_number     text      NOT NULL,
  order_to_collect text      NOT NULL,
  reference        text      NOT NULL,
  size             text      NOT NULL,
  quantity         integer   NOT NULL,
  created_at       timestamp NOT NULL,
  wave_number      text      NOT NULL,
  operator         text      NOT NULL,
  -- false when quantity = 0: excluded from every indicator (rule 3)
  is_valid         boolean   NOT NULL,
  -- true for every repeat after the first row identical in all columns;
  -- kept, and excluded only when the API toggle is on (rule 5)
  is_duplicate     boolean   NOT NULL DEFAULT false
);

CREATE TABLE picking_wave_pick (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  wave_number text    NOT NULL,
  reference   text    NOT NULL,
  size        text    NOT NULL,
  quantity    integer NOT NULL,
  location    text    NOT NULL,
  aisle       text    NOT NULL,
  operator    text    NOT NULL
);

CREATE TABLE etl_run_summary (
  metric text PRIMARY KEY,
  value  bigint NOT NULL
);
`;
