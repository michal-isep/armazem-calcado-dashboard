const int = new Intl.NumberFormat('en-GB');

export const formatInt = (n: number) => int.format(n);

/** Ratio indicators with two decimals; `null` means "no data", never zero. */
export const formatRatio = (n: number | null) =>
  n === null ? 'no data' : n.toFixed(2);

export const formatPercent = (n: number | null) =>
  n === null ? 'no data' : `${n.toFixed(1)}%`;

/** Change against the comparison period, e.g. "+4.2%". */
export function formatChange(
  current: number | null,
  previous: number | null,
): string | null {
  if (current === null || previous === null || previous === 0) return null;
  const change = ((current - previous) / previous) * 100;
  return `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`;
}

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** "2023-01" -> "Jan 2023". */
export function formatMonth(month: string): string {
  const [year, number] = month.split('-');
  return `${MONTHS[Number(number) - 1]} ${year}`;
}

/** "2023-01-05T08:00:00" -> "2023-01-05 08:00". */
export const formatDateTime = (iso: string) =>
  iso.slice(0, 16).replace('T', ' ');
