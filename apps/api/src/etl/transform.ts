// Pure row-level rules from spec section 4. No I/O here, so they are easy to test.

export const UNKNOWN_SIZE = 'unknown';

export interface OrderLine {
  customer: string;
  orderNumber: string;
  orderToCollect: string;
  reference: string;
  size: string;
  quantity: number;
  createdAt: string; // ISO 'YYYY-MM-DD HH:MM:00', no timezone (source has none)
  waveNumber: string;
  operator: string;
}

export interface Pick {
  waveNumber: string;
  reference: string;
  size: string;
  quantity: number;
  location: string;
  aisle: string;
  operator: string;
}

export interface ProductRow {
  reference: string;
  abccod: string;
  sector: string;
}

type Raw = Record<string, string | undefined>;

/** Reads a column, failing loudly if the header is missing. */
function col(row: Raw, name: string): string {
  const v = row[name];
  if (v === undefined) throw new Error(`Missing column "${name}"`);
  return v.trim();
}

/** Parses `dd/mm/yyyy hh:mm` into `YYYY-MM-DD HH:MM:00`. Throws on anything else. */
export function parseDate(text: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/.exec(text.trim());
  if (!m) throw new Error(`Bad date "${text}", expected dd/mm/yyyy hh:mm`);
  const [, dd, mm, yyyy, hh, mi] = m;
  const d = new Date(Date.UTC(+yyyy, +mm - 1, +dd, +hh, +mi));
  if (
    d.getUTCFullYear() !== +yyyy ||
    d.getUTCMonth() !== +mm - 1 ||
    d.getUTCDate() !== +dd ||
    d.getUTCHours() !== +hh
  ) {
    throw new Error(`Impossible date "${text}"`);
  }
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:00`;
}

/** Blank size becomes "unknown". Otherwise kept as an opaque label. */
export function normalizeSize(text: string): string {
  const t = text.trim();
  return t === '' ? UNKNOWN_SIZE : t;
}

function parseQuantity(text: string): number {
  if (!/^\d+$/.test(text)) throw new Error(`Bad quantity "${text}"`);
  return Number(text);
}

/** Aisle = first letter of the trimmed location code. Empty location gives ''. */
export function aisleOf(location: string): string {
  return location.trim().charAt(0).toUpperCase();
}

export function toOrderLine(row: Raw): OrderLine {
  return {
    customer: col(row, 'codCustomer'),
    orderNumber: col(row, 'orderNumber'),
    orderToCollect: col(row, 'orderToCollect'),
    reference: col(row, 'Reference'),
    size: normalizeSize(col(row, 'Size (US)')),
    quantity: parseQuantity(col(row, 'quantity (units)')),
    createdAt: parseDate(col(row, 'creationDate')),
    waveNumber: col(row, 'waveNumber'),
    operator: col(row, 'operator'),
  };
}

export function toPick(row: Raw): Pick {
  const location = col(row, 'locations');
  return {
    waveNumber: col(row, 'waveNumber'),
    reference: col(row, 'reference'),
    size: normalizeSize(col(row, 'Size (US)')),
    quantity: parseQuantity(col(row, 'quantityToPick (units)')),
    location,
    aisle: aisleOf(location),
    operator: col(row, 'operator'),
  };
}

export function toProduct(row: Raw): ProductRow {
  return {
    reference: col(row, 'Reference'),
    abccod: col(row, 'ABCCOD'),
    sector: col(row, 'Sector'),
  };
}
