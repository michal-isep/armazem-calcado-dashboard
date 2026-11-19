import Link from 'next/link';
import type { ReactNode } from 'react';
import type { FilterReport, PeriodIndicators, MonthlyTrend } from '../lib/api';
import type { Source } from '../lib/filters';
import { formatChange } from '../lib/format';
import { CardFilters } from './CardFilters';

export function KpiCard(props: {
  id: string;
  title: string;
  source: Source;
  report?: FilterReport;
  badge?: ReactNode;
  /** What the number is computed from, e.g. "32,632 orders, 122,337 lines". */
  basis?: string;
  children: ReactNode;
}) {
  return (
    <section className="card kpi" aria-labelledby={`kpi-${props.id}`}>
      <h3 id={`kpi-${props.id}`}>
        <span className="kpi-id">{props.id}</span> {props.title}
      </h3>
      {props.badge}
      <div className="kpi-body">{props.children}</div>
      {props.basis && <p className="kpi-basis">{props.basis}</p>}
      <CardFilters source={props.source} report={props.report} />
    </section>
  );
}

export function NotInformativeBadge() {
  return (
    <p className="badge" role="note">
      Not informative: all products are PF{' '}
      <Link href="/zones">See aisle share of picks (A1, a proxy)</Link>
    </p>
  );
}

/** Change against the previous equal-length period, or why there is none. */
export function Comparison(props: {
  trend: MonthlyTrend | null;
  pick: (p: PeriodIndicators) => number | null;
  format: (n: number | null) => string;
}) {
  const { trend, pick, format } = props;
  if (!trend) return <p className="kpi-compare">Comparison unavailable</p>;
  const { comparison, current } = trend;
  if (comparison.status === 'no-data' || !comparison.indicators) {
    const why =
      comparison.reason === 'before-data-start'
        ? 'the previous period starts before the data'
        : 'no matching orders in the previous period';
    return <p className="kpi-compare">Previous period: no data ({why})</p>;
  }
  const previous = pick(comparison.indicators);
  const change = formatChange(current ? pick(current) : null, previous);
  return (
    <p className="kpi-compare">
      Previous period ({comparison.from} to {comparison.to}): {format(previous)}
      {change && ` (${change})`}
    </p>
  );
}
